/* ==========================================================================
   App bootstrap. Every page sets <body data-page="...">; this file renders the
   shared chrome, starts the shared behaviour, then runs that page's modules.
   Modules that a page doesn't include are simply skipped.
   ========================================================================== */
(function (FrameX) {
  const call = (name, ...args) =>
    FrameX[name] && FrameX[name].init ? FrameX[name].init(...args) : undefined;

  const PAGES = {
    home: async () => {
      FrameX.marquee.init(document.querySelector("#ticker"));
      await Promise.all([
        call("site"),
        call("homeHero"),
        call("featured"),
        call("categories"),
        call("shops"),
        call("recommended"),
        call("reviews"),
        call("community"),
        call("guide"),
        call("trendingTemplates"),
        call("homeArt"),
      ]);
    },
    shop: async () => {
      const categories = await FrameX.api.getCategories();
      await Promise.all([call("shops"), call("collection", categories)]);
      if (FrameX.qs.param("locate")) FrameX.shops.useLocation();
    },
    "shop-detail": () => call("shopDetailPage"),
    "home-decor": () => call("decorPage"),
    "wall-art-studio": () => call("decorStudio"),
    product: () => call("productPage"),
    gallery: () => call("galleryPage"),
    templates: () => call("templatesPage"),
    template: () => call("templateDetailPage"),
    studio: () => call("studioPage"),
    "shop-dashboard": () => call("shopDashboard"),
    login: () => call("authPages"),
    signup: () => call("authPages"),
    "forgot-password": () => call("authPages"),
    "reset-password": () => call("authPages"),
    account: () => call("accountPage"),
    checkout: () => call("checkoutPage"),
    orders: () => call("ordersPage"),
    order: () => call("orderPage"),
    partner: () => call("partnerPage"),
    admin: () => call("adminPage"),
    "customer-gallery": () => call("customerGalleryPage"),
    contact: () => call("contactPage"),
    faq: () => call("faq"),
    services: () => Promise.all([call("media"), call("orderInfo")]),
    about: () => undefined,
    art: () => call("artPage"),
    artist: () => call("artistPage"),
    artwork: () => call("artworkPage"),
    paintings: () => call("paintingsPage"),
    painting: () => call("paintingPage"),
    "artist-dashboard": () => call("artistDashboard"),
    search: () => call("searchPage"),
  };

  async function start() {
    FrameX.chrome.render();
    FrameX.overlay.init();
    FrameX.nav.init();
    FrameX.actions.init();
    FrameX.cartDrawer.init();
    // Who is logged in (one request; pages that need it await FrameX.auth.ready).
    if (FrameX.auth) FrameX.auth.init();
    // The cart belongs to the account: it is loaded once we know who is logged in.
    FrameX.cart.init();
    try {
      await (PAGES[document.body.dataset.page] || PAGES.about)();
    } catch (error) {
      console.error("Page failed to start", error);
    }
    FrameX.reveal.observe();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})((window.FrameX = window.FrameX || {}));
