/* ==========================================================================
   SEED DATA — products. Stand-in for GET /api/v1/products.

   PLACEHOLDER VALUES: names and images come from the original site; prices,
   discounts, stock, sizes and materials are placeholders (the original used
   template prices in Rp) and must be replaced through the Admin Panel later.

   Amounts are whole rupees. In a real backend store money as integer paise.
   Final price = price - discountPercent (see services/pricing.js).
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  const img = (name) => "assets/img/products/" + name + ".webp";
  const sizesSmall = ["6 × 8 in", "8 × 10 in", "10 × 12 in"];
  const sizesLarge = ["12 × 16 in", "16 × 20 in", "20 × 24 in"];

  function product(id, shopId, name, image, price, discountPercent, extra) {
    return Object.assign(
      {
        id,
        shopId,
        name,
        slug: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
        description: "", // shown as "Description coming soon" until the shop adds one
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
        updatedAt: "2026-06-01T00:00:00Z",
      },
      extra || {},
    );
  }

  FrameX.seed.products = [
    // Featured frame styles (shown in the rail under the hero)
    product("p-001", "shop-001", "Ace of Us", "ace-of-us", 799, 10, {
      categoryIds: ["photo-frames", "portraits"],
      isFeatured: true,
      sizes: sizesLarge,
      material: "Walnut-finish wood",
    }),
    product("p-002", "shop-001", "Classic Square", "classic-square", 499, 0, {
      categoryIds: ["photo-frames", "family"],
      isFeatured: true,
      material: "White-wash wood",
      stock: 3,
    }),
    product("p-003", "shop-001", "Grand Frame", "grand-frame", 1499, 15, {
      categoryIds: ["photo-frames", "wedding"],
      isFeatured: true,
      sizes: sizesLarge,
      material: "Solid wood",
    }),
    product(
      "p-004",
      "shop-001",
      "Signature Frame (Medium)",
      "signature-frame",
      699,
      10,
      {
        categoryIds: ["photo-frames", "portraits"],
        isFeatured: true,
        sizes: ["12 × 16 in"],
        material: "Dark wood",
      },
    ),
    product("p-005", "shop-002", "The Royal Arch", "royal-arch", 999, 10, {
      categoryIds: ["photo-frames", "wedding", "portraits"],
      isFeatured: true,
      material: "Wood",
    }),
    product("p-006", "shop-002", "Midnight Luxe", "midnight-luxe", 1199, 20, {
      categoryIds: ["photo-frames", "portraits"],
      isFeatured: true,
      material: "Black wood",
      stock: 0,
    }),
    product("p-007", "shop-002", "Imperial Gold", "imperial-gold", 1799, 15, {
      categoryIds: ["photo-frames", "wall-art"],
      isFeatured: true,
      sizes: sizesLarge,
      material: "Gold-finish wood",
    }),
    product("p-008", "shop-002", "Vintage Legacy", "vintage-legacy", 1299, 0, {
      categoryIds: ["photo-frames", "family"],
      isFeatured: true,
      material: "Antique-finish wood",
    }),
    product("p-009", "shop-003", "Nordic Oak Frame", "nordic-oak", 899, 10, {
      categoryIds: ["photo-frames", "new-arrivals", "wall-art"],
      isFeatured: true,
      isNew: true,
      material: "Oak",
    }),
    product("p-010", "shop-003", "Urban Black", "urban-black", 749, 0, {
      categoryIds: ["photo-frames", "new-arrivals", "wall-art"],
      isFeatured: true,
      isNew: true,
      material: "Black metal",
    }),
    product("p-015", "shop-004", "Urban Black", "urban-black", 499, 50, {
      categoryIds: ["photo-frames", "new-arrivals", "wall-art"],
      isFeatured: true,
      isNew: false,
      material: "Black metal",
    }),

    // Everyday range
    product(
      "p-011",
      "shop-001",
      "Personalized Family Memory Wooden Photo Frame",
      "family-memory",
      599,
      25,
      {
        categoryIds: ["photo-frames", "family", "gifts"],
        isRecommended: true,
        material: "Wood",
      },
    ),
    product(
      "p-012",
      "shop-001",
      "Custom Wedding Anniversary Premium Photo Frame",
      "wedding-anniversary",
      849,
      30,
      {
        categoryIds: ["photo-frames", "wedding", "gifts"],
        isRecommended: true,
        sizes: sizesLarge,
        material: "Premium wood",
      },
    ),
    product(
      "p-013",
      "shop-002",
      "Multi-Photo Collage Wall Display Frame Set",
      "collage-set",
      1099,
      40,
      {
        categoryIds: ["photo-frames", "wall-art", "family"],
        isRecommended: true,
        sizes: ["Set of 5", "Set of 9"],
        material: "Wood",
      },
    ),
    product(
      "p-014",
      "shop-003",
      "Luxury HD Printed Personalized Picture Frame",
      "luxury-hd",
      1399,
      35,
      {
        categoryIds: ["photo-frames", "new-arrivals", "wall-art"],
        isRecommended: true,
        isNew: true,
        sizes: sizesLarge,
        material: "Wood with HD print",
      },
    ),
    product(
      "p-015",
      "shop-003",
      "Modern Decorative Wooden Wall Photo Frame",
      "modern-wooden",
      449,
      25,
      {
        categoryIds: ["photo-frames", "wall-art"],
        isRecommended: true,
        material: "Wood",
      },
    ),
    product(
      "p-016",
      "shop-003",
      "A4 White Texture Frame Set of 4",
      "white-texture-set",
      649,
      10,
      {
        categoryIds: ["photo-frames", "new-arrivals"],
        isNew: true,
        sizes: ["A4"],
        material: "Textured MDF",
      },
    ),
  ];
})((window.FrameX = window.FrameX || {}));
