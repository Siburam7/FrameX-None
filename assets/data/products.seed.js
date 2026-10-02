/* ==========================================================================
   SEED DATA — products. Stand-in for GET /api/v1/products.

   PLACEHOLDER VALUES: names and images come from the original site; prices,
   discounts, stock and materials are placeholders and must be replaced
   through the Admin Panel later.

   SIZE PRICING: the 10 named frame styles use `sizeOptions` — a Small /
   Medium / Large / Extra Large scheme with a price difference per size
   (priceDelta, in rupees, relative to `price` = the Medium price). This
   mirrors how a shop would price larger frames, but the exact amounts are a
   frontend placeholder until a shop sets its own per-size pricing.

   COLOURS: `colors` lists which assets/data/frame-colors.seed.js finishes a
   product supports. There is one product photo per frame (no per-colour
   photography yet), so the product page visualizes the chosen colour with a
   CSS frame mock-up next to the real photo, clearly labelled as a preview.

   Amounts are whole rupees. In a real backend store money as integer paise.
   Final price = (price + size priceDelta) − discountPercent% (services/pricing.js).
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  const img = (name) => "assets/img/products/" + name + ".webp";

  // Shared Small / Medium / Large / Extra Large scheme for the 10 named frames.
  const sizeScheme = [
    { id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -150 },
    { id: "m", label: "Medium", dimensions: "12 × 16 in", priceDelta: 0 },
    { id: "l", label: "Large", dimensions: "16 × 20 in", priceDelta: 250 },
    { id: "xl", label: "Extra Large", dimensions: "20 × 24 in", priceDelta: 450 }
  ];
  // Signature Frame is priced lower, so its deltas scale down to avoid a
  // Small size with a negative final price.
  const sizeSchemeCompact = [
    { id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -80 },
    { id: "m", label: "Medium", dimensions: "12 × 16 in", priceDelta: 0 },
    { id: "l", label: "Large", dimensions: "16 × 20 in", priceDelta: 150 },
    { id: "xl", label: "Extra Large", dimensions: "20 × 24 in", priceDelta: 280 }
  ];
  const sizesSmall = ["6 × 8 in", "8 × 10 in", "10 × 12 in"];
  const sizesLarge = ["12 × 16 in", "16 × 20 in", "20 × 24 in"];

  function product(id, shopId, name, image, price, discountPercent, extra) {
    return Object.assign(
      {
        id,
        shopId,
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: "",
        categoryIds: ["photo-frames"],
        image: img(image),
        images: [img(image)],
        price,
        currency: "INR",
        discountPercent,
        sizes: sizesSmall,
        material: "Wood",
        stock: 20,
        isAvailable: true, // admin "In stock / Out of stock" switch
        isVisible: true, // admin "Hide / show" switch
        isFeatured: false,
        isRecommended: false,
        isNew: false,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z"
      },
      extra || {}
    );
  }

  /** The 10 named frame styles: adds sizeOptions + a derived `sizes` label list. */
  function styledProduct(id, shopId, name, image, price, discountPercent, extra) {
    const scheme = (extra && extra.sizeOptions) || sizeScheme;
    return product(id, shopId, name, image, price, discountPercent, Object.assign({ sizeOptions: scheme, sizes: scheme.map((o) => o.label) }, extra));
  }

  FrameX.seed.products = [
    // ---- Featured frame styles: size + colour visualizer, full descriptions ----
    styledProduct("p-001", "shop-001", "Ace of Us", "ace-of-us", 799, 10, {
      categoryIds: ["photo-frames", "portraits"], isFeatured: true, material: "Walnut-finish wood",
      colors: ["walnut", "black", "natural-wood"],
      description: "A warm walnut-finish frame with a bold mat border, built for the portrait you want front and centre."
    }),
    styledProduct("p-002", "shop-001", "Classic Square", "classic-square", 499, 0, {
      categoryIds: ["photo-frames", "family"], isFeatured: true, material: "White-wash wood", stock: 3,
      colors: ["white", "natural-wood", "black"],
      description: "A soft white-wash square frame that keeps the focus on the photo — a quiet, everyday favourite."
    }),
    styledProduct("p-003", "shop-001", "Grand Frame", "grand-frame", 1499, 15, {
      categoryIds: ["photo-frames", "wedding"], isFeatured: true, material: "Solid wood",
      colors: ["walnut", "dark-brown", "gold"],
      description: "A substantial solid-wood frame with real presence — suited to a headboard wall or a wedding portrait."
    }),
    styledProduct("p-004", "shop-001", "Signature Frame", "signature-frame", 699, 10, {
      categoryIds: ["photo-frames", "portraits"], isFeatured: true, material: "Dark wood",
      colors: ["black", "dark-brown", "walnut"], sizeOptions: sizeSchemeCompact,
      description: "A slim dark-wood frame with clean lines, equally at home on a desk or a gallery wall."
    }),
    styledProduct("p-005", "shop-002", "The Royal Arch", "royal-arch", 999, 10, {
      categoryIds: ["photo-frames", "wedding", "portraits"], isFeatured: true, material: "Wood",
      colors: ["gold", "black", "walnut"],
      description: "An arched silhouette with an ornate mat — a frame built for a moment worth dressing up."
    }),
    styledProduct("p-006", "shop-002", "Midnight Luxe", "midnight-luxe", 1199, 20, {
      categoryIds: ["photo-frames", "portraits"], isFeatured: true, material: "Black wood", stock: 0,
      colors: ["black", "dark-brown", "walnut"],
      description: "A deep matte-black frame for black-and-white portraits and moody, low-light photos."
    }),
    styledProduct("p-007", "shop-002", "Imperial Gold", "imperial-gold", 1799, 15, {
      categoryIds: ["photo-frames", "wall-art"], isFeatured: true, material: "Gold-finish wood",
      colors: ["gold", "black", "dark-brown"],
      description: "A gold-finish statement frame with a wide profile, made to anchor a gallery wall."
    }),
    styledProduct("p-008", "shop-002", "Vintage Legacy", "vintage-legacy", 1299, 0, {
      categoryIds: ["photo-frames", "family"], isFeatured: true, material: "Antique-finish wood",
      colors: ["dark-brown", "walnut", "black"],
      description: "An antique-finish frame with a weathered edge, for photos that feel like they've always been there."
    }),
    styledProduct("p-009", "shop-003", "Nordic Oak Frame", "nordic-oak", 899, 10, {
      categoryIds: ["photo-frames", "new-arrivals", "wall-art"], isFeatured: true, isNew: true, material: "Oak",
      colors: ["natural-wood", "white", "black"],
      description: "A pale oak frame with a thin, modern profile — minimal enough to hang in a row."
    }),
    styledProduct("p-010", "shop-003", "Urban Black", "urban-black", 749, 0, {
      categoryIds: ["photo-frames", "new-arrivals", "wall-art"], isFeatured: true, isNew: true, material: "Black metal",
      colors: ["black", "white", "gold"],
      description: "A slim black metal frame with a contemporary edge, built for a clean, gallery-style hang."
    }),

    // ---- Everyday range (unchanged: single price, plain size list) ----
    product("p-011", "shop-001", "Personalized Family Memory Wooden Photo Frame", "family-memory", 599, 25, { categoryIds: ["photo-frames", "family", "gifts"], isRecommended: true, material: "Wood" }),
    product("p-012", "shop-001", "Custom Wedding Anniversary Premium Photo Frame", "wedding-anniversary", 849, 30, { categoryIds: ["photo-frames", "wedding", "gifts"], isRecommended: true, sizes: sizesLarge, material: "Premium wood" }),
    product("p-013", "shop-002", "Multi-Photo Collage Wall Display Frame Set", "collage-set", 1099, 40, { categoryIds: ["photo-frames", "wall-art", "family"], isRecommended: true, sizes: ["Set of 5", "Set of 9"], material: "Wood" }),
    product("p-014", "shop-003", "Luxury HD Printed Personalized Picture Frame", "luxury-hd", 1399, 35, { categoryIds: ["photo-frames", "new-arrivals", "wall-art"], isRecommended: true, isNew: true, sizes: sizesLarge, material: "Wood with HD print" }),
    product("p-015", "shop-003", "Modern Decorative Wooden Wall Photo Frame", "modern-wooden", 449, 25, { categoryIds: ["photo-frames", "wall-art"], isRecommended: true, material: "Wood" }),
    product("p-016", "shop-003", "A4 White Texture Frame Set of 4", "white-texture-set", 649, 10, { categoryIds: ["photo-frames", "new-arrivals"], isNew: true, sizes: ["A4"], material: "Textured MDF" })
  ];
})((window.FrameX = window.FrameX || {}));
