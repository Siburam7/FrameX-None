/* ==========================================================================
   Accounts and sessions: sign up, log in, log out, account recovery (codes by
   email / SMS and one-time links), first-time shop password setup, password change.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors, HttpError } from "../lib/errors.js";
import { linkBase } from "../lib/context.js";
import { emailStatus, messages, sendMail } from "../lib/mailer.js";
import { sendOtpSms, smsStatus } from "../lib/sms.js";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "../lib/passwords.js";
import { hashToken, newId, newToken } from "../lib/tokens.js";
import { normalizeEmail, normalizePhone } from "../lib/validate.js";
import { verifyFacebook, verifyGoogle } from "../lib/social-login.js";
import { recordAuthEvent } from "./analytics-service.js";
import { shopStatus } from "./shop-service.js";

const SHOP_CODE = /^FRX-SHOP-\d{3,}$/i;
const GENERIC_LOGIN_ERROR = "Those details don't match an account. Check them and try again.";

/** What the API may say about a user. Never includes the password hash. */
export async function publicUser(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at, u.last_login_at,
            (u.password_hash IS NOT NULL) AS has_password, NOT coalesce(u.cart_reminders_off, false) AS cart_reminders, (u.google_sub IS NOT NULL) AS via_google, (u.facebook_id IS NOT NULL) AS via_facebook,
            sh.shop_code, sh.name AS shop_name, sh.city, sh.state, sh.approval_status, sh.active_status,
            ar.artist_code, ar.username AS artist_username, ar.name AS artist_name, ar.status AS artist_status
       FROM users u LEFT JOIN shops sh ON sh.id = u.shop_id LEFT JOIN artists ar ON ar.id = u.artist_id WHERE u.id = $1`,
    [userId]
  );
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    // A customer who came through Google / Facebook may have no password (the account page offers to set one)
    hasPassword: u.has_password,
    cartReminders: u.cart_reminders, // cart reminder emails wanted (on unless the customer turned them off)
    linked: { google: u.via_google, facebook: u.via_facebook },
    shop: u.role === "SHOP" ? { shopCode: u.shop_code, name: u.shop_name, city: u.city, state: u.state, status: shopStatus(u) } : null,
    artist: u.role === "ARTIST" ? { artistCode: u.artist_code, username: u.artist_username, name: u.artist_name, status: u.artist_status } : null
  };
}

export async function createSession(userId, req) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86400000);
  await db.query(`INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
    newId(),
    userId,
    hashToken(token),
    String(req.headers["user-agent"] || "").slice(0, 300),
    req.ip,
    expiresAt
  ]);
  return { token, expiresAt };
}

/** Public sign-up. The role is fixed here: nothing the client sends can change it. */
export async function signupCustomer({ name, email, phone, password }) {
  const taken = await db.query("SELECT email, phone FROM users WHERE lower(email) = $1 OR (phone IS NOT NULL AND phone = $2)", [email, phone || null]);
  if (taken.rows.length) {
    const fields = {};
    if (taken.rows.some((r) => r.email.toLowerCase() === email)) fields.email = "An account with this email already exists. Try logging in.";
    if (phone && taken.rows.some((r) => r.phone === phone)) fields.phone = "An account with this phone number already exists.";
    throw errors.conflict("An account with these details already exists.", fields);
  }
  const id = newId();
  await db.query(
    `INSERT INTO users (id, name, email, phone, password_hash, role, status, password_changed_at)
     VALUES ($1, $2, $3, $4, $5, 'CUSTOMER', 'ACTIVE', now())`,
    [id, name, email, phone || null, await hashPassword(password)]
  );
  return id;
}

/**
 * accountType only decides WHERE to look (customer tab: email / phone; shop
 * tab: Shop ID / shop email). The role that comes back is whatever the
 * database says, so choosing the "shop" tab can never make someone a shop.
 */
