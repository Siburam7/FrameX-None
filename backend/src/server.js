/* Entry point: check configuration, open the database, apply migrations, listen. */
import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";
import { db, initDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { emailStatus } from "./lib/mailer.js";
import { smsStatus } from "./lib/sms.js";
import { paymentStatus } from "./payments/index.js";
import { storageStatus } from "./lib/storage.js";
import { syncCatalog } from "./services/catalog-service.js";
import { sweepUnusedArtistMedia } from "./services/artist-service.js";
import { expireUnpaidAdvances } from "./services/painting-payment-service.js";
import { expireUnpaidOrders } from "./services/payment-service.js";
import { loadSettings } from "./services/settings-service.js";
import { sweepUnusedMedia } from "./services/shop-product-service.js";
import { sweepUnusedUploads } from "./services/upload-service.js";

async function main() {
  assertConfig();
  await initDb();
  await migrate({ log: (m) => console.log(`[db] ${m}`) });
  // Products and templates: imported from the website's catalogue files into the database.
  await syncCatalog({ log: (m) => console.log(`[db] ${m}`) });
  // What a FrameX admin changed in the dashboard (fees, the custom-painting advance) replaces the environment's defaults.
  await loadSettings();

  // Housekeeping: expired sessions and used / expired one-time links.
  const sweep = () =>
    Promise.all([
      db.query("DELETE FROM sessions WHERE expires_at < now() - interval '7 days'"),
      db.query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'")
    ]).catch((error) => console.error("[db] cleanup failed:", error.message));
  setInterval(sweep, 6 * 60 * 60 * 1000).unref();

  // Customer photos that never reached an order (and left every cart) are removed after UPLOAD_UNUSED_DAYS.
  const tidyUploads = () =>
    sweepUnusedUploads()
      .then(() => sweepUnusedMedia()) // product pictures no product uses any more
      .then(() => sweepUnusedArtistMedia()) // artists' pictures no profile or artwork uses any more
      .catch((error) => console.error("[uploads] cleanup failed:", error.message));
  setInterval(tidyUploads, 6 * 60 * 60 * 1000).unref();
  tidyUploads();
  const files = await storageStatus();

  // Online orders that were never paid: cancelled after PAYMENT_PENDING_MINUTES, and their stock is given back.
  const expire = () => expireUnpaidOrders().catch((error) => console.error("[payments] expiring unpaid orders failed:", error.message));
  setInterval(expire, 60 * 1000).unref();
  expire();
  // Accepted custom paintings whose advance was never paid are closed after CUSTOM_PAINTING_ADVANCE_DAYS.
  const closePaintings = () => expireUnpaidAdvances().catch((error) => console.error("[paintings] closing unpaid requests failed:", error.message));
  setInterval(closePaintings, 60 * 60 * 1000).unref();
  closePaintings();

  const admins = (await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).rows[0].n;
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`FrameX API listening on http://localhost:${config.port}  (${config.env}, database: ${db.kind})`);
    if (config.serveFrontend) console.log(`Website:        http://localhost:${config.port}/`);
    const describe = (label, st, fix) =>
      console.log(`${label} ${st.mode === "real" ? `READY (${st.provider})` : st.mode === "dev" ? "DEVELOPMENT MAILBOX ONLY - nothing is really sent" : `NOT CONFIGURED - ${st.problems.join(" ")} ${fix}`}`);
    describe("Email:         ", emailStatus(), "See backend/README.md -> Email.");
    describe("SMS codes:     ", smsStatus(), "See backend/README.md -> SMS.");
    const pay = paymentStatus();
    console.log(`Online payment: ${pay.ready ? `READY (${pay.provider}, ${pay.mode.toUpperCase()} mode${pay.webhookReady ? "" : ", webhook secret NOT set"})` : `NOT CONFIGURED - ${pay.problems.join(" ")} See backend/README.md -> Payments.`}`);
    console.log(`Cash on Delivery: ${config.checkout.cod.enabled ? "ON" : "OFF"}`);
    console.log(`Customer photos: ${files.ready ? `READY (kept in ${files.dir}, up to ${Math.round(config.uploads.maxBytes / 1048576)} MB each)` : `NOT WORKING - ${files.problem}`}`);
    if (config.isProd && !process.env.UPLOAD_DIR) console.log("                 WARNING: UPLOAD_DIR is not set. On a host without a persistent disk, uploaded photos are lost when the service restarts.");
    console.log(`Gift wrapping:  ${config.checkout.giftWrap.enabled ? `ON (₹${config.checkout.giftWrap.fee} per order)` : "OFF"}`);
    console.log(`Custom paintings: ${config.paintings.advancePercent}% advance, ${100 - config.paintings.advancePercent}% when the painting is finished`);
    if (config.devMailbox) console.log(`Dev mailbox:    http://localhost:${config.port}/dev/mailbox`);
    console.log("Check setup:    npm run doctor");
    if (!admins) console.log('No admin account yet. Create one with:  npm run admin:create');
  });

  const stop = async () => {
    server.close();
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Windows: closing the console window (SIGHUP) or Ctrl+Break. The database is closed cleanly either way.
  process.on("SIGHUP", stop);
  process.on("SIGBREAK", stop);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
