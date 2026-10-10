/* ==========================================================================
   npm run doctor
   Says, in plain words, whether this backend can really deliver email and SMS,
   take payments and keep customer photos, and exactly what is missing if it
   can't. Checks provider credentials with the provider (no message is sent).
   Does not open the database, so it is safe to run while the server is running.
   ========================================================================== */
import { config } from "../src/config.js";
import { checkEmailProvider, emailStatus, parseFrom } from "../src/lib/mailer.js";
import { checkSmsProvider, smsStatus } from "../src/lib/sms.js";
import { storageStatus } from "../src/lib/storage.js";
import { gateway, paymentStatus } from "../src/payments/index.js";

const line = (ok, label, detail) => console.log(`${ok === true ? "[ OK ]" : ok === false ? "[FAIL]" : "[ -- ]"} ${label}${detail ? "\n        " + detail : ""}`);

console.log(`\nFrameX backend check (${config.env})\n`);

line(config.frontendUrlSet || !config.isProd ? (config.frontendUrlSet ? true : null) : false, `Website address for links: ${config.frontendUrlSet ? config.frontendUrl : "not set"}`, config.frontendUrlSet ? "" : "FRONTEND_URL is not set. Locally, links go back to the site the request came from. In production it must be set, e.g. FRONTEND_URL=https://siburam7.github.io/FrameX-None");
line(config.databaseUrl ? true : null, `Database: ${config.databaseUrl ? "PostgreSQL (DATABASE_URL)" : "embedded (local file, development)"}`, config.databaseUrl ? "" : "For production set DATABASE_URL to a hosted PostgreSQL.");

const email = emailStatus();
if (email.mode === "real") {
  const check = await checkEmailProvider();
  line(check.ok, `Email: ${email.provider}, from ${parseFrom(config.email.from).email}`, check.detail + (check.ok ? "\n        Send a real test:  npm run email:test -- you@example.com" : ""));
} else if (email.mode === "dev") line(null, "Email: DEVELOPMENT MAILBOX ONLY", "No email is really sent. Remove EMAIL_PROVIDER=dev and configure a provider for real delivery.");
else line(false, "Email: NOT CONFIGURED - no email can be sent", `${email.problems.join(" ")}\n        Fix: create a Brevo account, verify a sender address, then put in backend/.env:\n          EMAIL_PROVIDER=brevo\n          EMAIL_PROVIDER_API_KEY=<your Brevo API key>\n          EMAIL_FROM="FrameX <your-verified-sender@example.com>"`);

const sms = smsStatus();
if (sms.mode === "real") {
  const check = await checkSmsProvider();
  line(check.ok, `SMS: ${sms.provider}`, check.detail + (check.ok ? "\n        Send a real test (costs one SMS):  npm run sms:test -- 9876543210" : ""));
} else if (sms.mode === "dev") line(null, "SMS: DEVELOPMENT MAILBOX ONLY", "No SMS is really sent. Remove SMS_PROVIDER=dev and configure a provider for real delivery.");
else line(false, "SMS: NOT CONFIGURED - no code can be sent to a phone", `${sms.problems.join(" ")}\n        Fix: create a Fast2SMS account, add credit, then put in backend/.env:\n          SMS_PROVIDER=fast2sms\n          SMS_API_KEY=<your Fast2SMS API key>`);

const pay = paymentStatus();
if (pay.ready) {
  const check = await gateway().check();
  line(check.ok, `Online payment: ${pay.provider}, ${pay.mode.toUpperCase()} mode`, check.detail + (pay.mode === "test" ? "\n        Test mode: no real money moves. Pay with the gateway's test cards and test UPI IDs." : ""));
  line(pay.webhookReady ? true : null, `Payment webhook secret: ${pay.webhookReady ? "set" : "not set"}`, pay.webhookReady ? `Webhook address to enter at the gateway:  <your backend address>/api/payments/webhook/${pay.provider}` : "Payments still work (the server asks the gateway after each payment), but a payment finished after the customer closes the page is only noticed when they come back. Set RAZORPAY_WEBHOOK_SECRET and add the webhook at the gateway.");
} else
  line(false, "Online payment: NOT CONFIGURED - customers can't pay online", `${pay.problems.join(" ")}\n        Fix: create a Cashfree Payments account, copy the TEST (sandbox) API keys, then put in backend/.env:\n          PAYMENT_PROVIDER=cashfree\n          PAYMENT_MODE=test\n          CASHFREE_CLIENT_ID=...\n          CASHFREE_CLIENT_SECRET=...\n        (Razorpay still works too: PAYMENT_PROVIDER=razorpay\n          PAYMENT_MODE=test\n          RAZORPAY_KEY_ID=rzp_test_...\n          RAZORPAY_KEY_SECRET=<the key secret>\n          RAZORPAY_WEBHOOK_SECRET=<the secret you choose for the webhook>`);
