/* ==========================================================================
   Admin dashboard: customer orders (admin.html#/orders). ADMIN role only.

     #/orders[?status=&q=]      every order, newest first
     #/orders/<FX-number>       one order: move it forward, cancel it, refund it
     #/orders/updates           tell every customer whose order is under way its status, on WhatsApp

   WhatsApp: nothing is sent by FrameX or by this page. A WhatsApp button opens the admin's OWN WhatsApp
   (the app on a phone, WhatsApp Desktop or WhatsApp Web) in a chat with the customer's number, with the
   message already written; the admin presses Send there. That is free and needs no account or key, and it
   also means one press per customer: a page cannot send a WhatsApp message by itself. So this page says
   "opened", never "sent". (The customer's emails about each status change are sent by the backend as before.)

   The page is only a view of /api/admin/orders. The backend decides which
   status changes are allowed (order.nextStatuses), marks Cash on Delivery as
   paid when an order is delivered, refunds a cancelled paid order through the
   payment gateway and sends the customer's emails. Order status and payment
   status are always shown separately.

   The customer's ORIGINAL photos of every item can be downloaded here for
   printing (a short-lived link from the backend; each download is written to
   the audit log). Gift wrapping and each shop's progress are shown too.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const http = () => FrameX.http;
  const view = () => FrameX.orderView;

  const ACTION = {
    CONFIRMED: "Confirm order",
    PROCESSING: "Mark as being made",
    SHIPPED: "Mark as shipped",
    OUT_FOR_DELIVERY: "Mark as out for delivery",
    DELIVERED: "Mark as delivered",
    RETURNED: "Mark as returned",
    CANCELLED: "Cancel order",
  };
  const FILTERS = [["", "All"], ["PLACED", "New"], ["CONFIRMED", "Confirmed"], ["PROCESSING", "Being made"], ["SHIPPED", "Shipped"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"], ["PENDING_PAYMENT", "Waiting for payment"], ["CANCELLED", "Cancelled"], ["RETURNED", "Returned"]];

  /* ---------------------------------------------------------------- WhatsApp */
  const WA_ACTIVE = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY"];
  // What the message says about each status. Facts of the order only: no promises FrameX hasn't made.
  const WA_STATUS = {
    PENDING_PAYMENT: "is waiting for payment. You can pay from the order page.",
    PLACED: "has been received. We will confirm it shortly.",
    CONFIRMED: "is confirmed and will be prepared soon.",
    PROCESSING: "is being made.",
    SHIPPED: "has been shipped and is on its way.",
    OUT_FOR_DELIVERY: "is out for delivery.",
    DELIVERED: "has been delivered. We hope you love it.",
    CANCELLED: "has been cancelled.",
    RETURNED: "has been marked as returned.",
  };
  const WA_KEY = "framex.admin.waOpened.v1";

  /** "+91 98765 43210" -> "919876543210" (what wa.me wants); "" when it can't be a mobile number. */
  function waNumber(phone) {
    const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length === 10) return "91" + digits;
    return digits.length >= 11 && digits.length <= 15 ? digits : "";
  }
  const orderLink = (o) => `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}order.html?id=${encodeURIComponent(o.orderNumber)}`;
  function waText(o) {
    const first = String(o.customer.name || "").trim().split(/\s+/)[0];
    // A list row carries its first item; a whole order carries all of them.
    const item = o.firstItem || (o.items && o.items[0]);
    const count = o.itemCount || (o.items ? o.items.length : 1);
    const what = item ? ` (${item.name}${count > 1 ? ` + ${count - 1} more` : ""})` : "";
    const lines = [`Hello${first ? " " + first : ""}, this is FrameX.`, "", `Your order ${o.orderNumber}${what} ${WA_STATUS[o.status] || "has been updated."}`];
    if (o.paymentMethod === "COD" && o.paymentStatus !== "PAID" && WA_ACTIVE.includes(o.status)) lines.push(`Cash on Delivery: ${formatPrice(o.total)} to pay when it arrives.`);
    lines.push("", `See your order: ${orderLink(o)}`, "", "Thank you for ordering with FrameX.");
    return lines.join("\n");
  }
  const waUrl = (o) => (waNumber(o.customer.phone) ? `https://wa.me/${waNumber(o.customer.phone)}?text=${encodeURIComponent(waText(o))}` : "");

  // Which chats this browser has opened (order + the status it had), so the list can show where the admin got to.
  function waOpened() {
    try {
      return JSON.parse(window.localStorage.getItem(WA_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function waRemember(o) {
    try {
      const all = waOpened();
      const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
      Object.keys(all).forEach((k) => all[k] < week && delete all[k]);
      all[`${o.orderNumber}:${o.status}`] = Date.now();
      window.localStorage.setItem(WA_KEY, JSON.stringify(all));
    } catch (e) {
      /* storage blocked: the list just doesn't remember */
    }
  }
  const waOpenedAt = (o) => waOpened()[`${o.orderNumber}:${o.status}`] || 0;
  /** Opens the chat in one WhatsApp tab that is used again for the next customer. -> false when the browser refused. */
  function waOpen(o) {
    const url = waUrl(o);
    if (!url) return false;
    const tab = window.open(url, "framex-whatsapp");
    if (!tab) return false;
    try {
      tab.opener = null;
    } catch (e) {
      /* another site already */
    }
    waRemember(o);
    return true;
  }
  // The shops and artists of an order (o.sellers, admin only): a message to tell each one about it.
  const dashLink = (s, o) => `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}${s.type === "ARTIST" ? "artist-dashboard.html" : "shop-dashboard.html"}#/orders/${encodeURIComponent(o.orderNumber)}`;
  function sellerText(s, o) {
    const lines = [`Hello ${s.name}, this is FrameX.`, "", `New order ${o.orderNumber} for you: ${s.items} ${s.items === 1 ? "item" : "items"} (${s.firstItem}${s.items > 1 ? " and more" : ""}), ${formatPrice(s.itemsTotal)}.`];
    lines.push(o.paymentMethod === "COD" ? "Cash on Delivery: collect the cash on handover." : "Paid online.");
    if (o.giftWrap) lines.push("The customer asked for gift wrapping.");
    lines.push("", `Please accept it in your dashboard: ${dashLink(s, o)}`, "", "Thank you.");
    return lines.join("\n");
  }
  const sellerWa = (s, o) => (waNumber(s.phone) ? `https://wa.me/${waNumber(s.phone)}?text=${encodeURIComponent(sellerText(s, o))}` : "");
  function sellersCard(o) {
    const list = o.sellers || [];
    const body =
      o.status === "PENDING_PAYMENT"
        ? `<p class="co-lead">Shops and artists see this order once it is paid.</p>`
        : list.length
          ? list
              .map(
                (s, i) => `<div class="ao-seller"><p><strong>${esc(s.name)}</strong> <span class="sd-item__meta">${esc(s.code || "")} · ${s.items} ${s.items === 1 ? "item" : "items"} · ${esc(formatPrice(s.itemsTotal))}</span></p>
                ${sellerWa(s, o) ? `<button class="btn btn--dark btn--sm" type="button" data-wa-seller="${i}">${icon("phone")} WhatsApp ${esc(s.name)}</button>` : `<p class="co-lead">No mobile number on file for this ${s.type === "ARTIST" ? "artist" : "shop"}.</p>`}</div>`
              )
              .join("")
          : `<p class="co-lead">Every item in this order is made by FrameX itself.</p>`;
    return `<section class="co-card" data-sellers-card><h2 class="co-card__title">${icon("store")} Tell the ${list.length === 1 ? (list[0].type === "ARTIST" ? "artist" : "shop") : "sellers"} on WhatsApp</h2>${body}
      <p class="co-fine">${icon("alert")}<span>They were emailed when the order was placed. This opens your own WhatsApp with the message ready; you press Send there.</span></p></section>`;
  }

  const waButton = (o, label = "WhatsApp") =>
    waUrl(o) ? `<button class="iu-btn" type="button" data-wa="${esc(o.orderNumber)}" title="Open WhatsApp with this order's status ready to send">${icon("phone")} ${esc(label)}</button>` : `<span class="sd-item__meta" title="This order has no mobile number WhatsApp can use">No number</span>`;

  /** Every order that is under way: one chat after another. */
  async function updates(main, { head }) {
    const r = await http().get("/admin/order-updates");
    const v = view();
    const orders = r.items;
    const withNumber = orders.filter((o) => waUrl(o));
    const draw = (notice = "") => {
      const left = withNumber.filter((o) => !waOpenedAt(o));
      const next = left[0];
      main.innerHTML = `${head("Order updates on WhatsApp", "Tell every customer whose order is under way what its status is.", `<a class="btn btn--outline btn--sm" href="#/orders">All orders</a>`)}
        <p class="co-note">${icon("alert")}<span><strong>One press per customer.</strong> Each press opens your own WhatsApp in a chat with the next customer, with the message already written: you press Send there, come back and press again. WhatsApp does not let a website send messages by itself, so nothing here is sent automatically. Customers are still emailed automatically whenever an order's status changes.</span></p>
        ${notice ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(notice)}</span></div>` : ""}
        ${
          orders.length
            ? `<div class="co-actions" style="margin:16px 0">
              ${next ? `<button class="btn btn--primary" type="button" data-wa-next>${icon("phone")} Open next chat (${withNumber.length - left.length + 1} of ${withNumber.length})</button>` : `<span class="form-status form-status--success is-visible">${icon("check")}<span>All ${withNumber.length} chats have been opened.</span></span>`}
              ${withNumber.length > left.length ? `<button class="btn btn--outline btn--sm" type="button" data-wa-reset>Start again from the first</button>` : ""}
            </div>
            ${next ? `<p class="sd-item__meta" style="margin-bottom:12px">Next: <strong>${esc(next.orderNumber)}</strong> · ${esc(next.customer.name)} · ${esc(next.customer.phone)}</p><pre data-wa-preview style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0 0 20px;padding:14px 16px;border:1px solid var(--line);border-radius:var(--radius-md);background:#fff">${esc(waText(next))}</pre>` : ""}
            <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Order status</th><th scope="col">WhatsApp</th></tr></thead><tbody>
              ${orders
                .map((o) => {
                  const at = waOpenedAt(o);
                  return `<tr><td><a class="sd-item__name" href="#/orders/${esc(o.orderNumber)}">${esc(o.orderNumber)}</a>${o.isTest ? ` <span class="sd-status sd-status--draft an-test">Test</span>` : ""}<br><span class="sd-item__meta">${esc(o.firstItem ? o.firstItem.name : "")}${o.itemCount > 1 ? ` + ${o.itemCount - 1} more` : ""}</span></td>
                    <td>${esc(o.customer.name)}<br><span class="sd-item__meta">${esc(o.customer.phone || "no phone number")}</span></td>
                    <td>${v.badge(o.status, v.ORDER_STATUS)}</td>
                    <td>${waButton(o, at ? "Open again" : "Open chat")}${at ? `<br><span class="sd-item__meta">Opened ${esc(v.when(new Date(at).toISOString()))}</span>` : ""}</td></tr>`;
                })
                .join("")}
            </tbody></table></div>
            ${r.total > orders.length ? `<p class="co-fine">${icon("alert")}<span>Showing the newest ${orders.length} of ${r.total} orders under way.</span></p>` : ""}`
            : `<div class="sd-empty">${icon("check")}<strong>No orders under way</strong><span>Orders that are placed and not yet delivered appear here.</span></div>`
        }`;
    };
    draw();
    main.onclick = (e) => {
      const blocked = "Your browser stopped the WhatsApp window from opening. Allow pop-ups for this site, then press again.";
      if (e.target.closest("[data-wa-next]")) {
        const next = withNumber.find((o) => !waOpenedAt(o));
        return draw(next && !waOpen(next) ? blocked : "");
      }
      if (e.target.closest("[data-wa-reset]")) {
        try {
          const all = waOpened();
          withNumber.forEach((o) => delete all[`${o.orderNumber}:${o.status}`]);
          window.localStorage.setItem(WA_KEY, JSON.stringify(all));
        } catch (error) {
          /* nothing to forget */
        }
        return draw();
      }
      const one = e.target.closest("[data-wa]");
      if (one) {
        const o = orders.find((x) => x.orderNumber === one.dataset.wa);
        draw(o && !waOpen(o) ? blocked : "");
      }
    };
  }

  /* ---------------------------------------------------------------- List */
  async function list(main, params, { head }) {
    const status = params.get("status") || "";
    const q = params.get("q") || "";
    const page = Number(params.get("page")) || 1;
    const r = await http().get("/admin/orders", { status, q, page });
    const v = view();
    const link = (extra) => {
      const p = new URLSearchParams(Object.assign({}, status ? { status } : {}, q ? { q } : {}, extra));
      [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
      return "#/orders" + (p.toString() ? "?" + p : "");
    };
    const pages = Math.ceil(r.total / r.limit);
    main.innerHTML = `${head("Orders", "Customer orders. Order status and payment status are separate: an order is only marked paid after the payment gateway confirms it, or when a Cash on Delivery order is delivered.")}
      <div class="sd-toolbar">
        <div class="chip-scroll" role="group" aria-label="Filter by order status">${FILTERS.map(([id, label]) => `<a class="chip" href="${link({ status: id, page: "" })}" aria-pressed="${status === id}">${esc(label)}</a>`).join("")}</div>
        <a class="btn btn--outline btn--sm" href="#/orders/updates">${icon("phone")} Send order updates on WhatsApp</a>
        <form class="adm-search" data-search role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Order number, name, email or phone" aria-label="Search orders"><button class="btn btn--dark btn--sm" type="submit">Search</button></form>
      </div>
      ${
        r.items.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Order status</th><th scope="col">Payment</th><th scope="col">Total</th><th scope="col">Date</th><th scope="col">Tell the customer</th></tr></thead><tbody>
          ${r.items
            .map(
              (o) => `<tr>
              <td><a class="sd-item__name" href="#/orders/${esc(o.orderNumber)}">${esc(o.orderNumber)}</a>${o.isTest ? ` <span class="sd-status sd-status--draft an-test">Test</span>` : ""}<br><span class="sd-item__meta">${esc(o.firstItem ? o.firstItem.name : "")}${o.itemCount > 1 ? ` + ${o.itemCount - 1} more` : ""}</span></td>
              <td>${esc(o.customer.name)}<br><span class="sd-item__meta">${esc(o.customer.email)}</span></td>
              <td>${v.badge(o.status, v.ORDER_STATUS)}</td>
              <td>${v.paymentBadge(o)}<br><span class="sd-item__meta">${esc(v.methodLabel(o))}</span></td>
              <td><strong>${formatPrice(o.total)}</strong></td>
              <td>${esc(v.when(o.createdAt))}</td>
              <td>${waButton(o)}</td>
            </tr>`,
            )
            .join("")}
        </tbody></table></div>
        ${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${page > 1 ? `<a class="btn btn--outline btn--sm" href="${link({ page: page - 1 })}">Newer</a>` : ""}<span>Page ${page} of ${pages} · ${r.total} orders</span>${page < pages ? `<a class="btn btn--outline btn--sm" href="${link({ page: page + 1 })}">Older</a>` : ""}</nav>` : ""}`
          : `<div class="sd-empty">${icon("receipt")}<strong>No orders here</strong><span>${status || q ? "No order matches this filter." : "Orders appear here as soon as customers place them."}</span></div>`
      }`;
    main.onclick = (e) => {
      const one = e.target.closest("[data-wa]");
      const o = one && r.items.find((x) => x.orderNumber === one.dataset.wa);
      if (o && !waOpen(o)) FrameX.toast.show("Your browser stopped the WhatsApp window from opening. Allow pop-ups for this site, then press again.", { duration: 7000 });
    };
    $("[data-search]", main).addEventListener("submit", (e) => {
      e.preventDefault();
      window.location.hash = link({ q: new FormData(e.target).get("q").trim(), page: "" });
    });
  }

  /* ---------------------------------------------------------------- One order */
  function render(main, o, { head, message = "" }) {
    const v = view();
    const gatewayPaid = o.paymentMethod === "ONLINE";
    const fact = (k, val) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`;
    main.innerHTML = `${head(`Order ${o.orderNumber}`, `${esc(o.customer.name)} · placed ${esc(v.when(o.placedAt || o.createdAt))}`, `<a class="btn btn--outline btn--sm" href="#/orders">All orders</a>`)}
      ${message ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(message)}</span></div>` : ""}
      <div class="od-summary">
        <div><span>Order status</span>${v.badge(o.status, v.ORDER_STATUS)}</div>
        <div><span>Payment status</span>${v.paymentBadge(o)}</div>
        <div><span>Payment method</span><strong>${esc(v.methodLabel(o))}</strong></div>
        <div><span>Total</span><strong>${formatPrice(o.total)}</strong></div>
        <div><span>Refunded</span><strong>${formatPrice(o.amountRefunded)}</strong></div>
        <div><span>Stock</span><strong>${o.stockHeld ? "Held for this order" : "Given back"}</strong></div>
      </div>
      ${o.isTest ? `<p class="co-note" data-test-note>${icon("alert")}<span><strong>Test order.</strong> It is not counted in orders, sales or revenue in Analytics.${o.testNote ? ` Note: ${esc(o.testNote)}` : o.paymentMethod === "ONLINE" ? " It was paid with the payment gateway in TEST mode, or marked as a test." : ""}</span></p>` : ""}
      ${o.status === "CANCELLED" && o.cancelReason ? `<p class="od-cancel">${icon("alert")}<span>Cancelled: ${esc(o.cancelReason)}</span></p>` : ""}
      ${o.couponDiscount ? `<p class="co-note"><span aria-hidden="true">🏷️</span><span><strong>Coupon ${esc(o.couponCode)}</strong> took ${formatPrice(o.couponDiscount)} off this order.</span></p>` : ""}
      ${o.giftWrap ? `<p class="co-note co-note--gift"><span aria-hidden="true">🎁</span><span><strong>Gift wrap this order.</strong> The customer paid ${o.giftWrapFee ? formatPrice(o.giftWrapFee) : "nothing extra"} for gift wrapping.</span></p>` : ""}
      ${o.photoCount ? `<p class="co-note">${icon("image")}<span><strong>${o.photoCount} customer ${o.photoCount === 1 ? "photo" : "photos"}.</strong> Download the original ${o.photoCount === 1 ? "file" : "files"} below and print ${o.photoCount === 1 ? "it" : "them"} as ${o.photoCount === 1 ? "it is" : "they are"}: FrameX does not enhance or resize customer images.</span></p>` : ""}
      ${o.needsPhotos ? `<p class="co-note">${icon("alert")}<span>This order was placed before photos were uploaded with an order. The customer was asked to send the photos separately, quoting ${esc(o.orderNumber)}.</span></p>` : ""}
      <div class="ao-grid">
        <div>
          <section class="co-card"><h2 class="co-card__title">${icon("package")} Items</h2>${v.itemsHtml(o, { progress: true, photoActions: (p) => `<button class="co-link" type="button" data-photo="${esc(p.id)}" data-photo-action="download">Download original</button><button class="co-link" type="button" data-photo="${esc(p.id)}" data-photo-action="view">View</button>` })}</section>
          <section class="co-card"><h2 class="co-card__title">${icon("card")} Payment attempts</h2>
            <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">#</th><th scope="col">Status</th><th scope="col">Method</th><th scope="col">Amount</th><th scope="col">Reference</th><th scope="col">When</th></tr></thead><tbody>
              ${o.payments
                .map(
                  (p) => `<tr><td>${p.attempt}</td><td>${v.badge(p.status, v.PAYMENT_STATUS)}${p.failureReason ? `<br><span class="sd-item__meta">${esc(p.failureReason)}</span>` : ""}</td>
                  <td>${esc(v.INSTRUMENT[p.instrument] || v.INSTRUMENT[p.method] || p.method || "")}${p.verifiedVia ? `<br><span class="sd-item__meta">verified: ${esc(p.verifiedVia)}</span>` : ""}</td>
                  <td>${formatPrice(p.amount)}${p.amountRefunded ? `<br><span class="sd-item__meta">refunded ${formatPrice(p.amountRefunded)}</span>` : ""}</td>
                  <td><code>${esc(p.reference || "—")}</code></td><td>${esc(v.when(p.paidAt || p.createdAt))}</td></tr>`,
                )
                .join("")}
            </tbody></table></div>
            ${o.refunds.length ? `<h3 class="adm-subtitle">Refunds</h3><ul class="ao-facts">${o.refunds.map((f) => `<div><dt>${formatPrice(f.amount)} · ${esc(f.status.toLowerCase())}${f.reason ? ` · ${esc(f.reason)}` : ""}</dt><dd>${esc(v.when(f.createdAt))}</dd></div>`).join("")}</ul>` : ""}
          </section>
          <section class="co-card"><h2 class="co-card__title">${icon("clock")} History</h2>${v.timelineHtml(o)}</section>
        </div>
        <div>
          <section class="co-card"><h2 class="co-card__title">Next step</h2>
            ${
              o.nextStatuses.length
                ? `<form class="ao-form" data-status-form>
                <div class="form-field"><label for="ao-note">Note for the order history <span class="hint">(optional; the reason, when cancelling)</span></label><input id="ao-note" name="note" maxlength="300"></div>
                <div class="co-actions">${o.nextStatuses.map((s, i) => `<button class="btn ${s === "CANCELLED" ? "btn--outline od-cancel-btn" : i === 0 ? "btn--primary" : "btn--outline"} btn--sm" type="submit" name="status" value="${s}">${esc(ACTION[s] || s)}</button>`).join("")}</div>
                <p class="co-fine">${icon("alert")}<span>${o.paymentMethod === "COD" ? "Cash on Delivery: marking the order delivered records the cash as paid." : "Cancelling a paid order refunds it in full through the payment gateway."} The customer is emailed when an order is shipped, delivered or cancelled.</span></p>
              </form>`
                : `<p class="co-lead">This order is finished: there is no next step.</p>`
            }
          </section>
          ${
            o.refundable > 0
              ? `<section class="co-card"><h2 class="co-card__title">Refund</h2>
              <form class="ao-form" data-refund-form>
                <div class="form-field"><label for="ao-amount">Amount in rupees <span class="hint">(up to ${formatPrice(o.refundable)}; leave empty to refund all of it)</span></label><input id="ao-amount" name="amount" inputmode="numeric" placeholder="${o.refundable}"></div>
                <div class="form-field"><label for="ao-reason">Reason <span class="hint">(optional)</span></label><input id="ao-reason" name="reason" maxlength="200"></div>
                <div><button class="btn btn--dark btn--sm" type="submit">Refund</button></div>
                <p class="co-fine">${icon("alert")}<span>${gatewayPaid ? "The money goes back to the customer's original payment method through the payment gateway." : "Cash on Delivery: nothing can be sent automatically. This only records that FrameX gave the money back."}</span></p>
              </form></section>`
              : ""
          }
          <section class="co-card" data-test-card><h2 class="co-card__title">Sales reports</h2>
            ${
              o.isTest
                ? `<p class="co-lead">This order is kept out of sales reports as a test order.</p><div><button class="btn btn--outline btn--sm" type="button" data-test-off>Count it as a real order</button></div>`
                : `<form class="ao-form" data-test-form><p class="co-lead">This order is counted in sales reports.</p>
                <div class="form-field"><label for="ao-test-note">Only a test? Say why <span class="hint">(optional)</span></label><input id="ao-test-note" name="note" maxlength="200"></div>
                <div><button class="btn btn--outline btn--sm" type="submit">Mark as a test order</button></div></form>`
            }
            <p class="co-fine">${icon("alert")}<span>Marking changes nothing for the customer or the shop: the order, its payment and its delivery stay as they are.</span></p>
          </section>
          <section class="co-card"><h2 class="co-card__title">Price details</h2>${v.totalsHtml(o)}</section>
          <section class="co-card"><h2 class="co-card__title">${icon("user")} Customer</h2>
            <dl class="ao-facts">${fact("Name", esc(o.customer.name))}${fact("Email", esc(o.customer.email))}${fact("Phone", esc(o.customer.phone || "—"))}</dl>
            ${v.addressHtml(o)}
          </section>
          <section class="co-card" data-wa-card><h2 class="co-card__title">${icon("phone")} Tell the customer on WhatsApp</h2>
            ${
              waUrl(o)
                ? `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0 0 12px">${esc(waText(o))}</pre>
              <div><button class="btn btn--dark btn--sm" type="button" data-wa-one>${icon("phone")} Open WhatsApp with this message</button></div>
              <p class="co-fine">${icon("alert")}<span>This opens your own WhatsApp in a chat with ${esc(o.customer.phone)}; you press Send there. Nothing is sent from this page.</span></p>`
                : `<p class="co-lead">This order has no mobile number WhatsApp can use.</p>`
            }
          </section>
          ${sellersCard(o)}
          ${gatewayPaid ? `<section class="co-card"><h2 class="co-card__title">Gateway</h2><dl class="ao-facts">${fact("Gateway", esc(o.paymentGateway || "—"))}${fact("Gateway order", `<code>${esc(o.gatewayOrderId || "—")}</code>`)}</dl></section>` : ""}
        </div>
      </div>`;

    const apply = (promise) =>
      promise.then((r) => render(main, r.order, { head })).catch((error) => {
        if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
        render(main, o, { head, message: error.message });
      });

    $$("[data-wa-seller]", main).forEach((b) =>
      b.addEventListener("click", () => {
        const tab = window.open(sellerWa(o.sellers[Number(b.dataset.waSeller)], o), "framex-whatsapp");
        if (!tab) return FrameX.toast.show("Your browser stopped the WhatsApp window from opening. Allow pop-ups for this site, then press again.", { duration: 7000 });
        try {
          tab.opener = null;
        } catch (e) {
          /* another site already */
        }
      })
    );
    const waOne = $("[data-wa-one]", main);
    if (waOne) waOne.addEventListener("click", () => waOpen(o) || render(main, o, { head, message: "Your browser stopped the WhatsApp window from opening. Allow pop-ups for this site, then press again." }));
    const statusForm = $("[data-status-form]", main);
    if (statusForm)
      statusForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const status = e.submitter && e.submitter.value;
        if (!status) return;
        // Cancelling needs a second press: it gives stock back and may refund.
        if (status === "CANCELLED" && !e.submitter.dataset.confirm) {
          e.submitter.dataset.confirm = "1";
          e.submitter.textContent = o.paymentStatus === "PAID" && gatewayPaid ? "Press again: cancel and refund" : "Press again to cancel";
          return;
        }
        e.submitter.disabled = true;
        apply(http().post(`/admin/orders/${encodeURIComponent(o.orderNumber)}/status`, { status, note: statusForm.elements.note.value.trim() }));
      });
    // A test order is kept out of the sales reports (and can be put back).
    const testForm = $("[data-test-form]", main);
    if (testForm)
      testForm.addEventListener("submit", (e) => {
        e.preventDefault();
        e.submitter.disabled = true;
        apply(http().post(`/admin/orders/${encodeURIComponent(o.orderNumber)}/test`, { test: true, note: testForm.elements.note.value.trim() }));
      });
    const testOff = $("[data-test-off]", main);
    if (testOff)
      testOff.addEventListener("click", () => {
        testOff.disabled = true;
        apply(http().post(`/admin/orders/${encodeURIComponent(o.orderNumber)}/test`, { test: false }));
      });
    const refundForm = $("[data-refund-form]", main);
    if (refundForm)
      refundForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const raw = refundForm.elements.amount.value.trim();
        const amount = raw === "" ? undefined : Number(raw);
        if (amount !== undefined && (!Number.isInteger(amount) || amount < 1)) return render(main, o, { head, message: "Enter the refund as a whole number of rupees." });
        e.submitter.disabled = true;
        apply(http().post(`/admin/orders/${encodeURIComponent(o.orderNumber)}/refund`, Object.assign({ reason: refundForm.elements.reason.value.trim() }, amount === undefined ? {} : { amount })));
      });
  }

  async function detail(main, orderNumber, { head }) {
    if (orderNumber === "updates") return updates(main, { head });
    const { order } = await http().get("/admin/orders/" + encodeURIComponent(orderNumber));
    render(main, order, { head });
    // "Download original": the backend signs a short-lived link to that photo of this order (and logs it).
    view().wirePhotos(main, async (uploadId, { download }) => (await http().post(`/admin/orders/${encodeURIComponent(orderNumber)}/photos/${encodeURIComponent(uploadId)}/link`, { download })).link);
  }

  FrameX.adminOrders = { list, detail };
})((window.FrameX = window.FrameX || {}));
