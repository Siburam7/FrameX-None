/* ==========================================================================
   Cart drawer + header cart badge.
   There is no online checkout yet: the checkout button sends the order to
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
        ${(line.options || []).map((o) => `<p class="cart-line__meta">${esc(o)}</p>`).join("")}
        ${line.note ? `<p class="cart-line__meta">Note: ${esc(line.note)}</p>` : ""}
        ${line.type === "template" ? templateMeta(line) : ""}
        ${line.type === "studio" ? studioMeta(line) : ""}
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

  /** Personalised design lines: their text, photo count and an edit link. */
  function templateMeta(line) {
    const words = Object.values(line.customText || {})
      .filter(Boolean)
      .slice(0, 3)
      .map((v) =>
        esc(FrameX.templateEngine ? FrameX.templateEngine.formatDate(v) : v),
      );
    const edit = `studio.html?design=${encodeURIComponent(line.designId)}`;
    return `${words.length ? `<p class="cart-line__meta">“${words.join(" · ")}”</p>` : ""}
      <p class="cart-line__meta">${line.photoCount} ${line.photoCount === 1 ? "photo" : "photos"} · <a class="cart-line__edit" href="${edit}">Edit design</a></p>`;
  }

  /** FrameX Studio lines: frame / border / mat summary, text, photos and an edit link. */
  function studioMeta(line) {
    const words = Object.values(line.customText || {})
      .filter(Boolean)
      .slice(0, 3)
      .map((v) =>
        esc(FrameX.templateEngine ? FrameX.templateEngine.formatDate(v) : v),
      );
    return `${(line.summary || [])
      .filter((t) => !t.startsWith("Size"))
      .map((t) => `<p class="cart-line__meta">${esc(t)}</p>`)
      .join("")}
      ${words.length ? `<p class="cart-line__meta">“${words.join(" · ")}”</p>` : ""}
      <p class="cart-line__meta">${line.photoCount} ${line.photoCount === 1 ? "photo" : "photos"} · <a class="cart-line__edit" href="studio.html?design=${encodeURIComponent(line.designId)}">Edit in Studio</a></p>`;
  }

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
        (
          g,
        ) => `<section class="cart-group" aria-label="Items from ${esc(g.shopName)}">
          <h3 class="cart-group__head">${icon("store")} ${esc(g.shopName)}</h3>
          <ul>${g.lines.map(lineHtml).join("")}</ul>
        </section>`,
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
    button.setAttribute(
      "aria-label",
      `Open cart, ${count} ${count === 1 ? "item" : "items"}`,
    );
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
      const collection = $("#collection");
      if (collection)
        collection.scrollIntoView({
          behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
        });
      else window.location.href = FrameX.qs.pages.shop;
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
    // Until online checkout exists, the order is sent to FrameX on WhatsApp as a
    // ready-written message (items, sizes, notes, subtotal per shop).
    const whatsapp = (
      (FrameX.seed && FrameX.seed.site && FrameX.seed.site.contact) ||
      {}
    ).whatsapp;
    const checkout = $("#cart-checkout");
    if (whatsapp)
      checkout.innerHTML = `${FrameX.dom.icon("phone")} Order on WhatsApp`;
    checkout.addEventListener("click", () => {
      const groups = cart.groupedByShop();
      document.dispatchEvent(
        new CustomEvent("framex:checkout-requested", { detail: { groups } }),
      );
      if (!whatsapp) {
        FrameX.toast.show(
          "Online checkout is coming soon. Your cart is saved on this device.",
          { duration: 5000 },
        );
        return;
      }
      const { formatPrice } = FrameX.pricing;
      const text = ["Hello FrameX, I'd like to order:", ""]
        .concat(
          groups.flatMap((g) => [
            `From ${g.shopName || "shop"}:`,
            ...g.lines.map((l) => {
              let row = `• ${l.name}${l.size ? " (" + l.size + ")" : ""}${l.color ? ", " + l.color : ""} × ${l.qty} — ${formatPrice(l.unitPrice * l.qty)}${(l.options || []).map((o) => "\n  " + o).join("")}${l.note ? "\n  Note: " + l.note : ""}`;
              if (l.type === "studio") {
                const words = Object.values(l.customText || {})
                  .filter(Boolean)
                  .map((v) =>
                    FrameX.templateEngine
                      ? FrameX.templateEngine.formatDate(v)
                      : v,
                  );
                row += (l.summary || []).map((t) => `\n  ${t}`).join("");
                if (words.length) row += `\n  Text: "${words.join(" / ")}"`;
                if (l.photoCount)
                  row += `\n  ${l.photoCount} photo(s): I'll send them in this chat.`;
                row += `\n  Design ref: ${l.designId}`;
              }
              if (l.type === "template") {
                const words = Object.values(l.customText || {})
                  .filter(Boolean)
                  .map((v) =>
                    FrameX.templateEngine
                      ? FrameX.templateEngine.formatDate(v)
                      : v,
                  );
                row += `\n  Personalised template${words.length ? ': "' + words.join(" / ") + '"' : ""}\n  ${l.photoCount} photo(s): I'll send them in this chat.`;
              }
              return row;
            }),
            `Subtotal: ${formatPrice(g.subtotal)}`,
            "",
          ]),
        )
        .concat([
          "Please confirm availability, delivery or pickup, and the total.",
        ])
        .join("\n");
      window.open(
        FrameX.contact.whatsappUrl(whatsapp) +
          "?text=" +
          encodeURIComponent(text),
        "_blank",
        "noopener",
      );
    });
    // Esc is handled on the document: removing a cart line drops focus to <body>,
    // and the drawer must still close.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawer.classList.contains("is-open"))
        close();
    });
    drawer.addEventListener("keydown", (event) =>
      FrameX.overlay.trapFocus(drawer, event),
    );

    document.addEventListener("framex:cart-change", (event) => {
      render();
      // A removed line takes focus with it; keep keyboard users inside the drawer.
      if (
        drawer.classList.contains("is-open") &&
        !drawer.contains(document.activeElement)
      ) {
        (
          drawer.querySelector("[data-cart-action]") ||
          drawer.querySelector(".drawer__close")
        ).focus();
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
