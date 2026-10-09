/* ==========================================================================
   Configuration: every setting comes from environment variables (backend/.env
   locally, the host's settings in production). Nothing secret lives in code.
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

// Where uploaded files are kept. Tests and in-memory runs get a throw-away folder of their own.
const uploadDir = env.UPLOAD_DIR ? path.resolve(env.UPLOAD_DIR) : isTest || inMemory ? path.join(os.tmpdir(), `framex-uploads-${process.pid}`) : path.join(dataDir, "uploads");
const megabytes = (v, fallback, max) => Math.min(max, Math.max(1, int(v, fallback))) * 1024 * 1024;

const placeholderSecret = !env.AUTH_SECRET || /replace-with/i.test(env.AUTH_SECRET);
const radiusOptions = list(env.NEARBY_RADIUS_OPTIONS_KM)
  .map(Number)
  .filter((n) => n > 0);
const port = int(env.PORT, 4000);

// EMAIL_PROVIDER names the provider; with only an API key set, Brevo (the documented default) is assumed.
const emailKey = env.EMAIL_PROVIDER_API_KEY || env.EMAIL_PROVIDER_KEY || "";
const emailProvider = (env.EMAIL_PROVIDER || (emailKey ? "brevo" : env.GMAIL_APP_PASSWORD ? "gmail" : "none")).toLowerCase();

export const EMAIL_PROVIDERS = ["brevo", "resend", "gmail", "smtp", "dev", "none"];
export const PAYMENT_PROVIDERS = ["cashfree", "razorpay", "none"];
// A Google Analytics 4 Measurement ID, e.g. G-AB12CD34EF.
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
export const RAZORPAY_API = "https://api.razorpay.com";
// Cashfree Payments: the sandbox for PAYMENT_MODE=test, the live API for PAYMENT_MODE=live.
export const CASHFREE_API = { test: "https://sandbox.cashfree.com/pg", live: "https://api.cashfree.com/pg" };
const money = (v, fallback) => Math.max(0, Math.round(int(v, fallback)));
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
  // The backend's own public address (https://api.example.com). Only needed so a payment gateway can be told where to send webhooks.
  publicApiUrl: (env.PUBLIC_API_URL || "").replace(/\/+$/, ""),
  corsOrigins: list(env.CORS_ORIGINS || (isProd ? "" : "http://localhost:5500,http://127.0.0.1:5500")),
  serveFrontend: bool(env.SERVE_FRONTEND, !isProd),
  // Folder that holds the website's catalogue files (js/edit.js, js/templates.js, js/studio.js, assets/js/services/...).
  catalogDir: path.resolve(env.CATALOG_DIR || PROJECT_ROOT),
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

  // Messages from the Contact page: at most this many alert emails an hour (the rest wait in the admin panel).
  contact: { alertsPerHour: int(env.CONTACT_ALERTS_PER_HOUR, 30) },

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

  // Online payments. Nothing can be paid online until a gateway is configured;
  // the secret and the webhook secret never leave the server.
  payments: {
    provider: (env.PAYMENT_PROVIDER || "none").toLowerCase(),
    mode: (env.PAYMENT_MODE || "test").toLowerCase(), // test | live
    razorpay: {
      keyId: (env.RAZORPAY_KEY_ID || "").trim(),
      keySecret: (env.RAZORPAY_KEY_SECRET || "").trim(),
      webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
      // Tests point this at a stand-in gateway. Production always uses Razorpay's own address.
      apiBase: (env.RAZORPAY_API_BASE || RAZORPAY_API).replace(/\/+$/, "")
    },
    cashfree: {
      clientId: (env.CASHFREE_CLIENT_ID || "").trim(),
      clientSecret: (env.CASHFREE_CLIENT_SECRET || "").trim(),
      apiVersion: (env.CASHFREE_API_VERSION || "2025-01-01").trim(),
      // Cashfree signs webhooks with the API secret unless a separate webhook secret was set up.
      webhookSecret: (env.CASHFREE_WEBHOOK_SECRET || "").trim(),
      // Tests point this at a stand-in gateway. Production always uses Cashfree's own address.
      apiBase: (env.CASHFREE_API_BASE || CASHFREE_API[(env.PAYMENT_MODE || "test").toLowerCase() === "live" ? "live" : "test"]).replace(/\/+$/, "")
    },
    // An order waiting for an online payment keeps its stock this long, then is cancelled.
    pendingMinutes: Math.max(5, int(env.PAYMENT_PENDING_MINUTES, 30)),
    brandName: env.PAYMENT_BRAND_NAME || "FrameX"
  },

  // What the server adds to an order. All amounts in whole rupees.
  checkout: {
    taxPercent: Math.min(100, Math.max(0, Number(env.TAX_PERCENT) || 0)), // added on top of item prices; 0 = prices already include tax
    shippingFee: money(env.SHIPPING_FEE, 0),
    freeShippingAbove: money(env.SHIPPING_FREE_ABOVE, 0), // 0 = the shipping fee always applies
    cod: {
      enabled: bool(env.COD_ENABLED, true),
      fee: money(env.COD_FEE, 0),
      maxOrderValue: money(env.COD_MAX_ORDER_VALUE, 0), // 0 = no upper limit
      blockedPincodes: list(env.COD_BLOCKED_PINCODES), // full PIN codes or prefixes, e.g. "7590,110001"
      blockedShops: list(env.COD_BLOCKED_SHOPS), // catalogue shop ids
      blockedProducts: list(env.COD_BLOCKED_PRODUCTS), // product ids
      allowCustomDesigns: bool(env.COD_ALLOW_CUSTOM_DESIGNS, true)
    },
    // Gift wrapping: an optional extra for the whole order, shown before the customer pays.
    giftWrap: {
      enabled: bool(env.GIFT_WRAP_ENABLED, true),
      fee: money(env.GIFT_WRAP_FEE, 49),
      blockedShops: list(env.GIFT_WRAP_BLOCKED_SHOPS), // catalogue shop ids or Shop IDs that don't gift wrap
      blockedProducts: list(env.GIFT_WRAP_BLOCKED_PRODUCTS) // product ids that can't be gift wrapped
    }
  },

  // Custom paintings: the part of the price paid before the artist starts (the rest is paid when the painting is finished).
  paintings: {
    advancePercent: Math.min(99, Math.max(1, Math.round(int(env.CUSTOM_PAINTING_ADVANCE_PERCENT, 40)))),
    maxReferencePhotos: 5,
    // An accepted request waits this long for its advance before it is closed.
    advanceDays: Math.max(1, int(env.CUSTOM_PAINTING_ADVANCE_DAYS, 7))
  },
  // FrameX's share of a sale, in percent. Recorded for reports; payouts to sellers are not automated.
  platform: { commissionPercent: Math.min(90, Math.max(0, Number(env.PLATFORM_COMMISSION_PERCENT) || 0)) },
  // Customer photos (the originals that are printed). Private: only served through
  // short-lived signed links made for the customer, FrameX staff or the shop that makes the order.
  uploads: {
    dir: uploadDir,
    maxBytes: megabytes(env.UPLOAD_MAX_MB, 50, 200), // one photo; a 4K photo is usually 3 to 25 MB
    maxSide: 30000, // pixels on the longest side
    linkSeconds: Math.min(3600, Math.max(30, int(env.UPLOAD_LINK_SECONDS, 300))), // how long a download link works
    maxWaitingPerUser: Math.max(10, int(env.UPLOAD_MAX_WAITING, 80)), // photos not yet part of an order
    unusedDays: Math.max(1, int(env.UPLOAD_UNUSED_DAYS, 30)) // a photo that never reached an order is removed after this
  },

  // Product pictures uploaded by shops (public: they are shown on product pages).
  media: { maxBytes: megabytes(env.MEDIA_MAX_MB, 12, 40), maxPerShop: Math.max(50, int(env.MEDIA_MAX_PER_SHOP, 600)) },

  // true = a shop's "Publish" becomes "Submit for review" until a FrameX admin approves the product.
  catalog: { productModeration: bool(env.PRODUCT_MODERATION, false) },

  // Cart limits. The quantity one line may hold also depends on the product's stock.
  cart: { maxLines: 50, noteMaxLength: 300 },

  // Analytics for the admin dashboard.
  //   - Sales, orders, payments, accounts: always read from the database. Nothing here switches those off.
  //   - Visitor statistics (pages, products, searches): collected by the website only from visitors who
  //     allowed analytics there. ANALYTICS_ENABLED=false stops collecting them altogether.
  //   - Google Analytics 4 is optional. A Measurement ID is public (it is part of every page that uses
  //     it), so the website gets it from /api/config; it is not a secret.
  analytics: {
    enabled: bool(env.ANALYTICS_ENABLED, true),
    ga4MeasurementId: GA4_ID.test(String(env.GA4_MEASUREMENT_ID || "").trim()) ? env.GA4_MEASUREMENT_ID.trim() : "",
    ga4Invalid: Boolean(String(env.GA4_MEASUREMENT_ID || "").trim()) && !GA4_ID.test(String(env.GA4_MEASUREMENT_ID).trim()),
    retentionDays: Math.min(1825, Math.max(30, int(env.ANALYTICS_RETENTION_DAYS, 400))), // visitor and login records older than this are deleted
    // The reports' calendar day. 330 = India time (UTC+5:30).
    utcOffsetMinutes: Math.min(840, Math.max(-720, Math.round(int(env.ANALYTICS_UTC_OFFSET_MINUTES, 330)))),
    // A cart that still holds items and was not touched for this long counts as abandoned.
    abandonedCartHours: Math.min(720, Math.max(1, int(env.ANALYTICS_ABANDONED_CART_HOURS, 24)))
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
  if (!PAYMENT_PROVIDERS.includes(config.payments.provider)) problems.push(`PAYMENT_PROVIDER must be one of: ${PAYMENT_PROVIDERS.join(", ")}.`);
  if (!["test", "live"].includes(config.payments.mode)) problems.push("PAYMENT_MODE must be test or live.");
  if (isProd && config.payments.razorpay.apiBase !== RAZORPAY_API) problems.push("RAZORPAY_API_BASE must not be set in production.");
  if (isProd && !Object.values(CASHFREE_API).includes(config.payments.cashfree.apiBase)) problems.push("CASHFREE_API_BASE must not be set in production.");
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

/** What is missing before online payments can be taken (empty = ready). */
export function paymentProblems() {
  const p = config.payments;
  const out = [];
  if (p.provider === "cashfree") {
    const c = p.cashfree;
    if (!c.clientId) out.push("CASHFREE_CLIENT_ID is not set.");
    if (!c.clientSecret) out.push("CASHFREE_CLIENT_SECRET is not set.");
    // Sandbox credentials in live mode (or the other way round) are a setup mistake: refuse rather than guess.
    const testKey = /^TEST/i.test(c.clientId) || /_test_/i.test(c.clientSecret);
    const liveKey = /_prod_/i.test(c.clientSecret);
    if (c.clientId && c.clientSecret && p.mode === "live" && testKey) out.push('PAYMENT_MODE is "live" but the Cashfree credentials are sandbox (test) credentials.');
    if (c.clientId && c.clientSecret && p.mode === "test" && liveKey) out.push('PAYMENT_MODE is "test" but the Cashfree credentials are production credentials.');
    return out;
  }
  if (p.provider !== "razorpay") return out;
  const r = p.razorpay;
  if (!r.keyId) out.push("RAZORPAY_KEY_ID is not set.");
  if (!r.keySecret) out.push("RAZORPAY_KEY_SECRET is not set.");
  // A test key in live mode (or the other way round) is a setup mistake: refuse rather than guess.
  if (r.keyId && p.mode === "test" && !r.keyId.startsWith("rzp_test_")) out.push('PAYMENT_MODE is "test" but RAZORPAY_KEY_ID is not a test key (rzp_test_...).');
  if (r.keyId && p.mode === "live" && !r.keyId.startsWith("rzp_live_")) out.push('PAYMENT_MODE is "live" but RAZORPAY_KEY_ID is not a live key (rzp_live_...).');
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
