/* ==========================================================================
   Payment gateways.

   The checkout, the orders and the webhook route only use this file. A
   gateway is an object with these functions (see razorpay.js):

     name, label, methods[]             what to show at checkout
     clientConfig()                     what the browser may know (never a secret)
     createOrder({ amount, currency, receipt, notes, customer, returnUrl, expiresAt })
                                        -> { gatewayOrderId, amountMinor, currency, session? }
                                        session: what the browser needs to open this order's checkout (Cashfree)
     signedCheckout                     false = the checkout gives the browser no signature (Cashfree):
                                        the server then always asks the gateway what happened
     verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature }) -> boolean   (signed checkouts only)
     orderState(gatewayOrderId)         optional: "ACTIVE" | "PAID" | "EXPIRED"
     fetchPayment(id, { gatewayOrderId }) / listOrderPayments(gatewayOrderId) -> payment(s) as the gateway reports them
     capture(id, amount, currency, { gatewayOrderId })
     refund({ gatewayOrderId, gatewayPaymentId, amount, refundRef, notes }) -> { gatewayRefundId, amount, status }
     webhookReady(), verifyWebhookSignature(rawBody, headers), parseWebhook(body, headers, rawBody)
     check()                            are the credentials accepted?

   To add a gateway: write its file, add it to GATEWAYS and to
   PAYMENT_PROVIDERS in config.js, and set PAYMENT_PROVIDER.
   ========================================================================== */
import { config, paymentProblems } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { cashfree } from "./cashfree.js";
import { razorpay } from "./razorpay.js";

// Cashfree is the gateway FrameX uses. The Razorpay adapter stays selectable (PAYMENT_PROVIDER=razorpay)
// behind the same interface: one payment system, one gateway active at a time.
const GATEWAYS = { cashfree, razorpay };

/** { provider, mode, ready, problems[], webhookReady } — never contains a key. */
export function paymentStatus() {
  const provider = config.payments.provider;
  const gateway = GATEWAYS[provider];
  if (!gateway) return { provider: "none", mode: config.payments.mode, ready: false, webhookReady: false, problems: ["No payment gateway is configured (PAYMENT_PROVIDER=cashfree with CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET)."] };
  const problems = paymentProblems();
  return { provider, mode: config.payments.mode, ready: problems.length === 0, webhookReady: problems.length === 0 && gateway.webhookReady(), problems };
}

export const onlinePaymentsReady = () => paymentStatus().ready;

/** The configured gateway, or 503 when online payments can't be taken. */
export function gateway() {
  if (!paymentStatus().ready) throw new HttpError(503, "PAYMENT_NOT_CONFIGURED", "Online payment is not available right now.");
  return GATEWAYS[config.payments.provider];
}

/** A gateway by name, for its webhook address (null if it isn't the configured one). */
export const gatewayNamed = (name) => (paymentStatus().ready && config.payments.provider === name ? GATEWAYS[name] : null);
