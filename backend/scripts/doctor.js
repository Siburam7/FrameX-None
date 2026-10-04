/* ==========================================================================
   npm run doctor
   Says, in plain words, whether this backend can really deliver email and SMS,
   and exactly what is missing if it can't. Checks provider credentials with
   the provider (no message is sent). Does not open the database, so it is safe
   to run while the server is running.
   ========================================================================== */
import { config } from "../src/config.js";
import { checkEmailProvider, emailStatus, parseFrom } from "../src/lib/mailer.js";
import { checkSmsProvider, smsStatus } from "../src/lib/sms.js";

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

console.log("\nThe settings file is backend/.env (copy backend/.env.example). Restart the backend after changing it.\n");
