/* ==========================================================================
   A customer's own data: download it, or delete the account (owner's rules, 2026-10-20).

   Download: one JSON file with the profile, addresses, orders, custom paintings,
   reviews and messages to FrameX. Photo files are not in it (they are opened from
   the order pages).

   Delete (customers only; shops, artists and admins ask FrameX):
     - only with the account's password AND the word DELETE typed;
     - refused while an order or a custom painting is still under way;
     - the login, addresses, cart, sessions, alerts and every uploaded photo go;
     - orders and custom paintings stay as records for tax (number, items, amounts,
       dates, state for the place of supply) without the name, email, phone,
       address, personal texts or instructions;
     - reviews stay without the name ("A FrameX customer") and without their photo;
     - messages sent to FrameX lose the name, email and phone;
     - the account row stays (orders refer to it), emptied and switched off for good;
       its email is freed, so the person can sign up again later;
     - a last email to the old address says it is done.
   ========================================================================== */
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { sendMail } from "../lib/mailer.js";
import { verifyPassword } from "../lib/passwords.js";
import * as storage from "../lib/storage.js";

const DONE_ORDER = ["DELIVERED", "CANCELLED", "RETURNED"];
const DONE_PAINTING = ["DELIVERED", "CANCELLED", "DECLINED"];
export const DELETED_NAME = "Deleted customer";
export const REVIEW_NAME = "A FrameX customer";

/* ---------------------------------------------------------------- Download */

/** Everything FrameX keeps about this account, as one object (sent as a .json file). */
export async function exportData(userId) {
  const q = async (sql, params = [userId]) => (await db.query(sql, params)).rows;
  const [user] = await q("SELECT name, email, phone, role, created_at, last_login_at FROM users WHERE id = $1");
  if (!user) throw errors.notFound("That account doesn't exist.");
  const addresses = await q("SELECT full_name, phone, line1, line2, landmark, city, state, postal_code, country, created_at FROM addresses WHERE user_id = $1 ORDER BY created_at");
  const orders = await q(
    `SELECT id, order_number, status, payment_method, payment_status, subtotal, discount, coupon_code, coupon_discount, tax, shipping_fee, cod_fee,
            gift_wrap, gift_wrap_fee, total, amount_refunded, shipping_address, customer_name, customer_email, customer_phone, placed_at, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at`
  );
  const items = orders.length
    ? await q(`SELECT order_id, name, size, color, options, quantity, unit_price, line_total, note, design_summary, shop_name FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY order_id, position`, [orders.map((o) => o.id)])
    : [];
  const paintings = await q(
    `SELECT r.request_number, a.name AS artist, r.status, r.payment_status, r.price, r.amount_paid, r.instructions, r.shipping_address, r.created_at
       FROM painting_requests r JOIN artists a ON a.id = r.artist_id WHERE r.user_id = $1 ORDER BY r.created_at`
  );
  const reviews = await q("SELECT target_type, target_id, rating, body, author_name, status, created_at FROM reviews WHERE user_id = $1 ORDER BY created_at");
  const messages = await q("SELECT subject, message, created_at FROM contact_messages WHERE user_id = $1 OR lower(email) = lower($2) ORDER BY created_at", [userId, user.email]);
  const photos = await q("SELECT original_name, format, bytes, width, height, status, created_at FROM uploads WHERE user_id = $1 AND status <> 'DELETED' ORDER BY created_at");
  return {
    about: "Everything FrameX keeps about your account, as of the date below. Photo files are not included: open them from your order pages.",
    exportedAt: new Date().toISOString(),
    account: { name: user.name, email: user.email, phone: user.phone, type: user.role, createdAt: user.created_at, lastLoginAt: user.last_login_at },
    addresses,
    orders: orders.map(({ id, ...o }) => ({ ...o, items: items.filter((i) => i.order_id === id).map(({ order_id, ...i }) => i) })),
    customPaintings: paintings,
    reviews,
    messagesToFrameX: messages,
    photos
  };
}

/* ---------------------------------------------------------------- Delete */

/** What still stops this account from being deleted: [{ kind, number, status }] (empty = it can go). */
export async function blockers(userId) {
  const orders = (await db.query(`SELECT order_number AS number, status FROM orders WHERE user_id = $1 AND status <> ALL($2::text[]) ORDER BY created_at`, [userId, DONE_ORDER])).rows;
  const paintings = (await db.query(`SELECT request_number AS number, status FROM painting_requests WHERE user_id = $1 AND status <> ALL($2::text[]) ORDER BY created_at`, [userId, DONE_PAINTING])).rows;
  return [...orders.map((o) => ({ kind: "order", ...o })), ...paintings.map((p) => ({ kind: "painting", ...p }))];
}

/**
 * Delete the logged-in customer's account. { password, confirm: "DELETE" }.
 * -> { deleted: true, photosRemoved, ordersKept, paintingsKept }
 */