const k = config.checkout;
line(null, `Cash on Delivery: ${k.cod.enabled ? "ON" : "OFF"}${k.cod.enabled ? ` (fee ₹${k.cod.fee}${k.cod.maxOrderValue ? `, up to ₹${k.cod.maxOrderValue}` : ""})` : ""}`, `Delivery charge ₹${k.shippingFee}${k.freeShippingAbove ? ` (free from ₹${k.freeShippingAbove})` : ""}, tax ${k.taxPercent}% added at checkout. Change these in backend/.env (SHIPPING_FEE, SHIPPING_FREE_ABOVE, TAX_PERCENT, COD_*).`);

const wrap = k.giftWrap;
line(null, `Gift wrapping: ${wrap.enabled ? `ON (₹${wrap.fee} per order)` : "OFF"}`, "Change it in backend/.env (GIFT_WRAP_ENABLED, GIFT_WRAP_FEE). A shop can switch it off for itself or for one product.");

const files = await storageStatus();
const mb = Math.round(config.uploads.maxBytes / 1048576);
if (!files.ready && files.kind === "object") line(false, "Uploaded files: NOT WORKING - photos can't be uploaded or shown", `${files.dir}: ${files.problem}\n        Check S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (the key needs read and write access to this bucket).`);
else if (!files.ready) line(false, "Customer photos: NOT WORKING - personalised products can't be ordered", `The folder ${files.dir} can't be written to: ${files.problem}\n        Fix: set UPLOAD_DIR in backend/.env to a folder this server may write to.`);
else if (files.kind === "object") line(true, `Uploaded files: kept in ${files.dir} (up to ${mb} MB each, links last ${config.uploads.linkSeconds} s)`, "A test file was written, read back and removed just now. The bucket stays private: the server sends every file itself.");
else
  line(
    config.isProd && !process.env.UPLOAD_DIR ? null : true,
    `Customer photos: kept in ${files.dir} (up to ${mb} MB each, links last ${config.uploads.linkSeconds} s)`,
    config.isProd && !process.env.UPLOAD_DIR
      ? "UPLOAD_DIR is not set. In production the folder must be on a disk that survives restarts and redeploys, or uploaded photos are lost."
      : "Stored exactly as uploaded (never resized or enhanced) and never public. Back this folder up together with the database."
  );
{
  const a = config.analytics;
  line(
    a.ga4Invalid ? false : null,
    `Analytics: visitor statistics ${a.enabled ? "ON (only for visitors who allow them)" : "OFF (ANALYTICS_ENABLED=false)"}; Google Analytics 4 ${a.ga4MeasurementId ? a.ga4MeasurementId : "not used"}`,
    a.ga4Invalid ? "GA4_MEASUREMENT_ID is not a GA4 Measurement ID. It looks like G-AB12CD34EF (GA4 -> Admin -> Data streams). GA4 stays off until it is corrected." : `Reports use UTC${a.utcOffsetMinutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(a.utcOffsetMinutes) / 60)).padStart(2, "0")}:${String(Math.abs(a.utcOffsetMinutes) % 60).padStart(2, "0")} days; visitor records are kept ${a.retentionDays} days.`
  );
}
line(null, `Custom paintings: ${config.paintings.advancePercent}% advance when the artist accepts, ${100 - config.paintings.advancePercent}% when the painting is finished`, "Change it in the admin dashboard (Settings) or with CUSTOM_PAINTING_ADVANCE_PERCENT. Requests already made keep the split they were made with.");
line(null, `Shop products: ${config.catalog.productModeration ? "a shop's first Publish waits for FrameX approval (PRODUCT_MODERATION=true)" : "go on sale when the shop publishes them (PRODUCT_MODERATION=false)"}`);

console.log("\nThe settings file is backend/.env (copy backend/.env.example). Restart the backend after changing it.\n");
