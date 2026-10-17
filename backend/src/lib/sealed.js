/* ==========================================================================
   Small secrets kept in the database sealed (AES-256-GCM): a seller's bank
   account number or UPI ID. Anyone who gets a copy of the database sees only
   "v1.…" text; the key that opens it is PAYOUT_ENCRYPTION_KEY and lives only
   in the server's environment (32 random bytes, written as base64 or hex):

     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

   Without a key nothing can be sealed or opened, and the payout pages say so.
   Keep the key: details sealed with one key can't be opened with another
   (sellers would have to enter their payout account again).
   ========================================================================== */
import crypto from "node:crypto";

let cached; // undefined = not read yet; null = no usable key

function parseKey(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const bytes = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, "hex") : Buffer.from(text, "base64");
  return bytes.length === 32 ? bytes : null;
}
const key = () => (cached === undefined ? (cached = parseKey(process.env.PAYOUT_ENCRYPTION_KEY)) : cached);

/** true when a key is set (and is 32 bytes). */
export const sealingReady = () => Boolean(key());
/** true when PAYOUT_ENCRYPTION_KEY is set but isn't 32 bytes of base64 or hex. */
export const sealingKeyInvalid = () => Boolean(String(process.env.PAYOUT_ENCRYPTION_KEY || "").trim()) && !key();

/** Value -> "v1.<iv>.<tag>.<data>" (base64url). */
export function seal(value) {
  const k = key();
  if (!k) throw new Error("PAYOUT_ENCRYPTION_KEY is not set");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** "v1.…" -> the value. Throws when the text was changed or another key sealed it. */
export function open(text) {
  const k = key();
  if (!k) throw new Error("PAYOUT_ENCRYPTION_KEY is not set");
  const [version, iv, tag, data] = String(text || "").split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("not sealed text");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}

/** Tests: read the key again after changing the environment. */
export const resetSealingKey = () => (cached = undefined);
