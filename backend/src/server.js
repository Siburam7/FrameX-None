/* Entry point: check configuration, open the database, apply migrations, listen. */
import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";
import { db, initDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { emailStatus } from "./lib/mailer.js";
import { smsStatus } from "./lib/sms.js";

async function main() {
  assertConfig();
  await initDb();
  await migrate({ log: (m) => console.log(`[db] ${m}`) });

  // Housekeeping: expired sessions and used / expired one-time links.
  const sweep = () =>
    Promise.all([
      db.query("DELETE FROM sessions WHERE expires_at < now() - interval '7 days'"),
      db.query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'")
    ]).catch((error) => console.error("[db] cleanup failed:", error.message));
  setInterval(sweep, 6 * 60 * 60 * 1000).unref();

  const admins = (await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).rows[0].n;
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`FrameX API listening on http://localhost:${config.port}  (${config.env}, database: ${db.kind})`);
    if (config.serveFrontend) console.log(`Website:        http://localhost:${config.port}/`);
    const describe = (label, st, fix) =>
      console.log(`${label} ${st.mode === "real" ? `READY (${st.provider})` : st.mode === "dev" ? "DEVELOPMENT MAILBOX ONLY - nothing is really sent" : `NOT CONFIGURED - ${st.problems.join(" ")} ${fix}`}`);
    describe("Email:         ", emailStatus(), "See backend/README.md -> Email.");
    describe("SMS codes:     ", smsStatus(), "See backend/README.md -> SMS.");
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
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
