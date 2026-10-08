/* ==========================================================================
   Emails about an order, in the FrameX layout (lib/mailer.js -> htmlEmail).
   orderEmail(kind, order, extra) -> { subject, text, html, links }

   `order` is the customer's view of the order (services/order-service.js).
   Sent through the configured email provider; each kind is sent once per
   order (order_notifications), however often a webhook is repeated.
   ========================================================================== */
import { linkBase } from "./context.js";
import { esc, htmlEmail } from "./mailer.js";

const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const INSTRUMENT = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", paylater: "Pay later" };
const paidWith = (order) => (order.paymentMethod === "COD" ? "Cash on Delivery" : INSTRUMENT[order.paymentInstrument] || "Online payment");

const orderUrl = (order) => `${linkBase()}/order.html?id=${encodeURIComponent(order.orderNumber)}`;

function tables(order) {
  const a = order.shippingAddress || {};
  return [
    {
      title: `Order ${order.orderNumber}`,
      rows: order.items.map((i) => [`${esc(i.name)}${i.size ? ` <span style="color:#5b5f6b">(${esc(i.size)})</span>` : ""} × ${i.quantity}`, rupees(i.lineTotal)])
    },
    {
      rows: [
        ["Subtotal", rupees(order.subtotal)],
        order.discount ? ["Discount", "−" + rupees(order.discount)] : null,
        ["Delivery", rupees(order.shippingFee)],
        order.tax ? [`Tax (${order.taxPercent}%)`, rupees(order.tax)] : null,
        order.giftWrap ? ["Gift wrapping", rupees(order.giftWrapFee)] : null,
        order.codFee ? ["Cash on Delivery fee", rupees(order.codFee)] : null,
        ["Total", rupees(order.total), true],
        ["Payment", esc(paidWith(order))]
      ].filter(Boolean)
    },
    {
      title: "Delivery address",
      rows: [[[a.fullName, a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), a.postalCode].filter(Boolean).map(esc).join("<br>"), esc(a.phone || "")]]
    }
  ];
}

