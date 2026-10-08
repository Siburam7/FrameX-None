/* ==========================================================================
   Site chrome: header, footer and overlays are rendered from ONE template
   here, so every page shares identical markup (no copy-paste per page).
   Each page only needs <body data-page="..."> and the three root elements.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { pages } = FrameX.qs;

  const NAV = [
    ["home", "Home"],
    ["art", "Art & Artists"],
    ["services", "Services"],
    ["shop", "Shop"],
    ["decor", "Home Decor"],
    ["templates", "Templates"],
    ["contact", "Contact"],
    ["faq", "FAQ"],
  ];

  /* The header's main button follows the section the visitor is in: [label, link]. */
  const CTA = {
    art: ["Explore Art", `${pages.art}?view=artworks`],
    decor: ["Shop Decor", `${pages.decor}#browse`],
    templates: ["All Templates", pages.templates],
  };
  const CTA_DEFAULT = ["Shop Frames", pages.shop];

  const locationChip = `<button class="location-chip" type="button" data-action="use-location">
      ${icon("pin")}<span><small>Nearby shops</small><strong data-location-label>Set your location</strong></span></button>`;

  /* Account button. Rendered only when a FrameX backend is configured; it
     starts as "Log in" and is updated by syncAccount() once the session is known. */
  const accountBtn = () =>
    FrameX.http && FrameX.http.enabled()
      ? `<a class="account-btn" href="${pages.login}" data-account aria-label="Log in">${icon("user")}<span class="account-btn__text" data-account-text>Log in</span></a>`
      : "";
  const accountLink = () =>
    FrameX.http && FrameX.http.enabled()
      ? `<a class="btn btn--light" href="${pages.login}" data-account-mobile>${icon("user")} <span data-account-text>Log in</span></a>`
      : "";

  /** Point the account button at the right place for whoever is logged in. */
  function syncAccount() {
    const s = FrameX.auth && FrameX.auth.state;
    if (!s) return;
    const user = s.user;
    const href = user ? (user.role === "CUSTOMER" ? pages.account : FrameX.auth.homeFor(user.role)) : pages.login;
    const first = user ? String(user.role === "SHOP" && user.shop ? user.shop.name : user.name).split(/\s+/)[0] : "";
    const text = user ? (user.role === "SHOP" || user.role === "ARTIST" ? "Dashboard" : user.role === "ADMIN" ? "Admin" : first) : "Log in";
    document.querySelectorAll("[data-account], [data-account-mobile]").forEach((a) => {
      a.href = href;
      a.classList.toggle("is-authed", Boolean(user));
      if (a.hasAttribute("data-account")) a.setAttribute("aria-label", user ? `Your account (${first})` : "Log in");
      const label = a.querySelector("[data-account-text]");
      if (label) label.textContent = a.hasAttribute("data-account-mobile") && user ? (user.role === "CUSTOMER" ? "My account" : text) : text;
    });
  }
  document.addEventListener("framex:auth-change", syncAccount);

  function header(current) {
    // "shop-detail" and "product" belong to the Shop section in the nav.
    const section =
      {
        "shop-detail": "shop",
        product: "shop",
        "home-decor": "decor",
        "wall-art-studio": "decor",
        "customer-gallery": "gallery",
        template: "templates",
        studio: "templates",
        artist: "art",
        artwork: "art",
        painting: "art",
        paintings: "art",
      }[current] || current;
    const links = NAV.map(
      ([key, label]) =>
        `<li><a href="${pages[key]}"${key === section ? ' aria-current="page"' : ""}>${label}</a></li>`,
    ).join("");
    const solid = current === "home" ? "" : " site-header--solid";
    const [ctaLabel, ctaHref] = CTA[section] || CTA_DEFAULT;

    return `<header class="site-header${solid}" data-site-header>
      <div class="site-header__bar">
        <a class="brand" href="${pages.home}" aria-label="FrameX home"><img src="assets/img/ui/logo-framex.png" alt="FrameX" width="150" height="32"></a>
        <nav class="primary-nav" id="primary-nav" aria-label="Primary">
          <ul class="primary-nav__list">${links}</ul>
          <div class="primary-nav__mobile-extras">${locationChip}
            ${accountLink()}
            <a class="btn btn--light" href="${pages.search}">${icon("search")} Search</a>
            <a class="btn btn--primary" href="${ctaHref}">${ctaLabel}</a></div>
        </nav>
        <div class="site-header__actions">${locationChip}
          <a class="btn signup-btn" href="${ctaHref}">${ctaLabel}</a>
          <a class="search-btn" href="${pages.search}" aria-label="Search FrameX">${icon("search")}</a>
          ${accountBtn()}
          <button class="cart-btn" type="button" data-action="open-cart" aria-label="Open cart, 0 items">${icon("bag")}<span class="cart-btn__count" hidden>0</span></button>
          <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu"><span class="nav-toggle__bars"></span></button>
        </div>
      </div>
    </header>`;
  }

  /** WhatsApp helpers, shared with the contact page. Number = country code + digits. */
  const digits = (n) => String(n || "").replace(/\D/g, "");
  FrameX.contact = {
    whatsappUrl: (n) => "https://wa.me/" + digits(n),
    // "919337169824" -> "+91 93371 69824"
    formatWhatsapp: (n) => {
      const d = digits(n);
      return d.length === 12 && d.startsWith("91")
        ? `+91 ${d.slice(2, 7)} ${d.slice(7)}`
        : "+" + d;
    },
  };

  /** Email / WhatsApp from assets/data/site.seed.js, shown in the footer brand block when set. */
  function contactLinks() {
    const c =
      (FrameX.seed && FrameX.seed.site && FrameX.seed.site.contact) || {};
    const links = [];
    if (c.email)
      links.push(
        `<li><a href="mailto:${esc(c.email)}">${icon("mail")}<span>${esc(c.email)}</span></a></li>`,
      );
    if (c.whatsapp)
      links.push(
        `<li><a href="${esc(FrameX.contact.whatsappUrl(c.whatsapp))}" target="_blank" rel="noopener noreferrer">${icon("phone")}<span>WhatsApp ${esc(FrameX.contact.formatWhatsapp(c.whatsapp))}</span></a></li>`,
      );
    return links.length
      ? `<ul class="site-footer__contact">${links.join("")}</ul>`
      : "";
  }

  // Every link below is a real page — no "#" placeholders.
  const col = (title, items, extra = "") =>
    `<div><h3>${esc(title)}</h3><ul>${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}${extra}</ul></div>`;

  function footer() {
    return `<footer class="site-footer">
      <div class="container site-footer__top">
        <div class="site-footer__brand">
          <a class="brand" href="${pages.home}" aria-label="FrameX home"><img src="assets/img/ui/logo-framex.png" alt="FrameX" width="150" height="32" loading="lazy"></a>
          <p>Premium photo frames from local framing shops. Choose your frame, preview your own photo in it, then collect it or have it delivered.</p>
          ${contactLinks()}
        </div>
        ${col("Company", [
          ["Our Story", pages.story],
          ["About FrameX", pages.about],
          ["Customer Gallery", pages.customerGallery],
          ["Contact", pages.contact],
        ])}
        ${col("Shop", [
          ["All Frames", pages.shop],
          ["Home Decor & Wall Art", pages.decor],
          ["Art & Artists", pages.art],
          ["Templates", pages.templates],
          ["FrameX Studio", pages.studio + "?mode=photo"],
          ["Custom Frames", pages.home + "#custom-frame"],
          ["Categories", pages.home + "#categories"],
          ["Gallery", pages.gallery],
        ])}
        ${col("Support", [
          ["FAQ", pages.faq],
          ["How It Works", pages.services + "#journey"],
          ["Partner With FrameX", pages.partner],
          ["Join as an Artist", pages.art + "#join"],
          ["Shop Login", pages.login + "?type=shop"],
        ])}
        ${col("Legal", [
          ["Terms of Use", pages.terms],
          ["Privacy Notice", pages.privacy],
        ])}
      </div>
      <div class="container site-footer__bottom">
        <span>© 2026 FrameX. All rights reserved.</span>
        <a href="${pages.terms}">Terms of Use</a>
        <a href="${pages.privacy}">Privacy Notice</a>
      </div>
    </footer>`;
  }

  const overlays = `<div class="backdrop" id="backdrop"></div>
    <aside class="drawer" id="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" aria-hidden="true">
      <div class="drawer__head">
        <h2 class="drawer__title" id="cart-title">Your cart <span id="cart-title-count"></span></h2>
        <button class="drawer__close" type="button" aria-label="Close cart">${icon("close")}</button>
      </div>
      <div class="drawer__body" id="cart-body"></div>
      <div class="drawer__foot" id="cart-foot" hidden>
        <div class="summary-row"><span>Subtotal</span><strong id="cart-subtotal"></strong></div>
        <div class="summary-row"><small>Delivery and taxes</small><small>Calculated at checkout</small></div>
        <p class="drawer__note" id="cart-shop-note" hidden>Items from different shops are ordered separately.</p>
        <button class="btn btn--primary btn--block" type="button" id="cart-checkout">Checkout</button>
        <button class="btn btn--outline btn--block" type="button" id="cart-continue">Continue shopping</button>
      </div>
    </aside>
    <div class="toast-region" id="toast-region" role="status" aria-live="polite"></div>`;

  function render() {
    document.body.insertAdjacentHTML("afterbegin", FrameX.iconSprite);
    const page = document.body.dataset.page || "home";
    $("#site-header-root").outerHTML = header(page);
    $("#site-footer-root").outerHTML = footer();
    $("#overlay-root").outerHTML = overlays;
    syncAccount();
  }

  FrameX.chrome = { render };
})((window.FrameX = window.FrameX || {}));
