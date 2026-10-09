/* ==========================================================================
   Your orders (orders.html) and one order (order.html?id=FX-100001).
   Logged-in users only; the backend only ever returns the caller's own orders.

   order.html?id=…&placed=1 is the confirmation shown right after checkout.
   An order that is still waiting for its online payment asks the backend
   (which asks the payment gateway) whether the money has arrived, and offers
   "Retry payment". The page shows what the backend says, nothing else.

   An item that was made from the customer's own photos lists them, with a
   link to look at the original file (a short-lived link the backend signs for
   the logged-in owner). Gift wrapping is its own line in the price.

   Shared bits (status names, badges, the price table, the photo list) are on
   FrameX.orderView so the admin and shop dashboards show orders the same way.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const http = () => FrameX.http;

  const ORDER_STATUS = {
    PENDING_PAYMENT: "Waiting for payment",
    PLACED: "Order placed",
    CONFIRMED: "Confirmed",
    PROCESSING: "Being made",
    SHIPPED: "Shipped",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    RETURNED: "Returned",
  };
  const PAYMENT_STATUS = { PENDING: "Payment pending", PAID: "Paid", FAILED: "Payment failed", CANCELLED: "Not paid", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partly refunded" };
  const INSTRUMENT = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", paylater: "Pay later", cod: "Cash" };
  // Badge colours: ok (green), wait (amber), bad (red), mute (grey).
  const TONE = {
    PENDING_PAYMENT: "wait", PLACED: "ok", CONFIRMED: "ok", PROCESSING: "ok", SHIPPED: "ok", OUT_FOR_DELIVERY: "ok", DELIVERED: "ok", CANCELLED: "bad", RETURNED: "mute",
    PENDING: "wait", PAID: "ok", FAILED: "bad", REFUNDED: "mute", PARTIALLY_REFUNDED: "mute",
  };
  const STEPS = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

  const when = (iso, time = true) => (iso ? new Date(iso).toLocaleString(undefined, Object.assign({ day: "numeric", month: "short", year: "numeric" }, time ? { hour: "2-digit", minute: "2-digit" } : {})) : "");
  const badge = (status, labels) => `<span class="ob ob--${TONE[status] || "mute"}">${esc(labels[status] || status)}</span>`;
  const paymentLabel = (o) => (o.paymentMethod === "COD" && o.paymentStatus === "PENDING" ? "Pay on delivery" : PAYMENT_STATUS[o.paymentStatus] || o.paymentStatus);
  const paymentBadge = (o) => `<span class="ob ob--${o.paymentMethod === "COD" && o.paymentStatus === "PENDING" ? "mute" : TONE[o.paymentStatus] || "mute"}">${esc(paymentLabel(o))}</span>`;
  const methodLabel = (o) => (o.paymentMethod === "COD" ? "Cash on Delivery" : `Online payment${o.paymentInstrument ? ` (${INSTRUMENT[o.paymentInstrument] || o.paymentInstrument})` : ""}`);
  const orderUrl = (n) => `order.html?id=${encodeURIComponent(n)}`;

  /* ---------------------------------------------------------------- Shared pieces */
  const FULFILMENT = { NEW: "Received by the shop", ACCEPTED: "Accepted by the shop", IN_PRODUCTION: "In production", READY: "Ready", HANDED_OVER: "Handed over" };
  const megabytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  /** Plain facts about an uploaded file: "3840 × 2160 px · JPEG · 4.2 MB". */
  const photoFacts = (p) => [p.width && p.height ? `${p.width} × ${p.height} px` : "", String(p.format || "").toUpperCase(), p.bytes ? megabytes(p.bytes) : ""].filter(Boolean).join(" · ");

  /**
   * The customer's photos of one order line.
   *   actions(photo) -> buttons for one photo ("View original", "Download original")
   * Each button carries data-photo="<upload id>"; the page asks the backend for a
   * short-lived link when it is pressed (wirePhotos).
   */
  function photosHtml(item, { actions = null } = {}) {
    const list = item.photos || [];
    if (!list.length) return item.photosMissing ? `<span class="od-photos__missing">${icon("alert")} Photos for this item were sent separately.</span>` : "";
    return `<ul class="od-photos" aria-label="Your photos for ${esc(item.name)}">${list
      .map(
        (p, n) => `<li class="od-photo">
        <span class="od-photo__n">${list.length > 1 ? `Photo ${n + 1}` : "Your photo"}</span>
        <span class="od-photo__name">${esc(p.name)}</span>
        <span class="od-photo__facts">${esc(photoFacts(p))}</span>
        ${actions ? `<span class="od-photo__actions">${actions(p, item)}</span>` : ""}
      </li>`,
      )
      .join("")}</ul>`;
  }

  /**
   * "View original" / "Download original": the backend makes a link that works
   * for a few minutes, for whoever is allowed to see that photo.
   *   linkFor(uploadId, { download }) -> Promise<{ path, name }>
   */
  function wirePhotos(root, linkFor) {
    root.addEventListener("click", async (e) => {
      const button = e.target.closest("[data-photo]");
      if (!button || button.disabled) return;
      const download = button.dataset.photoAction === "download";
      // A window opened right at the click isn't blocked as a pop-up; it gets its address when the link arrives.
      const tab = download ? null : window.open("", "_blank");
      button.disabled = true;
      try {
        const link = await linkFor(button.dataset.photo, { download });
        const url = http().fileUrl(link.path);
        if (tab) tab.location.replace(url);
        else {
          const a = document.createElement("a");
          a.href = url;
          a.rel = "noopener";
          a.download = link.name || "";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (error) {
        if (tab) tab.close();
        if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
        FrameX.toast.show(error.message || "That photo couldn't be opened. Please try again.", { duration: 5000 });
      }
      button.disabled = false;
    });
  }

  /** options.photoActions(photo, item) -> the buttons shown next to each photo; options.progress: show each shop's progress */
  function itemsHtml(order, { photoActions = null, progress = false } = {}) {
    return `<ul class="co-items">${order.items
      .map(
        (i) => `<li class="co-item${(i.photos || []).length ? " co-item--photos" : ""}">
        <img src="${esc(http().asset(i.image) || "assets/img/ui/frame-decor.webp")}" alt="" width="64" height="64" loading="lazy">
        <div class="co-item__info">
          <strong>${esc(i.name)}</strong>
          <span>${[i.size, i.color].filter(Boolean).map(esc).join(" · ")}</span>
          ${(i.options || []).map((o) => `<span>${esc(o)}</span>`).join("")}
          ${i.design ? (i.design.summary || []).map((t) => `<span>${esc(t)}</span>`).join("") : ""}
          ${i.design && i.design.id ? `<span>Design ref ${esc(i.design.id)}</span>` : ""}
          ${i.note ? `<span>Note: ${esc(i.note)}</span>` : ""}
          <span class="co-item__shop">${icon("store")} ${esc(i.shopName)}${progress && i.fulfilment && i.fulfilment.status !== "NEW" ? ` · <em class="co-item__step">${esc(FULFILMENT[i.fulfilment.status] || i.fulfilment.status)}</em>` : ""}</span>
          ${photosHtml(i, { actions: photoActions })}
        </div>
        <div class="co-item__price"><strong>${formatPrice(i.lineTotal)}</strong><span>${i.quantity} × ${formatPrice(i.unitPrice)}</span>${i.unitDiscount ? `<s>${formatPrice(i.unitListPrice * i.quantity)}</s>` : ""}</div>
      </li>`,
      )
      .join("")}</ul>`;
  }

  function totalsHtml(o) {
    const row = (label, value, cls = "") => `<div class="co-row ${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
    return `<dl class="co-rows">
      ${row(`Subtotal (${o.itemCount} ${o.itemCount === 1 ? "item" : "items"})`, formatPrice(o.subtotal))}
      ${row("Discount", o.discount ? "− " + formatPrice(o.discount) : formatPrice(0), o.discount ? "co-row--good" : "")}
      ${row("Delivery", formatPrice(o.shippingFee))}
      ${row(o.tax ? `Tax (${o.taxPercent}%)` : "Tax", formatPrice(o.tax))}
      ${o.giftWrap ? row("Gift wrapping", o.giftWrapFee ? formatPrice(o.giftWrapFee) : "Free", "co-row--gift") : ""}
      ${o.codFee ? row("Cash on Delivery fee", formatPrice(o.codFee)) : ""}
      ${row("Total", formatPrice(o.total), "co-row--total")}
      ${o.amountRefunded ? row("Refunded", formatPrice(o.amountRefunded), "co-row--good") : ""}
    </dl>`;
  }

  function addressHtml(o) {
    const a = o.shippingAddress || {};
    return `<address class="od-address"><strong>${esc(a.fullName)}</strong><br>${[a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).map(esc).join("<br>")}<br>${icon("phone")} ${esc(a.phone || "")}</address>`;
  }

  function timelineHtml(o) {
    const text = (e) =>
      e.kind === "ORDER" ? ORDER_STATUS[e.status] || e.status : e.kind === "PAYMENT" ? `Payment: ${(PAYMENT_STATUS[e.status] || e.status || "").toLowerCase()}` : e.kind === "REFUND" ? "Refund" : "Note";
    return `<ol class="od-timeline">${o.events.map((e) => `<li><span class="od-timeline__dot od-timeline__dot--${e.kind.toLowerCase()}"></span><div><strong>${esc(text(e))}</strong>${e.detail ? `<span>${esc(e.detail)}</span>` : ""}<time datetime="${esc(e.at)}">${esc(when(e.at))}</time></div></li>`).join("")}</ol>`;
  }

  FrameX.orderView = { ORDER_STATUS, PAYMENT_STATUS, INSTRUMENT, FULFILMENT, badge, paymentBadge, paymentLabel, methodLabel, itemsHtml, photosHtml, photoFacts, wirePhotos, totalsHtml, addressHtml, timelineHtml, when };

  /* ---------------------------------------------------------------- orders.html */
  async function list(root, page = 1) {
    root.innerHTML = `<div class="skeleton" style="height:260px"></div>`;
    let r;
    try {
      r = await http().get("/orders", { page, limit: 10 });
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      return FrameX.templates.showError(root, "Your orders couldn't be loaded.", () => list(root, page));
    }
    const pages = Math.ceil(r.total / r.limit);
    root.innerHTML = `<div class="od">
      <header class="co-head"><h1 class="co-title">Your orders</h1><a class="btn btn--outline btn--sm" href="account.html">${icon("user")} Your account</a></header>
      ${
        r.items.length
          ? `<ul class="od-list">${r.items
              .map(
                (o) => `<li><a class="od-row" href="${orderUrl(o.orderNumber)}">
            <img src="${esc(http().asset((o.firstItem && o.firstItem.image) || "assets/img/ui/frame-decor.webp"))}" alt="" width="64" height="64" loading="lazy">
            <span class="od-row__main"><strong>${esc(o.firstItem ? o.firstItem.name : "Order")}${o.itemCount > 1 ? ` <span class="od-row__more">+ ${o.itemCount - 1} more</span>` : ""}</strong>
              <span>Order ${esc(o.orderNumber)} · ${esc(when(o.createdAt, false))}</span>
              <span class="od-row__badges">${badge(o.status, ORDER_STATUS)} ${paymentBadge(o)}</span></span>
            <span class="od-row__total"><strong>${formatPrice(o.total)}</strong>${icon("chev-right")}</span>
          </a></li>`,
              )
              .join("")}</ul>
          ${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${page > 1 ? `<button class="btn btn--outline btn--sm" type="button" data-page="${page - 1}">Newer</button>` : ""}<span>Page ${page} of ${pages}</span>${page < pages ? `<button class="btn btn--outline btn--sm" type="button" data-page="${page + 1}">Older</button>` : ""}</nav>` : ""}`
          : `<div class="co-empty">${icon("receipt")}<strong>No orders yet</strong><span>When you order a frame, it shows up here.</span><a class="btn btn--primary btn--sm" href="shop.html">Browse frames</a></div>`
      }
    </div>`;
    root.onclick = (e) => {
      const b = e.target.closest("[data-page]");
      if (b) list(root, Number(b.dataset.page));
    };
  }

  /* ---------------------------------------------------------------- order.html */
  let pollTimer = 0;

  function progressHtml(o) {
    if (!STEPS.includes(o.status)) return "";
    const at = STEPS.indexOf(o.status);
    return `<ol class="od-steps" aria-label="Order progress">${STEPS.map((s, i) => `<li class="${i < at ? "is-done" : i === at ? "is-current" : ""}"${i === at ? ' aria-current="step"' : ""}><span></span>${esc(ORDER_STATUS[s].replace("Order placed", "Placed"))}</li>`).join("")}</ol>`;
  }

  /** What the order says about the customer's photos, above the item list. */
  function photosNote(o) {
    if (["CANCELLED", "PENDING_PAYMENT"].includes(o.status)) return "";
    // An order placed before photos were uploaded to FrameX: they were asked for separately.
    if (o.needsPhotos) {
      const number = ((FrameX.seed && FrameX.seed.site && FrameX.seed.site.contact) || {}).whatsapp;
      const link = number ? `${FrameX.contact.whatsappUrl(number)}?text=${encodeURIComponent(`Hello FrameX, here are the photos for my order ${o.orderNumber}.`)}` : "contact.html";
      return `<div class="od-note">${icon("image")}<div><strong>We need your photos</strong><span>This order was placed before photos were uploaded with an order. If you haven't sent them yet, please send them to FrameX with your order number <strong>${esc(o.orderNumber)}</strong>, so we can print them.</span>
        <a class="btn btn--dark btn--sm" href="${esc(link)}"${number ? ' target="_blank" rel="noopener"' : ""}>${icon("phone")} Send photos</a></div></div>`;
    }
    if (!o.photoCount) return "";
    return `<div class="od-note od-note--ok">${icon("image")}<div><strong>We have your ${o.photoCount === 1 ? "photo" : `${o.photoCount} photos`}</strong><span>${o.photoCount === 1 ? "It is" : "They are"} kept with this order and printed in the same original quality you uploaded. FrameX does not enhance or change your image.</span></div></div>`;
  }

  /** The buttons next to each of the customer's own photos. */
  const ownPhotoActions = (p) => `<button class="co-link" type="button" data-photo="${esc(p.id)}" data-photo-action="view">View original</button>`;

  function render(root, o, { placed, message = "" }) {
    document.title = `Order ${o.orderNumber} — FrameX`;
    const pending = o.status === "PENDING_PAYMENT";
    const confirmed = placed && !pending && o.status !== "CANCELLED";
    const hero = confirmed
      ? `<div class="od-hero od-hero--ok">${icon("check")}<div><h1 class="co-title">Thank you! Your order is placed.</h1>
          <p>${o.paymentMethod === "COD" ? `Please keep <strong>${formatPrice(o.total)}</strong> ready to pay in cash on delivery.` : `We received your payment of <strong>${formatPrice(o.total)}</strong>.`} A confirmation is on its way to ${esc(o.customer.email)}.</p></div></div>`
      : pending
        ? `<div class="od-hero od-hero--wait">${icon("clock")}<div><h1 class="co-title">This order is waiting for its payment</h1>
            <p>${o.paymentStatus === "FAILED" ? "The last payment didn't go through." : o.paymentStatus === "CANCELLED" ? "The payment wasn't completed." : "We haven't received the payment yet."} The order is placed only once the payment is confirmed. ${o.canPay ? "Your items are being held for a short while." : ""}</p></div></div>`
        : `<header class="co-head"><h1 class="co-title">Order ${esc(o.orderNumber)}</h1><a class="btn btn--outline btn--sm" href="orders.html">All orders</a></header>`;

    root.innerHTML = `<div class="od">
      ${hero}
      ${message ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(message)}</span></div>` : ""}
      <div class="od-summary">
        <div><span>Order ID</span><strong>${esc(o.orderNumber)}</strong></div>
        <div><span>Order status</span>${badge(o.status, ORDER_STATUS)}</div>
        <div><span>Payment method</span><strong>${esc(methodLabel(o))}</strong></div>
        <div><span>Payment status</span>${paymentBadge(o)}</div>
        <div><span>${o.placedAt ? "Placed" : "Created"}</span><strong>${esc(when(o.placedAt || o.createdAt))}</strong></div>
        <div><span>Delivery</span><strong>${o.status === "DELIVERED" ? `Delivered ${esc(when(o.deliveredAt, false))}` : o.status === "CANCELLED" ? "—" : "The shop will confirm the delivery time"}</strong></div>
        ${o.giftWrap ? `<div><span>Gift wrapping</span><strong><span aria-hidden="true">🎁</span> Yes${o.giftWrapFee ? ` · ${formatPrice(o.giftWrapFee)}` : ""}</strong></div>` : ""}
      </div>
      ${progressHtml(o)}
      ${o.status === "CANCELLED" && o.cancelReason ? `<p class="od-cancel">${icon("alert")}<span>Cancelled: ${esc(o.cancelReason)}</span></p>` : ""}
      ${
        pending
          ? `<div class="co-actions od-pay">
          ${o.canPay ? `<button class="btn btn--primary" type="button" data-retry>${icon("lock")} Retry payment • ${formatPrice(o.total)}</button>` : `<a class="btn btn--primary" href="checkout.html">Check out again</a>`}
          <button class="btn btn--outline" type="button" data-refresh>I have paid: check again</button>
        </div>`
          : ""
      }
      ${photosNote(o)}
      <div class="co-grid">
        <div class="co-main">
          <section class="co-card"><h2 class="co-card__title">${icon("package")} Items</h2>${itemsHtml(o, { photoActions: ownPhotoActions, progress: true })}</section>
          ${confirmed ? "" : `<section class="co-card"><h2 class="co-card__title">${icon("clock")} Order history</h2>${timelineHtml(o)}</section>`}
        </div>
        <aside class="co-side">
          <section class="co-card"><h2 class="co-card__title">Price details</h2>${totalsHtml(o)}</section>
          <section class="co-card"><h2 class="co-card__title">${icon("pin")} Delivery address</h2>${addressHtml(o)}</section>
        </aside>
      </div>
      ${o.status === "DELIVERED" ? `<section class="co-card" data-order-reviews hidden></section>` : ""}
      <div class="co-actions od-actions">
        ${confirmed ? `<a class="btn btn--primary" href="${orderUrl(o.orderNumber)}">View Order</a>` : ""}
        <a class="btn ${confirmed ? "btn--outline" : "btn--primary"}" href="shop.html">Continue Shopping</a>
        ${confirmed ? "" : `<a class="btn btn--outline" href="orders.html">All orders</a>`}
        ${o.canCancel && !confirmed ? `<button class="btn btn--outline od-cancel-btn" type="button" data-cancel>Cancel order</button>` : ""}
      </div>
    </div>`;
  }

  /** A delivered order: what the customer can review from it (the backend says what, and accepts nothing else). */
  async function reviewsBox(root, orderNumber) {
    const box = $("[data-order-reviews]", root);
    if (!box) return;
    let items;
    try {
      items = (await http().get("/reviews/mine", { sourceType: "ORDER", sourceId: orderNumber })).items;
    } catch (error) {
      return;
    }
    if (!items.length) return;
    const KIND = { PRODUCT: "Product", ARTWORK: "Artwork", ARTIST: "Artist", SHOP: "Shop" };
    const stars = (i, rating) => [5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="orv-${i}-${n}" value="${n}"${rating === n ? " checked" : ""}><label for="orv-${i}-${n}" aria-label="${n} ${n === 1 ? "star" : "stars"}">${icon("star")}</label>`).join("");
    box.hidden = false;
    box.innerHTML = `<h2 class="co-card__title">${icon("star")} Rate what you received</h2>
      ${items.map((t, i) => `<form class="rev-form" data-review="${i}" novalidate style="padding:12px 0;border-top:1px solid var(--line)">
          <strong>${esc(t.name)} <span class="co-muted">(${esc(KIND[t.targetType] || "")})</span></strong>
          <div class="rev-stars" role="radiogroup" aria-label="Your rating for ${esc(t.name)}">${stars(i, t.review ? t.review.rating : 0)}</div>
          <textarea class="input" name="body" rows="2" maxlength="1500" placeholder="Tell other customers about it (optional).">${esc(t.review ? t.review.body : "")}</textarea>
          <div class="form-status" role="status" aria-live="polite"></div>
          <div><button class="btn btn--dark btn--sm" type="submit">${t.review ? "Update review" : "Post review"}</button></div>
        </form>`).join("")}`;
    box.onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target.closest("[data-review]");
      const t = items[Number(form.dataset.review)];
      const status = $(".form-status", form);
      const rating = Number(new FormData(form).get("rating"));
      if (!rating) return FrameX.forms.status(status, "error", "Choose 1 to 5 stars.");
      try {
        await http().post("/reviews", { targetType: t.targetType, targetId: t.targetId, sourceType: "ORDER", sourceId: orderNumber, rating, body: form.body.value });
        FrameX.forms.status(status, "success", "Thank you. Your review was saved.");
      } catch (error) {
        FrameX.forms.status(status, "error", esc(error.message));
      }
    };
  }

  async function detail(root) {
    const number = FrameX.qs.param("id") || "";
    const placed = FrameX.qs.param("placed") === "1";
    const show = (o, message) => {
      render(root, o, { placed, message });
      if (o.status === "DELIVERED") reviewsBox(root, o.orderNumber);
      // Google Analytics (only if the visitor allowed analytics) is told about an order once: when this
      // confirmation page shows an order the SERVER reports as placed. Never for an unpaid, cancelled or
      // test order. It is a statistic, not a record of payment: sales are counted from the database.
      if (placed && FrameX.analytics && !["PENDING_PAYMENT", "CANCELLED"].includes(o.status))
        FrameX.analytics.track("purchase", {
          transactionId: o.orderNumber,
          value: o.total,
          tax: o.tax,
          shipping: o.shippingFee,
          test: o.isTest,
          items: (o.items || []).map((i) => ({ item_id: i.productId || i.templateId || "design", item_name: i.name, quantity: i.quantity, price: i.unitPrice })),
        });
    };
    const fail = (error) => {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      if (error.status === 404)
        return (root.innerHTML = `<div class="co-empty">${icon("alert")}<strong>We couldn't find that order</strong><span>Check the link, or look in your orders.</span><a class="btn btn--primary btn--sm" href="orders.html">Your orders</a></div>`);
      FrameX.templates.showError(root, "This order couldn't be loaded.", () => detail(root));
    };

    // "View original": a link to the customer's own file, signed by the backend for a few minutes.
    if (!root.dataset.photosWired) {
      root.dataset.photosWired = "1";
      wirePhotos(root, async (uploadId, { download }) => (await http().post(`/orders/${encodeURIComponent(number)}/photos/${encodeURIComponent(uploadId)}/link`, { download })).link);
    }

    let order;
    try {
      order = (await http().get("/orders/" + encodeURIComponent(number))).order;
      // Waiting for a payment: ask the backend to check with the gateway before showing "not paid".
      if (order.status === "PENDING_PAYMENT") order = (await FrameX.payments.refresh(number)).order;
    } catch (error) {
      return fail(error);
    }
    show(order);
    if (placed && order.status !== "PENDING_PAYMENT") FrameX.cart.refresh();

    /** A payment may still be on its way (UPI can take a moment): look again a few times. */
    function poll(times) {
      clearTimeout(pollTimer);
      if (times <= 0) return;
      pollTimer = setTimeout(async () => {
        try {
          const r = await FrameX.payments.refresh(number);
          if (r.order.status !== "PENDING_PAYMENT") return show((order = r.order));
        } catch (error) {
          /* try again on the next tick */
        }
        poll(times - 1);
      }, 5000);
    }

    root.onclick = async (e) => {
      const button = e.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-retry")) {
        button.disabled = true;
        let result;
        try {
          result = await FrameX.payments.retry(number);
        } catch (error) {
          result = { outcome: "pending", order: null, message: error.message };
        }
        if (result.order) order = result.order;
        else order = (await http().get("/orders/" + encodeURIComponent(number))).order;
        show(order, result.outcome === "paid" ? "" : result.outcome === "failed" ? "The payment didn't go through. You can try again." : result.outcome === "cancelled" ? "You closed the payment window before paying. Nothing was charged." : result.message || "We're still confirming your payment. Please don't pay again.");
        if (result.outcome === "paid") FrameX.cart.refresh();
        if (result.outcome === "pending") poll(12);
      }
      if (button.hasAttribute("data-refresh")) {
        button.disabled = true;
        try {
          order = (await FrameX.payments.refresh(number)).order;
          show(order, order.status === "PENDING_PAYMENT" ? "We haven't received a payment for this order yet. If you just paid, it can take a minute to arrive." : "");
        } catch (error) {
          show(order, error.message);
        }
      }
      if (button.hasAttribute("data-cancel")) {
        // Two presses, so an order isn't cancelled by accident.
        if (!button.dataset.confirm) {
          button.dataset.confirm = "1";
          button.textContent = order.paymentStatus === "PAID" ? "Press again to cancel and refund" : "Press again to cancel this order";
          return;
        }
        button.disabled = true;
        try {
          order = (await http().post(`/orders/${encodeURIComponent(number)}/cancel`)).order;
          show(order);
          FrameX.toast.show(order.paymentStatus === "REFUNDED" ? "Order cancelled. Your refund has been started." : "Order cancelled.");
        } catch (error) {
          show(order, error.message);
        }
      }
    };
  }

  async function initList() {
    const root = $("#orders-root");
    if (!root) return;
    if (!(await FrameX.auth.guard(["CUSTOMER", "SHOP", "ADMIN"]))) return;
    await list(root);
  }

  async function initDetail() {
    const root = $("#order-root");
    if (!root) return;
    if (!(await FrameX.auth.guard(["CUSTOMER", "SHOP", "ADMIN"]))) return;
    await detail(root);
  }

  FrameX.ordersPage = { init: initList };
  FrameX.orderPage = { init: initDetail };
})((window.FrameX = window.FrameX || {}));