export async function login({ identifier, password, accountType, ip = null }) {
  const id = String(identifier || "").trim();
  let row = null;
  if (accountType === "shop") {
    const sql = `SELECT u.*, sh.approval_status FROM users u JOIN shops sh ON sh.id = u.shop_id WHERE u.role = 'SHOP' AND `;
    row = SHOP_CODE.test(id)
      ? (await db.query(sql + "sh.shop_code = $1", [id.toUpperCase()])).rows[0]
      : (await db.query(sql + "lower(u.email) = $1", [normalizeEmail(id)])).rows[0];
  } else {
    const phone = id.includes("@") ? null : normalizePhone(id);
    row = id.includes("@")
      ? (await db.query("SELECT * FROM users WHERE role IN ('CUSTOMER', 'ADMIN', 'ARTIST', 'CARE') AND lower(email) = $1", [normalizeEmail(id)])).rows[0]
      : phone
        ? (await db.query("SELECT * FROM users WHERE role IN ('CUSTOMER', 'ADMIN') AND phone = $1", [phone])).rows[0]
        : null;
  }

  const ok = row && row.password_hash ? await verifyPassword(password, row.password_hash) : await verifyAgainstDummy(password);
  // For the admin's security figures: which account an attempt was aimed at (when there is one) and why it failed. Never what was typed.
  const failed = async (error) => {
    await recordAuthEvent({ kind: "LOGIN_FAILED", userId: row ? row.id : null, role: row ? row.role : null, accountType, reason: error.code, ip });
    return error;
  };
  if (!ok) throw await failed(errors.unauthorized(GENERIC_LOGIN_ERROR, "INVALID_CREDENTIALS"));
  // Only someone who knows the password learns the account's state.
  if (row.status === "DISABLED") throw await failed(errors.forbidden("This account has been disabled. Please contact FrameX.", "ACCOUNT_DISABLED"));
  if (row.status !== "ACTIVE") throw await failed(errors.forbidden("This account isn't ready yet. Use the setup link FrameX sent you.", "ACCOUNT_NOT_READY"));
  if (row.role === "SHOP" && row.approval_status !== "APPROVED") throw await failed(errors.forbidden("This shop isn't approved on FrameX at the moment. Please contact FrameX.", "SHOP_NOT_APPROVED"));

  if (needsRehash(row.password_hash)) await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), row.id]);
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [row.id]);
  await recordAuthEvent({ kind: "LOGIN", userId: row.id, role: row.role, accountType, ip });
  return row.id;
}

/* ---------------------------------------------------------------- Google / Facebook */

const SOCIAL = {
  google: { column: "google_sub", label: "Google", verify: verifyGoogle },
  facebook: { column: "facebook_id", label: "Facebook", verify: verifyFacebook }
};