export async function deleteAccount(actor, { password, confirm } = {}, { ip = null } = {}) {
  const user = (await db.query("SELECT * FROM users WHERE id = $1", [actor.id])).rows[0];
  if (!user || user.deleted_at) throw errors.notFound("That account doesn't exist.");
  if (user.role !== "CUSTOMER") throw errors.forbidden("A shop, artist or admin account is closed by FrameX. Please contact FrameX.", "CONTACT_FRAMEX");
  const fields = {};
  if (typeof confirm !== "string" || confirm.trim() !== "DELETE") fields.confirm = "Type DELETE (in capitals) to confirm.";
  if (typeof password !== "string" || !password || !(await verifyPassword(password, user.password_hash))) fields.password = "That isn't your password.";
  if (Object.keys(fields).length) throw errors.validation(fields);
  const waiting = await blockers(user.id);
  if (waiting.length) {
    const list = waiting.map((w) => `${w.kind === "order" ? "order" : "custom painting"} ${w.number}`).join(", ");
    throw Object.assign(errors.conflict(`Your ${list} ${waiting.length === 1 ? "is" : "are"} still under way. You can delete your account once ${waiting.length === 1 ? "it is" : "they are"} delivered or cancelled.`, null, "ACTIVE_ORDERS"), { details: { waiting } });
  }

  const files = [];
  const kept = await db.tx(async (q) => {
    // Photos: every file goes (after the commit); the records say DELETED
    const uploads = (await q.query("SELECT id, storage_key FROM uploads WHERE user_id = $1 AND status <> 'DELETED'", [user.id])).rows;
    files.push(...uploads.map((u) => u.storage_key));
    await q.query("UPDATE uploads SET status = 'DELETED', deleted_at = now() WHERE user_id = $1 AND status <> 'DELETED'", [user.id]);
    const reviewPhotos = (await q.query("SELECT photo_key FROM reviews WHERE user_id = $1 AND photo_key IS NOT NULL", [user.id])).rows;
    files.push(...reviewPhotos.map((r) => r.photo_key));

    // Orders and custom paintings: kept for tax, without the person (the state stays: place of supply)
    const orders = await q.query(
      `UPDATE orders SET customer_name = $2, customer_email = '', customer_phone = NULL,
              shipping_address = jsonb_build_object('state', shipping_address->>'state', 'removed', true), updated_at = now()
        WHERE user_id = $1`,
      [user.id, DELETED_NAME]
    );
    await q.query("UPDATE order_items SET note = '', customization = NULL, design_summary = NULL WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)", [user.id]);
    await q.query("UPDATE order_notifications SET recipient = '' WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)", [user.id]);
    const paintings = await q.query(
      `UPDATE painting_requests SET customer_name = $2, customer_email = '', customer_phone = NULL, instructions = '',
              shipping_address = jsonb_build_object('state', shipping_address->>'state', 'removed', true), updated_at = now()
        WHERE user_id = $1`,
      [user.id, DELETED_NAME]
    );

    // Reviews stay without the name and the photo; messages to FrameX without the contact details
    await q.query("UPDATE reviews SET author_name = $2, photo_key = NULL, photo_mime = NULL, updated_at = now() WHERE user_id = $1", [user.id, REVIEW_NAME]);
    await q.query("UPDATE contact_messages SET name = $3, email = '', phone = '', user_id = NULL WHERE user_id = $1 OR lower(email) = lower($2)", [user.id, user.email, DELETED_NAME]);

    // What only made sense for the login
    for (const table of ["addresses", "sessions", "auth_tokens", "otp_codes", "notifications"]) await q.query(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
    await q.query("DELETE FROM carts WHERE user_id = $1", [user.id]);
    await q.query("UPDATE auth_events SET user_id = NULL WHERE user_id = $1", [user.id]);

    // The account row: emptied, switched off for good, its email freed
    await q.query(
      `UPDATE users SET name = $2, email = $3, phone = NULL, password_hash = NULL, status = 'DISABLED', deleted_at = now(), updated_at = now() WHERE id = $1`,
      [user.id, DELETED_NAME, `deleted-${user.id}@deleted.invalid`]
    );
    await audit(q, { actor: { id: user.id, role: user.role }, action: ACTIONS.ACCOUNT_DELETED, targetType: "user", targetId: user.id, metadata: { orders: orders.rowCount, paintings: paintings.rowCount, photos: files.length }, ip });
    return { orders: orders.rowCount, paintings: paintings.rowCount };
  });

  // After the commit: the files themselves (a file that is already gone is not an error)
  let removed = 0;
  for (const key of files) {
    try {
      await storage.remove(key);
      removed += 1;
    } catch (error) {
      console.error("[account] a photo of a deleted account could not be removed:", error.message);
    }
  }
  sendMail({
    to: user.email,
    subject: "Your FrameX account was deleted",
    text: [
      `Hi ${user.name},`,
      "",
      "Your FrameX account has been deleted, as you asked. Your login, addresses, saved photos and cart are gone.",
      "Records of your past orders are kept only as FrameX needs them for tax, without your name, email, phone or address.",
      "",
      "If you didn't ask for this, reply to this email.",
      "",
      "FrameX"
    ].join("\n")
  }).catch(() => {});
  return { deleted: true, photosRemoved: removed, ordersKept: kept.orders, paintingsKept: kept.paintings };
}
