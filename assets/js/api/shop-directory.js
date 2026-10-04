/* ==========================================================================
   Shop directory: where the website's shop lists come from.

   With the FrameX backend connected, shops are the approved + active shops
   in its database, and every distance is calculated by the backend from each
   shop's stored coordinates (GET /api/shops/nearby). Without a backend (or
   when it can't be reached) the site falls back to the catalogue file
   (js/edit.js), exactly as before.

   Products still live in the catalogue file until Step 2. A backend shop is
   linked to its catalogue products by `catalogRef` (set by a FrameX admin).
   ========================================================================== */
(function (FrameX) {
  const http = FrameX.http;

  /** Backend shop -> the shape the existing shop cards and pages already use. */
  function toShop(s, catalogue) {
    const c = (s.catalogRef && catalogue.get(s.catalogRef)) || {};
    const a = s.address || {};
    return {
      id: s.shopCode,
      shopCode: s.shopCode,
      catalogRef: s.catalogRef || null,
      name: s.name,
      description: s.description || null,
      coverImage: c.coverImage || null,
      logo: c.logo || null,
      address: { line1: a.line1, area: a.area, city: a.city, state: a.state, postalCode: a.postalCode },
      location: s.location,
      phone: s.phone || null,
      openingHours: s.openingHours || null,
      fulfilment: s.fulfilment || [],
      rating: null, // reviews arrive in a later step
      isActive: true,
      isSample: Boolean(s.isDemo),
      distanceKm: s.distanceKm, // measured by the backend; null when no location was given
      productCount: c.productCount || 0,
      source: "backend",
    };
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

    return Object.assign({}, base, {
      /** params: q, sort ("nearest" = within radiusKm of lat/lng), lat, lng, radiusKm, page, limit */
      async getShops(params = {}) {
        if (!http.enabled()) return base.getShops(params);
        try {
          const cat = await catalogue();
          const hasPoint = params.lat != null && params.lng != null;
          const limit = Math.min(Number(params.limit) || 20, 50);
          if (params.sort === "nearest" && hasPoint) {
            const r = await http.get("/shops/nearby", { lat: params.lat, lng: params.lng, radius: params.radiusKm, limit });
            return { items: r.items.map((s) => toShop(s, cat)), total: r.total, page: 1, limit, radiusKm: r.radiusKm, source: "backend" };
          }
          const r = await http.get("/shops", { q: params.q, lat: hasPoint ? params.lat : null, lng: hasPoint ? params.lng : null, page: params.page, limit });
          return { items: r.items.map((s) => toShop(s, cat)), total: r.total, page: r.page, limit: r.limit, source: "backend" };
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
          return toShop(r.shop, await catalogue());
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
    });
  }

  FrameX.shopDirectory = { wrap };
})((window.FrameX = window.FrameX || {}));
