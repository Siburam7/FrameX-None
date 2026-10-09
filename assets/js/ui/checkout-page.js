/* ==========================================================================
   Checkout page (checkout.html). Logged-in users only.

     checkout.html         orders the cart
     checkout.html?buy=1   "Buy Now": orders the one item chosen on a product
                           page or in FrameX Studio (services/buy-now.js);
                           the cart is not changed

     1. Delivery address   saved addresses, add / edit
     2. Order summary      the items as the backend prices them now, with the
                           customer's own photos where an item is made from them
     3. Gift wrapping      "Would you like to gift wrap this order?" Yes / No.
                           The charge is the backend's (GIFT_WRAP_FEE) and is its
                           own line in the price before anything is paid.
     4. Payment method     online (through the payment gateway) or Cash on Delivery
     Price details + "Pay ₹…" / "Place Order • ₹…"

   Every amount on this page comes from GET /api/checkout/quote. The page
   never adds anything up. "Place order" sends the address, the way to pay,
   the total that was shown and a key for this checkout; the backend builds
   the order from the cart in its own database and answers with the order.

   Online payment: the gateway's window is opened by services/payments.js and
   the backend verifies the result. This page shows "paid" only when the
   backend says the order is paid.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const forms = () => FrameX.forms;
  const http = () => FrameX.http;

  const KEY_STORE = "framex.checkoutKey.v1";
  const METHOD_ICON = { upi: "qr", card: "card", netbanking: "bank", wallet: "wallet", COD: "cash" };
  const GATEWAY_NAME = { cashfree: "Cashfree Payments", razorpay: "Razorpay" };

  let root, user;
  let addresses = [];
  let states = [];
  let addressId = null;
  let editing = null; // null | "new" | address id
  let method = null; // "upi" | "card" | "netbanking" | "wallet" | "COD"
  let quote = null;
  let busy = false;
  let waiting = null; // { orderNumber, message }: an online order that still needs its payment
  let giftWrap = false; // the customer's answer to "gift wrap this order?"
  let giftWrapOffered = true; // false = the shop doesn't offer gift wrapping at all (GET /api/config)
  const buyMode = FrameX.qs.param("buy") === "1";
  let buying = null; // "Buy Now": { name, item } — this one item is ordered instead of the cart

  const paymentMethod = () => (method === "COD" ? "COD" : method ? "ONLINE" : null);
  const orderUrl = (n, placed) => `order.html?id=${encodeURIComponent(n)}${placed ? "&placed=1" : ""}`;

  /* ---- One key per checkout: the same key always gives the same order.
     It is kept for this tab, so pressing the button twice or reloading the page
     can't create a second order. It changes when what is being ordered changes. */
  function checkoutKey() {
    const direct = buying ? [buying.item.productId || (buying.item.design && buying.item.design.id), buying.item.quantity, buying.item.selection || null, buying.item.note || "", buying.item.customization || null, buying.item.photos || null] : null;
    const signature = JSON.stringify([addressId, paymentMethod(), quote.total, quote.items.map((i) => [i.id, i.quantity]), direct, wrapped()]);
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY_STORE) || "null");
      if (saved && saved.signature === signature) return saved.key;
    } catch (error) {
      /* start a new key */
    }
    const key = window.crypto && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    try {
      sessionStorage.setItem(KEY_STORE, JSON.stringify({ key, signature }));
    } catch (error) {
      /* storage blocked: the key lasts for this page view */
    }
    return key;
  }
  const forgetKey = () => {
    try {
      sessionStorage.removeItem(KEY_STORE);
    } catch (error) {
      /* nothing stored */
    }
  };

  /* ---------------------------------------------------------------- Data */
  /** The backend's price for the cart, or for the one "Buy Now" item. */
  const askQuote = () =>
    buying
      ? http().post("/checkout/quote", { addressId: addressId || undefined, paymentMethod: paymentMethod() || undefined, buyNow: buying.item, giftWrap })
      : http().get("/checkout/quote", { addressId, paymentMethod: paymentMethod(), giftWrap: giftWrap ? "true" : "" });

  /** Is gift wrapping part of this order? Only when it was chosen AND the backend says this order can be wrapped. */
  const wrapped = () => Boolean(quote && quote.giftWrap && quote.giftWrap.selected);

  async function loadQuote() {
    const r = await askQuote();
    quote = r.quote;
    // An order that can't be wrapped (a shop or a product doesn't offer it) drops the choice.
    if (giftWrap && quote.giftWrap && !quote.giftWrap.available) giftWrap = false;
    // Pick a way to pay that is really available.
    const online = quote.payment.online;
    const ok = method === "COD" ? quote.payment.cod.available : method ? online.available && online.methods.some((m) => m.id === method) : false;
    if (!ok) {
      const next = online.available ? online.methods[0].id : quote.payment.cod.available ? "COD" : null;
      if (next !== method) {
        method = next;
        if (paymentMethod()) quote = (await askQuote()).quote;
      }
    }
  }

  /* ---------------------------------------------------------------- Address */
  const addressText = (a) => [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).map(esc).join("<br>");

  function addressForm(a = {}) {
    const f = forms().field;
    return `<form class="form-grid co-address-form" id="co-address-form" novalidate>
        <div class="form-grid form-grid--2">
          ${f("fullName", "Full name", { required: true, autocomplete: "name", maxlength: 80, value: a.fullName || user.name, prefix: "ad" })}
          ${f("phone", "Mobile number", { required: true, type: "tel", inputmode: "tel", autocomplete: "tel", value: a.phone || user.phone || "", placeholder: "10-digit mobile number", prefix: "ad" })}
        </div>
        ${f("line1", "House / flat no., building, street", { required: true, autocomplete: "address-line1", maxlength: 160, value: a.line1 || "", prefix: "ad" })}
        <div class="form-grid form-grid--2">
          ${f("line2", "Area / locality", { autocomplete: "address-line2", maxlength: 120, value: a.line2 || "", prefix: "ad" })}
          ${f("landmark", "Landmark", { maxlength: 120, value: a.landmark || "", prefix: "ad" })}
        </div>
        <div class="form-grid form-grid--3">
          ${f("city", "City / town", { required: true, autocomplete: "address-level2", maxlength: 80, value: a.city || "", prefix: "ad" })}
          <div class="form-field" data-invalid="false">
            <label for="ad-state">State</label>
            <select class="select" id="ad-state" name="state" required autocomplete="address-level1" aria-describedby="ad-state-err">
              <option value="">Choose a state</option>
              ${states.map((s) => `<option value="${esc(s)}"${s === a.state ? " selected" : ""}>${esc(s)}</option>`).join("")}
            </select>
            <p class="form-field__error" id="ad-state-err">${icon("alert")}<span></span></p>
          </div>
          ${f("postalCode", "PIN code", { required: true, inputmode: "numeric", autocomplete: "postal-code", maxlength: 6, value: a.postalCode || "", prefix: "ad" })}
        </div>
        <div class="form-status" role="status" aria-live="polite"></div>
        <div class="co-actions">
          <button class="btn btn--dark btn--sm" type="submit">${a.id ? "Save address" : "Save and deliver here"}</button>
          ${addresses.length ? `<button class="btn btn--outline btn--sm" type="button" data-address-cancel>Cancel</button>` : ""}
        </div>
      </form>`;
  }

  function renderAddress() {
    const box = $("#co-address-body", root);
    if (editing || !addresses.length) {
      const current = addresses.find((a) => a.id === editing) || {};
      box.innerHTML = `${addresses.length ? "" : `<p class="co-lead">Where should we deliver your order?</p>`}${addressForm(current)}`;
      const form = $("#co-address-form", box);
      forms().handle(form, {
        busyLabel: "Saving…",
        send: (v) => (current.id ? http().patch("/addresses/" + current.id, v) : http().post("/addresses", v)),
        async onSuccess(result) {
          addresses = result.items;
          addressId = result.address.id;
          editing = null;
          await refresh();
        },
      });
      const cancel = $("[data-address-cancel]", box);
      if (cancel)
        cancel.addEventListener("click", () => {
          editing = null;
          renderAddress();
        });
      return;
    }
    box.innerHTML = `<div class="co-addresses" role="radiogroup" aria-label="Delivery address">
        ${addresses
          .map(
            (a) => `<label class="co-choice${a.id === addressId ? " is-selected" : ""}">
            <input type="radio" name="address" value="${esc(a.id)}"${a.id === addressId ? " checked" : ""}>
            <span class="co-choice__body"><strong>${esc(a.fullName)}</strong><span>${addressText(a)}</span><span>${icon("phone")} ${esc(a.phone)}</span></span>
            <button class="co-link" type="button" data-address-edit="${esc(a.id)}">Edit</button>
          </label>`,
          )
          .join("")}
      </div>
      <button class="co-link co-link--add" type="button" data-address-new>${icon("plus")} Add a new address</button>`;
  }

  /* ---------------------------------------------------------------- Items */
  /** The customer's own photos on an item: "Your photo: name" or "3 photos". */
  function photosLine(i) {
    const list = i.photos || [];
    if (!list.length) return "";
    return `<span class="co-item__photos">${icon("image")} ${list.length === 1 ? `Your photo: ${esc(list[0].name)}` : `${list.length} of your photos`}</span>`;
  }

  function renderItems() {
    const box = $("#co-items-body", root);
    const problems = quote.issues.filter((i) => i.code !== "CART_EMPTY");
    box.innerHTML = `${
      problems.length
        ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span><strong>Some items need your attention.</strong> ${problems.map((i) => `${i.name ? esc(i.name) + ": " : ""}${esc(i.message)}`).join(" ")} ${buying ? `<button class="co-link" type="button" data-back>Go back to the item</button>` : `<button class="co-link" type="button" data-open-cart>Review your cart</button>`}</span></div>`
        : ""
    }
      ${quote.priceChanges.length ? `<div class="form-status form-status--info is-visible" role="status">${icon("alert")}<span>${quote.priceChanges.map((c) => `The price of ${esc(c.name)} changed from ${formatPrice(c.from)} to ${formatPrice(c.to)}.`).join(" ")}</span></div>` : ""}
      <ul class="co-items">${quote.items
        .map(
          (i) => `<li class="co-item">
          <img src="${esc(http().asset(i.image))}" alt="" width="64" height="64" loading="lazy">
          <div class="co-item__info">
            <strong>${esc(i.name)}</strong>
            <span>${[i.size, i.color].filter(Boolean).map(esc).join(" · ")}</span>
            ${(i.options || []).map((o) => `<span>${esc(o)}</span>`).join("")}
            ${photosLine(i)}
            ${i.note ? `<span>Note: ${esc(i.note)}</span>` : ""}
            <span class="co-item__shop">${icon("store")} ${esc(i.shopName)}</span>
          </div>
          <div class="co-item__price"><strong>${formatPrice(i.lineTotal)}</strong><span>${i.quantity} × ${formatPrice(i.unitPrice)}</span>${i.unitDiscount ? `<s>${formatPrice(i.unitListPrice * i.quantity)}</s>` : ""}</div>
        </li>`,
        )
        .join("")}</ul>
      ${quote.items.some((i) => (i.photos || []).length) ? `<p class="co-note">${icon("image")}<span>Your photos are uploaded and go with this order. They are printed in the same original quality you provided: FrameX does not enhance or change them.</span></p>` : ""}`;
  }

  /* ---------------------------------------------------------------- Gift wrapping */
  function renderGift() {
    const card = $("#co-gift", root);
    if (!card) return;
    const g = quote.giftWrap || { available: false, fee: 0, reason: "", selected: false };
    card.hidden = !giftWrapOffered;
    if (!giftWrapOffered) return;
    const price = g.fee ? `+ ${formatPrice(g.fee)} for the whole order` : "Free";
    const choice = (value, title, hint, disabled) => `<label class="co-choice co-choice--gift${(value === "yes") === wrapped() ? " is-selected" : ""}${disabled ? " is-disabled" : ""}">
        <input type="radio" name="gift" value="${value}"${(value === "yes") === wrapped() ? " checked" : ""}${disabled ? " disabled" : ""}>
        <span class="co-choice__body"><strong>${title}</strong><span>${hint}</span></span>
      </label>`;
    $("#co-gift-body", root).innerHTML = `<p class="co-gift__q"><span aria-hidden="true">🎁</span> Would you like to gift wrap this order?</p>
      <div class="co-gift__choices" role="radiogroup" aria-label="Gift wrapping">
        ${choice("yes", "Yes, gift wrap it", esc(price), !g.available)}
        ${choice("no", "No, thank you", "Standard protective packaging", false)}
      </div>
      ${g.available ? "" : `<p class="co-fine co-fine--warn">${icon("alert")}<span>${esc(g.reason || "Gift wrapping is not available for this order.")}</span></p>`}`;
  }

  /* ---------------------------------------------------------------- Payment */
  function methodRow({ id, label, hint, disabled = false }) {
    return `<label class="co-choice co-choice--pay${id === method ? " is-selected" : ""}${disabled ? " is-disabled" : ""}">
        <input type="radio" name="pay" value="${esc(id)}"${id === method ? " checked" : ""}${disabled ? " disabled" : ""}>
        <span class="co-choice__icon">${icon(METHOD_ICON[id] || "card")}</span>
        <span class="co-choice__body"><strong>${esc(label)}</strong><span>${esc(hint)}</span></span>
      </label>`;
  }

  function renderPayment() {
    const { online, cod } = quote.payment;
    const codHint = cod.available ? `Pay in cash when your order arrives${cod.fee ? ` · ${formatPrice(cod.fee)} fee` : ""}` : cod.reason;
    $("#co-pay-body", root).innerHTML = `${online.available && online.mode === "test" ? `<div class="form-status form-status--dev is-visible" role="note">${icon("alert")}<span><strong>Test mode.</strong> Online payments on this site are not real yet: no money is taken. Use the payment gateway's test cards and test UPI IDs.</span></div>` : ""}
      <div class="co-methods" role="radiogroup" aria-label="Payment method">
        ${
          online.available
            ? online.methods.map(methodRow).join("")
            : `<div class="co-choice co-choice--pay is-disabled" aria-disabled="true"><span class="co-choice__icon">${icon("lock")}</span><span class="co-choice__body"><strong>Online payment</strong><span>UPI, cards and net banking aren't available right now.</span></span></div>`
        }
        ${methodRow({ id: "COD", label: "Cash on Delivery", hint: codHint, disabled: !cod.available })}
      </div>
      ${!online.available && !cod.available ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>No way to pay is available for this order right now. Please <a href="contact.html">contact FrameX</a>.</span></div>` : ""}`;
  }

  /* ---------------------------------------------------------------- Price details + button */
  function renderTotal() {
    const q = quote;
    const cod = method === "COD";
    const ready = q.ok && addressId && !editing && method && !busy;
    const gatewayName = GATEWAY_NAME[q.payment.online.provider] || "the payment gateway";
    const row = (label, value, cls = "") => `<div class="co-row ${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
    $("#co-total", root).innerHTML = `<h2 class="co-card__title">Price details</h2>
      <dl class="co-rows">
        ${row(`Subtotal (${q.itemCount} ${q.itemCount === 1 ? "item" : "items"})`, formatPrice(q.subtotal))}
        ${q.discount ? row("Discount", "− " + formatPrice(q.discount), "co-row--good") : ""}
        ${row("Delivery", formatPrice(q.shippingFee))}
        ${q.tax ? row(`Tax (${q.taxPercent}%)`, formatPrice(q.tax)) : ""}
        ${wrapped() ? row("Gift wrapping", q.giftWrapFee ? formatPrice(q.giftWrapFee) : "Free", "co-row--gift") : ""}
        ${q.codFee ? row("Cash on Delivery fee", formatPrice(q.codFee)) : ""}
        ${row("Total", formatPrice(q.total), "co-row--total")}
      </dl>
      ${waiting ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span><strong>Order ${esc(waiting.orderNumber)} is not paid yet.</strong> ${esc(waiting.message)} <a href="${orderUrl(waiting.orderNumber)}">View order</a></span></div>` : ""}
      <div class="form-status" id="co-status" role="status" aria-live="polite"></div>
      <button class="btn btn--primary btn--block co-place" type="button" data-place ${ready ? "" : "disabled"}>${
        cod ? `Place Order • ${formatPrice(q.total)}` : waiting ? `Retry payment • ${formatPrice(q.total)}` : `Pay ${formatPrice(q.total)}`
      }</button>
      <p class="co-fine">${icon("lock")}<span>${
        !method
          ? "Choose a way to pay."
          : cod
            ? "You pay in cash when your order is delivered. Nothing is charged now."
            : `You pay in ${esc(gatewayName)}'s secure window. FrameX never sees or stores your card number, CVV or UPI PIN.`
      }</span></p>
      ${!addressId || editing ? `<p class="co-fine co-fine--warn">${icon("alert")}<span>Add a delivery address to continue.</span></p>` : ""}`;
  }

  /* ---------------------------------------------------------------- Page */
  function render() {
    if (!buying && quote.issues.some((i) => i.code === "CART_EMPTY")) {
      root.innerHTML = `<div class="co-empty">${icon("bag")}<strong>Your cart is empty</strong><span>Add a frame to your cart to check out.</span>
        <div class="co-actions"><a class="btn btn--primary" href="shop.html">Browse frames</a><a class="btn btn--outline" href="orders.html">Your orders</a></div></div>`;
      return;
    }
    if (!$("#co-total", root)) {
      root.innerHTML = `<div class="co">
        <header class="co-head">
          <h1 class="co-title">Checkout</h1>
          <ol class="co-steps" aria-label="Checkout steps"><li class="is-done">${buying ? "Buy Now" : "Cart"}</li><li>Address</li><li>Summary</li><li>Payment</li></ol>
        </header>
        ${buying ? `<p class="co-buynow">${icon("bag")}<span><strong>Buy Now:</strong> you are ordering this item only. Your cart is not changed.${FrameX.cart.count() ? ` <a href="checkout.html">Check out your cart instead</a>` : ""}</span></p>` : ""}
        <div class="co-grid">
          <div class="co-main">
            <section class="co-card" aria-labelledby="co-h-address"><h2 class="co-card__title" id="co-h-address"><span class="co-num">1</span> Delivery address</h2><div id="co-address-body"></div></section>
            <section class="co-card" aria-labelledby="co-h-items"><h2 class="co-card__title" id="co-h-items"><span class="co-num">2</span> Order summary</h2><div id="co-items-body"></div></section>
            <section class="co-card" id="co-gift" aria-labelledby="co-h-gift"${giftWrapOffered ? "" : " hidden"}><h2 class="co-card__title" id="co-h-gift"><span class="co-num">3</span> Gift wrapping</h2><div id="co-gift-body"></div></section>
            <section class="co-card" aria-labelledby="co-h-pay"><h2 class="co-card__title" id="co-h-pay"><span class="co-num">${giftWrapOffered ? 4 : 3}</span> Payment method</h2><div id="co-pay-body"></div></section>
          </div>
          <aside class="co-side"><div class="co-card co-card--total" id="co-total" aria-live="polite"></div></aside>
        </div>
      </div>`;
    }
    renderAddress();
    renderItems();
    renderGift();
    renderPayment();
    renderTotal();
  }

  async function refresh() {
    try {
      await loadQuote();
      render();
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      FrameX.templates.showError(root, "Checkout couldn't be loaded.", start);
    }
  }

  const say = (kind, html) => {
    const box = $("#co-status", root);
    if (box) forms().status(box, kind, html);
  };

  /** The order is placed: forget the "Buy Now" item, or reload the cart (its bought lines are gone). */
  const done = () => (buying ? FrameX.buyNow.clear() : FrameX.cart.refresh());

  /** After the gateway's window: go to the confirmation, or stay here with "Retry payment". */
  function settle(result, orderNumber) {
    if (result.outcome === "paid") {
      forgetKey();
      done();
      window.location.href = orderUrl(orderNumber, true);
      return;
    }
    const message =
      result.outcome === "failed"
        ? "The payment didn't go through. You can try again, or choose another way to pay."
        : result.outcome === "cancelled"
          ? "You closed the payment window before paying. Nothing was charged."
          : result.message || "We're still confirming your payment. Please don't pay again: check the order in a moment.";
    waiting = { orderNumber, message };
  }

  async function place() {
    if (busy || !quote.ok || !addressId || !method) return;
    busy = true;
    renderTotal();
    say("info", method === "COD" ? "Placing your order…" : "Opening the secure payment window…");
    try {
      if (waiting && method !== "COD") {
        // The order already exists: a new payment attempt on the same order.
        settle(await FrameX.payments.retry(waiting.orderNumber, method), waiting.orderNumber);
      } else {
        const r = await http().post("/checkout/orders", { addressId, paymentMethod: paymentMethod(), paymentChannel: method === "COD" ? undefined : method, expectedTotal: quote.total, idempotencyKey: checkoutKey(), buyNow: buying ? buying.item : undefined, giftWrap: wrapped() });
        const number = r.order.orderNumber;
        if (r.order.paymentMethod === "COD" || r.order.paymentStatus === "PAID") {
          forgetKey();
          done();
          window.location.href = orderUrl(number, true);
          return;
        }
        if (r.payment) settle(await FrameX.payments.pay(r.payment, number), number);
        else waiting = { orderNumber: number, message: (r.paymentError && r.paymentError.message) || "The payment couldn't be started. Please try again." };
      }
    } catch (error) {
      busy = false;
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      if (error.code === "EARLIER_ORDER_PAID" && error.details && error.details.orderNumber) {
        forgetKey();
        window.location.href = orderUrl(error.details.orderNumber, true);
        return;
      }
      if (error.code === "CHECKOUT_EXPIRED" || error.code === "CHECKOUT_CHANGED") {
        forgetKey();
        waiting = null;
      }
      // Prices, stock or fees changed: show the page as the server sees it now, with the reason.
      await refresh();
      say("error", esc(error.message));
      const box = $("#co-status", root);
      if (box) box.scrollIntoView({ block: "center", behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }
    busy = false;
    renderTotal();
  }

  function wire() {
    root.addEventListener("change", async (e) => {
      if (e.target.name === "address") {
        addressId = e.target.value;
        waiting = null;
        await refresh();
      }
      if (e.target.name === "pay") {
        method = e.target.value;
        if (method === "COD") waiting = null; // switching to cash: a new order replaces the unpaid online one
        await refresh();
      }
      if (e.target.name === "gift") {
        giftWrap = e.target.value === "yes";
        waiting = null; // the total changes: this is a new checkout, not a retry of the unpaid order
        await refresh();
        const again = $(`input[name="gift"][value="${wrapped() ? "yes" : "no"}"]`, root);
        if (again) again.focus();
      }
    });
    root.addEventListener("click", (e) => {
      const edit = e.target.closest("[data-address-edit]");
      if (edit) {
        e.preventDefault();
        editing = edit.dataset.addressEdit;
        renderAddress();
        renderTotal();
        return;
      }
      if (e.target.closest("[data-address-new]")) {
        editing = "new";
        renderAddress();
        renderTotal();
        return;
      }
      if (e.target.closest("[data-open-cart]")) return void FrameX.cartDrawer.open();
      if (e.target.closest("[data-back]")) return void window.history.back();
      if (e.target.closest("[data-place]")) place();
    });
    // The cart changed in the drawer (or on another device): price it again.
    document.addEventListener("framex:cart-change", (e) => {
      if (buying || !["update", "remove", "clear", "add"].includes(e.detail.type) || busy) return; // "Buy Now" doesn't depend on the cart
      waiting = null; // what is being ordered changed: this is a new checkout
      refresh();
    });
  }

  async function start() {
    root.innerHTML = `<div class="skeleton" style="height:420px"></div>`;
    try {
      const [r, settings] = await Promise.all([http().get("/addresses"), http().serverConfig()]);
      giftWrapOffered = !settings || !settings.giftWrap || settings.giftWrap.enabled !== false;
      addresses = r.items;
      states = r.states;
      addressId = (addresses.find((a) => a.isDefault) || addresses[0] || {}).id || null;
      await loadQuote();
      render();
      // For the visitor statistics: checkout was opened with something in it (counted once per page).
      if (!start.counted && FrameX.analytics && quote && quote.total > 0) {
        start.counted = true;
        FrameX.analytics.track("begin_checkout", { value: quote.total });
      }
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      FrameX.templates.showError(root, "Checkout couldn't be loaded.", start);
    }
  }

  async function init() {
    root = $("#checkout-root");
    if (!root) return;
    user = await FrameX.auth.guard(["CUSTOMER", "SHOP", "ADMIN"]);
    if (!user) return;
    if (buyMode) {
      buying = FrameX.buyNow ? FrameX.buyNow.read() : null;
      if (!buying) {
        // Opened without an item (a new tab, or the hour is up).
        root.innerHTML = `<div class="co-empty">${icon("bag")}<strong>Choose an item to buy</strong><span>“Buy Now” starts from a product page. You can also check out the items in your cart.</span>
          <div class="co-actions"><a class="btn btn--primary" href="shop.html">Browse frames</a><a class="btn btn--outline" href="checkout.html">Check out your cart</a></div></div>`;
        return;
      }
    }
    wire();
    await start();
  }

  FrameX.checkoutPage = { init };
})((window.FrameX = window.FrameX || {}));
