/* ==========================================================================
   Email delivery, behind one function: sendMail({ to, subject, text, html }).

   EMAIL_PROVIDER
     brevo   Brevo transactional email API (EMAIL_PROVIDER_API_KEY + EMAIL_FROM).
             The default choice: free tier, and a single sender address can be
             verified without owning a domain.
     resend  Resend API (needs a verified domain for EMAIL_FROM).
     gmail   A Gmail account through SMTP (GMAIL_USER + GMAIL_APP_PASSWORD).
     smtp    Any other SMTP server (SMTP_*).
     none    Not configured. NOTHING is sent and callers are told so; the
             website then says "Email service is not configured".
     dev     Development testing only, must be chosen explicitly, refused in
             production. Nothing is sent; messages are listed at /dev/mailbox.

   sendMail() never pretends. It returns
     { delivered: true,  id }                       the provider accepted the message
     { delivered: false, reason: "not_configured" } no provider
     { delivered: false, reason: "dev" }            development mailbox only
     { delivered: false, reason: "provider_error", detail }
   ========================================================================== */
import { config, emailProblems } from "../config.js";

const outbox = []; // "dev" providers only (email and SMS)
const MAX_OUTBOX = 100;

/** Development only: remember a message that would have been sent. */
export function pushDevMessage(message) {
  outbox.unshift({ id: Date.now() + "-" + outbox.length, at: new Date().toISOString(), links: [], ...message });
  outbox.length = Math.min(outbox.length, MAX_OUTBOX);
}
export const devOutbox = () => (config.devMailbox ? outbox.slice() : []);
export const clearDevOutbox = () => (outbox.length = 0);

/** "FrameX <support@example.com>" -> { name: "FrameX", email: "support@example.com" } */
export function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+)\s*>\s*$/.exec(String(from || ""));
  return m ? { name: m[1].trim() || "FrameX", email: m[2] } : { name: "FrameX", email: String(from || "").trim() };
}

/** real = a provider is fully configured; dev = development mailbox; none = nothing can be sent. */
export function emailStatus() {
  const provider = config.email.provider;
  if (provider === "none") return { provider, mode: "none", problems: ["No email provider is configured (EMAIL_PROVIDER / EMAIL_PROVIDER_API_KEY)."] };
  if (provider === "dev") return { provider, mode: config.devMailbox ? "dev" : "none", problems: [] };
  const problems = emailProblems();
  return { provider, mode: problems.length ? "none" : "real", problems };
}
export const emailDelivery = () => emailStatus().mode;

async function api(url, options, name) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty body */
  }
  if (!response.ok) throw Object.assign(new Error(`${name} answered ${response.status}: ${(data && (data.message || data.error || data.name)) || "request refused"}`), { status: response.status });
  return data || {};
}

async function sendBrevo({ to, subject, text, html, replyTo = null }) {
  const reply = replyTo ? { email: replyTo.email, ...(replyTo.name ? { name: replyTo.name } : {}) } : config.email.replyTo ? { email: config.email.replyTo } : null;
  const data = await api(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: { "api-key": config.email.key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: parseFrom(config.email.from),
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html || `<pre style="font-family:inherit">${esc(text)}</pre>`,
        ...(reply ? { replyTo: reply } : {})
      })
    },
    "Brevo"
  );
  return data.messageId || "accepted";
}