/** A clean display name from what Google / Facebook gave (or the email's first part). */
function socialName(name, email) {
  const clean = String(name || "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean.length >= 2) return clean;
  const local = String(email).split("@")[0].replace(/[^a-z0-9]+/gi, " ").trim();
  return (local.length >= 2 ? local : "FrameX customer").slice(0, 80);
}

/**
 * "Continue with Google / Facebook". The proof is checked with Google / Facebook first (lib/social-login.js).
 * The same person (their Google / Facebook id) or, the first time, the same email reaches the same customer account;
 * a new email makes a new customer account (no password, no phone: the delivery address carries the phone).
 * Only CUSTOMER accounts: an admin, care, shop or artist account logs in with its password.
 * -> { userId, created }
 */
export async function socialLogin(provider, proof, { ip = null } = {}) {
  const how = SOCIAL[provider];
  if (!how) throw errors.notFound("Not found.");
  const person = await how.verify(proof);
  const socialId = provider === "google" ? person.sub : person.id;
  const email = normalizeEmail(person.email);
  const result = await db.tx(async (q) => {
    let row = (await q.query(`SELECT * FROM users WHERE ${how.column} = $1 AND deleted_at IS NULL`, [socialId])).rows[0];
    if (!row) row = (await q.query("SELECT * FROM users WHERE lower(email) = $1 AND deleted_at IS NULL", [email])).rows[0];
    if (row) {
      if (row.role !== "CUSTOMER") throw errors.forbidden("This email belongs to a FrameX shop, artist or staff account. Please log in with your password.", "USE_PASSWORD");
      if (row.status === "DISABLED") throw errors.forbidden("This account has been disabled. Please contact FrameX.", "ACCOUNT_DISABLED");
      if (row[how.column] && row[how.column] !== socialId) throw errors.conflict(`This email is joined to a different ${how.label} account. Please log in with your password.`, null, "SOCIAL_MISMATCH");
      await q.query(`UPDATE users SET ${how.column} = $2, last_login_at = now(), updated_at = now() WHERE id = $1`, [row.id, socialId]);
      return { userId: row.id, created: false };
    }
    const id = newId();
    await q.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, ${how.column}, last_login_at)
       VALUES ($1, $2, $3, NULL, NULL, 'CUSTOMER', 'ACTIVE', $4, now())`,
      [id, socialName(person.name, email), email, socialId]
    );
    return { userId: id, created: true };
  });
  await recordAuthEvent({ kind: "LOGIN", userId: result.userId, role: "CUSTOMER", accountType: "customer", ip });
  return result;
}

/* ---------------------------------------------------------------- Log in / sign up with a code by email (owner, 2026-10-31)
   1. sendLoginCode(email)            a 6-digit code goes to that address, also when it has no account yet
   2. verifyLoginCode(email, code)    a customer account: { userId } (logged in); no account: { signupToken }
   3. completeCodeSignup(token, ...)  a correct code on a new address became a token; with a name it is a new
                                      customer account, logged in (owner's choice "A": no dead end on the login page)
   Like Google, only CUSTOMER accounts log in this way. A shop, artist or staff address (or a disabled account) is
   sent an email that says to log in with the password instead, so the answer here never tells who has an account.

   Since 2026-11-01 the same three steps also work with a mobile number and a code by SMS (sendPhoneCode,
   verifyPhoneCode): a new number becomes a customer account with a name and, only if they give one, an email
   address (owner: "Email optional (skip kar sakein)"). login_codes.email then holds the number (+91XXXXXXXXXX). */

const loginCodeHash = (address, code) => crypto.createHmac("sha256", config.authSecret).update(`login-code:${address}:${code}`).digest("hex");
const SIGNUP_TICKET_MINUTES = 30;
const signupSig = (payload) => crypto.createHmac("sha256", config.authSecret).update("code-signup:" + payload).digest("base64url");
/** A correct code on an address without an account, as a signed ticket for step 3. kind: "email" | "phone". */
function makeSignupTicket(kind, value) {
  const payload = Buffer.from(`${kind}:${value}|${Date.now() + SIGNUP_TICKET_MINUTES * 60_000}`).toString("base64url");
  return `${payload}.${signupSig(payload)}`;
}
/** -> { kind: "email" | "phone", value } (a ticket made before 2026-11-01 holds just the email) */
function fromSignupTicket(ticket) {
  const expired = () => errors.badRequest("This sign-up has expired. Please ask for a new code.", "SIGNUP_EXPIRED");
  const [payload, sig] = String(ticket || "").split(".");
  if (!payload || !sig || !sameHash(sig, signupSig(payload))) throw expired();
  const text = Buffer.from(payload, "base64url").toString();
  const cut = text.lastIndexOf("|");
  if (!(Number(text.slice(cut + 1)) > Date.now())) throw expired();
  const who = text.slice(0, cut);
  if (who.startsWith("phone:")) return { kind: "phone", value: who.slice(6) };
  return { kind: "email", value: who.startsWith("email:") ? who.slice(6) : who };
}
const accountByEmail = async (q, email) => (await q.query("SELECT * FROM users WHERE lower(email) = $1 AND deleted_at IS NULL", [email])).rows[0];
const accountByPhone = async (q, phone) => (await q.query("SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL", [phone])).rows[0];

/**
 * A new 6-digit code for an address (an email, or a +91 number), after the resend wait and the hourly cap of that
 * address. refused: the address belongs to an account that can't log in this way; it still gets a row that can
 * never be used (its hash is not of a code), so the wait and the cap apply to it too. -> { code, codeId }
 */
async function newLoginCode(address, refused) {
  const recent = (await db.query("SELECT created_at FROM login_codes WHERE email = $1 AND created_at > $2 ORDER BY created_at DESC", [address, new Date(Date.now() - 3600_000)])).rows;
  const wait = recent.length ? Math.ceil((new Date(recent[0].created_at).getTime() + config.otp.resendSeconds * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) throw new HttpError(429, "OTP_COOLDOWN", `Please wait ${wait} seconds before asking for another code.`, { retryAfterSeconds: wait });
  if (recent.length >= config.otp.maxPerHour) throw new HttpError(429, "OTP_LIMIT", "Too many codes requested. Please try again in an hour.", { retryAfterSeconds: 3600 });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const codeId = newId();
  await db.tx(async (q) => {
    await q.query("DELETE FROM login_codes WHERE created_at < now() - interval '1 day'"); // old codes are of no use to anyone
    await q.query("UPDATE login_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL", [address]); // a new code replaces an earlier one
    await q.query("INSERT INTO login_codes (id, email, code_hash, expires_at, used_at) VALUES ($1, $2, $3, $4, $5)", [codeId, address, refused ? "refused" : loginCodeHash(address, code), new Date(Date.now() + config.otp.minutes * 60_000), refused ? new Date() : null]);
  });
  return { code, codeId };
}

/** Step 1. Same answer whether or not the address has an account. */
export async function sendLoginCode(rawEmail) {
  const email = normalizeEmail(rawEmail);
  const mail = emailStatus();
  if (mail.mode === "none") throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Login codes can't be sent right now. Please log in with your password or with Google.");
  const user = await accountByEmail(db, email);
  const refused = user && (user.role !== "CUSTOMER" || user.status !== "ACTIVE");
  const { code, codeId } = await newLoginCode(email, refused);
  const result = await sendMail({ to: email, ...(refused ? messages.loginCodeRefused(user.status !== "ACTIVE") : messages.loginCode(code, config.otp.minutes)) });
  if (!result.delivered && result.reason !== "dev") {
    await db.query("DELETE FROM login_codes WHERE id = $1", [codeId]); // not sent: it must not count, nor stay valid
    if (result.reason === "not_configured") throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Login codes can't be sent right now. Please log in with your password or with Google.");
    throw new HttpError(502, "EMAIL_SEND_FAILED", "We couldn't send the email right now. Please try again in a few minutes.");
  }
  return { ok: true, masked: maskEmail(email), expiresInMinutes: config.otp.minutes, resendAfterSeconds: config.otp.resendSeconds, devMode: result.reason === "dev" };
}

/** "+91 98765 43210", "9876543210" … -> "+919876543210"; null when it isn't an Indian mobile number. */
const indianMobile = (raw) => {
  const phone = normalizePhone(raw);
  return phone && /^\+91[6-9]\d{9}$/.test(phone) ? phone : null;
};

/**
 * Step 1 by SMS. Same answer whether or not the number has an account. A number of a shop, artist or staff account
 * (or a disabled one) gets no SMS at all (each SMS costs money): its code row can't be used, and step 2 says nothing.
 */
export async function sendPhoneCode(rawPhone) {
  const phone = indianMobile(rawPhone);
  if (!phone) throw errors.validation({ phone: "Enter a 10-digit Indian mobile number." });
  if (smsStatus().mode === "none") throw new HttpError(503, "SMS_NOT_CONFIGURED", "Codes by SMS can't be sent right now. Please use your email or Google.");
  const user = await accountByPhone(db, phone);
  const refused = user && (user.role !== "CUSTOMER" || user.status !== "ACTIVE");
  const { code, codeId } = await newLoginCode(phone, refused);
  const result = refused ? { delivered: true } : await sendOtpSms(phone, code);
  if (!result.delivered && result.reason !== "dev") {
    await db.query("DELETE FROM login_codes WHERE id = $1", [codeId]); // not sent: it must not count, nor stay valid
    if (result.reason === "not_configured") throw new HttpError(503, "SMS_NOT_CONFIGURED", "Codes by SMS can't be sent right now. Please use your email or Google.");
    throw new HttpError(502, "SMS_SEND_FAILED", "We couldn't send the SMS right now. Please try again in a few minutes, or use your email.");
  }
  return { ok: true, masked: maskPhone(phone), expiresInMinutes: config.otp.minutes, resendAfterSeconds: config.otp.resendSeconds, devMode: result.reason === "dev" };
}

/** Step 2's check, for an email or a number: wrong tries are counted (as for the reset codes); a correct code is used up. */
async function useLoginCode(address, code) {
  const invalid = () => errors.badRequest("That code is incorrect or has expired. Check it, or ask for a new code.", "OTP_INVALID");
  const locked = () => errors.badRequest("Too many wrong attempts. Please ask for a new code.", "OTP_LOCKED");
  const row = (await db.query("SELECT id, code_hash FROM login_codes WHERE email = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [address])).rows[0];
  if (!row) throw invalid();
  // Count the attempt first, in one statement, so parallel guesses can't go past the limit
  const counted = await db.query("UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING attempts", [row.id, config.otp.maxAttempts]);
  if (!counted.rows.length) {
    await db.query("UPDATE login_codes SET used_at = now() WHERE id = $1", [row.id]);
    throw locked();
  }
  if (!sameHash(loginCodeHash(address, code), row.code_hash)) {
    const left = config.otp.maxAttempts - counted.rows[0].attempts;
    if (left <= 0) {
      await db.query("UPDATE login_codes SET used_at = now() WHERE id = $1", [row.id]);
      throw locked();
    }
    throw errors.badRequest(`That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`, "OTP_INVALID");
  }
  const used = await db.query("UPDATE login_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [row.id]);
  if (!used.rows.length) throw invalid();
}

/** Step 2 by SMS: a customer account is logged in; a new number gets a sign-up ticket. */
export async function verifyPhoneCode(rawPhone, code, { ip = null } = {}) {
  const phone = indianMobile(rawPhone);
  if (!phone) throw errors.validation({ phone: "Enter a 10-digit Indian mobile number." });
  await useLoginCode(phone, code);
  const user = await accountByPhone(db, phone);
  if (!user) return { signupToken: makeSignupTicket("phone", phone), masked: maskPhone(phone) };
  if (user.role !== "CUSTOMER") throw errors.forbidden("This mobile number belongs to a FrameX shop, artist or staff account. Please log in with your password.", "USE_PASSWORD");
  if (user.status !== "ACTIVE") throw errors.forbidden("This account has been disabled. Please contact FrameX.", "ACCOUNT_DISABLED");
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  await recordAuthEvent({ kind: "LOGIN", userId: user.id, role: user.role, accountType: "customer", ip });
  return { userId: user.id };
}

/** Step 2. Wrong tries are counted (as for the reset codes); a correct code is used up. */
export async function verifyLoginCode(rawEmail, code, { ip = null } = {}) {
  const email = normalizeEmail(rawEmail);
  await useLoginCode(email, code);
  const user = await accountByEmail(db, email);
  if (!user) return { signupToken: makeSignupTicket("email", email), masked: maskEmail(email) };
  // The person proved the address is theirs, so the account's state can be said now
  if (user.role !== "CUSTOMER") throw errors.forbidden("This email belongs to a FrameX shop, artist or staff account. Please log in with your password.", "USE_PASSWORD");
  if (user.status !== "ACTIVE") throw errors.forbidden("This account has been disabled. Please contact FrameX.", "ACCOUNT_DISABLED");
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  await recordAuthEvent({ kind: "LOGIN", userId: user.id, role: user.role, accountType: "customer", ip });
  return { userId: user.id };
}

/**
 * Step 3 (a new address only). No password: one can be added later on the account page.
 * A ticket from an email: phone is optional. A ticket from a mobile number: email is optional (owner, 2026-11-01).
 */
export async function completeCodeSignup(ticket, { name, phone = null, email = null }, { ip = null } = {}) {
  const who = fromSignupTicket(ticket);
  const byPhone = who.kind === "phone";
  const account = byPhone ? { email: email ? normalizeEmail(email) : null, phone: who.value } : { email: who.value, phone: phone || null };
  const userId = await db.tx(async (q) => {
    if (account.email && (await accountByEmail(q, account.email)))
      throw byPhone
        ? errors.conflict("This email already has a FrameX account. Log in with that email, then add this mobile number on your account page.", { email: "This email already has a FrameX account." }, "EMAIL_TAKEN")
        : errors.conflict("An account with this email already exists. Please log in.", null, "ACCOUNT_EXISTS");
    if (account.phone && (await q.query("SELECT 1 FROM users WHERE phone = $1", [account.phone])).rows.length)
      throw byPhone
        ? errors.conflict("An account with this mobile number already exists. Please log in.", null, "ACCOUNT_EXISTS")
        : errors.conflict("That phone number is used by another account.", { phone: "That phone number is used by another account." });
    const id = newId();
    await q.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, last_login_at)
       VALUES ($1, $2, $3, $4, NULL, 'CUSTOMER', 'ACTIVE', now())`,
      [id, name, account.email, account.phone]
    );
    return id;
  });
  await recordAuthEvent({ kind: "LOGIN", userId, role: "CUSTOMER", accountType: "customer", ip });
  return userId;
}

