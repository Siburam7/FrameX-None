/* ==========================================================================
   Configuration: every setting comes from environment variables (backend/.env
   locally, the host's settings in production). Nothing secret lives in code.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, "..");
export const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");

// Load backend/.env when present (real environment variables win).
const envFile = path.join(BACKEND_ROOT, ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);

const env = process.env;
const bool = (v, fallback) => (v === undefined || v === "" ? fallback : /^(1|true|yes|on)$/i.test(v));
const int = (v, fallback) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const nodeEnv = env.NODE_ENV || "development";
const isProd = nodeEnv === "production";
const isTest = nodeEnv === "test";
// DATA_DIR=memory keeps everything in memory (throw-away server for experiments and tests).
const inMemory = env.DATA_DIR === "memory";
const dataDir = env.DATA_DIR && !inMemory ? path.resolve(env.DATA_DIR) : path.join(BACKEND_ROOT, ".data");

/** Development only: a random secret kept in backend/.data so sessions survive restarts. */
function devSecret() {
  if (isTest || inMemory) return crypto.randomBytes(48).toString("base64url");
  const file = path.join(dataDir, "dev-auth-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const placeholderSecret = !env.AUTH_SECRET || /replace-with/i.test(env.AUTH_SECRET);
const radiusOptions = list(env.NEARBY_RADIUS_OPTIONS_KM)
  .map(Number)
  .filter((n) => n > 0);
const port = int(env.PORT, 4000);

// EMAIL_PROVIDER names the provider; with only an API key set, Brevo (the documented default) is assumed.
const emailKey = env.EMAIL_PROVIDER_API_KEY || env.EMAIL_PROVIDER_KEY || "";
const emailProvider = (env.EMAIL_PROVIDER || (emailKey ? "brevo" : env.GMAIL_APP_PASSWORD ? "gmail" : "none")).toLowerCase();

export const EMAIL_PROVIDERS = ["brevo", "resend", "gmail", "smtp", "dev", "none"];
export const SMS_PROVIDERS = ["fast2sms", "2factor", "twilio", "dev", "none"];

export const config = {
  env: nodeEnv,
  isProd,
  isTest,
  port,
  dataDir,
  inMemory: inMemory || isTest,
  databaseUrl: env.DATABASE_URL || "",
  databaseSsl: env.DATABASE_SSL || "",
  allowEmbeddedDbInProd: bool(env.ALLOW_EMBEDDED_DB, false),

  authSecret: placeholderSecret ? (isProd ? "" : devSecret()) : env.AUTH_SECRET,
  sessionTtlDays: int(env.SESSION_TTL_DAYS, 14),
  cookie: {
    name: "fx_session",
    sameSite: /^(none|strict)$/i.test(env.COOKIE_SAMESITE || "") ? env.COOKIE_SAMESITE.toLowerCase() : "lax",
    secure: bool(env.COOKIE_SECURE, isProd),
    domain: env.COOKIE_DOMAIN || ""
  },
  allowBearer: bool(env.AUTH_ALLOW_BEARER, false),

  frontendUrl: (env.FRONTEND_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
  // false = FRONTEND_URL wasn't set: links in messages then point back at the (allowed) site the request came from.
  frontendUrlSet: Boolean(env.FRONTEND_URL),
  corsOrigins: list(env.CORS_ORIGINS || (isProd ? "" : "http://localhost:5500,http://127.0.0.1:5500")),
  serveFrontend: bool(env.SERVE_FRONTEND, !isProd),
  trustProxy: int(env.TRUST_PROXY, 0),

  // Email. Nothing is sent unless a provider is configured: there is no silent fallback.
  email: {
    provider: emailProvider,
    key: emailKey,
    from: env.EMAIL_FROM || (env.GMAIL_USER ? `FrameX <${env.GMAIL_USER}>` : ""),
    replyTo: env.EMAIL_REPLY_TO || "",
    // Gmail: the account's address and a Google "App Password" (never the normal password). Spaces are ignored.
    gmail: { user: (env.GMAIL_USER || "").trim(), appPassword: (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "") },
    smtp: { host: env.SMTP_HOST || "", port: int(env.SMTP_PORT, 587), user: env.SMTP_USER || "", password: env.SMTP_PASSWORD || "" },
    adminNotify: env.ADMIN_NOTIFY_EMAIL || ""
  },

  // Text messages (password-reset codes). Off unless a provider is configured.
  sms: {
    provider: (env.SMS_PROVIDER || "none").toLowerCase(),
    key: env.SMS_API_KEY || env.SMS_PROVIDER_KEY || "",
    senderId: env.SMS_SENDER_ID || "",
    templateId: env.SMS_TEMPLATE_ID || "",
    twilio: { accountSid: env.TWILIO_ACCOUNT_SID || "", authToken: env.TWILIO_AUTH_TOKEN || "", from: env.TWILIO_FROM || "" }
  },

  // One-time codes: 6 digits, short life, few tries, a wait before re-sending, a cap per hour.
  otp: {
    minutes: int(env.OTP_EXPIRY_MINUTES, 10),
    maxAttempts: int(env.OTP_MAX_ATTEMPTS, 5),
    resendSeconds: int(env.OTP_RESEND_SECONDS, 30),
    maxPerHour: int(env.OTP_MAX_PER_HOUR, 5)
  },

  geocoder: {
    provider: (env.GEOCODER_PROVIDER || "nominatim").toLowerCase(),
    contactEmail: env.GEOCODER_CONTACT_EMAIL || "",
    key: env.MAP_PROVIDER_KEY || ""
  },

  // The ONE place nearby-search limits are defined (the website reads them from GET /api/config).
  nearby: {
    radiusOptionsKm: radiusOptions.length ? radiusOptions : [5, 10, 25, 50],
    defaultRadiusKm: int(env.NEARBY_DEFAULT_RADIUS_KM, 25),
    maxRadiusKm: int(env.NEARBY_MAX_RADIUS_KM, 100),
    maxResults: 50
  },

  tokens: { passwordResetMinutes: 60, accountSetupHours: 72 },
  rateLimit: { enabled: bool(env.RATE_LIMIT_ENABLED, true) }
};

// The dev mailbox exists only outside production, and only while email or SMS uses the "dev" provider.
config.devMailbox = !isProd && (config.email.provider === "dev" || config.sms.provider === "dev");

/** Stop a production server from starting with unsafe settings. */
export function assertConfig() {
  const problems = [];
  if (isProd && !config.authSecret) problems.push("AUTH_SECRET must be set to a long random string.");
  if (isProd && config.authSecret && config.authSecret.length < 32) problems.push("AUTH_SECRET must be at least 32 characters.");
  if (isProd && !config.databaseUrl && !config.allowEmbeddedDbInProd) problems.push("DATABASE_URL must be set (or ALLOW_EMBEDDED_DB=true with a persistent disk).");
  if (isProd && !config.frontendUrlSet) problems.push("FRONTEND_URL must be set to the website's public address (it is used in password-reset links).");
  if (isProd && config.email.provider === "dev") problems.push('EMAIL_PROVIDER "dev" is not allowed in production.');
  if (isProd && config.sms.provider === "dev") problems.push('SMS_PROVIDER "dev" is not allowed in production.');
  if (!EMAIL_PROVIDERS.includes(config.email.provider)) problems.push(`EMAIL_PROVIDER must be one of: ${EMAIL_PROVIDERS.join(", ")}.`);
  if (!SMS_PROVIDERS.includes(config.sms.provider)) problems.push(`SMS_PROVIDER must be one of: ${SMS_PROVIDERS.join(", ")}.`);
  // Missing email / SMS credentials do not stop the server: accounts keep working, the start-up
  // banner and "npm run doctor" say what is missing, and the API answers "... service is not configured."
  if (isProd && !config.corsOrigins.length && !config.serveFrontend) problems.push("CORS_ORIGINS must list the website's origin.");
  if (config.cookie.sameSite === "none" && !config.cookie.secure) problems.push("COOKIE_SAMESITE=none requires HTTPS (COOKIE_SECURE=true).");
  if (problems.length) throw new Error("Configuration problem:\n - " + problems.join("\n - "));
}

/** What is missing before real email can be sent (empty = ready). */
export function emailProblems() {
  const e = config.email;
  const out = [];
  if (e.provider === "brevo" || e.provider === "resend") {
    if (!e.key) out.push("EMAIL_PROVIDER_API_KEY is not set.");
    if (!e.from) out.push('EMAIL_FROM is not set (a sender address verified with the provider, e.g. "FrameX <support@example.com>").');
  }
  if (e.provider === "gmail" && (!e.gmail.user || !e.gmail.appPassword)) out.push('GMAIL_USER and GMAIL_APP_PASSWORD are not set (run "npm run email:setup").');
  if (e.provider === "smtp" && !e.smtp.host) out.push("SMTP_HOST is not set.");
  if (e.provider === "smtp" && !e.from) out.push("EMAIL_FROM is not set.");
  return out;
}

/** What is missing before real SMS can be sent (empty = ready). */
export function smsProblems() {
  const m = config.sms;
  const out = [];
  if (["fast2sms", "2factor"].includes(m.provider) && !m.key) out.push("SMS_API_KEY is not set.");
  if (m.provider === "twilio" && !(m.twilio.accountSid && m.twilio.authToken && m.twilio.from)) out.push("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are not all set.");
  return out;
}
