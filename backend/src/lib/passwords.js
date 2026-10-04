/* ==========================================================================
   Password hashing with scrypt (Node's built-in, memory-hard KDF).
   Stored format:  scrypt$N$r$p$<salt base64url>$<hash base64url>
   The parameters travel with each hash, so they can be raised later and old
   hashes still verify (needsRehash() flags them for an upgrade at next login).
   Passwords are never logged and never leave this module in any other form.
   ========================================================================== */
import crypto from "node:crypto";

// OWASP-recommended scrypt setting (N=2^15, r=8, p=3), about 32 MB per hash.
const PARAMS = { N: 32768, r: 8, p: 3 };
const KEY_LENGTH = 32;
const MAX_MEMORY = 128 * 1024 * 1024;

const scrypt = (password, salt, { N, r, p }) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key)));
  });

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  let actual;
  try {
    actual = await scrypt(String(password), Buffer.from(salt, "base64url"), { N: Number(N), r: Number(r), p: Number(p) });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function needsRehash(stored) {
  const [, N, r, p] = String(stored || "").split("$");
  return Number(N) !== PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p;
}

// Verifying against this when no account matches keeps "unknown user" and
// "wrong password" taking the same time.
let dummy = null;
export async function verifyAgainstDummy(password) {
  dummy = dummy || (await hashPassword(crypto.randomBytes(18).toString("base64url")));
  await verifyPassword(String(password || ""), dummy);
  return false;
}
