/* ==========================================================================
   WhatsApp messages from the FrameX business number, behind one function:
   sendWhatsAppTemplate({ to, template, values, button, preview }).

   WHATSAPP_PROVIDER
     fast2sms  The WhatsApp Business API through Fast2SMS (owner, 2026-11-01),
               its "Advanced API": POST /dev/whatsapp/<version>/<phone_number_id>/messages
               with Meta's own message shape. WHATSAPP_API_KEY = the Fast2SMS API
               key, sent in the Authorization header (never in the address);
               WHATSAPP_PHONE_NUMBER_ID = the business number's id. The templates
               are made in the Fast2SMS panel and approved by Meta;
               config.whatsapp.templates names each one by its template name.
     none      Not configured. NOTHING is sent.
     dev       Development testing only, chosen explicitly, refused in
               production. Nothing is sent; messages are listed at /dev/mailbox.

   A business can only start a WhatsApp conversation with an approved template:
   `values` fill its {{1}}, {{2}}…, `button` fills the {{1}} of a "Visit website"
   button with a dynamic link. `preview` is the message as the customer reads it
   (for the development mailbox and the tests; the real text is Meta's copy).

   sendWhatsAppTemplate() never pretends. It returns
     { delivered: true,  id }   Fast2SMS accepted it (WhatsApp delivers it a moment later)
     { delivered: false, reason: "not_configured" | "dev" | "bad_number" | "provider_error", detail }
   ========================================================================== */
import { config, whatsappProblems } from "../config.js";
import { pushDevMessage } from "./mailer.js";

/** real = a provider is fully configured; dev = development mailbox; none = nothing can be sent. */
export function whatsappStatus() {
  const provider = config.whatsapp.provider;
  if (provider === "none") return { provider, mode: "none", problems: ["No WhatsApp provider is configured (WHATSAPP_PROVIDER / WHATSAPP_API_KEY)."] };
  if (provider === "dev") return { provider, mode: config.devMailbox ? "dev" : "none", problems: [] };
  const problems = whatsappProblems();
  return { provider, mode: problems.length ? "none" : "real", problems };
}

/** "+91 98765 43210", "09876543210", "919876543210" -> "9876543210"; null when it can't be an Indian mobile number. */
export function indianMobile(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

// WhatsApp refuses new lines, tabs and long runs of spaces in a template value; "|" separates the values.
const clean = (value) => String(value ?? "").replace(/[|\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200);

function explain(error) {
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return "The WhatsApp provider did not answer in time.";
  if (error && error.cause && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(String(error.cause.code))) return "Could not reach the WhatsApp provider. Check the internet connection.";
  return String(error.message || error).slice(0, 220);
}

/* ---- Fast2SMS Advanced API: POST /dev/whatsapp/<version>/<phone_number_id>/messages, Meta's message shape.
   The body's {{1}}, {{2}}… are one "body" component; a "Visit website" button's {{1}} is its own "button"
   component (Fast2SMS support, 2026-11-01: it must not be added to the body values). ---- */
async function sendFast2Sms(number, template, values, button) {
  const w = config.whatsapp;
  const components = [];
  if (values.length) components.push({ type: "body", parameters: values.map((v) => ({ type: "text", text: clean(v) })) });
  if (button != null) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: clean(button) }] });
  const body = { messaging_product: "whatsapp", recipient_type: "individual", to: "91" + number, type: "template", template: { name: String(template), language: { code: w.language }, components } };
  const url = `${w.apiBase}/dev/whatsapp/${encodeURIComponent(w.apiVersion)}/${encodeURIComponent(w.phoneNumberId)}/messages`;
  const response = await fetch(url, { method: "POST", headers: { Authorization: w.key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  let data = {};
  try {
    data = (await response.json()) || {};
  } catch {
    /* not JSON */
  }
  const sent = Array.isArray(data.messages) && data.messages[0] && data.messages[0].id;
  if (!response.ok || !sent) {
    const why = (data.error && (data.error.error_user_msg || data.error.message)) || (Array.isArray(data.message) ? data.message.join(" ") : data.message) || "request refused";
    throw new Error(`Fast2SMS answered ${response.status}: ${why}`);
  }
  return data.messages[0].id;
}

/** to: any way of writing an Indian mobile number. Sends one template message and reports what the provider said. */
export async function sendWhatsAppTemplate({ to, template, values = [], button = null, preview = "" }) {
  const status = whatsappStatus();
  if (status.mode === "none") return { delivered: false, reason: "not_configured", detail: status.problems.join(" ") };
  const number = indianMobile(to);
  if (!number) return { delivered: false, reason: "bad_number", detail: "Not an Indian mobile number." };
  if (!template) return { delivered: false, reason: "not_configured", detail: "No template id is set for this message." };
  if (status.mode === "dev") {
    pushDevMessage({ kind: "whatsapp", to: "+91" + number, subject: `WhatsApp (template ${template})`, text: preview || values.map(clean).join(" | ") });
    if (!config.isTest) console.log(`[dev-whatsapp] NOT SENT (development mailbox): template ${template} for +91${number}`);
    return { delivered: false, reason: "dev" };
  }
  try {
    const id = await sendFast2Sms(number, template, values, button);
    if (!config.isTest) console.log(`[whatsapp] fast2sms accepted template ${template} for +91${number} (id ${id})`);
    return { delivered: true, id };
  } catch (error) {
    const detail = explain(error);
    console.error(`[whatsapp] fast2sms did NOT accept template ${template} for +91${number}: ${detail}`);
    return { delivered: false, reason: "provider_error", detail };
  }
}
