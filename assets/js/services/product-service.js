/* ==========================================================================
   Product + shop services: the only way UI code reads or changes products.

     productService   customer reads (get, list, facets) and shop writes
                      (save, publish, unpublish, duplicate, remove)
     shopService      shops (the logged-in shop comes from FrameX.auth)

   They sit on FrameX.api and the product model (rules, validation). A shop's
   own products are saved in its account on the FrameX backend
   (api/shop-directory.js): the backend rebuilds every record with the
   platform's rules and is the one that decides whether it can be published,
   so what this file checks first is only there to answer quickly.
   ========================================================================== */
(function (FrameX) {
  const model = () => FrameX.productModel;
  const api = () => FrameX.api;

  const productService = {
    /** A published product by id or slug, as the full product model. */
    async get(idOrSlug) {
      const p = await api().getProduct(idOrSlug);
      return p
        ? Object.assign(model().normalize(p), { shopName: p.shopName })
        : null;
    },
    list: (params) => api().getProducts(params),
    facets: () => api().getProductFacets(),

    /* ---- Shop side ---- */
    /** Every product of the shop: its own (source "dashboard") and its catalogue-file products (source "catalogue", read-only). */
    forShop: (shopId) => api().getShopProducts(shopId),
    async getForEditing(id) {
      const p = await api().getShopProduct(id);
      return p
        ? Object.assign(model().normalize(p), { source: p.source, onSale: p.onSale })
        : null;
    },

    /**
     * Save as-is (any status). Shop input is sanitised: no verification claims,
     * and the product type's rules (required customer photos) are applied.
     * Throws an error with `.friendly` when the backend refuses it.
     */
    async save(product, { status } = {}) {
      const m = model();
      const p = m.sanitizeShopInput(product);
      if (status) p.status = status;
      p.slug = m.slugify(p.slug || p.name); // the backend makes it unique
      const saved = await api().saveShopProduct(m.normalize(p));
      return Object.assign(m.normalize(saved), { source: saved.source, onSale: saved.onSale });
    },

    /**
     * Publish only a complete product. With moderation on, the backend keeps a
     * product FrameX hasn't approved yet as "pending_review".
     * -> { ok: true, status, product } | { ok: false, issues }
     */
    async publish(product) {
      const check = model().validateForPublish(product);
      if (!check.ready) return { ok: false, issues: check.issues };
      try {
        const saved = await productService.save(product, { status: "published" });
        return { ok: true, status: saved.status, product: saved };
      } catch (error) {
        if (error.issues) return { ok: false, issues: error.issues };
        throw error;
      }
    },

    unpublish: (product) =>
      productService.save(product, { status: "unpublished" }),

    async duplicate(product) {
      const copy = model().duplicate(product, []);
      return productService.save(copy);
    },

    /** Remove one of the shop's own products. Orders and carts that already hold it keep their record of it. */
    async remove(product) {
      await api().deleteShopProduct(product.id);
      return true;
    },

    /* ---- Products an older version kept in this browser only ---- */

    /** [{ record, isCatalogueEdit }] for this shop. */
    localOnly: (shopId) => (FrameX.seedProvider && FrameX.seedProvider.localRecords ? FrameX.seedProvider.localRecords(shopId) : []),

    /**
     * Move one browser-only product into the shop's account: its pictures are
     * uploaded, then the record is saved (as a draft unless it is complete).
     * -> the saved product
     */
    async adoptLocal(record) {
      const m = model();
      const p = m.sanitizeShopInput(m.normalize(record));
      const media = FrameX.mediaService;
      const move = async (holder, key) => {
        if (holder && media.isLegacy(holder[key])) holder[key] = await media.adopt(holder[key]);
      };
      for (const v of p.views || []) {
        const thumbWasLegacy = media.isLegacy(v.thumb);
        await move(v, "url");
        if (thumbWasLegacy) v.thumb = v.url ? `${v.url}:thumb` : "";
      }
      p.views = (p.views || []).filter((v) => v && v.url);
      if (p.product360 && Array.isArray(p.product360.frames)) {
        for (let i = 0; i < p.product360.frames.length; i++) await move(p.product360.frames, i);
        p.product360.frames = p.product360.frames.filter(Boolean);
        if (!p.product360.frames.length) p.product360 = null;
      }
      for (const item of p.media || []) {
        // Video files were never uploaded anywhere: only a link can be kept.
        if (media.isLegacy(item.url)) item.url = "";
        await move(item, "thumbnail");
      }
      p.media = (p.media || []).filter((item) => item && item.url);
      for (const mat of (p.print && p.print.materials) || []) await move(mat, "image");
      for (const part of p.components || []) await move(part, "image");
      p.id = m.newId();
      const wanted = record.status === "published" && m.validateForPublish(p).ready ? "published" : "draft";
      const saved = await productService.save(p, { status: wanted });
      FrameX.seedProvider.forgetLocal(record.id);
      return saved;
    },
  };

  /** Every uploaded-file reference inside a product. */
  function mediaRefs(p) {
    const refs = [];
    (p.views || []).forEach((v) => refs.push(v.url, v.thumb));
    ((p.product360 && p.product360.frames) || []).forEach((u) => refs.push(u));
    (p.media || []).forEach((m) => refs.push(m.url, m.thumbnail));
    ((p.print && p.print.materials) || []).forEach((m) => refs.push(m.image));
    (p.components || []).forEach((c) => refs.push(c.image));
    return refs.filter((r) => FrameX.mediaService.isMedia(r));
  }

  const shopService = {
    list: (params) => api().getShops(Object.assign({ limit: 1000 }, params)),
    get: (id) => api().getShop(id),
  };

  FrameX.productService = productService;
  FrameX.shopService = shopService;
  FrameX.productMedia = { refs: mediaRefs };
})((window.FrameX = window.FrameX || {}));
