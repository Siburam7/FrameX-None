/* Send ONE real email with the current settings and show what the provider answered:
     npm run email:test -- someone@example.com
   Reports "accepted" only when the provider accepted the message. */
import { config } from "../src/config.js";
import { emailStatus, messages, sendMail } from "../src/lib/mailer.js";

const to = process.argv[2];
config.isTest = true; // keep the output to the lines below

async function main() {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error("Give the address to send to:  npm run email:test -- you@example.com");
  const status = emailStatus();
  if (status.mode === "none") throw new Error(`Email service is not configured. ${status.problems.join(" ")}  Run "npm run doctor" for the exact steps.`);
  if (status.mode === "dev") throw new Error('EMAIL_PROVIDER is "dev": nothing is really sent. Configure a real provider (see "npm run doctor").');
  const result = await sendMail({ to, ...messages.test() });
  if (!result.delivered) throw new Error(`${status.provider} did not accept the message: ${result.detail}`);
  console.log(`${status.provider} ACCEPTED the message for ${to} (provider id: ${result.id}).`);
  console.log("Now check that inbox (and the spam folder). Accepted means the provider took it for delivery; arriving in the inbox is the final proof.");
}

main().catch((error) => {
  console.error("Email test failed: " + (error.message || error));
  process.exitCode = 1;
});
