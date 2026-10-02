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
    const section = { "shop-detail": "shop", product: "shop" }[current] || current;
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

  // Every link below is a real page — no "#" placeholders.
  const col = (title, items) =>
    `<div><h3>${esc(title)}</h3><ul>${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}</ul></div>`;

  function footer() {
    return `<footer class="site-footer">
      <div class="container site-footer__top">
        ${col("Company", [["Our Story", pages.story], ["About FrameX", pages.about], ["Contact", pages.contact]])}
        ${col("Customer", [["Shop", pages.shop], ["FAQ", pages.faq], ["Terms of Use", pages.terms], ["Privacy Notice", pages.privacy]])}
        ${col("Product", [["All Frames", pages.shop], ["Custom Frames", pages.home + "#custom-frame"], ["Gallery", pages.gallery]])}
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
