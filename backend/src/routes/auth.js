/* /api/auth — sign up, log in, log out, current user, forgot / reset password. */
import { Router } from "express";
import { config } from "../config.js";
import { errors } from "../lib/errors.js";
import { hit, rateLimit } from "../lib/rate-limit.js";
import { clearSessionCookie, setSessionCookie } from "../lib/security.js";
import { v, validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import * as auth from "../services/auth-service.js";

const router = Router();
const MINUTE = 60_000;

/** Starts a session: httpOnly cookie always; the token itself only when bearer mode is switched on. */
async function startSession(req, res, userId, status = 200) {
  const session = await auth.createSession(userId, req);
  setSessionCookie(res, session.token, session.expiresAt);
  res.status(status).json({ user: await auth.publicUser(userId), ...(config.allowBearer ? { token: session.token, expiresAt: session.expiresAt } : {}) });
}

// Public sign-up creates CUSTOMER accounts only. Any "role" sent by the client is ignored.
router.post("/signup", rateLimit("signup", { windowMs: 60 * MINUTE, max: 10 }), async (req, res) => {
  const data = validate(req.body, {
    name: v.string({ min: 2, max: 80, label: "Name" }),
    email: v.email(),
    phone: v.phone(),
    password: v.password(),
    confirmPassword: v.secret({ label: "Confirm password" })
  });
  if (data.password !== data.confirmPassword) throw errors.validation({ confirmPassword: "The passwords don't match." });
  const userId = await auth.signupCustomer(data);
  await startSession(req, res, userId, 201);
});

router.post("/login", rateLimit("login-ip", { windowMs: 15 * MINUTE, max: 30 }), async (req, res) => {
  const data = validate(req.body, {
    identifier: v.string({ min: 3, max: 254, label: "This field" }),
    password: v.secret(),
    accountType: v.enumOf(["customer", "shop"], { required: false })
  });
  // Slows down guessing one account's password from many addresses.
  hit("login-id", data.identifier.toLowerCase(), { windowMs: 15 * MINUTE, max: 10 });
  const userId = await auth.login({ ...data, accountType: data.accountType || "customer" });
  await startSession(req, res, userId);
});

router.post("/logout", async (req, res) => {
  if (req.auth) await auth.logout(req.auth.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// 200 in both cases, so a logged-out visitor doesn't produce console errors.
router.get("/me", async (req, res) => {
  res.json(req.auth ? { authenticated: true, user: await auth.publicUser(req.auth.user.id) } : { authenticated: false, user: null });
});

/* ---- Forgot password ----
   start  -> which account, and how a code can be sent (masked email / mobile)
   send   -> a 6-digit code goes out through the email or SMS provider
   verify -> a correct code becomes a one-time reset token for /reset-password */
router.post("/recovery/start", rateLimit("recovery-start", { windowMs: 15 * MINUTE, max: 12 }), async (req, res) => {
  const { identifier } = validate(req.body, { identifier: v.string({ min: 3, max: 254, label: "This field" }) });
  hit("recovery-id", identifier.toLowerCase(), { windowMs: 15 * MINUTE, max: 8 });
  res.json(await auth.startRecovery(identifier));
});

router.post("/recovery/send", rateLimit("recovery-send", { windowMs: 15 * MINUTE, max: 12 }), async (req, res) => {
  const data = validate(req.body, { recoveryToken: v.string({ min: 20, max: 400, label: "Request" }), channel: v.enumOf(["email", "sms"], { label: "Option" }) });
  res.json(await auth.sendRecoveryCode(data.recoveryToken, data.channel));
});

router.post("/recovery/verify", rateLimit("recovery-verify", { windowMs: 15 * MINUTE, max: 40 }), async (req, res) => {
  const data = validate(req.body, {
    recoveryToken: v.string({ min: 20, max: 400, label: "Request" }),
    channel: v.enumOf(["email", "sms"], { label: "Option" }),
    code: v.string({ min: 6, max: 6, label: "Code", pattern: /^\d{6}$/, patternMessage: "Enter the 6-digit code." })
  });
  res.json(await auth.verifyRecoveryCode(data.recoveryToken, data.channel, data.code));
});

router.post("/token-info", rateLimit("token-info", { windowMs: 15 * MINUTE, max: 40 }), async (req, res) => {
  const { token } = validate(req.body, { token: v.string({ min: 20, max: 200, label: "Link" }) });
  res.json(await auth.tokenInfo(token));
});

// Password reset AND first-time shop password setup (the token decides which).
router.post("/reset-password", rateLimit("reset", { windowMs: 15 * MINUTE, max: 15 }), async (req, res) => {
  const data = validate(req.body, { token: v.string({ min: 20, max: 200, label: "Link" }), password: v.password(), confirmPassword: v.secret({ label: "Confirm password" }) });
  if (data.password !== data.confirmPassword) throw errors.validation({ confirmPassword: "The passwords don't match." });
  const result = await auth.completePasswordToken(data.token, data.password, req.ip);
  clearSessionCookie(res);
  res.json({ ok: true, ...result });
});

router.post("/change-password", requireAuth, rateLimit("change-password", { windowMs: 15 * MINUTE, max: 10 }), async (req, res) => {
  const data = validate(req.body, { currentPassword: v.secret({ label: "Current password" }), newPassword: v.password(), confirmPassword: v.secret({ label: "Confirm password" }) });
  if (data.newPassword !== data.confirmPassword) throw errors.validation({ confirmPassword: "The passwords don't match." });
  if (data.newPassword === data.currentPassword) throw errors.validation({ newPassword: "Choose a password you haven't used here before." });
  await auth.changePassword(req.auth.user.id, req.auth.sessionId, data.currentPassword, data.newPassword);
  res.json({ ok: true });
});

export default router;
