/* ==========================================================================
   Pricing display helpers.
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
        maximumFractionDigits: 0
      });
    return formatter.format(amount);
  }

  /** Price after the product's percentage discount, in whole rupees. */
  function finalPrice(product) {
    const percent = Math.min(Math.max(Number(product.discountPercent) || 0, 0), 100);
    return Math.round((product.price * (100 - percent)) / 100);
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

  FrameX.pricing = { formatPrice, finalPrice, availability };
})((window.FrameX = window.FrameX || {}));
