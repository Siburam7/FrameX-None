/* ==========================================================================
   Delivery addresses of the logged-in user.
   Every function takes the user's id from the session and only ever touches
   that user's rows: another user's address id answers 404.
   ========================================================================== */
import { db } from "../db/index.js";
import { errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { isUuid, v, validate } from "../lib/validate.js";

const MAX_ADDRESSES = 10;

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const SPEC = {
  fullName: v.string({ min: 2, max: 80, label: "Full name" }),
  phone: v.phone({ required: true }),
  line1: v.string({ min: 5, max: 160, label: "Address" }),
  line2: v.string({ max: 120, label: "Area" }),
  landmark: v.string({ max: 120, label: "Landmark" }),
  city: v.string({ min: 2, max: 80, label: "City" }),
  state: v.enumOf(INDIAN_STATES, { label: "State" }),
  postalCode: v.string({ min: 6, max: 6, label: "PIN code", pattern: /^[1-9][0-9]{5}$/, patternMessage: "Enter a valid 6-digit PIN code." })
};

/** Read an address from a request body: only these fields, trimmed and checked. */
export const readAddress = (body) => validate(body, SPEC);

export const publicAddress = (a) => ({
  id: a.id,
  fullName: a.full_name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2 || "",
  landmark: a.landmark || "",
  city: a.city,
  state: a.state,
  postalCode: a.postal_code,
  country: a.country,
  isDefault: a.is_default
});

/** The address as an order keeps it (no id: the order must not change if the address is edited later). */
export const addressSnapshot = (a) => {
  const { id, isDefault, ...rest } = publicAddress(a);
  return rest;
};

export async function listAddresses(userId) {
  const { rows } = await db.query("SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC", [userId]);
  return rows.map(publicAddress);
}

/** The caller's own address row, or 404. */
export async function ownAddress(userId, id, q = db) {
  const notFound = () => errors.notFound("That address wasn't found.", "ADDRESS_NOT_FOUND");
  if (!isUuid(id)) throw notFound();
  const { rows } = await q.query("SELECT * FROM addresses WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function addAddress(userId, data, { makeDefault = false } = {}) {
  return db.tx(async (q) => {
    const { rows } = await q.query("SELECT count(*)::int AS n FROM addresses WHERE user_id = $1", [userId]);
    if (rows[0].n >= MAX_ADDRESSES) throw errors.conflict(`You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`, null, "ADDRESS_LIMIT");
    const first = rows[0].n === 0;
    if (makeDefault || first) await q.query("UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default", [userId]);
    const id = newId();
    await q.query(
      `INSERT INTO addresses (id, user_id, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, userId, data.fullName, data.phone, data.line1, data.line2 || null, data.landmark || null, data.city, data.state, data.postalCode, makeDefault || first]
    );
    return publicAddress(await ownAddress(userId, id, q));
  });
}

export async function updateAddress(userId, id, data) {
  await ownAddress(userId, id);
  await db.query(
    `UPDATE addresses SET full_name = $3, phone = $4, line1 = $5, line2 = $6, landmark = $7, city = $8, state = $9, postal_code = $10, updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [id, userId, data.fullName, data.phone, data.line1, data.line2 || null, data.landmark || null, data.city, data.state, data.postalCode]
  );
  return publicAddress(await ownAddress(userId, id));
}

export async function setDefaultAddress(userId, id) {
  await db.tx(async (q) => {
    await ownAddress(userId, id, q);
    await q.query("UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default", [userId]);
    await q.query("UPDATE addresses SET is_default = true, updated_at = now() WHERE id = $1 AND user_id = $2", [id, userId]);
  });
  return listAddresses(userId);
}

/** Past orders keep their own copy of the address, so deleting one changes no order. */
export async function deleteAddress(userId, id) {
  await db.tx(async (q) => {
    const row = await ownAddress(userId, id, q);
    await q.query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [id, userId]);
    if (row.is_default) await q.query("UPDATE addresses SET is_default = true WHERE id = (SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)", [userId]);
  });
  return listAddresses(userId);
}