/** A customer without a password (came through Google / Facebook) sets one, to log in with email too. */
export async function setFirstPassword(userId, password) {
  const { rowCount } = await db.query("UPDATE users SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2 AND password_hash IS NULL", [await hashPassword(password), userId]);
  if (!rowCount) throw errors.conflict('This account already has a password. Use "Change password".', null, "HAS_PASSWORD");
}

export const logout = (sessionId) => db.query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [sessionId]);

const revokeSessions = (q, userId, exceptSessionId = null) =>
  q.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)", [userId, exceptSessionId]);

/** New one-time token for a user; older unused tokens of that purpose stop working. */
export async function issueToken(q, userId, purpose, { createdBy = null } = {}) {
  const token = newToken();
  const ms = purpose === "ACCOUNT_SETUP" ? config.tokens.accountSetupHours * 3600000 : config.tokens.passwordResetMinutes * 60000;
  const expiresAt = new Date(Date.now() + ms);
  await q.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await q.query("INSERT INTO auth_tokens (id, user_id, purpose, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)", [newId(), userId, purpose, hashToken(token), createdBy, expiresAt]);
  return { token, expiresAt, url: tokenUrl(token) };
}

// The token rides in the URL fragment (#...), which browsers never send to servers or put in Referer headers.
export const tokenUrl = (token) => `${linkBase()}/reset-password.html#token=${token}`;

