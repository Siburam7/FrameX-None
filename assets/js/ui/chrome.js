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
    ["about", "About"],
    ["services", "Services"],
    ["shop", "Shop"],
    ["gallery", "Gallery"],
    ["contact", "Contact"],
    ["faq", "FAQ"]
  ];

  const locationChip = `<button class="location-chip" type="button" data-action="use-location">
      ${icon("pin")}<span><small>Nearby shops</small><strong data-location-label>Set your location</strong></span></button>`;

  function header(current) {
    // "shop-detail" and "product" belong to the Shop section in the nav.
    const section = { "shop-detail": "shop", product: "shop", "customer-gallery": "gallery" }[current] || current;
    const links = NAV.map(
      ([key, label]) => `<li><a href="${pages[key]}"${key === section ? ' aria-current="page"' : ""}>${label}</a></li>`
    ).join("");
    const solid = current === "home" ? "" : " site-header--solid";

    return `<header class="site-header${solid}" data-site-header>
      <div class="site-header__bar">
        <a class="brand" href="${pages.home}" aria-label="FrameX home"><img src="assets/img/ui/logo-framex.png" alt="FrameX" width="116" height="24"></a>
        <nav class="primary-nav" id="primary-nav" aria-label="Primary">
          <ul class="primary-nav__list">${links}</ul>
          <div class="primary-nav__mobile-extras">${locationChip}
            <button class="btn btn--light" type="button" data-action="coming-soon" data-feature="Customer accounts">Sign up</button></div>
        </nav>
        <div class="site-header__actions">${locationChip}
          <button class="btn signup-btn" type="button" data-action="coming-soon" data-feature="Customer accounts">Sign up</button>
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
      return d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : "+" + d;
    }
  };

  /** Email / WhatsApp from assets/data/site.seed.js, listed under Support when set. */
  function contactLinks() {
    const c = (FrameX.seed && FrameX.seed.site && FrameX.seed.site.contact) || {};
    const links = [];
    if (c.email) links.push(`<li><a href="mailto:${esc(c.email)}">${icon("mail")}<span>${esc(c.email)}</span></a></li>`);
    if (c.whatsapp) links.push(`<li><a href="${esc(FrameX.contact.whatsappUrl(c.whatsapp))}" target="_blank" rel="noopener noreferrer">${icon("phone")}<span>WhatsApp ${esc(FrameX.contact.formatWhatsapp(c.whatsapp))}</span></a></li>`);
    return links.join("");
  }

  // Every link below is a real page — no "#" placeholders.
  const col = (title, items, extra = "") =>
    `<div><h3>${esc(title)}</h3><ul>${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}${extra}</ul></div>`;

  function footer() {
    return `<footer class="site-footer">
      <div class="container site-footer__top">
        ${col("Company", [["Our Story", pages.story], ["About FrameX", pages.about], ["Customer Gallery", pages.customerGallery], ["Contact", pages.contact]])}
        ${col("Shop", [["All Frames", pages.shop], ["Custom Frames", pages.home + "#custom-frame"], ["Categories", pages.home + "#categories"], ["Gallery", pages.gallery]])}
        ${col("Support", [["FAQ", pages.faq], ["How It Works", pages.services + "#journey"]], contactLinks())}
        ${col("Legal", [["Terms of Use", pages.terms], ["Privacy Notice", pages.privacy]])}
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
        <div class="summary-row"><small>Delivery fee</small><small>Set by the shop at checkout</small></div>
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
  }

  FrameX.chrome = { render };
})((window.FrameX = window.FrameX || {}));
