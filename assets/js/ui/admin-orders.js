/* ==========================================================================
   Admin dashboard: customer orders (admin.html#/orders). ADMIN role only.

     #/orders[?status=&q=]      every order, newest first
     #/orders/<FX-number>       one order: move it forward, cancel it, refund it

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
  const { $, escapeHtml: esc, icon } = FrameX.dom;
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
        <form class="ad-search" data-search role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Order number, name, email or phone" aria-label="Search orders"><button class="btn btn--dark btn--sm" type="submit">Search</button></form>
      </div>
      ${
        r.items.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Order status</th><th scope="col">Payment</th><th scope="col">Total</th><th scope="col">Date</th></tr></thead><tbody>
          ${r.items
            .map(
              (o) => `<tr>
              <td><a class="sd-item__name" href="#/orders/${esc(o.orderNumber)}">${esc(o.orderNumber)}</a><br><span class="sd-item__meta">${esc(o.firstItem ? o.firstItem.name : "")}${o.itemCount > 1 ? ` + ${o.itemCount - 1} more` : ""}</span></td>
              <td>${esc(o.customer.name)}<br><span class="sd-item__meta">${esc(o.customer.email)}</span></td>
              <td>${v.badge(o.status, v.ORDER_STATUS)}</td>
              <td>${v.paymentBadge(o)}<br><span class="sd-item__meta">${esc(v.methodLabel(o))}</span></td>
              <td><strong>${formatPrice(o.total)}</strong></td>
              <td>${esc(v.when(o.createdAt))}</td>
            </tr>`,
            )
            .join("")}
        </tbody></table></div>
        ${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${page > 1 ? `<a class="btn btn--outline btn--sm" href="${link({ page: page - 1 })}">Newer</a>` : ""}<span>Page ${page} of ${pages} · ${r.total} orders</span>${page < pages ? `<a class="btn btn--outline btn--sm" href="${link({ page: page + 1 })}">Older</a>` : ""}</nav>` : ""}`
          : `<div class="sd-empty">${icon("receipt")}<strong>No orders here</strong><span>${status || q ? "No order matches this filter." : "Orders appear here as soon as customers place them."}</span></div>`
      }`;
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
      ${o.status === "CANCELLED" && o.cancelReason ? `<p class="od-cancel">${icon("alert")}<span>Cancelled: ${esc(o.cancelReason)}</span></p>` : ""}
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
            ${o.refunds.length ? `<h3 class="ad-subtitle">Refunds</h3><ul class="ao-facts">${o.refunds.map((f) => `<div><dt>${formatPrice(f.amount)} · ${esc(f.status.toLowerCase())}${f.reason ? ` · ${esc(f.reason)}` : ""}</dt><dd>${esc(v.when(f.createdAt))}</dd></div>`).join("")}</ul>` : ""}
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
          <section class="co-card"><h2 class="co-card__title">Price details</h2>${v.totalsHtml(o)}</section>
          <section class="co-card"><h2 class="co-card__title">${icon("user")} Customer</h2>
            <dl class="ao-facts">${fact("Name", esc(o.customer.name))}${fact("Email", esc(o.customer.email))}${fact("Phone", esc(o.customer.phone || "—"))}</dl>
            ${v.addressHtml(o)}
          </section>
          ${gatewayPaid ? `<section class="co-card"><h2 class="co-card__title">Gateway</h2><dl class="ao-facts">${fact("Gateway", esc(o.paymentGateway || "—"))}${fact("Gateway order", `<code>${esc(o.gatewayOrderId || "—")}</code>`)}</dl></section>` : ""}
        </div>
      </div>`;

    const apply = (promise) =>
      promise.then((r) => render(main, r.order, { head })).catch((error) => {
        if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
        render(main, o, { head, message: error.message });
      });

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
    const { order } = await http().get("/admin/orders/" + encodeURIComponent(orderNumber));
    render(main, order, { head });
    // "Download original": the backend signs a short-lived link to that photo of this order (and logs it).
    view().wirePhotos(main, async (uploadId, { download }) => (await http().post(`/admin/orders/${encodeURIComponent(orderNumber)}/photos/${encodeURIComponent(uploadId)}/link`, { download })).link);
  }

  FrameX.adminOrders = { list, detail };
})((window.FrameX = window.FrameX || {}));
