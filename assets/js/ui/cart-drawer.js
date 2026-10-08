/* ==========================================================================
   Cart drawer + header cart badge.

   Shows the logged-in account's cart exactly as the backend returns it
   (store/cart.js): names, options, prices, what is no longer available.
   A visitor who isn't logged in is asked to log in first (ui/auth-gate.js).

   "Checkout" asks the backend to re-check the cart (availability, quantities,
   today's prices) and then opens checkout.html, where the address, the price
   and the payment are handled.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const cart = FrameX.cart;

  let drawer, body, foot, opener;
  let notice = null; // what the pre-checkout check found: [{ code, message }]
  let clearTimer = 0;

  const isOpen = () => drawer && drawer.classList.contains("is-open");
  const dated = (v) =>
    FrameX.templateEngine ? FrameX.templateEngine.formatDate(v) : v;
  const words = (line, limit = 99) =>
    Object.values((line.design && line.design.customText) || {})
      .filter(Boolean)
      .slice(0, limit)
      .map(dated);

  /** Was this design made in this browser? Only then can the Studio reopen it (designs are saved per browser). */
  function designIsHere(id) {
    if (!id) return false;
    if (FrameX.designs) return Boolean(FrameX.designs.get(id));
    try {
      return JSON.parse(localStorage.getItem("framex.designs.v1") || "[]").some(
        (d) => d && d.id === id,
      );
    } catch (error) {
      return false;
    }
  }

  /** FrameX Studio lines: frame / border / mat summary, text, photos and an edit link. */
  function designMeta(line) {
    const d = line.design;
    const text = words(line, 3).map(esc);
    const edit = designIsHere(d.id)
      ? ` · <a class="cart-line__edit" href="studio.html?design=${encodeURIComponent(d.id)}">Edit in Studio</a>`
      : "";
    return `${(d.summary || []).map((t) => `<p class="cart-line__meta">${esc(t)}</p>`).join("")}
      ${text.length ? `<p class="cart-line__meta">“${text.join(" · ")}”</p>` : ""}
      <p class="cart-line__meta">${d.photoCount} ${d.photoCount === 1 ? "photo" : "photos"}${edit}</p>`;
  }

  /** The customer's own photos on a line that is made from them. */
  function photosMeta(line) {
    const list = line.photos || [];
    if (!line.photosRequired || !list.length) return "";
    const words = list.length === 1 ? `Your photo: ${esc(list[0].name)}` : `${list.length} of your photos added`;
    return `<p class="cart-line__meta cart-line__photos">${icon("image")}<span>${words}</span></p>`;
  }

  /** A line that can't be ordered because its photo is missing: where to add the photo (then remove this line). */
  function photoFix(line) {
    if (!line.issue || line.issue.code !== "PHOTOS_REQUIRED") return "";
    const href = line.design
      ? designIsHere(line.design.id)
        ? `studio.html?design=${encodeURIComponent(line.design.id)}`
        : ""
      : line.productId
        ? `product.html?id=${encodeURIComponent(line.productId)}#your-photo`
        : "";
    return href ? ` <a class="cart-line__edit" href="${href}">Add your photo</a>, then remove this line.` : "";
  }

  function lineHtml(line) {
    const choice = [line.size, line.color].filter(Boolean).map(esc).join(" · ");
    const each = line.available ? `${formatPrice(line.unitPrice)} each` : "";
    const meta = [choice, each].filter(Boolean).join(" · ");
    const full = line.quantity >= Math.min(line.maxQuantity, cart.MAX_QTY);
    return `<li class="cart-line${line.available ? "" : " cart-line--unavailable"}" data-id="${esc(line.id)}">
      <img class="cart-line__image" src="${esc(FrameX.http.asset(line.image))}" alt="" width="72" height="72">
      <div class="cart-line__info">
        <p class="cart-line__name">${esc(line.name)}</p>
        ${meta ? `<p class="cart-line__meta">${meta}</p>` : ""}
        ${(line.options || []).map((o) => `<p class="cart-line__meta">${esc(o)}</p>`).join("")}
        ${line.note ? `<p class="cart-line__meta">Note: ${esc(line.note)}</p>` : ""}
        ${line.design ? designMeta(line) : photosMeta(line)}
        ${line.available && line.priceChange ? `<p class="cart-line__flag">Price updated: was ${formatPrice(line.priceChange.from)}, now ${formatPrice(line.priceChange.to)}.</p>` : ""}
        ${line.issue ? `<p class="cart-line__flag cart-line__flag--error">${icon("alert")}<span>${esc(line.issue.message)}${photoFix(line)}</span></p>` : ""}
        ${
          line.available
            ? `<div class="cart-line__row">
          <div class="qty" role="group" aria-label="Quantity for ${esc(line.name)}">
            <button class="qty__btn" type="button" data-cart-action="dec" aria-label="Decrease quantity">${icon("minus")}</button>
            <span class="qty__value" aria-live="polite">${line.quantity}</span>
            <button class="qty__btn" type="button" data-cart-action="inc" aria-label="Increase quantity" ${full ? "disabled" : ""}>${icon("plus")}</button>
          </div>
          <span class="cart-line__total">${formatPrice(line.lineTotal)}</span>
        </div>`
            : ""
        }
        <button class="cart-line__remove" type="button" data-cart-action="remove">Remove</button>
      </div>
    </li>`;
  }

  const stateHtml = (iconName, title, text, action = "") =>
    `<div class="cart-empty">${icon(iconName)}<strong>${title}</strong><span>${text}</span>${action}</div>`;

  function noticeHtml() {
    if (!notice || !notice.length) return "";
    const onlyPrices = notice.every((i) => i.code === "PRICE_CHANGED");
    return `<div class="cart-notice" role="alert" tabindex="-1">${icon("alert")}<div>
      <strong>${onlyPrices ? "Prices have changed" : "Please check your cart"}</strong>
      <ul>${notice.map((i) => `<li>${i.name && i.code !== "PRICE_CHANGED" ? `${esc(i.name)}: ` : ""}${esc(i.message)}</li>`).join("")}</ul>
      ${onlyPrices ? "<p>The new prices are shown below. Press Checkout again to continue.</p>" : ""}
    </div></div>`;
  }

  function render() {
    const status = cart.status();
    const groups = cart.groups();
    const count = cart.count();

    $("#cart-title-count").textContent = count ? `(${count})` : "";
    updateBadge(count);
    drawer.classList.toggle("is-busy", cart.busy());

    let state = "";
    if (status === "idle")
      state = stateHtml(
        "lock",
        "Log in to see your cart",
        "Your cart is saved to your FrameX account, so it's there on every device.",
        `<button class="btn btn--primary btn--sm" type="button" data-cart-action="login">Log in or sign up</button>`,
      );
    else if (status === "error")
      state = stateHtml(
        "alert",
        "We couldn't load your cart",
        "Check your connection and try again. Nothing in your cart is lost.",
        `<button class="btn btn--primary btn--sm" type="button" data-cart-action="retry">Try again</button>`,
      );
    else if (status === "loading" && !groups.length)
      state = stateHtml("bag", "Loading your cart…", "");
    else if (!groups.length)
      state = stateHtml(
        "bag",
        "Your cart is empty",
        "Pick a frame you love and it will show up here.",
        `<button class="btn btn--primary btn--sm" type="button" data-cart-action="browse">Browse frames</button>`,
      );
    if (state) {
      body.innerHTML = state;
      foot.hidden = true;
      return;
    }

    body.innerHTML =
      noticeHtml() +
      groups
        .map(
          (
            g,
          ) => `<section class="cart-group" aria-label="Items from ${esc(g.shopName)}">
          <h3 class="cart-group__head">${icon("store")} ${esc(g.shopName)}</h3>
          <ul>${g.items.map(lineHtml).join("")}</ul>
        </section>`,
        )
        .join("") +
      `<p class="cart-clear"><button type="button" data-cart-action="clear">Clear cart</button></p>`;

    $("#cart-subtotal").textContent = formatPrice(cart.subtotal());
    $("#cart-shop-note").hidden = groups.length < 2;
    $("#cart-checkout").disabled = !cart.items().some((i) => i.available);
    foot.hidden = false;
  }

  function updateBadge(count) {
    const badge = $(".cart-btn__count");
    const button = $(".cart-btn");
    if (!badge || !button) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    button.setAttribute(
      "aria-label",
      cart.status() === "idle"
        ? "Cart. Log in to see your cart"
        : `Open cart, ${count} ${count === 1 ? "item" : "items"}`,
    );
  }

  /** Opens the cart. A visitor who isn't logged in is asked to log in first. */
  async function open(trigger) {
    const from = trigger || document.activeElement;
    const state = await FrameX.auth.ready;
    if (!state.authenticated) {
      const loggedIn = await FrameX.authGate.require({ reason: "cart" });
      if (!loggedIn) return;
    }
    if (isOpen()) return;
    opener = from;
    notice = null;
    $$(".toast").forEach((t) => t.remove()); // don't let toasts cover the checkout button
    render();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    FrameX.overlay.show(close);
    setTimeout(() => $(".drawer__close", drawer).focus(), 50);
    cart.refresh(); // pick up changes made on another device or tab
  }

  function close() {
    if (!isOpen()) return;
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
      const collection = $("#collection");
      if (collection)
        collection.scrollIntoView({
          behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
        });
      else window.location.href = FrameX.qs.pages.shop;
      return;
    }
    if (action === "retry") return void cart.refresh();
    if (action === "login") {
      close();
      FrameX.authGate.require({ reason: "cart" }).then((ok) => ok && open());
      return;
    }
    if (action === "clear") {
      // Two taps, so a cart isn't emptied by accident.
      if (btn.dataset.confirm) {
        clearTimeout(clearTimer);
        cart.clear();
        return;
      }
      btn.dataset.confirm = "1";
      btn.textContent = "Tap again to remove everything";
      clearTimer = setTimeout(() => {
        delete btn.dataset.confirm;
        btn.textContent = "Clear cart";
      }, 4000);
      return;
    }
    if (cart.busy()) return; // the last change is still being saved
    const lineEl = btn.closest(".cart-line");
    const id = lineEl.dataset.id;
    const line = cart.items().find((l) => l.id === id);
    if (!line) return;

    if (action === "inc") cart.setQty(id, line.quantity + 1);
    if (action === "dec") cart.setQty(id, line.quantity - 1);
    if (action === "remove") {
      lineEl.classList.add("is-removing");
      cart.remove(id);
    }
  }

  /** The backend checks the cart once more; then the checkout page takes over. */
  async function checkout() {
    const button = $("#cart-checkout");
    button.disabled = true;
    const check = await cart.validate();
    button.disabled = false;
    if (!check.ok) {
      notice = check.issues;
      render();
      const box = $(".cart-notice", body);
      if (box) {
        body.scrollTop = 0;
        box.focus();
      }
      return;
    }
    notice = null;
    window.location.href = FrameX.qs.pages.checkout;
  }

  function init() {
    drawer = $("#cart-drawer");
    body = $("#cart-body");
    foot = $("#cart-foot");
    if (!drawer) return;

    $(".drawer__close", drawer).addEventListener("click", close);
    body.addEventListener("click", onBodyClick);
    $("#cart-continue").addEventListener("click", close);
    const button = $("#cart-checkout");
    button.innerHTML = `${icon("lock")} Checkout`;
    button.addEventListener("click", checkout);

    // Esc is handled on the document: removing a cart line drops focus to <body>,
    // and the drawer must still close. (The login dialog, when open, closes first.)
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        isOpen() &&
        !(FrameX.authGate && FrameX.authGate.isOpen())
      )
        close();
    });
    drawer.addEventListener("keydown", (event) =>
      FrameX.overlay.trapFocus(drawer, event),
    );

    document.addEventListener("framex:cart-change", (event) => {
      const { type, message } = event.detail;
      if (type === "busy") {
        drawer.classList.add("is-busy");
        updateBadge(cart.count());
        return;
      }
      if (type === "failed") {
        if (message) FrameX.toast.show(message, { duration: 5000 });
        drawer.classList.toggle("is-busy", cart.busy());
        render(); // puts back a line that was fading out
        return;
      }
      if (["update", "remove", "clear", "add", "reset"].includes(type))
        notice = null;
      if (type === "reset") close(); // logged out
      render();
      // A removed line takes focus with it; keep keyboard users inside the drawer.
      if (isOpen() && !drawer.contains(document.activeElement)) {
        (
          drawer.querySelector("[data-cart-action]") ||
          drawer.querySelector(".drawer__close")
        ).focus();
      }
      if (type === "add") {
        const bag = $(".cart-btn");
        bag.classList.remove("is-bumped");
        void bag.offsetWidth; // restart the animation
        bag.classList.add("is-bumped");
      }
    });
    render();
  }

  FrameX.cartDrawer = { init, open, close };
})((window.FrameX = window.FrameX || {}));
