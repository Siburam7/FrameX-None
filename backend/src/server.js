/* Entry point: check configuration, open the database, apply migrations, listen. */
import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";
import { db, initDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { describeConnection, pgConnection } from "./db/ssl.js";
import { emailStatus } from "./lib/mailer.js";
import { smsStatus } from "./lib/sms.js";
import { paymentStatus } from "./payments/index.js";
import { storageStatus } from "./lib/storage.js";
import { syncCatalog } from "./services/catalog-service.js";
import { labelOlderOrders, sweepAnalytics } from "./services/analytics-service.js";
import { sweepUnusedArtistMedia } from "./services/artist-service.js";
import { expireUnpaidAdvances } from "./services/painting-payment-service.js";
import { expireUnpaidOrders } from "./services/payment-service.js";
import { payoutsStatusLine } from "./services/payout-service.js";
import { checkKnownFiles } from "./services/storage-check.js";
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
  // Orders from before test payments were labelled get their label once (test payments are never counted as sales).
  await labelOlderOrders({ log: (m) => console.log(`[db] ${m}`) });

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
  // Visitor statistics and login records older than ANALYTICS_RETENTION_DAYS are deleted.
  const tidyAnalytics = () => sweepAnalytics().catch((error) => console.error("[analytics] cleanup failed:", error.message));
  setInterval(tidyAnalytics, 12 * 60 * 60 * 1000).unref();
  tidyAnalytics();
  const files = await storageStatus();
  // Every file the database knows still in the storage? (After a redeploy: the earlier deploys' files survived.) Counts only.
  const known = files.ready ? await checkKnownFiles().catch((error) => ({ error: error.message })) : null;

  // Online orders that were never paid: cancelled after PAYMENT_PENDING_MINUTES, and their stock is given back.
  const expire = () => expireUnpaidOrders().catch((error) => console.error("[payments] expiring unpaid orders failed:", error.message));
  setInterval(expire, 60 * 1000).unref();
  expire();
  // Accepted custom paintings whose advance was never paid are closed after CUSTOM_PAINTING_ADVANCE_DAYS.
  const closePaintings = () => expireUnpaidAdvances().catch((error) => console.error("[paintings] closing unpaid requests failed:", error.message));
  setInterval(closePaintings, 60 * 60 * 1000).unref();
  closePaintings();

  const admins = (await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).rows[0].n;
  // Whether the payout key works (it seals and opens a test value, and opens every saved account); never the key itself.
  const payoutsLine = await payoutsStatusLine().catch((error) => `payout accounts NOT CHECKED - ${error.message}`);
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`FrameX API listening on http://localhost:${config.port}  (${config.env}, database: ${db.kind})`);
    if (config.serveFrontend) console.log(`Website:        http://localhost:${config.port}/`);
    if (db.kind === "postgres") {
      const link = describeConnection(pgConnection(config.databaseUrl, config.databaseSsl), { production: config.isProd });
      console.log(`Database link:  ${link.ok ? "" : "WARNING: "}${link.text}`);
    }
    const describe = (label, st, fix) =>
      console.log(`${label} ${st.mode === "real" ? `READY (${st.provider})` : st.mode === "dev" ? "DEVELOPMENT MAILBOX ONLY - nothing is really sent" : `NOT CONFIGURED - ${st.problems.join(" ")} ${fix}`}`);
    describe("Email:         ", emailStatus(), "See backend/README.md -> Email.");
    describe("SMS codes:     ", smsStatus(), "See backend/README.md -> SMS.");
    const pay = paymentStatus();
    console.log(`Online payment: ${pay.ready ? `READY (${pay.provider}, ${pay.mode.toUpperCase()} mode${pay.webhookReady ? "" : ", webhook secret NOT set"})` : `NOT CONFIGURED - ${pay.problems.join(" ")} See backend/README.md -> Payments.`}`);
    console.log(`Cash on Delivery: ${config.checkout.cod.enabled ? "ON" : "OFF"}`);
    console.log(`Customer photos: ${files.ready ? `READY (kept in ${files.dir}, up to ${Math.round(config.uploads.maxBytes / 1048576)} MB each)` : `NOT WORKING - ${files.problem}`}`);
    if (files.ready && files.private === true) console.log("                 the bucket is private: it refused the test file to a request without keys");
    if (files.ready && files.private === false) console.log("                 WARNING: the bucket is PUBLIC: it sent the test file to a request without keys. Make it private in the storage provider's settings (Backblaze B2: Bucket Settings -> Files in Bucket are: Private).");
    if (files.ready && files.kind === "object" && files.private === null) console.log("                 could not tell whether the bucket is private (no clear answer to a request without keys)");
    if (known && known.error) console.log(`Stored files:   NOT CHECKED - ${known.error}`);
    else if (known && !known.missing) console.log(`Stored files:   all ${known.known} file(s) the database knows are in the storage`);
    else if (known) console.log(`Stored files:   WARNING: ${known.missing} of ${known.known} file(s) the database knows are MISSING from the storage (lost on a restart or a redeploy?)`);
    if (files.ready && files.kind === "disk" && config.isProd && !process.env.UPLOAD_DIR) console.log("                 WARNING: this is the server's own disk. If the host wipes it on a restart or a redeploy, every uploaded photo is lost. Use a persistent disk (UPLOAD_DIR) or a bucket (STORAGE_PROVIDER=s3).");
    console.log(`Gift wrapping:  ${config.checkout.giftWrap.enabled ? `ON (₹${config.checkout.giftWrap.fee} per order)` : "OFF"}`);
    console.log(`Analytics:      visitor statistics ${config.analytics.enabled ? "ON (only for visitors who allow them)" : "OFF"}; Google Analytics 4 ${config.analytics.ga4MeasurementId || (config.analytics.ga4Invalid ? "NOT USED - GA4_MEASUREMENT_ID is not a Measurement ID (G-XXXXXXXXXX)" : "not used")}`);
    console.log(`Custom paintings: ${config.paintings.advancePercent}% advance, ${100 - config.paintings.advancePercent}% when the painting is finished`);
    console.log(`Payouts:        ${payoutsLine}`);
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
