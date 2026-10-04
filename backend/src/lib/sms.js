/* ==========================================================================
   Text messages (one-time codes), behind one function: sendOtpSms(to, code).

   SMS_PROVIDER
     fast2sms  Fast2SMS (India). Default choice: its OTP route sends without the
               business doing its own DLT registration. SMS_API_KEY = API key.
               With SMS_SENDER_ID + SMS_TEMPLATE_ID set, its DLT route is used.
     2factor   2Factor.in (India). SMS_API_KEY; SMS_TEMPLATE_ID = the approved
               OTP template name in the 2Factor panel (optional).
     twilio    Twilio. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.
     none      Not configured. NOTHING is sent; the website says
               "SMS service is not configured".
     dev       Development testing only, chosen explicitly, refused in
               production. Nothing is sent; messages are listed at /dev/mailbox.

   India: operators deliver business SMS only through DLT-registered senders
   and templates. Fast2SMS's OTP route and 2Factor's approved OTP templates
   cover that for you; Twilio needs your own DLT registration.
   (MSG91 is deliberately not supported: its API answers "success" even for an
   invalid key, so a send could not be confirmed.)

   sendOtpSms() never pretends. It returns
     { delivered: true,  id }                       the provider accepted the request
     { delivered: false, reason: "not_configured" | "dev" | "provider_error", detail }
   The code itself is never logged.
   ========================================================================== */
import { config, smsProblems } from "../config.js";
import { pushDevMessage } from "./mailer.js";

/** real = a provider is fully configured; dev = development mailbox; none = nothing can be sent. */
export function smsStatus() {
  const provider = config.sms.provider;
  if (provider === "none") return { provider, mode: "none", problems: ["No SMS provider is configured (SMS_PROVIDER / SMS_API_KEY)."] };
  if (provider === "dev") return { provider, mode: config.devMailbox ? "dev" : "none", problems: [] };
  const problems = smsProblems();
  return { provider, mode: problems.length ? "none" : "real", problems };
}
export const smsDelivery = () => smsStatus().mode;

const indian10 = (to) => (/^\+91\d{10}$/.test(to) ? to.slice(3) : null);

async function json(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* not JSON */
  }
  return { ok: response.ok, status: response.status, data: data || {} };
}

const refuse = (name, r, text) => new Error(`${name} answered ${r.status}: ${text || "request refused"}`);

/* ---- Fast2SMS: POST /dev/bulkV2, API key in the "authorization" header ---- */
async function sendFast2Sms(to, code) {
  const number = indian10(to);
  if (!number) throw new Error("Fast2SMS only sends to Indian mobile numbers (+91).");
  const { senderId, templateId } = config.sms;
  const body = senderId && templateId ? { route: "dlt", sender_id: senderId, message: templateId, variables_values: `${code}|`, numbers: number } : { route: "otp", variables_values: code, numbers: number };
  const r = await json("https://www.fast2sms.com/dev/bulkV2", { method: "POST", headers: { authorization: config.sms.key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (!r.ok || r.data.return !== true) throw refuse("Fast2SMS", r, Array.isArray(r.data.message) ? r.data.message.join(" ") : r.data.message);
  return r.data.request_id || "accepted";
}

/* ---- 2Factor: GET /API/V1/{key}/SMS/{phone}/{otp}[/{template}] ---- */
async function sendTwoFactor(to, code) {
  const phone = indian10(to) || to;
  const template = config.sms.templateId ? "/" + encodeURIComponent(config.sms.templateId) : "";
  const r = await json(`https://2factor.in/API/V1/${encodeURIComponent(config.sms.key)}/SMS/${encodeURIComponent(phone)}/${code}${template}`, { method: "GET", headers: { Accept: "application/json" } });
  if (!r.ok || String(r.data.Status).toLowerCase() !== "success") throw refuse("2Factor", r, r.data.Details);
  return r.data.Details || "accepted";
}

/* ---- Twilio: POST Messages.json with basic auth ---- */
async function sendTwilio(to, text) {
  const { accountSid, authToken, from } = config.sms.twilio;
  const r = await json(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: text })
  });
  if (!r.ok) throw refuse("Twilio", r, r.data.message);
  return r.data.sid || "accepted";
}

/** Sentence used where the provider lets us send our own text. */
export const otpText = (code) => `${code} is your FrameX verification code. It expires in ${config.otp.minutes} minutes. Do not share it with anyone.`;

function explain(error) {
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return "The SMS provider did not answer in time.";
  if (error && error.cause && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(String(error.cause.code))) return "Could not reach the SMS provider. Check the internet connection.";
  return String(error.message || error).slice(0, 220);
}

/** to: "+919876543210". Sends the one-time code and reports what the provider said. */
export async function sendOtpSms(to, code) {
  const status = smsStatus();
  if (status.mode === "none") return { delivered: false, reason: "not_configured", detail: status.problems.join(" ") };
  if (status.mode === "dev") {
    pushDevMessage({ kind: "sms", to, subject: "Text message (SMS)", text: otpText(code) });
    if (!config.isTest) console.log(`[dev-sms] NOT SENT (development mailbox): code for ${to}`);
    return { delivered: false, reason: "dev" };
  }
  try {
    let id;
    if (status.provider === "fast2sms") id = await sendFast2Sms(to, code);
    else if (status.provider === "2factor") id = await sendTwoFactor(to, code);
    else id = await sendTwilio(to, otpText(code));
    if (!config.isTest) console.log(`[sms] ${status.provider} accepted a code for ${to} (id ${id})`);
    return { delivered: true, id };
  } catch (error) {
    const detail = explain(error);
    console.error(`[sms] ${status.provider} did NOT accept a code for ${to}: ${detail}`);
    return { delivered: false, reason: "provider_error", detail };
  }
}

/** Check the provider credentials without sending anything. { ok, detail } */
export async function checkSmsProvider() {
  const status = smsStatus();
  if (status.mode !== "real") return { ok: false, detail: status.mode === "dev" ? "Development mailbox: nothing is really sent." : status.problems.join(" ") };
  try {
    if (status.provider === "fast2sms") {
      const r = await json(`https://www.fast2sms.com/dev/wallet?authorization=${encodeURIComponent(config.sms.key)}`, { headers: { Accept: "application/json" } });
      if (!r.ok || r.data.return !== true) throw refuse("Fast2SMS", r, r.data.message);
      return { ok: true, detail: `Fast2SMS key accepted. Wallet balance: Rs ${r.data.wallet}.` };
    }
    if (status.provider === "2factor") {
      const r = await json(`https://2factor.in/API/V1/${encodeURIComponent(config.sms.key)}/BAL/SMS`, { headers: { Accept: "application/json" } });
      if (!r.ok || String(r.data.Status).toLowerCase() !== "success") throw refuse("2Factor", r, r.data.Details);
      return { ok: true, detail: `2Factor key accepted. SMS balance: ${r.data.Details}.` };
    }
    if (status.provider === "twilio") {
      const { accountSid, authToken } = config.sms.twilio;
      const r = await json(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, { headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") } });
      if (!r.ok) throw refuse("Twilio", r, r.data.message);
      return { ok: true, detail: `Twilio account accepted (${r.data.status || "active"}).` };
    }
    return { ok: false, detail: "Unknown SMS provider." };
  } catch (error) {
    return { ok: false, detail: explain(error) };
  }
}
