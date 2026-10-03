/* ==========================================================================
   Seed data provider
   Implements the same methods and response shapes as http-provider.js, but
   reads shops, products and categories from js/edit.js (and the remaining
   content from assets/data/*.seed.js) and applies filtering/sorting client-side.
   This is NOT a backend: when the real API exists, set config.dataMode = "api"
   and this file is no longer used.
   ========================================================================== */
(function (FrameX) {
  const { config, pricing, location: loc } = FrameX;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const seed = () => FrameX.seed;
  const matches = (text, query) => String(text || "").toLowerCase().includes(query);

  const activeShops = () => seed().shops.filter((shop) => shop.isActive !== false);
  const shopById = (id) => activeShops().find((shop) => shop.id === id);

  /** Visible products that belong to an active shop. */
  function visibleProducts() {
    const shopIds = new Set(activeShops().map((shop) => shop.id));
    return seed().products.filter((p) => p.isVisible !== false && shopIds.has(p.shopId));
  }

  function withShopName(product) {
    const shop = shopById(product.shopId);
    return Object.assign(clone(product), { shopName: shop ? shop.name : "" });
  }

  const paginate = (items, page, limit) => {
    const size = Math.max(1, Number(limit) || items.length || 1);
    const current = Math.max(1, Number(page) || 1);
    return { items: items.slice((current - 1) * size, current * size), total: items.length, page: current, limit: size };
  };

  const PRODUCT_SORTS = {
    price_asc: (a, b) => pricing.finalPrice(a) - pricing.finalPrice(b),
    price_desc: (a, b) => pricing.finalPrice(b) - pricing.finalPrice(a),
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    name: (a, b) => a.name.localeCompare(b.name)
  };

  /** Order set by the HOMEPAGE lists in js/edit.js (items not listed keep their place at the end). */
  const byRank = (field) => (a, b) => nullsLast(a[field], b[field], (x, y) => x - y);

  const nullsLast = (a, b, compare) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : compare(a, b));

  const SHOP_SORTS = {
    nearest: (a, b) => nullsLast(a.distanceKm, b.distanceKm, (x, y) => x - y),
    rating: (a, b) =>
      nullsLast(a.rating && a.rating.average, b.rating && b.rating.average, (x, y) => y - x)
  };

  const provider = {
    getSite: async () => clone(seed().site),
    /** Categories include productCount (visible products) so the UI can hide empty ones. */
    async getCategories() {
      const counts = {};
      visibleProducts().forEach((p) => (p.categoryIds || []).forEach((id) => (counts[id] = (counts[id] || 0) + 1)));
      const active = seed().categories.filter((c) => c.isActive !== false);
      return clone(active.sort((a, b) => a.sortOrder - b.sortOrder)).map((c) =>
        Object.assign(c, { productCount: counts[c.id] || 0 })
      );
    },
    getReviews: async () => clone(seed().reviews),
    getCommunity: async () => clone(seed().community),
    getFaq: async () => clone(seed().faq),
    getGallery: async () => clone(seed().gallery),

    /** params: q, sort (recommended|nearest|rating), lat, lng, page, limit */
    async getShops(params = {}) {
      const user = params.lat != null && params.lng != null ? { latitude: Number(params.lat), longitude: Number(params.lng) } : null;
      const counts = {};
      visibleProducts().forEach((p) => (counts[p.shopId] = (counts[p.shopId] || 0) + 1));

      let items = activeShops().map((shop) => {
        const copy = clone(shop);
        copy.productCount = counts[shop.id] || 0;
        copy.distanceKm = user ? loc.distanceKm(user, shop.location) : null;
        return copy;
      });

      const q = String(params.q || "").trim().toLowerCase();
      if (q) items = items.filter((s) => matches(s.name, q) || matches(s.address && s.address.area, q) || matches(s.address && s.address.city, q));
      if (SHOP_SORTS[params.sort]) items.sort(SHOP_SORTS[params.sort]);
      else items.sort(byRank("featuredRank")); // "recommended": featured shops first
      return paginate(items, params.page, params.limit);
    },

    async getShop(id) {
      const shops = await provider.getShops({ limit: 1000 });
      return shops.items.find((shop) => shop.id === id) || null;
    },

    /** params: shopId, category, q, sort, inStock, isFeatured, isRecommended, page, limit */
    async getProducts(params = {}) {
      let items = visibleProducts();
      if (params.shopId) items = items.filter((p) => p.shopId === params.shopId);
      if (params.category) items = items.filter((p) => (p.categoryIds || []).includes(params.category));
      if (params.isFeatured) items = items.filter((p) => p.isFeatured);
      if (params.isRecommended) items = items.filter((p) => p.isRecommended);
      if (params.inStock) items = items.filter((p) => pricing.availability(p) !== "out_of_stock");

      const q = String(params.q || "").trim().toLowerCase();
      if (q) {
        items = items.filter((p) => matches(p.name, q) || matches(p.material, q) || matches(p.description, q));
      }

      items = [...items];
      if (PRODUCT_SORTS[params.sort]) items.sort(PRODUCT_SORTS[params.sort]);
      else if (params.isFeatured) items.sort(byRank("featuredRank"));
      else if (params.isRecommended) items.sort(byRank("recommendedRank"));

      const page = paginate(items, params.page, params.limit);
      page.items = page.items.map(withShopName);
      return page;
    },

    async getProduct(id) {
      const product = visibleProducts().find((p) => p.id === id);
      return product ? withShopName(product) : null;
    }
  };

  FrameX.seedProvider = provider;
})((window.FrameX = window.FrameX || {}));