/* ---------------------------------------------------------------- Account recovery (forgot password)
   1. startRecovery(identifier)        find the account, list how a code can be sent (masked)
   2. sendRecoveryCode(ticket, channel) create a 6-digit code and hand it to the email / SMS provider
   3. verifyRecoveryCode(...)           check the code, return a one-time reset token
   4. completePasswordToken(...)        set the new password (same function a reset link uses)
   Customers and shops can recover this way. ADMIN accounts cannot: an admin
   password is only changed from the server (npm run admin:create). */

const otpHash = (userId, code) => crypto.createHmac("sha256", config.authSecret).update(`${userId}:${code}`).digest("hex");
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** "someone@gmail.com" -> "s*****@gmail.com" */
export const maskEmail = (email) => {
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
};
/** "+919876544321" -> "******4321" */
export const maskPhone = (phone) => "******" + String(phone).slice(-4);

const RECOVERY_SELECT = `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.password_hash,
         sh.phone AS shop_phone, sh.shop_code, sh.approval_status
    FROM users u LEFT JOIN shops sh ON sh.id = u.shop_id`;

/** Only active customer / shop accounts that already have a password can recover it. */
const canRecover = (u) => Boolean(u) && u.status === "ACTIVE" && Boolean(u.password_hash) && u.role !== "ADMIN" && (u.role !== "SHOP" || u.approval_status === "APPROVED");
/** A shop's login has no mobile number of its own, so its shop's number is used. */
const recoveryPhone = (u) => u.phone || (u.role === "SHOP" ? u.shop_phone : null) || null;