async function sendResend({ to, subject, text, html, replyTo = null }) {
  const data = await api(
    "https://api.resend.com/emails",
    { method: "POST", headers: { Authorization: `Bearer ${config.email.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo.email } : {}) }) },
    "Resend"
  );
  return data.id || "accepted";
}

let transport = null;
/** Gmail / SMTP connection (nodemailer), created on first use. */
export async function smtpTransport() {
  if (transport) return transport;
  const nodemailer = (await import("nodemailer")).default;
  if (config.email.provider === "gmail") {
    const { user, appPassword } = config.email.gmail;
    transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: appPassword } });
  } else {
    const { host, port, user, password } = config.email.smtp;
    transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass: password } : undefined });
  }
  return transport;
}

/** Why sending failed, in words a shop owner can act on. Never includes the message or a secret. */
export function explainMailError(error) {
  const text = String((error && (error.response || error.message)) || error);
  if (error && (error.code === "EAUTH" || /535|Username and Password not accepted|BadCredentials/i.test(text))) {
    return "Gmail refused the login. Use a Google App Password (not the normal Gmail password) and check the address.";
  }
  if (error && error.status === 401) return "The email provider rejected the API key (EMAIL_PROVIDER_API_KEY).";
  if (error && ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND"].includes(error.code)) return "Could not reach the mail server. Check the internet connection.";
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return "The email provider did not answer in time.";
  return text.split("\n")[0].slice(0, 220);
}

export async function sendMail({ to, subject, text, html, links = [], replyTo = null }) {
  const status = emailStatus();
  if (status.mode === "none") return { delivered: false, reason: "not_configured", detail: status.problems.join(" ") };
  if (status.mode === "dev") {
    pushDevMessage({ kind: "email", to, subject, text, links, ...(replyTo ? { replyTo: replyTo.email } : {}) });
    if (!config.isTest) console.log(`[dev-mail] NOT SENT (development mailbox): "${subject}" for ${to}`);
    return { delivered: false, reason: "dev" };
  }
  try {
    let id;
    if (status.provider === "brevo") id = await sendBrevo({ to, subject, text, html, replyTo });
    else if (status.provider === "resend") id = await sendResend({ to, subject, text, html, replyTo });
    else id = (await (await smtpTransport()).sendMail({ from: config.email.from, to, subject, text, html, ...(replyTo ? { replyTo: replyTo.email } : {}) })).messageId;
    // Recipient and provider id only: never the body (it carries one-time codes and links).
    if (!config.isTest) console.log(`[mail] ${status.provider} accepted "${subject}" for ${to} (id ${id})`);
    return { delivered: true, id };
  } catch (error) {
    const detail = explainMailError(error);
    console.error(`[mail] ${status.provider} did NOT accept "${subject}" for ${to}: ${detail}`);
    return { delivered: false, reason: "provider_error", detail };
  }
}

/** Check the provider credentials without sending anything. { ok, detail } */
export async function checkEmailProvider() {
  const status = emailStatus();
  if (status.mode !== "real") return { ok: false, detail: status.mode === "dev" ? "Development mailbox: nothing is really sent." : status.problems.join(" ") };
  try {
    if (status.provider === "brevo") {
      const account = await api("https://api.brevo.com/v3/account", { headers: { "api-key": config.email.key, Accept: "application/json" } }, "Brevo");
      return { ok: true, detail: `Brevo key accepted (account ${account.email || "ok"}). The sender ${parseFrom(config.email.from).email} must be a verified sender in Brevo.` };
    }
    if (status.provider === "resend") {
      await api("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${config.email.key}` } }, "Resend");
      return { ok: true, detail: "Resend key accepted." };
    }
    await (await smtpTransport()).verify();
    return { ok: true, detail: `${status.provider === "gmail" ? "Gmail" : "SMTP server"} accepted the login.` };
  } catch (error) {
    return { ok: false, detail: explainMailError(error) };
  }
}

/* ---------------------------------------------------------------- Messages */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plainFooter = "\n\n— FrameX\nIf you didn't ask for this, you can ignore this email. Your password stays the same.";

/**
 * FrameX email layout: dark brand bar, heading, paragraphs, an optional large
 * code, an optional button (with the plain link under it), and a security note.
 * Table layout and inline styles, so it renders in Gmail, Outlook and phones.
 *
 * Order emails add `tables`: [{ title?, rows: [[left, right, bold?]] }] with
 * already-escaped HTML in the cells, and `account: false` (no password advice).
 */