function plainSummary(order) {
  const a = order.shippingAddress || {};
  return [
    `Order ${order.orderNumber}`,
    ...order.items.map((i) => `- ${i.name}${i.size ? ` (${i.size})` : ""} x ${i.quantity}: ${rupees(i.lineTotal)}`),
    `Subtotal: ${rupees(order.subtotal)}`,
    order.discount ? `Discount: -${rupees(order.discount)}` : "",
    `Delivery: ${rupees(order.shippingFee)}`,
    order.tax ? `Tax: ${rupees(order.tax)}` : "",
    order.giftWrap ? `Gift wrapping: ${rupees(order.giftWrapFee)}` : "",
    order.codFee ? `Cash on Delivery fee: ${rupees(order.codFee)}` : "",
    `Total: ${rupees(order.total)}`,
    `Payment: ${paidWith(order)}`,
    "",
    "Delivery address:",
    [a.fullName, a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), a.postalCode, a.phone].filter(Boolean).join(", ")
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// An order from before photos were uploaded to FrameX.
const PHOTOS = "Your order includes a personalised design. Please send your photos to FrameX on WhatsApp, quoting your order number, so we can print them.";
const photosReceived = (n) => `We have your ${n === 1 ? "photo" : `${n} photos`} with this order. ${n === 1 ? "It is" : "They are"} printed in the same original quality you uploaded: FrameX does not enhance or change your image.`;
const GIFT = "Your order will be gift wrapped.";

/** What each email says. Each entry: (order, extra) -> { subject, heading, lines[], button } */
const COPY = {
  ORDER_PLACED_COD: (o) => ({
    subject: `Order ${o.orderNumber} placed: pay ${rupees(o.total)} on delivery`,
    heading: "Your order is placed",
    lines: [`Thank you for your order. You chose Cash on Delivery: please keep ${rupees(o.total)} ready when it arrives.`, "The shop will confirm your order and the delivery time."],
    button: "View order"
  }),
  ORDER_PLACED_PAID: (o) => ({
    subject: `Payment received: order ${o.orderNumber} is placed`,
    heading: "Payment received, order placed",
    lines: [`We received your payment of ${rupees(o.total)} (${paidWith(o)}). Your order is placed.`, "The shop will confirm your order and the delivery time."],
    button: "View order"
  }),
  PAYMENT_FAILED: (o, x) => ({
    subject: `Payment not completed: order ${o.orderNumber}`,
    heading: "Your payment didn't go through",
    lines: [
      `Your payment of ${rupees(o.total)} for order ${o.orderNumber} was not completed${x.reason ? ` (${x.reason})` : ""}. The order is not placed yet.`,
      "You can try again with the same or another payment method. If any money left your account, your bank or payment app normally returns it automatically.",
      o.expiresAt ? "We are holding your items for a short while. After that the order is cancelled and you can check out again." : ""
    ],
    button: "Retry payment"
  }),
  ORDER_SHIPPED: (o) => ({
    subject: `Order ${o.orderNumber} has been shipped`,
    heading: "Your order is on its way",
    lines: [`Order ${o.orderNumber} has been shipped.`, o.paymentMethod === "COD" && o.paymentStatus !== "PAID" ? `Please keep ${rupees(o.total)} ready to pay on delivery.` : ""],
    button: "View order"
  }),
  ORDER_DELIVERED: (o) => ({
    subject: `Order ${o.orderNumber} was delivered`,
    heading: "Your order was delivered",
    lines: [`Order ${o.orderNumber} has been delivered. We hope you love it.`, o.paymentMethod === "COD" ? `Your cash payment of ${rupees(o.total)} was received.` : ""],
    button: "View order"
  }),
  ORDER_CANCELLED: (o, x) => ({
    subject: `Order ${o.orderNumber} was cancelled`,
    heading: "Your order was cancelled",
    lines: [`Order ${o.orderNumber} has been cancelled${x.reason ? `: ${x.reason}` : "."}`, x.refundAmount ? `A refund of ${rupees(x.refundAmount)} to your original payment method has been started.` : o.paymentMethod === "COD" ? "Nothing was charged." : ""],
    button: "View order"
  }),
  REFUND_INITIATED: (o, x) => ({
    subject: `Refund started for order ${o.orderNumber}`,
    heading: "Your refund has been started",
    lines: [`A refund of ${rupees(x.amount)} for order ${o.orderNumber} has been started. It goes back to the payment method you used.`, "Your bank or payment app decides how quickly it shows in your account."],
    button: "View order"
  }),
  REFUND_COMPLETED: (o, x) => ({
    subject: `Refund completed for order ${o.orderNumber}`,
    heading: "Your refund is complete",
    lines: [`Your refund of ${rupees(x.amount)} for order ${o.orderNumber} has been processed by the payment gateway.`],
    button: "View order"
  })
};

export const EMAIL_KINDS = Object.keys(COPY);

export function orderEmail(kind, order, extra = {}) {
  const c = COPY[kind](order, extra);
  const lines = c.lines.filter(Boolean);
  const placed = kind === "ORDER_PLACED_COD" || kind === "ORDER_PLACED_PAID";
  if (placed && order.needsPhotos) lines.push(PHOTOS);
  else if (placed && order.photoCount) lines.push(photosReceived(order.photoCount));
  if (placed && order.giftWrap) lines.push(GIFT);
  const url = orderUrl(order);
  const name = (order.customer && order.customer.name) || "there";
  return {
    subject: c.subject,
    text: `Hi ${name},\n\n${lines.join("\n\n")}\n\n${plainSummary(order)}\n\n${c.button}: ${url}\n\n— FrameX\nFrameX will never ask you for your card number, CVV, UPI PIN or password.`,
    html: htmlEmail({
      preview: c.subject,
      heading: c.heading,
      paragraphs: [`Hi ${esc(name)},`, ...lines.map(esc)],
      tables: tables(order),
      button: { label: c.button, url, note: "" },
      notice: `You received this email because an order was placed with this address on FrameX (${order.orderNumber}).`,
      account: false
    }),
    links: [{ label: c.button, url }]
  };
}