async function findRecoveryAccount(identifier) {
  const id = String(identifier || "").trim();
  let row = null;
  if (SHOP_CODE.test(id)) row = (await db.query(`${RECOVERY_SELECT} WHERE sh.shop_code = $1 AND u.role = 'SHOP' LIMIT 1`, [id.toUpperCase()])).rows[0];
  else if (id.includes("@")) row = (await db.query(`${RECOVERY_SELECT} WHERE lower(u.email) = $1 LIMIT 1`, [normalizeEmail(id)])).rows[0];
  else {
    const phone = normalizePhone(id);
    if (phone) {
      row = (await db.query(`${RECOVERY_SELECT} WHERE u.phone = $1 LIMIT 1`, [phone])).rows[0];
      if (!row) row = (await db.query(`${RECOVERY_SELECT} WHERE u.role = 'SHOP' AND u.phone IS NULL AND sh.phone = $1 LIMIT 1`, [phone])).rows[0];
    }
  }
  return canRecover(row) ? row : null;
}

/* The "ticket" ties steps 2 and 3 to the account found in step 1 without sending the account id to the browser in the clear. */
const TICKET_MINUTES = 20;
const ticketSig = (payload) => crypto.createHmac("sha256", config.authSecret).update("recovery:" + payload).digest("base64url");
const makeTicket = (userId) => {
  const payload = Buffer.from(`${userId}|${Date.now() + TICKET_MINUTES * 60_000}`).toString("base64url");
  return `${payload}.${ticketSig(payload)}`;
};
async function userFromTicket(ticket) {
  const expired = () => errors.badRequest("This reset request has expired. Please start again.", "RECOVERY_EXPIRED");
  const [payload, sig] = String(ticket || "").split(".");
  if (!payload || !sig || !sameHash(sig, ticketSig(payload))) throw expired();
  const [userId, exp] = Buffer.from(payload, "base64url").toString().split("|");
  if (!(Number(exp) > Date.now())) throw expired();
  const user = (await db.query(`${RECOVERY_SELECT} WHERE u.id = $1`, [userId])).rows[0];
  if (!canRecover(user)) throw expired();
  return user;
}

function channelsFor(user) {
  const email = emailStatus();
  const sms = smsStatus();
  const phone = recoveryPhone(user);
  return [
    // (an account made with a mobile number only has no email to send to)
    ...(user.email ? [{ type: "email", masked: maskEmail(user.email), available: email.mode !== "none", devMode: email.mode === "dev", ...(email.mode === "none" ? { reason: "Email service is not configured." } : {}) }] : []),
    ...(phone ? [{ type: "sms", masked: maskPhone(phone), available: sms.mode !== "none", devMode: sms.mode === "dev", ...(sms.mode === "none" ? { reason: "SMS service is not configured." } : {}) }] : [])
  ];
}

