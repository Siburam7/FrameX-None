/* ==========================================================================
   Shop directory: what the website gets from the FrameX backend on top of
   the catalogue file (js/edit.js).

   Shops       the approved + active shops in the backend's database. Every
               distance is calculated by the backend from each shop's stored
               coordinates (GET /api/shops/nearby).
   Products    the catalogue file's products, PLUS the products shops create
               in their dashboard (GET /api/catalog/shop-products: only what
               is on sale, from listed shops). They are handed to the seed
               provider, so listing, search, filters and product pages treat
               them like any other product.
   Shop tools  a shop's own products are read and saved through its account
               on the backend (/api/shops/<Shop ID>/products). Nothing a shop
               creates is kept in the browser.

   Without a backend (or when it can't be reached) the site falls back to the
   catalogue file alone, exactly as before. A backend shop is linked to its
   catalogue-file products by `catalogRef` (set by a FrameX admin).
   ========================================================================== */
(function (FrameX) {
  const http = FrameX.http;

  // A shop without a cover picture of its own gets one of these general pictures of frames
  // (stock photos, see assets/img/shops/CREDITS.md). The same shop always gets the same one.
  const STOCK_COVERS = [4, 5, 1, 2, 3].map((n) => `assets/img/shops/cover-stock-${n}.webp`);
  function stockCover(code) {
    let sum = 0;
    for (const ch of String(code || "")) sum += ch.charCodeAt(0);
    return STOCK_COVERS[sum % STOCK_COVERS.length];
  }

  /** Backend shop -> the shape the existing shop cards and pages already use. */
  function toShop(s, catalogue, counts) {
    const c = (s.catalogRef && catalogue.get(s.catalogRef)) || {};
    const a = s.address || {};
    return {
      id: s.shopCode,
      shopCode: s.shopCode,
      catalogRef: s.catalogRef || null,
      name: s.name,
      description: s.description || null,
      coverImage: c.coverImage || stockCover(s.shopCode),
      logo: c.logo || null,
      address: { line1: a.line1, area: a.area, city: a.city, state: a.state, postalCode: a.postalCode },
      location: s.location,
      phone: s.phone || null,
      openingHours: s.openingHours || null,
      fulfilment: s.fulfilment || [],
      giftWrap: s.giftWrap !== false,
      rating: null, // reviews arrive in a later step
      isActive: true,
      isSample: Boolean(s.isDemo),
      distanceKm: s.distanceKm, // measured by the backend; null when no location was given
      // Its products carry the catalogue link when there is one, otherwise its Shop ID.
      productCount: counts[s.catalogRef || s.shopCode] || 0,
      source: "backend",
    };
  }

  /** "/media/<id>" paths anywhere in a record -> addresses this page can load (the backend may be on another address). */
  function withAssets(value) {
    if (typeof value === "string") return http.asset(value);
    if (Array.isArray(value)) return value.map(withAssets);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => (out[k] = withAssets(value[k])));
      return out;
    }
    return value;
  }

  /** The logged-in shop's own Shop ID (the backend refuses any other). */
  function ownShopCode() {
    const user = FrameX.auth && FrameX.auth.state.user;
    return user && user.shop ? user.shop.shopCode : "";
  }
  const shopPath = (rest = "") => `/shops/${encodeURIComponent(ownShopCode())}/products${rest}`;
  const isOwnId = (id) => /^lp-[a-z0-9]{6,40}$/.test(String(id || ""));

  function wrap(base) {
    let cataloguePromise = null;
    const catalogue = () => {
      cataloguePromise =
        cataloguePromise ||
        base
          .getShops({ limit: 1000 })
          .then((r) => new Map(r.items.map((s) => [s.id, s])))
          .catch(() => new Map());
      return cataloguePromise;
    };

    /* ---- Shop products from the backend, fetched once per page ---- */
    let shopProductsPromise = null;
    function shopProducts() {
      if (!http.enabled() || !base.setShopProducts) return Promise.resolve();
      shopProductsPromise =
        shopProductsPromise ||
        http
          .get("/catalog/shop-products")
          .then((r) => base.setShopProducts(withAssets(r.items)))
          .catch(() => {
            /* backend not reachable: the catalogue file's products are still shown */
          });
      return shopProductsPromise;
    }
    /** A reading method of the provider that waits for the shop products first. */
    const afterShopProducts = (name) => async (...args) => {
      await shopProducts();
      return base[name](...args);
    };
    const counts = async () => {
      await shopProducts();
      return base.countByShop ? base.countByShop() : {};
    };

    return Object.assign({}, base, {
      getProducts: afterShopProducts("getProducts"),
      getProduct: afterShopProducts("getProduct"),
      getCategories: afterShopProducts("getCategories"),
      getProductFacets: afterShopProducts("getProductFacets"),

      /** params: q, sort ("nearest" = within radiusKm of lat/lng), lat, lng, radiusKm, page, limit */
      async getShops(params = {}) {
        if (!http.enabled()) return base.getShops(params);
        try {
          const [cat, n] = await Promise.all([catalogue(), counts()]);
          const hasPoint = params.lat != null && params.lng != null;
          const limit = Math.min(Number(params.limit) || 20, 50);
          if (params.sort === "nearest" && hasPoint) {
            const r = await http.get("/shops/nearby", { lat: params.lat, lng: params.lng, radius: params.radiusKm, limit });
            return { items: r.items.map((s) => toShop(s, cat, n)), total: r.total, page: 1, limit, radiusKm: r.radiusKm, source: "backend" };
          }
          const r = await http.get("/shops", { q: params.q, lat: hasPoint ? params.lat : null, lng: hasPoint ? params.lng : null, page: params.page, limit });
          return { items: r.items.map((s) => toShop(s, cat, n)), total: r.total, page: r.page, limit: r.limit, source: "backend" };
        } catch (error) {
          if (!error.network) throw error;
          console.warn("FrameX backend not reachable; showing shops from the catalogue file.");
          return Object.assign(await base.getShops(params), { source: "catalogue" });
        }
      },

      /** id: a Shop ID (FRX-SHOP-1001) or a catalogue shop id (shop-001). */
      async getShop(id) {
        if (!http.enabled()) return base.getShop(id);
        try {
          const r = await http.get("/shops/" + encodeURIComponent(id));
          return toShop(r.shop, await catalogue(), await counts());
        } catch (error) {
          // Not (yet) in the backend, or backend unreachable: use the catalogue entry if there is one.
          if (error.network || error.status === 404) return base.getShop(id);
          throw error;
        }
      },

      /** "Dhenkanal" / "759001" -> places with coordinates, or null when place search isn't available. */
      async searchPlaces(q) {
        if (!http.enabled()) return null;
        try {
          const r = await http.get("/geo/search", { q });
          return r.available ? r.results : null;
        } catch (error) {
          return null;
        }
      },

      /* ---- The logged-in shop's own products (shop dashboard) ----
         The backend decides everything that matters: the product always belongs
         to the session's shop, the record is rebuilt with the platform's rules
         (product type, required customer photos), and publishing needs a
         complete product. Pictures stay as "media:<id>" references here; the
         media service turns them into addresses when they are shown. */

      /** Every product of this shop: the ones it created (editable) and its catalogue-file products (managed by FrameX). */
      async getShopProducts(shopId) {
        const [own, fromFile] = await Promise.all([http.get(shopPath()).then((r) => r.items), base.getCatalogueProducts ? base.getCatalogueProducts(shopId) : []]);
        return own.map((p) => Object.assign(p, { source: "dashboard" })).concat(fromFile);
      },

      /** One product for editing or previewing, whatever its status. */
      async getShopProduct(id) {
        if (!isOwnId(id)) {
          // A catalogue-file product: shown to its shop as it is on sale.
          const p = await base.getProduct(id);
          return p ? Object.assign(p, { source: "catalogue" }) : null;
        }
        try {
          return Object.assign((await http.get(shopPath("/" + encodeURIComponent(id)))).product, { source: "dashboard" });
        } catch (error) {
          if (error.status === 404) return null;
          throw error;
        }
      },

      /** Create or change one of the shop's products. `product.status` is what the shop wants it to be. */
      async saveShopProduct(product) {
        const record = JSON.parse(JSON.stringify(product));
        ["source", "hasLocalChanges", "shopName", "onSale"].forEach((k) => delete record[k]);
        try {
          const saved = (await http.put(shopPath("/" + encodeURIComponent(product.id)), record)).product;
          shopProductsPromise = null; // what is on sale may have changed
          return Object.assign(saved, { source: "dashboard" });
        } catch (error) {
          // The backend's own words (what is missing, which picture, which price) are what the shop needs to read.
          const issues = error.details && error.details.issues;
          const first = error.fields ? Object.values(error.fields)[0] : "";
          throw Object.assign(error, { friendly: (issues && issues.length ? `${error.message} ${issues.map((i) => i.message).join(". ")}.` : first || error.message) || "The product couldn't be saved. Please try again.", issues: issues || null });
        }
      },

      async deleteShopProduct(id) {
        await http.delete(shopPath("/" + encodeURIComponent(id)));
        shopProductsPromise = null;
        return true;
      },

      /** The backend keeps product addresses unique itself; nothing to ask for here. */
      getProductSlugs: async () => [],
    });
  }

  FrameX.shopDirectory = { wrap };
})((window.FrameX = window.FrameX || {}));
