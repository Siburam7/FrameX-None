/* Send ONE real text message with a test code and show what the provider answered:
     npm run sms:test -- 9876543210
   This uses your SMS credit. Reports "accepted" only when the provider accepted the request. */
import crypto from "node:crypto";
import { config } from "../src/config.js";
import { sendOtpSms, smsStatus } from "../src/lib/sms.js";
import { normalizePhone } from "../src/lib/validate.js";

config.isTest = true; // keep the output to the lines below

async function main() {
  const to = normalizePhone(process.argv[2] || "");
  if (!to) throw new Error("Give the mobile number to send to:  npm run sms:test -- 9876543210");
  const status = smsStatus();
  if (status.mode === "none") throw new Error(`SMS service is not configured. ${status.problems.join(" ")}  Run "npm run doctor" for the exact steps.`);
  if (status.mode === "dev") throw new Error('SMS_PROVIDER is "dev": nothing is really sent. Configure a real provider (see "npm run doctor").');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const result = await sendOtpSms(to, code);
  if (!result.delivered) throw new Error(`${status.provider} did not accept the request: ${result.detail}`);
  console.log(`${status.provider} ACCEPTED a text message for ${to} (provider id: ${result.id}).`);
  console.log(`The test code sent was ${code}. Check that it arrives on the phone: that is the final proof.`);
}

main().catch((error) => {
  console.error("SMS test failed: " + (error.message || error));
  process.exitCode = 1;
});