/** Step 1. identifier: email, mobile number or Shop ID. */
export async function startRecovery(identifier) {
  const user = await findRecoveryAccount(identifier);
  if (!user) throw errors.notFound("We couldn't find an account with those details. Check them, or contact FrameX for help.", "ACCOUNT_NOT_FOUND");
  return { recoveryToken: makeTicket(user.id), accountType: user.role === "SHOP" ? "shop" : "customer", channels: channelsFor(user) };
}

/**
 * Step 2. Creates the code and gives it to the provider. Succeeds only if the
 * provider accepted the message (or, in explicit development mode, the dev
 * mailbox took it). A provider that isn't configured or refuses is an error
 * the caller sees: nothing is ever reported as sent when it wasn't.
 */
export async function sendRecoveryCode(ticket, channel) {
  const user = await userFromTicket(ticket);
  const option = channelsFor(user).find((c) => c.type === channel);
  if (!option) throw errors.badRequest("That option isn't available for this account.", "CHANNEL_UNAVAILABLE");
  if (!option.available) throw new HttpError(503, channel === "email" ? "EMAIL_NOT_CONFIGURED" : "SMS_NOT_CONFIGURED", option.reason);
  const dbChannel = channel === "email" ? "EMAIL" : "SMS";

  // Resend cooldown and hourly cap (per account).
  const recent = (await db.query("SELECT created_at FROM otp_codes WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC", [user.id, new Date(Date.now() - 3600_000)])).rows;
  const wait = recent.length ? Math.ceil((new Date(recent[0].created_at).getTime() + config.otp.resendSeconds * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) throw new HttpError(429, "OTP_COOLDOWN", `Please wait ${wait} seconds before asking for another code.`, { retryAfterSeconds: wait });
  if (recent.length >= config.otp.maxPerHour) throw new HttpError(429, "OTP_LIMIT", "Too many codes requested. Please try again in an hour.", { retryAfterSeconds: 3600 });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const destination = channel === "email" ? user.email : recoveryPhone(user);
  const otpId = newId();
  await db.tx(async (q) => {
    await q.query("UPDATE otp_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]); // a new code replaces any earlier one
    await q.query("INSERT INTO otp_codes (id, user_id, purpose, channel, destination, code_hash, expires_at) VALUES ($1, $2, 'PASSWORD_RESET', $3, $4, $5, $6)", [otpId, user.id, dbChannel, destination, otpHash(user.id, code), new Date(Date.now() + config.otp.minutes * 60_000)]);
  });

  let result;
  if (channel === "email") {
    const link = await issueToken(db, user.id, "PASSWORD_RESET"); // the email also carries a one-time link
    result = await sendMail({ to: user.email, ...messages.passwordResetCode(user.name, code, link.url, config.otp.minutes, config.tokens.passwordResetMinutes) });
  } else result = await sendOtpSms(destination, code);

  if (!result.delivered && result.reason !== "dev") {
    // Not sent: the code must not stay valid, and the attempt doesn't count against the user.
    await db.query("DELETE FROM otp_codes WHERE id = $1", [otpId]);
    await db.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    if (result.reason === "not_configured") throw new HttpError(503, channel === "email" ? "EMAIL_NOT_CONFIGURED" : "SMS_NOT_CONFIGURED", channel === "email" ? "Email service is not configured." : "SMS service is not configured.");
    throw new HttpError(502, channel === "email" ? "EMAIL_SEND_FAILED" : "SMS_SEND_FAILED", channel === "email" ? "We couldn't send the email right now. Please try again in a few minutes, or use another option." : "We couldn't send the text message right now. Please try again in a few minutes, or use another option.");
  }
  return { ok: true, channel, masked: option.masked, expiresInMinutes: config.otp.minutes, resendAfterSeconds: config.otp.resendSeconds, devMode: result.reason === "dev" };
}

/**
 * Step 3. Each wrong try is counted; after the limit the code is dead and a
 * new one must be requested. A correct code is used up and exchanged for a
 * normal single-use password-reset token.
 */
export async function verifyRecoveryCode(ticket, channel, code) {
  const invalid = () => errors.badRequest("That code is incorrect or has expired. Check it, or request a new code.", "OTP_INVALID");
  const locked = () => errors.badRequest("Too many wrong attempts. Please request a new code.", "OTP_LOCKED");
  const user = await userFromTicket(ticket);
  const otp = (
    await db.query("SELECT id, code_hash FROM otp_codes WHERE user_id = $1 AND channel = $2 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [user.id, channel === "email" ? "EMAIL" : "SMS"])
  ).rows[0];
  if (!otp) throw invalid();

  // Count the attempt first, in one statement, so parallel guesses can't exceed the limit.
  const counted = await db.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING attempts", [otp.id, config.otp.maxAttempts]);
  if (!counted.rows.length) {
    await db.query("UPDATE otp_codes SET used_at = now() WHERE id = $1", [otp.id]);
    throw locked();
  }
  if (!sameHash(otpHash(user.id, code), otp.code_hash)) {
    const left = config.otp.maxAttempts - counted.rows[0].attempts;
    if (left <= 0) {
      await db.query("UPDATE otp_codes SET used_at = now() WHERE id = $1", [otp.id]);
      throw locked();
    }
    throw errors.badRequest(`That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`, "OTP_INVALID");
  }
  return db.tx(async (q) => {
    const used = await q.query("UPDATE otp_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [otp.id]);
    if (!used.rows.length) throw invalid();
    const reset = await issueToken(q, user.id, "PASSWORD_RESET");
    return { resetToken: reset.token, expiresAt: reset.expiresAt };
  });
}

async function findToken(q, token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const { rows } = await q.query(
    `SELECT t.id, t.purpose, t.user_id, u.email, u.status, u.role, sh.shop_code, sh.name AS shop_name
       FROM auth_tokens t JOIN users u ON u.id = t.user_id LEFT JOIN shops sh ON sh.id = u.shop_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
    [hashToken(token)]
  );
  const row = rows[0];
  return row && row.status !== "DISABLED" ? row : null;
}

/** For the reset page: is this link still good, and what is it for? */
export async function tokenInfo(token) {
  const row = await findToken(db, token);
  if (!row) return { valid: false };
  return { valid: true, purpose: row.purpose, shop: row.shop_code ? { shopCode: row.shop_code, name: row.shop_name } : null };
}

/** Uses a reset / setup token exactly once and sets the new password. */
export async function completePasswordToken(token, password, ip) {
  const passwordHash = await hashPassword(password);
  return db.tx(async (q) => {
    const row = await findToken(q, token);
    if (!row) throw errors.badRequest("This link is no longer valid. Please request a new one.", "TOKEN_INVALID");
    // Marking it used in the same statement makes a second use (even a simultaneous one) fail.
    const used = await q.query("UPDATE auth_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [row.id]);
    if (!used.rows.length) throw errors.badRequest("This link has already been used. Please request a new one.", "TOKEN_INVALID");
    await q.query("UPDATE users SET password_hash = $1, password_changed_at = now(), status = 'ACTIVE', updated_at = now() WHERE id = $2", [passwordHash, row.user_id]);
    await revokeSessions(q, row.user_id);
    await q.query("UPDATE otp_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [row.user_id]);
    await audit(q, {
      actor: { id: row.user_id, role: row.role },
      action: row.purpose === "ACCOUNT_SETUP" ? ACTIONS.ACCOUNT_SETUP_COMPLETED : ACTIONS.PASSWORD_RESET,
      targetType: "user",
      targetId: row.user_id,
      ip
    });
    return { purpose: row.purpose, role: row.role, shopCode: row.shop_code || null };
  });
}

export async function changePassword(userId, sessionId, currentPassword, newPassword) {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw errors.validation({ currentPassword: "That isn't your current password." });
  }
  const passwordHash = await hashPassword(newPassword);
  await db.tx(async (q) => {
    await q.query("UPDATE users SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2", [passwordHash, userId]);
    await revokeSessions(q, userId, sessionId); // other devices are signed out
  });
}

export async function updateProfile(userId, { name, phone }) {
  if (phone) {
    const clash = await db.query("SELECT 1 FROM users WHERE phone = $1 AND id <> $2", [phone, userId]);
    if (clash.rows.length) throw errors.conflict("That phone number is used by another account.", { phone: "That phone number is used by another account." });
  }
  const sets = [];
  const params = [];
  if (name !== undefined) sets.push(`name = $${params.push(name)}`);
  if (phone !== undefined) sets.push(`phone = $${params.push(phone || null)}`);
  if (!sets.length) return;
  params.push(userId);
  await db.query(`UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
}

export { revokeSessions };
