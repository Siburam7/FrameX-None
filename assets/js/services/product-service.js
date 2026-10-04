/* ==========================================================================
   Product + shop services: the only way UI code reads or changes products.

     productService   customer reads (get, list, facets) and shop writes
                      (save, publish, unpublish, duplicate, remove)
     shopService      shops, and which shop this device manages

   They sit on FrameX.api (seed provider today, HTTP provider later), the
   product model (rules, validation) and the media service (uploaded files),
   so no page talks to storage directly.
   ========================================================================== */
(function (FrameX) {
  const model = () => FrameX.productModel;
  const api = () => FrameX.api;
  const SESSION =
    (FrameX.config.storageKeys && FrameX.config.storageKeys.shopSession) ||
    "framex.shopSession.v1";

  async function listingImageFor(p, previous) {
    const main = model().mainView(p);
    if (!main) return { listingImage: "", listingImageFor: "" };
    if (!FrameX.mediaService || !FrameX.mediaService.isMedia(main.url))
      return { listingImage: "", listingImageFor: main.url };
    if (
      previous &&
      previous.listingImageFor === main.url &&
      previous.listingImage
    )
      return { listingImage: previous.listingImage, listingImageFor: main.url };
    return {
      listingImage: await FrameX.mediaService.listingThumb(main.url),
      listingImageFor: main.url,
    };
  }

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
    forShop: (shopId) => api().getShopProducts(shopId),
    async getForEditing(id) {
      const p = await api().getShopProduct(id);
      return p ? model().normalize(p) : null;
    },

    /** Save as-is (any status). Shop input is sanitised: no verification claims. */
    async save(product, { status } = {}) {
      const m = model();
      const p = m.sanitizeShopInput(product);
      const now = new Date().toISOString();
      if (status) p.status = status;
      const taken = (await api().getProductSlugs())
        .filter((x) => x.id !== p.id)
        .map((x) => x.slug);
      const wanted = m.slugify(p.slug || p.name);
      p.slug =
        wanted && !taken.includes(wanted)
          ? wanted
          : m.uniqueSlug(p.name || "product", taken);
      p.updatedAt = now;
      if (p.status === "published" && !p.publishedAt) p.publishedAt = now;
      Object.assign(p, await listingImageFor(p, product));
      // The stored record carries the listing fields too, so pages without the
      // product model (home page cards, cart) can still show it.
      return api().saveShopProduct(m.normalize(p));
    },

    /** Publish (or submit for review when moderation is on) only a complete product. */
    async publish(product) {
      const check = model().validateForPublish(product);
      if (!check.ready) return { ok: false, issues: check.issues };
      const status = FrameX.config.productModeration
        ? "pending_review"
        : "published";
      return {
        ok: true,
        status,
        product: await productService.save(product, { status }),
      };
    },

    unpublish: (product) =>
      productService.save(product, { status: "unpublished" }),

    async duplicate(product) {
      const taken = (await api().getProductSlugs()).map((x) => x.slug);
      const copy = model().duplicate(product, taken);
      copy.listingImage = product.listingImage || "";
      copy.listingImageFor = product.listingImageFor || "";
      return productService.save(copy);
    },

    /** Delete a dashboard product, or drop this device's changes to a catalogue product. */
    async remove(product) {
      await api().deleteShopProduct(product.id);
      if (FrameX.mediaService && FrameX.config.dataMode !== "api") {
        const shops = await api().getShops({ limit: 1000 });
        const all = (
          await Promise.all(shops.items.map((s) => api().getShopProducts(s.id)))
        ).flat();
        const refs = all.flatMap((p) => mediaRefs(p));
        FrameX.mediaService.collectGarbage(refs);
      }
      return true;
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
    /** Shop sign-in arrives with the backend; until then this device picks its shop. */
    currentId() {
      try {
        return localStorage.getItem(SESSION) || null;
      } catch (e) {
        return null;
      }
    },
    setCurrent(id) {
      try {
        if (id) localStorage.setItem(SESSION, id);
        else localStorage.removeItem(SESSION);
      } catch (e) {
        /* storage blocked: the choice lasts for this page only */
      }
    },
  };

  FrameX.productService = productService;
  FrameX.shopService = shopService;
  FrameX.productMedia = { refs: mediaRefs };
})((window.FrameX = window.FrameX || {}));