// The FrameX logo on the dark bar: white letters and the orange X. The picture is the website's
// assets/img/ui/logo-framex-email.png; its alt text is styled the same way, so a mailbox that blocks
// pictures (or a development machine, where there is no public address) still shows the name like the logo.
const LOGO_TEXT_STYLE = "font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:900;letter-spacing:1px;line-height:24px;color:#ffffff";
export function emailLogo() {
  const text = `<span style="${LOGO_TEXT_STYLE}">FRAME<span style="color:#ff5a1f">X</span></span>`;
  return config.email.logoUrl ? `<img src="${esc(config.email.logoUrl)}" width="140" height="24" alt="FRAMEX" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:24px;${LOGO_TEXT_STYLE}">` : text;
}

export function htmlEmail({ preview = "", heading, paragraphs = [], code = "", codeNote = "", button = null, notice = "", tables = [], account = true }) {
  const table = (t) => `<tr><td style="padding:10px 28px 4px">${t.title ? `<div style="font-size:13px;font-weight:bold;color:#5b5f6b;padding-bottom:6px">${esc(t.title)}</div>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;color:#2b2b2b">${t.rows
        .map(([left, right, bold]) => `<tr><td style="padding:5px 0;border-top:1px solid #f1f2f3;vertical-align:top${bold ? ";font-weight:bold" : ""}">${left}</td><td align="right" style="padding:5px 0 5px 12px;border-top:1px solid #f1f2f3;vertical-align:top;white-space:nowrap${bold ? ";font-weight:bold" : ""}">${right}</td></tr>`)
        .join("")}</table></td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#faf6ee;font-family:Arial,Helvetica,sans-serif;color:#050816">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ee"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#050816;padding:20px 28px">${emailLogo()}</td></tr>
    <tr><td style="padding:28px 28px 8px;font-size:21px;font-weight:bold;line-height:1.3">${esc(heading)}</td></tr>
    ${paragraphs.map((p) => `<tr><td style="padding:6px 28px;font-size:15px;line-height:1.6;color:#2b2b2b">${p}</td></tr>`).join("")}
    ${code ? `<tr><td style="padding:14px 28px 4px"><div style="display:inline-block;padding:14px 22px;border-radius:12px;background:#faf6ee;border:1px solid #ecdcbd;font-family:'Courier New',monospace;font-size:30px;font-weight:bold;letter-spacing:8px;color:#050816">${esc(code)}</div></td></tr>
    <tr><td style="padding:4px 28px 6px;font-size:13px;line-height:1.5;color:#5b5f6b">${esc(codeNote)}</td></tr>` : ""}
    ${tables.map(table).join("")}
    ${button ? `<tr><td style="padding:16px 28px 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#de832e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px">${esc(button.label)}</a></td></tr>
    <tr><td style="padding:4px 28px 6px;font-size:12px;line-height:1.5;color:#5b5f6b;word-break:break-all">${esc(button.note || "")} If the button doesn't work, copy this address into your browser:<br>${esc(button.url)}</td></tr>` : ""}
    <tr><td style="padding:18px 28px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e4e5e7;padding-top:16px;font-size:12px;line-height:1.6;color:#5b5f6b">
      ${esc(notice || "If you didn't ask for this, you can ignore this email.")}<br>${account ? "FrameX will never ask you for your password or this code by phone, WhatsApp or email." : "FrameX will never ask you for your card number, CVV, UPI PIN or password by phone, WhatsApp or email."}</td></tr></table></td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px"><tr><td style="padding:14px 28px;font-size:11px;color:#8f8f8f;text-align:center">FrameX · premium photo frames from local framing shops</td></tr></table>
