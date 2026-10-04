/* ==========================================================================
   Cart store
   Real client-side cart: add / remove / change quantity, saved in
   localStorage. Prices stored on a line are a DISPLAY SNAPSHOT — the backend
   must re-price every line at checkout.
   Lines carry shopId because a marketplace order is created per shop.
   ========================================================================== */
(function (FrameX) {
  const { config, pricing } = FrameX;
  const KEY = config.storageKeys.cart;
  const MAX_QTY = 20;
  let lines = load();

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((l) => l && l.productId && l.qty > 0)
        : [];
    } catch (error) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch (error) {
      /* storage full or blocked: cart still works for this session */
    }
  }

  function emit(detail) {
    document.dispatchEvent(
      new CustomEvent("framex:cart-change", {
        detail: Object.assign({ count: count() }, detail),
      }),
    );
  }

  const lineKey = (productId, size, color, note) =>
    `${productId}::${size || ""}::${color || ""}::${note || ""}`;
  const findLine = (key) => lines.find((l) => l.key === key);

  /** sizeId selects the priced size option (see services/pricing.js); `size`
      and `color` are the human-readable labels shown in the cart.
      `options` (e.g. ["Print: Matte Paper", "Front cover: Acrylic"]) and
      `unitPrice` come from the product page's pricingService.quote(). */
  function add(
    product,
    {
      sizeId = null,
      size = null,
      color = null,
      qty = 1,
      note = "",
      options = [],
      unitPrice = null,
    } = {},
  ) {
    const key = lineKey(
      product.id,
      size,
      [color].concat(options).filter(Boolean).join("|"),
      note,
    );
    const existing = findLine(key);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, MAX_QTY);
    } else {
      lines.push({
        key,
        productId: product.id,
        shopId: product.shopId,
        shopName: product.shopName || "",
        name: product.name,
        image: product.listingImage || product.image,
        size,
        color,
        options,
        note,
        unitPrice:
          typeof unitPrice === "number"
            ? unitPrice
            : pricing.priceForSize(product, sizeId),
        qty: Math.min(qty, MAX_QTY),
      });
    }
    persist();
    emit({ type: "add", productId: product.id });
  }

  /** A FrameX Studio design (template, simple photo or customised product).
      The line keeps the COMPLETE configuration (config), the price breakdown
      (pricing) and a readable summary, keyed by the saved design id. */
  function addStudio(item) {
    const key = `studio::${item.design.id}`;
    const existing = findLine(key);
    const line = {
      key,
      type: "studio",
      productType: item.productType, // "template" | "simple-photo" | "product-frame"
      productId: item.productId || `studio:${item.productType}`,
      templateId: item.templateId || null,
      designId: item.design.id,
      shopId: item.shopId,
      shopName: item.shopName,
      name: item.name,
      image: item.thumbnail || "",
      size: item.sizeLabel || null,
      color: null,
      note: "",
      summary: item.summary || [],
      customText: item.customText || {},
      photoCount: item.photoCount || 0,
      pricing: item.pricing || null,
      config: item.config,
      unitPrice: item.unitPrice,
      qty: Math.min((existing ? existing.qty : 0) + 1, MAX_QTY),
    };
    lines = existing
      ? lines.map((l) => (l.key === key ? line : l))
      : lines.concat(line);
    persist();
    emit({ type: "add", productId: line.productId });
  }

  function setQty(key, qty) {
    const line = findLine(key);
    if (!line) return;
    if (qty <= 0) return remove(key);
    line.qty = Math.min(qty, MAX_QTY);
    persist();
    emit({ type: "update", key });
  }

  function remove(key) {
    lines = lines.filter((l) => l.key !== key);
    persist();
    emit({ type: "remove", key });
  }

  function clear() {
    lines = [];
    persist();
    emit({ type: "clear" });
  }

  const count = () => lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = (subset = lines) =>
    subset.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

  /** Lines grouped per shop: [{ shopId, shopName, lines, subtotal }] */
  function groupedByShop() {
    const groups = new Map();
    lines.forEach((l) => {
      if (!groups.has(l.shopId))
        groups.set(l.shopId, {
          shopId: l.shopId,
          shopName: l.shopName,
          lines: [],
        });
      groups.get(l.shopId).lines.push(l);
    });
    return [...groups.values()].map((g) =>
      Object.assign(g, { subtotal: subtotal(g.lines) }),
    );
  }

  FrameX.cart = {
    add,
    addStudio,
    setQty,
    remove,
    clear,
    count,
    subtotal,
    groupedByShop,
    getLines: () => lines.map((l) => Object.assign({}, l)),
    MAX_QTY,
  };
})((window.FrameX = window.FrameX || {}));
