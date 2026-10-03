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

  /* ---- Products created or edited in the shop dashboard (this device only) ----
     Stored as complete product records (assets/js/services/product-model.js).
     A record with the same id as a js/edit.js product overrides it once
     published (or hides it when unpublished); drafts never reach customers. */
  const SHOP_PRODUCTS = (config.storageKeys && config.storageKeys.shopProducts) || "framex.shopProducts.v1";
  function localRecords() {
    try {
      const list = JSON.parse(localStorage.getItem(SHOP_PRODUCTS) || "[]");
      return Array.isArray(list) ? list.filter((r) => r && r.id) : [];
    } catch (error) {
      return [];
    }
  }
  function writeLocal(list) {
    try {
      localStorage.setItem(SHOP_PRODUCTS, JSON.stringify(list));
    } catch (error) {
      throw Object.assign(new Error("storage"), { friendly: "This browser's storage is full, so the product couldn't be saved. Remove some images or older drafts and try again." });
    }
  }

  /** Full product model when product-model.js is on the page, else the stored shape. */
  const normalize = (p) => (FrameX.productModel ? FrameX.productModel.normalize(p) : clone(p));

  /** Catalogue products with this device's published shop changes applied. */
  function allProducts() {
    const local = localRecords();
    const overrides = new Map(local.map((r) => [r.id, r]));
    const catalogueIds = new Set(seed().products.map((p) => p.id));
    const fromCatalogue = seed().products
      .map((p) => {
        const o = overrides.get(p.id);
        if (!o || o.status === "draft" || o.status === "pending_review") return p;
        return o.status === "published" ? o : null;
      })
      .filter(Boolean);
    return fromCatalogue.concat(local.filter((r) => !catalogueIds.has(r.id) && r.status === "published"));
  }

  /** Visible products that belong to an active shop. */
  function visibleProducts() {
    const shopIds = new Set(activeShops().map((shop) => shop.id));
    return allProducts()
      .filter((p) => p.isVisible !== false && (p.schema !== 2 || p.status === "published") && shopIds.has(p.shopId))
      .map(normalize);
  }

  function withShopName(product) {
    const shop = shopById(product.shopId);
    return Object.assign(clone(product), { shopName: shop ? shop.name : "" });
  }

  const lower = (v) => String(v || "").trim().toLowerCase();
  const titleCase = (v) => String(v || "").trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());

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

    /** params: shopId, category, q, sort, inStock, isFeatured, isRecommended, page, limit,
        material, frameType, finish, size, priceMin, priceMax, customizable
        (the same names the API accepts, so filtering can move to the server). */
    async getProducts(params = {}) {
      let items = visibleProducts();
      if (params.shopId) items = items.filter((p) => p.shopId === params.shopId);
      if (params.category) items = items.filter((p) => (p.categoryIds || []).includes(params.category));
      if (params.isFeatured) items = items.filter((p) => p.isFeatured);
      if (params.isRecommended) items = items.filter((p) => p.isRecommended);
      if (params.inStock) items = items.filter((p) => pricing.availability(p) !== "out_of_stock");
      if (params.material) items = items.filter((p) => lower(p.material) === lower(params.material));
      if (params.frameType) items = items.filter((p) => p.frame && p.frame.type === params.frameType);
      if (params.finish) items = items.filter((p) => p.frame && lower(p.frame.finish) === lower(params.finish));
      if (params.size) items = items.filter((p) => pricing.sizeOptions(p).some((o) => o.dimensions === params.size || o.label === params.size));
      if (params.priceMin) items = items.filter((p) => pricing.startingPrice(p) >= Number(params.priceMin));
      if (params.priceMax) items = items.filter((p) => pricing.startingPrice(p) <= Number(params.priceMax));
      if (params.customizable) items = items.filter((p) => p.customizable);

      const q = String(params.q || "").trim().toLowerCase();
      if (q) {
        items = items.filter((p) => matches(p.name, q) || matches(p.material, q) || matches(p.description, q) || (p.tags || []).some((t) => matches(t, q)));
      }

      items = [...items];
      if (PRODUCT_SORTS[params.sort]) items.sort(PRODUCT_SORTS[params.sort]);
      else if (params.isFeatured) items.sort(byRank("featuredRank"));
      else if (params.isRecommended) items.sort(byRank("recommendedRank"));

      const page = paginate(items, params.page, params.limit);
      page.items = page.items.map(withShopName);
      return page;
    },

    /* ---- Personalised templates (data: js/templates.js) -------------------- */

    /** params: q, category, occasion, photos ("1".."5", "6+"), trending, popular, new,
        sort (trending | popular | newest | price_asc | price_desc | photos), page, limit */
    async getTemplates(params = {}) {
      let items = (seed().templates || []).filter((t) => t.available !== false);
      if (params.category) items = items.filter((t) => t.category === params.category);
      if (params.occasion) items = items.filter((t) => t.occasion === params.occasion);
      if (params.photos) {
        const n = parseInt(params.photos, 10);
        items = items.filter((t) => (String(params.photos).endsWith("+") ? t.photosRequired >= n : t.photosRequired === n));
      }
      if (params.trending) items = items.filter((t) => t.isTrending);
      if (params.popular) items = items.filter((t) => t.isPopular);
      if (params.new) items = items.filter((t) => t.isNew);

      const q = String(params.q || "").trim().toLowerCase();
      if (q) {
        const names = new Map((seed().templateCategories || []).map((c) => [c.id, c.name]));
        const occasions = new Map((seed().templateOccasions || []).map((o) => [o.id, o.name]));
        // Every query word must match the start of a word in the title, category,
        // occasion, tags or description ("wed" finds "wedding"). Words of 3 letters
        // or fewer must match a whole word, so "mom" doesn't find "moments".
        const SYNONYMS = { mom: ["mother", "mum", "maa", "mom"], mum: ["mother", "mum", "maa", "mom"], dad: ["father", "dad", "papa"], papa: ["father", "dad", "papa"], bff: ["friends", "friend"], kid: ["kids"], dog: ["pet", "pets", "dog"], cat: ["pet", "pets", "cat"], diwali: ["diwali", "deepavali"] };
        const words = q.split(/\s+/).map((w) => w.replace(/'s$/, "")).filter(Boolean);
        items = items.filter((t) => {
          const tokens = [t.title, names.get(t.category), occasions.get(t.occasion), t.description, ...(t.tags || [])].join(" ").toLowerCase().split(/[^a-z0-9]+/);
          return words.every((word) =>
            (SYNONYMS[word] || [word]).some((w) => tokens.some((token) => (w.length <= 3 ? token === w : token.startsWith(w))))
          );
        });
      }

      const score = (t) => (t.isTrending ? 2 : 0) + (t.isPopular ? 1 : 0);
      const SORTS = {
        trending: (a, b) => Number(b.isTrending) - Number(a.isTrending) || score(b) - score(a),
        popular: (a, b) => Number(b.isPopular) - Number(a.isPopular) || score(b) - score(a),
        newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
        price_asc: (a, b) => a.price - b.price,
        price_desc: (a, b) => b.price - a.price,
        photos: (a, b) => a.photosRequired - b.photosRequired
      };
      items = [...items].sort(SORTS[params.sort] || SORTS.trending);
      return paginate(clone(items), params.page, params.limit);
    },

    /** One template by slug or id (null when missing or unavailable). */
    async getTemplate(slugOrId) {
      const t = (seed().templates || []).find((x) => (x.slug === slugOrId || x.id === slugOrId) && x.available !== false);
      return t ? clone(t) : null;
    },

    /** Categories with templateCount (available templates only). */
    async getTemplateCategories() {
      const counts = {};
      (seed().templates || []).filter((t) => t.available !== false).forEach((t) => (counts[t.category] = (counts[t.category] || 0) + 1));
      return clone(seed().templateCategories || []).map((c) => Object.assign(c, { slug: c.id, templateCount: counts[c.id] || 0 }));
    },

    /** Occasions + print sizes for the template filters and the customizer. */
    /** FrameX Studio catalogue (js/studio.js). */
    getStudioCatalog: async () => clone(seed().studio),

    getTemplateOptions: async () => clone({ occasions: seed().templateOccasions || [], sizes: seed().templateSizes || [] }),

    /** One visible product by id or slug. */
    async getProduct(idOrSlug) {
      const list = visibleProducts();
      const product = list.find((p) => p.id === idOrSlug) || list.find((p) => p.slug === idOrSlug);
      return product ? withShopName(product) : null;
    },

    /** Values the Shop page filters can offer (only what products actually have). */
    async getProductFacets() {
      const items = visibleProducts();
      const uniq = (values) => Array.from(new Map(values.filter(Boolean).map((v) => [lower(v), titleCase(v)])).values()).sort();
      const prices = items.map((p) => pricing.startingPrice(p));
      const types = new Map();
      items.forEach((p) => p.frame && p.frame.type && types.set(p.frame.type, FrameX.productModel ? FrameX.productModel.frameTypeName(p.frame.type) : p.frame.type));
      return {
        materials: uniq(items.map((p) => p.material)),
        finishes: uniq(items.map((p) => p.frame && p.frame.finish)),
        frameTypes: Array.from(types, ([id, name]) => ({ id, name })),
        sizes: Array.from(new Set(items.flatMap((p) => pricing.sizeOptions(p).map((o) => o.dimensions)).filter(Boolean))),
        price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
        customizable: items.filter((p) => p.customizable).length
      };
    },

    /* ---- Shop workspace (dashboard). With a backend these become
       authenticated /shop/products endpoints; here they use this device. ---- */

    /** Every product of one shop, any status: catalogue items plus dashboard records. */
    async getShopProducts(shopId) {
      const local = localRecords();
      const overrides = new Map(local.map((r) => [r.id, r]));
      const catalogueIds = new Set(seed().products.map((p) => p.id));
      const fromCatalogue = seed().products
        .filter((p) => p.shopId === shopId)
        .map((p) => Object.assign(normalize(overrides.get(p.id) || p), { source: "catalogue", hasLocalChanges: overrides.has(p.id) }));
      const own = local.filter((r) => r.shopId === shopId && !catalogueIds.has(r.id)).map((r) => Object.assign(normalize(r), { source: "local", hasLocalChanges: true }));
      return clone(own.concat(fromCatalogue).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
    },

    /** One product for editing or previewing, whatever its status. */
    async getShopProduct(id) {
      const record = localRecords().find((r) => r.id === id);
      const catalogue = seed().products.find((p) => p.id === id);
      if (!record && !catalogue) return null;
      return withShopName(Object.assign(normalize(record || catalogue), { source: catalogue ? "catalogue" : "local", hasLocalChanges: Boolean(record) }));
    },

    async saveShopProduct(product) {
      const list = localRecords();
      const record = clone(product);
      delete record.source;
      delete record.hasLocalChanges;
      delete record.shopName;
      const i = list.findIndex((r) => r.id === record.id);
      if (i >= 0) list[i] = record;
      else list.push(record);
      writeLocal(list);
      return clone(record);
    },

    async deleteShopProduct(id) {
      writeLocal(localRecords().filter((r) => r.id !== id));
      return true;
    },

    /** [{ id, slug }] of every product (for unique product URLs). */
    async getProductSlugs() {
      return seed().products.concat(localRecords()).filter((p) => p.slug).map((p) => ({ id: p.id, slug: p.slug }));
    }
  };

  FrameX.seedProvider = provider;
})((window.FrameX = window.FrameX || {}));