</td></tr></table></body></html>`;
}

export const messages = {
  /** Password reset: a 6-digit code to type in AND a one-time link, both for the same request. */
  passwordResetCode: (name, code, url, codeMinutes, linkMinutes) => ({
    subject: "Reset your FrameX password",
    text: `Hi ${name},\n\nWe received a request to reset your FrameX password.\n\nYour reset code: ${code}\n(valid for ${codeMinutes} minutes, works once)\n\nOr open this link to choose a new password (valid for ${linkMinutes} minutes, works once):\n${url}\n\nIf you didn't request this, ignore this email. Your password stays the same. Never share this code with anyone.${plainFooter}`,
    html: htmlEmail({
      preview: `Your FrameX reset code is ${code}`,
      heading: "Reset your FrameX password",
      paragraphs: [`Hi ${esc(name)},`, "We received a request to reset the password for your FrameX account. Enter this code on the reset page:"],
      code,
      codeNote: `This code expires in ${codeMinutes} minutes and works once.`,
      button: { label: "Reset password", url, note: `Or use this button instead of the code. The link expires in ${linkMinutes} minutes and works once.` },
      notice: "If you didn't request a password reset, ignore this email. Your password stays the same and nobody can change it without this code or link."
    }),
    links: [{ label: "Reset password", url }]
  }),
  shopSetup: (shopName, shopCode, url, hours) => ({
    subject: `Your FrameX shop account (${shopCode})`,
    text: `Hello,\n\n${shopName} has been approved on FrameX.\n\nYour Shop ID: ${shopCode}\n\nSet your password with this link. It works once and expires in ${hours} hours:\n\n${url}\n\nAfter that, log in with your Shop ID (or this email address) and your password.${plainFooter}`,
    html: htmlEmail({
      preview: `${shopName} is approved. Shop ID ${shopCode}`,
      heading: `${shopName} is approved on FrameX`,
      paragraphs: [`Your Shop ID: <strong>${esc(shopCode)}</strong>`, "Set your password with the button below. After that, log in with your Shop ID (or this email address) and your password."],
      button: { label: "Set shop password", url, note: `The link expires in ${hours} hours and works once.` },
      notice: "You received this because a FrameX admin approved a shop with this email address."
    }),
    links: [{ label: "Set shop password", url }]
  }),
  applicationReceived: (ownerName, shopName) => ({
    subject: "We received your FrameX shop application",
    text: `Hi ${ownerName},\n\nThanks for applying to list ${shopName} on FrameX. Our team will review your details and contact you. You don't have a login yet; if your shop is approved we'll send your Shop ID and a link to set your password.${plainFooter}`,
    html: htmlEmail({ heading: "We received your application", paragraphs: [`Hi ${esc(ownerName)},`, `Thanks for applying to list <strong>${esc(shopName)}</strong> on FrameX. Our team will review your details and contact you.`, "You don't have a login yet. If your shop is approved, we'll send your Shop ID and a link to set your password."], notice: "You received this because this address was entered on FrameX's Partner With FrameX form." })
  }),
  applicationNotify: (app) => ({
    subject: `New shop application: ${app.shop_name}`,
    text: `${app.shop_name} (${app.owner_name}) applied from ${app.city}, ${app.state}.\nPhone: ${app.phone}\nEmail: ${app.email}\n\nReview it in the FrameX admin dashboard.`
  }),
  applicationRejected: (ownerName, shopName) => ({
    subject: "About your FrameX shop application",
    text: `Hi ${ownerName},\n\nThank you for applying to list ${shopName} on FrameX. We're not able to approve the application at the moment. You're welcome to contact us with any questions.${plainFooter}`
  }),
  test: () => ({
    subject: "FrameX email test",
    text: `This is a test message from your FrameX backend. Email sending works.${plainFooter}`,
    html: htmlEmail({ heading: "Email sending works", paragraphs: ["This is a test message from your FrameX backend. Password-reset and shop-setup emails will be sent from this address."], notice: "You received this because someone ran the FrameX email test with this address." })
  })
};
