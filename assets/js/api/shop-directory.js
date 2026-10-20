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

   A SLOW backend must not hold the pages up either (a free host sleeps when
   nobody visits and needs most of a minute to wake):
   - the shops' own products are remembered in this browser for ten minutes.
     A page still waits PATIENCE_MS for the fresh list (so a product a shop
     has just removed or changed is not shown as it was); only when the
     backend is slower than that does the remembered list stand in for it;
   - without a remembered list, a page waits PATIENCE_MS for them and then
     shows the catalogue file's products; the shops' products join the next
     page that is opened. A product page for one of them waits as long as it
     takes: there is nothing else it could show;
   - a product's shop that the catalogue file also knows is shown from there
     when the backend takes too long.
   Prices, stock and what can be ordered are decided by the backend when
   something is added to the cart, whatever a page was showing.
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
      rating: s.rating || null, // { average, count } of its published reviews, or null
      featured: Boolean(s.featured), // featured by FrameX (e.g. a paid promotion): first in the lists, with a label
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

  const PATIENCE_MS = 1200;
  const CACHE_KEY = "framex.cache.shopProducts.v1";
  const CACHE_MS = 10 * 60 * 1000;
  const LATE = Symbol("late");
  /** The promise's own result, or LATE when it takes longer than `ms`. */
  const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(LATE), ms))]);

  function remembered() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
      return saved && Array.isArray(saved.items) && Date.now() - saved.at < CACHE_MS ? saved.items : null;
    } catch (error) {
      return null;
    }
  }
  function remember(items) {
    try {
      const text = JSON.stringify({ at: Date.now(), items });
      // A very long list is not worth a browser's storage room: it is simply fetched each time.
      if (text.length < 1500000) window.localStorage.setItem(CACHE_KEY, text);
      else window.localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      /* storage full or blocked: nothing is remembered */
    }
  }

  /** What is on sale changed (a shop saved or removed a product): the remembered list is out of date. */
  function forget() {
    try {
      window.localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      /* nothing was remembered */
    }
  }

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
    let shopProductsPromise = null; // what a page waits for: at most PATIENCE_MS
    let freshShopProducts = null; // the backend's own answer, however long it takes
    let answered = false;
    function shopProducts() {
      if (!http.enabled() || !base.setShopProducts) return Promise.resolve();
      if (shopProductsPromise) return shopProductsPromise;
      const saved = remembered();
      if (saved) base.setShopProducts(withAssets(saved));
      answered = false;
      freshShopProducts = http
        .get("/catalog/shop-products")
        .then((r) => {
          base.setShopProducts(withAssets(r.items));
          remember(r.items);
        })
        .catch(() => {
          /* backend not reachable: the catalogue file's products (and any remembered ones) are still shown */
        })
        .then(() => {
          answered = true;
        });
      // (with a remembered list, it is already in place if the fresh one is late)
      shopProductsPromise = within(freshShopProducts, PATIENCE_MS);
      return shopProductsPromise;
    }
    /** A reading method of the provider that waits (a little) for the shop products first. */
    const afterShopProducts = (name) => async (...args) => {
      await shopProducts();
      return base[name](...args);
    };
    /** One product. One that isn't known yet may be a shop's own product still on its way: that is worth the wait. */
    async function getProduct(...args) {
      await shopProducts();
      const found = await base.getProduct(...args);
      if (found || answered || !freshShopProducts) return found;
      await freshShopProducts;
      return base.getProduct(...args);
    }
    const counts = async () => {
      await shopProducts();
      return base.countByShop ? base.countByShop() : {};
    };

    return Object.assign({}, base, {
      getProducts: afterShopProducts("getProducts"),
      getProduct,
      getCategories: afterShopProducts("getCategories"),
      getProductFacets: afterShopProducts("getProductFacets"),

      /** params: q, sort ("nearest" = within radiusKm of lat/lng; any other with lat/lng = nearest first, any distance), lat, lng, radiusKm, page, limit */
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
          // optional: a catalogue shop that isn't on FrameX is answered { shop: null } instead of a 404 error
          const asked = http.get("/shops/" + encodeURIComponent(id), { optional: 1 });
          // A shop the catalogue file knows too can be shown from there when the backend is slow to answer.
          const local = await Promise.resolve(base.getShop(id)).catch(() => null);
          const r = local ? await within(asked, PATIENCE_MS) : await asked;
          if (r === LATE) {
            asked.catch(() => {});
            return local;
          }
          if (!r.shop) return local || base.getShop(id); // not on FrameX: the catalogue entry, if there is one
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
          forget();
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
        forget();
        return true;
      },

      /** The backend keeps product addresses unique itself; nothing to ask for here. */
      getProductSlugs: async () => [],
    });
  }

  FrameX.shopDirectory = { wrap };
})((window.FrameX = window.FrameX || {}));
