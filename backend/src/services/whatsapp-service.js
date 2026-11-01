/* ==========================================================================
   WhatsApp messages FrameX sends by itself (owner, 2026-11-01: "jitna bhi abhi
   manual send karna padta hai … automatic"). What the admin used to send by
   hand from their own WhatsApp now goes from the FrameX business number:

     orderUpdate(orderId, kind)   the customer, about their order: placed, payment failed, shipped, out for
                                  delivery, delivered, cancelled, refund. Only when they said yes at checkout.
     sellerNewOrder(…)            each shop and artist of a new order (the same news as their email).
     accountApproved(…)           a new shop or artist, once their login's setup link has been emailed.

   Each message is one Meta-approved template (lib/whatsapp.js). PREVIEW holds
   the same words as the templates in the Fast2SMS panel: change both together.
   Every message is kept in whatsapp_messages, one row per (kind, ref, phone):
   the same news is never sent twice, and the admin sees what went and what
   failed. Nothing is stored or sent while WhatsApp isn't set up.
   Each kind has its own switch in Admin → Settings → WhatsApp messages.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { indianMobile, sendWhatsAppTemplate, whatsappStatus } from "../lib/whatsapp.js";
import { newId } from "../lib/tokens.js";

const sending = new Set();
/** Tests: wait until every WhatsApp message that was started has been handed to the provider. */
export const whatsappSettled = async () => {
  while (sending.size) await Promise.all([...sending]);
};
const track = (job) => {
  sending.add(job);
  job.finally(() => sending.delete(job));
  return job;
};

const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/** The customer's words for each order event (the {{3}} "Status:" of framex_order_update). */
const STATUS = {
  ORDER_PLACED_COD: (o) => `Placed. Please pay ${rupees(o.total)} in cash on delivery`,
  ORDER_PLACED_PAID: (o) => `Placed. Payment of ${rupees(o.total)} received`,
  PAYMENT_FAILED: () => "Payment did not go through. You can try again from your order page",
  ORDER_SHIPPED: () => "Shipped and on its way",
  ORDER_OUT_FOR_DELIVERY: (o) => (o.payment_method === "COD" && o.payment_status !== "PAID" ? `Out for delivery today. Please keep ${rupees(o.total)} ready (cash on delivery)` : "Out for delivery today"),
  ORDER_DELIVERED: () => "Delivered. We hope you love it",
  ORDER_CANCELLED: () => "Cancelled",
  REFUND_INITIATED: (o, x) => `Refund of ${rupees(x.amount)} started. Banks usually take a few working days`,
  REFUND_COMPLETED: (o, x) => `Refund of ${rupees(x.amount)} completed`
};
export const ORDER_KINDS = Object.keys(STATUS);

/** The messages as customers read them, word for word the approved templates. */
const PREVIEW = {
  orderUpdate: ([name, number, status], button) => `Hello ${name}, there is an update on your FrameX order ${number}.\n\nStatus: ${status}\n\nTap the button below to see your order. Thank you for shopping with FrameX.\n[View order: ${config.frontendUrl || ""}/order.html?id=${button}]`,
  sellerNewOrder: ([name, number, items, payment], button) => `Hello ${name}, you have a new FrameX order ${number}: ${items}.\n\nPayment: ${payment}\n\nPlease accept it in your FrameX dashboard.\n[Open dashboard: ${config.frontendUrl || ""}/${button}]`,
  accountApproved: ([name, business, code]) => `Hello ${name}, good news: ${business} is approved on FrameX. Your FrameX ID is ${code}.\n\nWe have emailed you the link to set up your login. Please check your inbox and spam folder.\n\nThank you for joining FrameX.\n[Open FrameX]`
};

/**
 * One message, once: the row is written first (ON CONFLICT nothing), then the template is sent and the row says
 * what happened. -> "sent" | "dev" | "failed" | "repeat" (already sent) | "off" (WhatsApp not set up) | "bad_number"
 */
