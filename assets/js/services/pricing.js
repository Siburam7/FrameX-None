/* ==========================================================================
   Pricing + size-option display helpers.
   These only DISPLAY prices coming from the catalogue. Authoritative totals,
   delivery fees and marketplace commission are calculated by the backend.
   ========================================================================== */
(function (FrameX) {
  const { config } = FrameX;
  let formatter;

  function formatPrice(amount) {
    formatter =
      formatter ||
      new Intl.NumberFormat(config.locale, {
        style: "currency",
        currency: config.currency,
        maximumFractionDigits: 0,
      });
    return formatter.format(amount);
  }

  const clampPercent = (product) =>
    Math.min(Math.max(Number(product.discountPercent) || 0, 0), 100);

  /** Normalized size options: product.sizeOptions if set, else one entry per plain `sizes` label. */
  function sizeOptions(product) {
    if (Array.isArray(product.sizeOptions) && product.sizeOptions.length)
      return product.sizeOptions;
    return (product.sizes || []).map((label, i) => ({
      id: String(i),
      label,
      dimensions: null,
      priceDelta: 0,
    }));
  }

  const hasSizeChoice = (product) => sizeOptions(product).length > 1;

  /** The size that is selected by default: "Medium" when present, else the first size. */
  function defaultSizeId(product) {
    const opts = sizeOptions(product);
    const medium =
      opts.find((o) => o.id === "m") || opts.find((o) => !o.priceDelta);
    return (medium || opts[0] || {}).id ?? null;
  }

  /** Price for one specific size option, after the product's discount. */
  function priceForSize(product, sizeId) {
    const opts = sizeOptions(product);
    const opt = opts.find((o) => o.id === sizeId) ||
      opts.find((o) => o.id === defaultSizeId(product)) ||
      opts[0] || { priceDelta: 0 };
    const base = Math.max(
      Number(product.price) + (Number(opt.priceDelta) || 0),
      0,
    );
    return Math.round((base * (100 - clampPercent(product))) / 100);
  }

  /** Price at the default size — used by product cards, cart lines, related products. */
  function finalPrice(product) {
    return priceForSize(product, defaultSizeId(product));
  }

  /** The lowest price across all sizes, for "From ₹X" card labels. */
  function startingPrice(product) {
    const opts = sizeOptions(product);
    const cheapest = opts.reduce(
      (min, o) => Math.min(min, Number(o.priceDelta) || 0),
      0,
    );
    const base = Math.max(Number(product.price) + cheapest, 0);
    return Math.round((base * (100 - clampPercent(product))) / 100);
  }

  /** "in_stock" | "low_stock" | "out_of_stock" */
  function availability(product) {
    if (product.isAvailable === false) return "out_of_stock";
    if (typeof product.stock === "number") {
      if (product.stock <= 0) return "out_of_stock";
      if (product.stock <= config.lowStockThreshold) return "low_stock";
    }
    return "in_stock";
  }

  FrameX.pricing = {
    formatPrice,
    finalPrice,
    startingPrice,
    priceForSize,
    sizeOptions,
    hasSizeChoice,
    defaultSizeId,
    availability,
  };
})((window.FrameX = window.FrameX || {}));
