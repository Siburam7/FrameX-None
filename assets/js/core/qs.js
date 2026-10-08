/* Query-string + relative-URL helpers. All links stay relative so the site
   works from a GitHub Pages sub-path (https://user.github.io/repo/). */
(function (FrameX) {
  const param = (name) => new URLSearchParams(window.location.search).get(name);

  const pages = {
    home: "index.html",
    about: "about.html",
    services: "services.html",
    shop: "shop.html",
    decor: "home-decor.html",
    wallArtStudio: "wall-art-studio.html",
    templates: "templates.html",
    studio: "studio.html",
    shopDashboard: "shop-dashboard.html",
    login: "login.html",
    signup: "signup.html",
    account: "account.html",
    checkout: "checkout.html",
    orders: "orders.html",
    order: "order.html",
    partner: "partner.html",
    admin: "admin.html",
    gallery: "gallery.html",
    customerGallery: "customer-gallery.html",
    contact: "contact.html",
    faq: "faq.html",
    story: "our-story.html",
    terms: "terms-of-use.html",
    privacy: "privacy-notice.html",
    art: "art.html",
    artist: "artist.html",
    artwork: "artwork.html",
    paintings: "paintings.html",
    painting: "painting.html",
    artistDashboard: "artist-dashboard.html",
    search: "search.html",
  };

  /** product.html?slug=<slug> for a product object with a slug, else ?id=<id>.
      (A static host can't serve /products/<slug>; the slug keeps URLs readable.) */
  const productUrl = (p) =>
    p && typeof p === "object"
      ? p.slug
        ? `product.html?slug=${encodeURIComponent(p.slug)}`
        : `product.html?id=${encodeURIComponent(p.id)}`
      : `product.html?id=${encodeURIComponent(p)}`;
  const shopUrl = (id) => `shop-detail.html?id=${encodeURIComponent(id)}`;
  const shopListUrl = (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return "shop.html" + (s ? "?" + s : "");
  };

  const artistUrl = (a) => `artist.html?artist=${encodeURIComponent(typeof a === "string" ? a : a.username || a.artistCode)}`;
  const artworkUrl = (w) => `artwork.html?id=${encodeURIComponent(typeof w === "string" ? w : w.id)}`;
  const paintingUrl = (n) => `painting.html?id=${encodeURIComponent(n)}`;

  FrameX.qs = { param, pages, productUrl, shopUrl, shopListUrl, artistUrl, artworkUrl, paintingUrl };
})((window.FrameX = window.FrameX || {}));