async function sendOnce({ kind, ref, phone, template, values, button = null, preview }) {
  if (whatsappStatus().mode === "none") return "off";
  const number = indianMobile(phone);
  if (!number) return "bad_number";
  const id = newId();
  const claimed = await db.query("INSERT INTO whatsapp_messages (id, kind, ref, phone, template, status) VALUES ($1, $2, $3, $4, $5, 'SENDING') ON CONFLICT (kind, ref, phone) DO NOTHING RETURNING id", [id, kind, String(ref), number, String(template)]);
  if (!claimed.rows[0]) return "repeat";
  const result = await sendWhatsAppTemplate({ to: number, template, values, button, preview });
  const status = result.delivered ? "SENT" : result.reason === "dev" ? "NOT_SENT" : "FAILED";
  await db.query("UPDATE whatsapp_messages SET status = $2, request_id = $3, detail = $4 WHERE id = $1", [id, status, result.delivered ? String(result.id) : null, result.delivered ? null : [result.reason, result.detail].filter(Boolean).join(": ").slice(0, 300)]);
  return result.delivered ? "sent" : result.reason === "dev" ? "dev" : "failed";
}

const quietly = (label, work) =>
  track(
    (async () => {
      try {
        return await work();
      } catch (error) {
        console.error(`[whatsapp] ${label} failed: ${error.message}`);
        return "failed";
      }
    })()
  );

/** The customer hears about their order on WhatsApp (they said yes at checkout). ref/extra as for the order email. */
export function orderUpdate(orderId, kind, { ref = "", extra = {} } = {}) {
  return quietly(`${kind} for order ${orderId}`, async () => {
    if (!config.whatsapp.orderUpdates || !STATUS[kind]) return "off";
    const o = (await db.query("SELECT order_number, customer_name, customer_phone, whatsapp_updates, total, payment_method, payment_status FROM orders WHERE id = $1", [orderId])).rows[0];
    if (!o || !o.whatsapp_updates) return "off";
    const values = [firstName(o.customer_name), o.order_number, STATUS[kind](o, extra)];
    return sendOnce({ kind: "ORDER_UPDATE", ref: `${o.order_number}:${kind}:${ref}`, phone: o.customer_phone, template: config.whatsapp.templates.orderUpdate, values, button: o.order_number, preview: PREVIEW.orderUpdate(values, o.order_number) });
  });
}

/**
 * A shop or an artist hears about a new order (their items only, as in their email).
 * seller: { key ("shop:<id>" | "artist:<id>"), name, phone, dashboard ("shop-dashboard.html" | "artist-dashboard.html") }
 */
export function sellerNewOrder({ orderNumber, seller, items, payment }) {
  return quietly(`new-order alert ${orderNumber}`, async () => {
    if (!config.whatsapp.sellerAlerts) return "off";
    const values = [seller.name || "there", orderNumber, items, payment];
    return sendOnce({ kind: "SELLER_NEW_ORDER", ref: `${orderNumber}:${seller.key}`, phone: seller.phone, template: config.whatsapp.templates.sellerNewOrder, values, button: seller.dashboard, preview: PREVIEW.sellerNewOrder(values, seller.dashboard) });
  });
}

/** A new shop or artist hears they are approved, once the email with their setup link has gone. */
export function accountApproved({ code, name, business, phone }) {
  return quietly(`approval of ${code}`, async () => {
    if (!config.whatsapp.accountApproved) return "off";
    const values = [firstName(name), business, code];
    return sendOnce({ kind: "ACCOUNT_APPROVED", ref: code, phone, template: config.whatsapp.templates.accountApproved, values, preview: PREVIEW.accountApproved(values) });
  });
}

/** Admin: the latest messages, newest first, and how many went / failed in the last 30 days. */
export async function recentMessages(limit = 50) {
  const rows = (await db.query("SELECT id, kind, ref, phone, status, request_id, detail, created_at FROM whatsapp_messages ORDER BY created_at DESC LIMIT $1", [Math.min(200, Math.max(1, limit))])).rows;
  const counts = (await db.query("SELECT status, count(*)::int AS n FROM whatsapp_messages WHERE created_at > now() - interval '30 days' GROUP BY status")).rows;
  const by = Object.fromEntries(counts.map((r) => [r.status, r.n]));
  const status = whatsappStatus();
  return {
    service: { mode: status.mode, problems: status.problems },
    last30Days: { sent: by.SENT || 0, failed: by.FAILED || 0, notSent: by.NOT_SENT || 0 },
    messages: rows.map((r) => ({ id: r.id, kind: r.kind, ref: r.ref, phone: `+91 ${r.phone.slice(0, 5)} ${r.phone.slice(5)}`, status: r.status, requestId: r.request_id, detail: r.detail, at: r.created_at }))
  };
}
