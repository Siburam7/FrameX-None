/* ==========================================================================
   Messages from the Contact page.

   submit()  keeps the message (so it is in the admin panel whatever happens
             to email) and sends an alert email to FrameX's own address:
             ADMIN_NOTIFY_EMAIL when it is set, otherwise the active admin
             accounts. The email's Reply-To is the sender, so answering it
             from the mailbox answers the customer.

   Nothing is ever emailed to the address the visitor typed: the form can't be
   used to make FrameX send mail to a stranger.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { linkBase } from "../lib/context.js";
import { errors } from "../lib/errors.js";
import { esc, htmlEmail, sendMail } from "../lib/mailer.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";

const sending = new Set();
/** Tests: wait until every alert email that was started has been handed to the mailer. */
export const contactSettled = () => Promise.all([...sending]);

const oneLine = (s) => String(s).replace(/[\r\n\t]+/g, " ").trim();

/** Where the alert goes: the configured address(es), otherwise every active admin account. */
async function recipients() {
  const fixed = String(config.email.adminNotify || "").split(/[,;\s]+/).filter((a) => a.includes("@"));
  if (fixed.length) return fixed.slice(0, 5);
  return (await db.query("SELECT email FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND email IS NOT NULL ORDER BY created_at LIMIT 5")).rows.map((r) => r.email);
}

async function sendAlert(m, panelUrl) {
  const to = await recipients();
  if (!to.length) return "NO_RECIPIENT";
  const subject = `New message on FrameX: ${oneLine(m.subject).slice(0, 120)}`;
  const text = `A visitor sent this message from the Contact page of FrameX.\n\nName: ${m.name}\nEmail: ${m.email}\nPhone: ${m.phone || "not given"}\nSubject: ${oneLine(m.subject)}\n\n${m.message}\n\nReply to this email to answer ${m.name} directly.\nAll messages: ${panelUrl}`;
  const html = htmlEmail({
    preview: `${m.name}: ${oneLine(m.subject)}`,
    heading: "New message from the Contact page",
    paragraphs: [`<strong>${esc(oneLine(m.subject))}</strong>`, esc(m.message).replace(/\r?\n/g, "<br>"), `Reply to this email to answer ${esc(m.name)} directly.`],
    tables: [{ title: "From", rows: [["Name", esc(m.name)], ["Email", esc(m.email)], ["Phone", esc(m.phone || "not given")]] }],
    button: { label: "Open messages", url: panelUrl },
    notice: "You received this because this address receives messages for FrameX administrators.",
    account: false
  });
  const results = [];
  for (const address of to) results.push(await sendMail({ to: address, subject, text, html, links: [{ label: "Open messages", url: panelUrl }], replyTo: { email: m.email, name: oneLine(m.name) } }));
  if (results.some((r) => r.delivered)) return "SENT";
  if (results.some((r) => r.reason === "dev")) return "DEV";
  if (results.some((r) => r.reason === "not_configured")) return "NOT_CONFIGURED";
  return "FAILED";
}

/**
 * A visitor's message. data = { name, email, phone, subject, message }, already validated.
 * The same message sent twice within ten minutes (a double click, a retry) is kept once.
 */
export async function submit(data, { user = null } = {}) {
  const again = (await db.query("SELECT id FROM contact_messages WHERE email = $1 AND subject = $2 AND message = $3 AND created_at > now() - interval '10 minutes' LIMIT 1", [data.email, data.subject, data.message])).rows[0];
  if (again) return { id: again.id, repeated: true };
  // The alert emails share the provider's daily allowance with password-reset codes: a flood of messages must not use it up.
  const recent = (await db.query("SELECT count(*)::int AS n FROM contact_messages WHERE alert IN ('SENT', 'DEV', 'PENDING') AND created_at > now() - interval '1 hour'")).rows[0].n;
  const limited = recent >= config.contact.alertsPerHour;
  const id = newId();
  await db.query("INSERT INTO contact_messages (id, user_id, name, email, phone, subject, message, alert) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [id, user ? user.id : null, data.name, data.email, data.phone || "", data.subject, data.message, limited ? "LIMIT" : "PENDING"]);
  if (!limited) {
    const panelUrl = `${linkBase()}/admin.html#/messages`; // read now: the request is over when the email goes out
    const job = (async () => {
      let alert = "FAILED";
      try {
        alert = await sendAlert(data, panelUrl);
      } catch (error) {
        console.error(`[contact] alert email failed: ${error.message}`);
      }
      await db.query("UPDATE contact_messages SET alert = $2 WHERE id = $1", [id, alert]).catch(() => {});
    })();
    sending.add(job);
    job.finally(() => sending.delete(job));
  }
  return { id, repeated: false };
}

/* ---------------------------------------------------------------- FrameX staff */

const shape = (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, status: r.status, alert: r.alert, hasAccount: Boolean(r.user_id), createdAt: r.created_at, readAt: r.read_at });

export const unreadCount = async () => (await db.query("SELECT count(*)::int AS n FROM contact_messages WHERE status = 'NEW'")).rows[0].n;

export async function adminList({ status = "", page = 1, limit = 20 } = {}) {
  const size = Math.min(Math.max(1, Math.floor(Number(limit)) || 20), 50);
  const at = Math.max(1, Math.floor(Number(page)) || 1);
  const where = status ? "WHERE status = $1" : "";
  const params = status ? [status] : [];
  const total = (await db.query(`SELECT count(*)::int AS n FROM contact_messages ${where}`, params)).rows[0].n;
  const { rows } = await db.query(`SELECT * FROM contact_messages ${where} ORDER BY created_at DESC, id LIMIT ${size} OFFSET ${(at - 1) * size}`, params);
  return { items: rows.map(shape), total, unread: await unreadCount(), page: at, limit: size };
}

const found = (row) => {
  if (!row) throw errors.notFound("We couldn't find that message.");
  return row;
};

export async function adminSetStatus(id, status) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that message.");
  return shape(found((await db.query("UPDATE contact_messages SET status = $2, read_at = CASE WHEN $2 = 'READ' THEN now() ELSE NULL END WHERE id = $1 RETURNING *", [id, status])).rows[0]));
}

/** Removes a message for good. The audit log keeps that it happened, not what it said. */
export async function adminDelete(id, { actor, ip }) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that message.");
  await db.tx(async (q) => {
    found((await q.query("DELETE FROM contact_messages WHERE id = $1 RETURNING id", [id])).rows[0]);
    await audit(q, { actor, action: ACTIONS.CONTACT_MESSAGE_DELETED, targetType: "contact_message", targetId: id, ip });
  });
  return { deleted: true };
}
