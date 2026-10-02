/* ==========================================================================
   Cart drawer + header cart badge.
   Checkout is intentionally not connected: the button announces that and
   emits "framex:checkout-requested" so a real checkout can hook in later.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const cart = FrameX.cart;

  let drawer, body, foot, opener;

  const lineHtml = (line) => `<li class="cart-line" data-key="${esc(line.key)}">
      <img class="cart-line__image" src="${esc(line.image)}" alt="" width="72" height="72">
      <div class="cart-line__info">
        <p class="cart-line__name">${esc(line.name)}</p>
        <p class="cart-line__meta">${[line.size, line.color].filter(Boolean).map(esc).join(" · ")}${line.size || line.color ? " · " : ""}${formatPrice(line.unitPrice)} each</p>
        ${line.note ? `<p class="cart-line__meta">Note: ${esc(line.note)}</p>` : ""}
        <div class="cart-line__row">
          <div class="qty" role="group" aria-label="Quantity for ${esc(line.name)}">
            <button class="qty__btn" type="button" data-cart-action="dec" aria-label="Decrease quantity">${icon("minus")}</button>
            <span class="qty__value" aria-live="polite">${line.qty}</span>
            <button class="qty__btn" type="button" data-cart-action="inc" aria-label="Increase quantity" ${line.qty >= cart.MAX_QTY ? "disabled" : ""}>${icon("plus")}</button>
          </div>
          <span class="cart-line__total">${formatPrice(line.unitPrice * line.qty)}</span>
        </div>
        <button class="cart-line__remove" type="button" data-cart-action="remove">Remove</button>
      </div>
    </li>`;

  function render() {
    const groups = cart.groupedByShop();
    const count = cart.count();

    $("#cart-title-count").textContent = count ? `(${count})` : "";
    updateBadge(count);

    if (!groups.length) {
      body.innerHTML = `<div class="cart-empty">${icon("bag")}<strong>Your cart is empty</strong>
        <span>Pick a frame you love and it will show up here.</span>
        <button class="btn btn--primary btn--sm" type="button" data-cart-action="browse">Browse frames</button></div>`;
      foot.hidden = true;
      return;
    }

    body.innerHTML = groups
      .map(
        (g) => `<section class="cart-group" aria-label="Items from ${esc(g.shopName)}">
          <h3 class="cart-group__head">${icon("store")} ${esc(g.shopName)}</h3>
          <ul>${g.lines.map(lineHtml).join("")}</ul>
        </section>`
      )
      .join("");

    $("#cart-subtotal").textContent = formatPrice(cart.subtotal());
    $("#cart-shop-note").hidden = groups.length < 2;
    foot.hidden = false;
  }

  function updateBadge(count) {
    const badge = $(".cart-btn__count");
    const button = $(".cart-btn");
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    button.setAttribute("aria-label", `Open cart, ${count} ${count === 1 ? "item" : "items"}`);
  }

  function open(trigger) {
    opener = trigger || document.activeElement;
    $$(".toast").forEach((t) => t.remove()); // don't let toasts cover the checkout button
    render();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    FrameX.overlay.show(close);
    setTimeout(() => $(".drawer__close", drawer).focus(), 50);
  }

  function close() {
    if (!drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    FrameX.overlay.hide(close);
    if (opener && opener.focus) opener.focus();
  }

  function onBodyClick(event) {
    const btn = event.target.closest("[data-cart-action]");
    if (!btn) return;
    const action = btn.dataset.cartAction;
    if (action === "browse") {
      close();
      $("#collection").scrollIntoView({ behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }
    const lineEl = btn.closest(".cart-line");
    const key = lineEl.dataset.key;
    const line = cart.getLines().find((l) => l.key === key);
    if (!line) return;

    if (action === "inc") cart.setQty(key, line.qty + 1);
    if (action === "dec") cart.setQty(key, line.qty - 1);
    if (action === "remove") {
      lineEl.classList.add("is-removing");
      setTimeout(() => cart.remove(key), 240);
    }
  }

  function init() {
    drawer = $("#cart-drawer");
    body = $("#cart-body");
    foot = $("#cart-foot");
    if (!drawer) return;

    $(".drawer__close", drawer).addEventListener("click", close);
    body.addEventListener("click", onBodyClick);
    $("#cart-continue").addEventListener("click", close);
    $("#cart-checkout").addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("framex:checkout-requested", { detail: { groups: cart.groupedByShop() } }));
      FrameX.toast.show("Online checkout isn't connected yet. Your cart is saved on this device.", { duration: 5000 });
    });
    // Esc is handled on the document: removing a cart line drops focus to <body>,
    // and the drawer must still close.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawer.classList.contains("is-open")) close();
    });
    drawer.addEventListener("keydown", (event) => FrameX.overlay.trapFocus(drawer, event));

    document.addEventListener("framex:cart-change", (event) => {
      render();
      // A removed line takes focus with it; keep keyboard users inside the drawer.
      if (drawer.classList.contains("is-open") && !drawer.contains(document.activeElement)) {
        (drawer.querySelector("[data-cart-action]") || drawer.querySelector(".drawer__close")).focus();
      }
      if (event.detail.type === "add") {
        const button = $(".cart-btn");
        button.classList.remove("is-bumped");
        void button.offsetWidth; // restart the animation
        button.classList.add("is-bumped");
      }
    });
    render();
  }

  FrameX.cartDrawer = { init, open, close };
})((window.FrameX = window.FrameX || {}));
