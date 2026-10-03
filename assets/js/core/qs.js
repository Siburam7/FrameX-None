/* Query-string + relative-URL helpers. All links stay relative so the site
   works from a GitHub Pages sub-path (https://user.github.io/repo/). */
(function (FrameX) {
  const param = (name) => new URLSearchParams(window.location.search).get(name);

  const pages = {
    home: "index.html",
    about: "about.html",
    services: "services.html",
    shop: "shop.html",
    templates: "templates.html",
    studio: "studio.html",
    shopDashboard: "shop-dashboard.html",
    gallery: "gallery.html",
    customerGallery: "customer-gallery.html",
    contact: "contact.html",
    faq: "faq.html",
    story: "our-story.html",
    terms: "terms-of-use.html",
    privacy: "privacy-notice.html"
  };

  /** product.html?slug=<slug> for a product object with a slug, else ?id=<id>.
      (A static host can't serve /products/<slug>; the slug keeps URLs readable.) */
  const productUrl = (p) =>
    p && typeof p === "object" ? (p.slug ? `product.html?slug=${encodeURIComponent(p.slug)}` : `product.html?id=${encodeURIComponent(p.id)}`) : `product.html?id=${encodeURIComponent(p)}`;
  const shopUrl = (id) => `shop-detail.html?id=${encodeURIComponent(id)}`;
  const shopListUrl = (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return "shop.html" + (s ? "?" + s : "");
  };

  FrameX.qs = { param, pages, productUrl, shopUrl, shopListUrl };
})((window.FrameX = window.FrameX || {}));
