/* ==========================================================================
   FrameX — edit.js
   THE ONE FILE YOU EDIT to manage shops, products, categories and what the
   home page shows. Edit → save → refresh the website. Nothing else to touch.

   Every page (Home, Shop, Shop details, Product) reads its data from here.

   CONTENTS
     1. CATEGORIES        — ADD NEW CATEGORY HERE
     2. FRAME COLOURS     — the finishes a product can offer
     3. SIZE PRESETS      — ready-made size lists you can reuse
     4. SHOPS             — ADD NEW SHOP HERE
     5. PRODUCTS          — ADD NEW PRODUCT HERE
     6. HOMEPAGE          — what appears on the home page, and in what order
     7. (do not edit)     — hands the data to the website

   RULES THAT KEEP THE SITE WORKING
     • Every `id` must be unique and must never change once it is in use
       (links, carts and wishlists point at it).
     • Every item is wrapped in { } and separated from the next by a comma.
     • Text goes in "double quotes". Numbers, true, false and null do not.
     • If the site looks wrong after an edit, open the browser console
       (F12 → Console): this file reports mistakes there, e.g. a product
       pointing at a shop that does not exist.

   PRIVACY: this file is downloaded by every visitor's browser. Only put
   information here that is fine to be public. Keep owners' private phone
   numbers, emails and agreements in your own records, not in this file.

   LATER: when a real database/admin panel exists, set dataMode to "api" in
   assets/js/config.js. The website then stops reading this file and reads
   the same fields from the server instead (see docs/ARCHITECTURE.md).
   ========================================================================== */
(function (FrameX) {
  /* ========================================================================
     1. CATEGORIES
     ------------------------------------------------------------------------
     id        short lowercase name, no spaces. Products list these ids in
               `categoryIds`. Shop links look like shop.html?category=<id>
     name      what visitors see
     image     photo used on the home page category card
     isActive  true = shown, false = hidden everywhere (deactivated)

     A category with no visible products is hidden automatically.
     Which categories get the big cards on the home page is set in
     section 6 (HOMEPAGE → categoryIds).
     ======================================================================== */
  const categories = [
    // ---- Frame styles ----
    {
      id: "classic",
      name: "Classic Frames",
      image: "assets/img/products/vintage-legacy.webp",
      isActive: true,
    },
    {
      id: "modern",
      name: "Modern Frames",
      image: "assets/img/products/urban-black.webp",
      isActive: true,
    },
    {
      id: "wooden",
      name: "Wooden Frames",
      image: "assets/img/products/nordic-oak.webp",
      isActive: true,
    },
    {
      id: "luxury",
      name: "Luxury Frames",
      image: "assets/img/products/imperial-gold.webp",
      isActive: true,
    },
    {
      id: "minimal",
      name: "Minimal Frames",
      image: "assets/img/products/signature-frame.webp",
      isActive: true,
    },
    {
      id: "decorative",
      name: "Decorative Frames",
      image: "assets/img/products/royal-arch.webp",
      isActive: true,
    },

    // ---- Occasions / themes ----
    {
      id: "photo-frames",
      name: "All Photo Frames",
      image: "assets/img/categories/photo-frames.webp",
      isActive: true,
    },
    {
      id: "family",
      name: "Family Memories",
      image: "assets/img/categories/family.webp",
      isActive: true,
    },
    {
      id: "wedding",
      name: "Wedding",
      image: "assets/img/categories/wedding.webp",
      isActive: true,
    },
    {
      id: "portraits",
      name: "Portraits",
      image: "assets/img/categories/portraits.webp",
      isActive: true,
    },
    {
      id: "wall-art",
      name: "Wall Art",
      image: "assets/img/categories/wall-art.webp",
      isActive: true,
    },
    {
      id: "gifts",
      name: "Gifts",
      image: "assets/img/categories/gifts.webp",
      isActive: true,
    },
    {
      id: "new-arrivals",
      name: "New Arrivals",
      image: "assets/img/categories/new-arrivals.webp",
      isActive: true,
    },

    // ---- Product types (shops pick these in the shop dashboard) ----
    // Empty categories stay hidden until a shop lists a product in them.
    { id: "premium", name: "Premium Frames", image: "assets/img/products/imperial-gold.webp", isActive: true },
    { id: "metal", name: "Metal Frames", image: "assets/img/products/urban-black.webp", isActive: true },
    { id: "gallery-frames", name: "Gallery Frames", image: "assets/img/products/nordic-oak.webp", isActive: true },
    { id: "collage", name: "Collage Frames", image: "assets/img/products/collage-set.webp", isActive: true },
    { id: "floating", name: "Floating Frames", image: "assets/img/products/signature-frame.webp", isActive: true },
    { id: "canvas", name: "Canvas", image: "assets/img/categories/wall-art.webp", isActive: true },
    { id: "photo-prints", name: "Photo Prints", image: "assets/img/categories/photo-frames.webp", isActive: true },
    { id: "custom", name: "Custom Frames", image: "assets/img/products/wedding-anniversary.webp", isActive: true },
    { id: "personalized", name: "Personalized Frames", image: "assets/img/products/family-memory.webp", isActive: true },

    // ADD NEW CATEGORY HERE — put a comma after the line above, then copy this line:
    // { id: "kids", name: "Kids' Room", image: "assets/img/categories/kids.webp", isActive: true }
    //
    // EDIT CATEGORY: change the name or image on its line (never the id).
    // DELETE/DEACTIVATE CATEGORY: set isActive: false (safe), or delete its line
    //   and also remove its id from every product's categoryIds.
  ];

  /* ========================================================================
     2. FRAME COLOURS
     ------------------------------------------------------------------------
     The finishes a frame can be offered in. Products pick from these ids in
     their `colors` list. `hex` is the on-screen approximation of the finish;
     `texture` is "solid", "wood" or "metal" and styles the product preview.
     ======================================================================== */
  const frameColors = [
    { id: "black", name: "Black", hex: "#1c1c1c", texture: "solid" },
    { id: "white", name: "White", hex: "#f3efe7", texture: "solid" },
    {
      id: "natural-wood",
      name: "Natural Wood",
      hex: "#c8a165",
      texture: "wood",
    },
    { id: "walnut", name: "Walnut", hex: "#5b3a29", texture: "wood" },
    { id: "dark-brown", name: "Dark Brown", hex: "#3b2412", texture: "wood" },
    { id: "gold", name: "Gold", hex: "#b8872b", texture: "metal" },
    // ADD NEW FRAME COLOUR HERE
  ];

  /* ========================================================================
     3. SIZE PRESETS
     ------------------------------------------------------------------------
     Reusable size lists, so you don't retype them for every product.
     Use one in a product with:   sizes: SIZES.standard

     priceDelta = rupees added to (or taken off) the product's base `price`
     for that size. The base price is the price of the size with priceDelta 0.

     A product can also have its own list instead of a preset, either
       priced:  sizes: [{ id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -100 }, …]
       simple:  sizes: ["A4", "A3"]            (same price for every size)
     ======================================================================== */
  const SIZES = {
    // Small / Medium / Large / Extra Large with a price step per size
    standard: [
      { id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -150 },
      { id: "m", label: "Medium", dimensions: "12 × 16 in", priceDelta: 0 },
      { id: "l", label: "Large", dimensions: "16 × 20 in", priceDelta: 250 },
      {
        id: "xl",
        label: "Extra Large",
        dimensions: "20 × 24 in",
        priceDelta: 450,
      },
    ],
    // Same sizes with smaller price steps, for lower-priced frames
    compact: [
      { id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -80 },
      { id: "m", label: "Medium", dimensions: "12 × 16 in", priceDelta: 0 },
      { id: "l", label: "Large", dimensions: "16 × 20 in", priceDelta: 150 },
      {
        id: "xl",
        label: "Extra Large",
        dimensions: "20 × 24 in",
        priceDelta: 280,
      },
    ],
    // Plain lists: one price whichever size is chosen
    small: ["6 × 8 in", "8 × 10 in", "10 × 12 in"],
    large: ["12 × 16 in", "16 × 20 in", "20 × 24 in"],
  };

  // Opening hours helper: OPEN("10:00", "20:00") — use null for a closed day.
  const OPEN = (from, to) => [from, to];

  /* ========================================================================
     4. SHOPS
     ------------------------------------------------------------------------
     id            unique, e.g. "shop-004". Products point at it with shopId.
     name          shop name shown to visitors
     ownerName     contact person (not shown on the site, but this file is
                   public — see PRIVACY at the top)
     description   short text about the shop, or null
     coverImage    wide photo on the shop card / shop page
     logo          small square logo, or null to show the shop's initials
     address       line1, area, city, state, postalCode (null if unknown)
     location      latitude + longitude from Google Maps (right-click the
                   shop → the two numbers). Needed for "nearest shop" and
                   distances. null = no distance is shown.
     phone         public shop phone, or null
     openingHours  per day: OPEN("10:00", "20:00") or null for closed.
                   Set the whole field to null if hours are not known yet.
     fulfilment    any of: "pickup", "shop_delivery", "delivery_partner"
     rating        { average: 4.6, count: 128 } or null when there are no reviews
     isActive      true = live. false = shop AND all its products are hidden.
     isSample      true shows a "Sample shop" label (placeholder shops only)

     NOTE: only "FrameX Studio" uses real information (its address). Shops B
     and C are placeholders so the multi-shop layout can be seen.
     ======================================================================== */
  const shops = [
    // EDIT SHOP HERE — change any value inside a shop's { } block.
    {
      id: "shop-001",
      name: "FrameX Studio",
      ownerName: null,
      description: null,
      coverImage: "assets/img/shops/cover-a.webp",
      logo: null,
      address: {
        line1: null,
        area: "Mathakarogola",
        city: "Dhenkanal",
        state: "Odisha",
        postalCode: "759024",
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: null,
      fulfilment: ["pickup"],
      rating: null,
      isActive: true,
      isSample: false,
    },
    {
      id: "shop-002",
      name: "Photo Frame Shop B",
      ownerName: null,
      description: null,
      coverImage: "assets/img/shops/cover-b.webp",
      logo: null,
      address: {
        line1: null,
        area: "Address to be added",
        city: null,
        state: null,
        postalCode: null,
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: {
        mon: OPEN("10:00", "20:00"),
        tue: OPEN("10:00", "20:00"),
        wed: OPEN("10:00", "20:00"),
        thu: OPEN("10:00", "20:00"),
        fri: OPEN("10:00", "20:00"),
        sat: OPEN("10:00", "20:00"),
        sun: null,
      },
      fulfilment: ["pickup", "shop_delivery"],
      rating: null,
      isActive: true,
      isSample: true,
    },
    {
      id: "shop-003",
      name: "Photo Frame Shop C",
      ownerName: null,
      description: null,
      coverImage: "assets/img/shops/cover-c.webp",
      logo: null,
      address: {
        line1: null,
        area: "Address to be added",
        city: null,
        state: null,
        postalCode: null,
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: {
        mon: OPEN("10:00", "20:00"),
        tue: OPEN("10:00", "20:00"),
        wed: OPEN("10:00", "20:00"),
        thu: OPEN("10:00", "20:00"),
        fri: OPEN("10:00", "20:00"),
        sat: OPEN("10:00", "20:00"),
        sun: OPEN("10:00", "20:00"),
      },
      fulfilment: ["pickup", "delivery_partner"],
      rating: null,
      isActive: true,
      isSample: true,
    },

    // ADD NEW SHOP HERE — put a comma after the } above, then copy this block,
    // remove the // at the start of each line and fill it in:
    //
    // {
    //   id: "shop-004",
    //   name: "Shop name",
    //   ownerName: "Owner name",
    //   description: "A sentence or two about the shop.",
    //   coverImage: "assets/img/shops/your-photo.webp",
    //   logo: null,
    //   address: { line1: "Street / building", area: "Area", city: "City", state: "State", postalCode: "000000" },
    //   location: { latitude: 20.6593, longitude: 85.5975 },
    //   phone: "+91 00000 00000",
    //   openingHours: {
    //     mon: OPEN("10:00", "20:00"), tue: OPEN("10:00", "20:00"), wed: OPEN("10:00", "20:00"),
    //     thu: OPEN("10:00", "20:00"), fri: OPEN("10:00", "20:00"), sat: OPEN("10:00", "20:00"), sun: null
    //   },
    //   fulfilment: ["pickup", "shop_delivery"],
    //   rating: null,
    //   isActive: true,
    //   isSample: false
    // }
    //
    // DELETE/DEACTIVATE SHOP HERE: set isActive: false to hide the shop and all
    //   its products (recommended — easy to bring back). To remove it for good,
    //   delete its whole { } block AND every product whose shopId is that shop.
  ];

  /* ========================================================================
     5. PRODUCTS
     ------------------------------------------------------------------------
     id               unique, e.g. "p-017"
     shopId           the id of the shop that sells it (section 4) — required
     name             product name
     image            main product photo
     description      one or two sentences ("" for none)
     categoryIds      category ids from section 1 (a product can be in several)
     price            BASE PRICE in whole rupees (the size with priceDelta 0)
     discountPercent  0 for none, 10 for 10% off, …
     stock            how many are available. 0 = "Out of stock",
                      5 or fewer = "Only N left"
     isAvailable      false forces "Out of stock" whatever the stock number is
     isVisible        false hides the product from the whole site (deactivated)
     isNew            true shows a "New" badge
     material         shown in the product details
     sizes            a preset from section 3 (SIZES.standard …) or your own list
     colors           frame colour ids from section 2. Leave out for no colour choice.
     frame            THIS PRODUCT'S OWN frame design, used by "Try With Your
                      Own Image" on the product page so each product previews
                      with its own frame, not a generic one:
                        shape        "rectangle" | "square" | "arch"
                        style        "plain" (flat colour) | "grain" (wood grain)
                                     | "ornate" (carved look)
                        borderWidth  "thin" | "medium" | "thick"
                        double       true = thin extra line near the inner edge
                        ornament     true = small decorative crest on top
                        matColor     "none" | "white" | "cream" | "red"
                                     (the mount around the photo)
                        matWidth     "none" | "thin" | "medium" | "wide"
                      Leave `frame` out for products that aren't frames (accessories);
                      they can't be opened in FrameX Studio.
                      Optional, only when the shop has told you: inside `frame`
                        type    "classic" | "modern" | "minimal" | "premium" | "wood" |
                                "metal" | "gallery" | "floating" | "canvas" | "collage"
                        finish  e.g. "Matte"      width / depth  millimetres, e.g. 30

     OPTIONAL DETAIL (all of these can be left out; the product page only shows
     sections that have information. Shops normally enter this in the shop
     dashboard, shop-dashboard.html, instead of here):
       views          typed photos instead of `images`:
                        [{ type: "FRONT", url: "...", alt: "Front of the frame" },
                         { type: "BACK", url: "...", alt: "Back with hanger" }]
                      types: FRONT SIDE BACK CORNER DETAIL MATERIAL WALL_PREVIEW
                             LIFESTYLE PACKAGING
       product360     { frames: ["...01.webp", "...02.webp", …] }  (8 or more)
       media          [{ kind: "video", url: "https://youtu.be/…", duration: 20 }]
       print          { materials: [{ id: "pm1", type: "matte-paper", name: "Matte Paper",
                          finish: "Matte", thickness: "260 gsm", priceModifier: 0 }],
                        quality: "Standard" }
       protection     { options: [{ type: "acrylic", priceModifier: 150 }], default: "acrylic" }
       back           { backing: "MDF board", hanging: "Sawtooth hanger", stand: false }
       components     [{ type: "frame", name: "Outer Frame", material: "Teak" }, …]
       specifications [{ label: "Care", value: "Wipe with a dry cloth" }]
       quality        { items: { frameQuality: "Standard" } }   shop-provided only;
                      never write "certified", "best quality" or "FrameX verified".

     Featured / recommended products are chosen in section 6 (HOMEPAGE).
     Prices, discounts, stock and materials below are placeholders until each
     shop confirms its own.
     ======================================================================== */
  const products = [
    // EDIT PRODUCT HERE — change any value inside a product's { } block.

    // ---------------- FrameX Studio (shop-001) ----------------
    {
      id: "p-001",
      shopId: "shop-001",
      name: "Ace of Us",
      image: "assets/img/products/ace-of-us.webp",
      description:
        "A warm walnut-finish frame with a bold mat border, built for the portrait you want front and centre.",
      categoryIds: ["photo-frames", "portraits", "decorative", "wooden"],
      price: 799,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Walnut-finish wood",
      sizes: SIZES.standard,
      colors: ["walnut", "black", "natural-wood"],
      frame: {
        shape: "rectangle",
        style: "ornate",
        borderWidth: "thin",
        matColor: "red",
        matWidth: "medium",
      },
    },
    {
      id: "p-002",
      shopId: "shop-001",
      name: "Classic Square",
      image: "assets/img/products/classic-square.webp",
      description:
        "A soft white-wash square frame that keeps the focus on the photo — a quiet, everyday favourite.",
      categoryIds: ["photo-frames", "family", "classic", "minimal"],
      price: 499,
      discountPercent: 0,
      stock: 3,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "White-wash wood",
      sizes: SIZES.standard,
      colors: ["white", "natural-wood", "black"],
      frame: {
        shape: "square",
        style: "grain",
        borderWidth: "thick",
        matColor: "white",
        matWidth: "wide",
      },
    },
    {
      id: "p-003",
      shopId: "shop-001",
      name: "Grand Frame",
      image: "assets/img/products/grand-frame.webp",
      description:
        "A substantial solid-wood frame with real presence — suited to a headboard wall or a wedding portrait.",
      categoryIds: ["photo-frames", "wedding", "classic", "wooden"],
      price: 1499,
      discountPercent: 15,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Solid wood",
      sizes: SIZES.standard,
      colors: ["walnut", "dark-brown", "gold"],
      frame: {
        shape: "rectangle",
        style: "grain",
        borderWidth: "thick",
        matColor: "white",
        matWidth: "wide",
      },
    },
    {
      id: "p-004",
      shopId: "shop-001",
      name: "Signature Frame",
      image: "assets/img/products/signature-frame.webp",
      description:
        "A slim dark-wood frame with clean lines, equally at home on a desk or a gallery wall.",
      categoryIds: ["photo-frames", "portraits", "minimal", "modern"],
      price: 699,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Dark wood",
      sizes: SIZES.compact,
      colors: ["black", "dark-brown", "walnut"],
      frame: {
        shape: "rectangle",
        style: "grain",
        borderWidth: "medium",
        matColor: "white",
        matWidth: "thin",
      },
    },
    {
      id: "p-011",
      shopId: "shop-001",
      name: "Personalized Family Memory Wooden Photo Frame",
      image: "assets/img/products/family-memory.webp",
      description: "",
      categoryIds: ["photo-frames", "family", "gifts", "wooden", "classic", "personalized"],
      price: 599,
      discountPercent: 25,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Wood",
      sizes: SIZES.small,
    },
    {
      id: "p-012",
      shopId: "shop-001",
      name: "Custom Wedding Anniversary Premium Photo Frame",
      image: "assets/img/products/wedding-anniversary.webp",
      description: "",
      categoryIds: ["photo-frames", "wedding", "gifts", "luxury", "classic", "custom"],
      price: 849,
      discountPercent: 30,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Premium wood",
      sizes: SIZES.large,
    },

    // ---------------- Photo Frame Shop B (shop-002) ----------------
    {
      id: "p-005",
      shopId: "shop-002",
      name: "The Royal Arch",
      image: "assets/img/products/royal-arch.webp",
      description:
        "An arched silhouette with an ornate mat — a frame built for a moment worth dressing up.",
      categoryIds: [
        "photo-frames",
        "wedding",
        "portraits",
        "decorative",
        "luxury",
      ],
      price: 999,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Wood",
      sizes: SIZES.standard,
      colors: ["gold", "black", "walnut"],
      frame: {
        shape: "arch",
        style: "ornate",
        borderWidth: "thin",
        double: true,
        ornament: true,
        matColor: "red",
        matWidth: "medium",
      },
    },
    {
      id: "p-006",
      shopId: "shop-002",
      name: "Midnight Luxe",
      image: "assets/img/products/midnight-luxe.webp",
      description:
        "A deep matte-black frame for black-and-white portraits and moody, low-light photos.",
      categoryIds: ["photo-frames", "portraits", "luxury", "modern"],
      price: 1199,
      discountPercent: 20,
      stock: 0,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Black wood",
      sizes: SIZES.standard,
      colors: ["black", "dark-brown", "walnut"],
      frame: {
        shape: "rectangle",
        style: "plain",
        borderWidth: "thin",
        matColor: "none",
        matWidth: "none",
      },
    },
    {
      id: "p-007",
      shopId: "shop-002",
      name: "Imperial Gold",
      image: "assets/img/products/imperial-gold.webp",
      description:
        "A gold-finish statement frame with a wide profile, made to anchor a gallery wall.",
      categoryIds: ["photo-frames", "wall-art", "luxury", "decorative"],
      price: 1799,
      discountPercent: 15,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Gold-finish wood",
      sizes: SIZES.standard,
      colors: ["gold", "black", "dark-brown"],
      frame: {
        shape: "rectangle",
        style: "ornate",
        borderWidth: "thick",
        matColor: "cream",
        matWidth: "wide",
      },
    },
    {
      id: "p-008",
      shopId: "shop-002",
      name: "Vintage Legacy",
      image: "assets/img/products/vintage-legacy.webp",
      description:
        "An antique-finish frame with a weathered edge, for photos that feel like they've always been there.",
      categoryIds: ["photo-frames", "family", "classic", "decorative"],
      price: 1299,
      discountPercent: 0,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Antique-finish wood",
      sizes: SIZES.standard,
      colors: ["dark-brown", "walnut", "black"],
      frame: {
        shape: "rectangle",
        style: "ornate",
        borderWidth: "medium",
        double: true,
        ornament: true,
        matColor: "cream",
        matWidth: "medium",
      },
    },
    {
      id: "p-013",
      shopId: "shop-002",
      name: "Multi-Photo Collage Wall Display Frame Set",
      image: "assets/img/products/collage-set.webp",
      description: "",
      categoryIds: [
        "photo-frames",
        "wall-art",
        "family",
        "decorative",
        "modern", "collage",
      ],
      price: 1099,
      discountPercent: 40,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Wood",
      sizes: ["Set of 5", "Set of 9"],
    },

    // ---------------- Photo Frame Shop C (shop-003) ----------------
    {
      id: "p-009",
      shopId: "shop-003",
      name: "Nordic Oak Frame",
      image: "assets/img/products/nordic-oak.webp",
      description:
        "A pale oak frame with a thin, modern profile — minimal enough to hang in a row.",
      categoryIds: [
        "photo-frames",
        "new-arrivals",
        "wall-art",
        "wooden",
        "minimal",
        "modern",
      ],
      price: 899,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Oak",
      sizes: SIZES.standard,
      colors: ["natural-wood", "white", "black"],
      frame: {
        shape: "rectangle",
        style: "grain",
        borderWidth: "thin",
        matColor: "white",
        matWidth: "thin",
      },
    },
    {
      id: "p-010",
      shopId: "shop-003",
      name: "Urban Black",
      image: "assets/img/products/urban-black.webp",
      description:
        "A slim black metal frame with a contemporary edge, built for a clean, gallery-style hang.",
      categoryIds: [
        "photo-frames",
        "new-arrivals",
        "wall-art",
        "modern",
        "minimal", "metal",
      ],
      price: 749,
      discountPercent: 0,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Black metal",
      sizes: SIZES.standard,
      colors: ["black", "white", "gold"],
      frame: {
        shape: "rectangle",
        style: "plain",
        borderWidth: "thin",
        matColor: "white",
        matWidth: "thin",
      },
    },
    {
      id: "p-014",
      shopId: "shop-003",
      name: "Luxury HD Printed Personalized Picture Frame",
      image: "assets/img/products/luxury-hd.webp",
      description: "",
      categoryIds: ["photo-frames", "new-arrivals", "wall-art", "luxury", "personalized"],
      price: 1399,
      discountPercent: 35,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Wood with HD print",
      sizes: SIZES.large,
    },
    {
      id: "p-015",
      shopId: "shop-003",
      name: "Modern Decorative Wooden Wall Photo Frame",
      image: "assets/img/products/modern-wooden.webp",
      description: "",
      categoryIds: [
        "photo-frames",
        "wall-art",
        "modern",
        "wooden",
        "decorative",
      ],
      price: 449,
      discountPercent: 25,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Wood",
      sizes: SIZES.small,
    },
    {
      id: "p-016",
      shopId: "shop-003",
      name: "A4 White Texture Frame Set of 4",
      image: "assets/img/products/white-texture-set.webp",
      description: "",
      categoryIds: ["photo-frames", "new-arrivals", "minimal", "modern"],
      price: 649,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Textured MDF",
      sizes: ["A4"],
    },

    // ---------------- Accessories ----------------
    // Price, stock and pack size are placeholders until the shop confirms them.
    // Main photo: Unsplash (free licence), https://unsplash.com/photos/S1RqpXS_I7c
    // The other three are stills from FrameX's own magnetic hanging videos.
    {
      id: "p-017",
      shopId: "shop-001",
      name: "Magnetic Hanging",
      image: "assets/img/products/magnetic-hanging.jpg",
      images: [
        "assets/img/products/magnetic-hanging.jpg",
        "assets/video/hanging-1.jpg",
        "assets/video/hanging-2.jpg",
        "assets/video/hanging-3.jpg",
      ],
      description:
        "A magnetic mount for hanging frames without a drill or nails: peel and stick it to the wall, adjust the frame until it sits right, and take it down later without leaving holes.",
      categoryIds: ["wall-art", "new-arrivals"],
      price: 299,
      discountPercent: 0,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Magnetic mount with adhesive backing",
      sizes: ["Set of 4"],
    },

    // ADD NEW PRODUCT HERE — put a comma after the } above, then copy this block,
    // remove the // at the start of each line and fill it in:
    //
    // {
    //   id: "p-017",
    //   shopId: "shop-001",
    //   name: "Product name",
    //   image: "assets/img/products/your-photo.webp",
    //   description: "One or two sentences about the frame.",
    //   categoryIds: ["photo-frames", "classic"],
    //   price: 999,
    //   discountPercent: 0,
    //   stock: 10,
    //   isAvailable: true,
    //   isVisible: true,
    //   isNew: true,
    //   material: "Wood",
    //   sizes: SIZES.standard,
    //   colors: ["black", "walnut"],
    //   frame: { shape: "rectangle", style: "grain", borderWidth: "medium", matColor: "white", matWidth: "thin" }
    // }
    //
    // DELETE/DEACTIVATE PRODUCT HERE:
    //   • Hide it from the site:  isVisible: false   (recommended — easy to bring back)
    //   • Mark it out of stock:   isAvailable: false  or  stock: 0
    //   • Remove it for good:     delete its whole { } block, and remove its id
    //                             from the HOMEPAGE lists below.
  ];

  /* ========================================================================
     6. HOMEPAGE
     ------------------------------------------------------------------------
     Lists of ids. The ORDER here is the order shown on the home page.
     Hidden / deactivated items are skipped automatically.

     featuredProductIds     the scrolling "Featured frame styles" showcase
     recommendedProductIds  "Highly recommended frames" (first 5 are shown)
     categoryIds            the large "Shop by category" cards; every other
                            active category appears as a small link under them
     featuredShopIds        shops listed first under "Photo-frame shops near
                            you" (first 3 are shown on the home page)
     ======================================================================== */
  const homepage = {
    featuredProductIds: [
      "p-001",
      "p-002",
      "p-003",
      "p-004",
      "p-005",
      "p-006",
      "p-007",
      "p-008",
      "p-009",
      "p-010",
    ],
    recommendedProductIds: ["p-011", "p-012", "p-013", "p-014", "p-015"],
    categoryIds: [
      "classic",
      "modern",
      "wooden",
      "luxury",
      "minimal",
      "decorative",
    ],
    featuredShopIds: ["shop-001", "shop-002", "shop-003"],
  };

  /* ========================================================================
     7. DO NOT EDIT BELOW THIS LINE
     ------------------------------------------------------------------------
     Checks the data above for common mistakes, fills in the fields the
     website derives by itself, and hands everything to the data layer
     (assets/js/api/seed-provider.js) in the same shape the future API uses.
     ======================================================================== */
  const warn = (message) => console.warn("[edit.js] " + message);
  const slugify = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const rank = (list, id) =>
    list.indexOf(id) === -1 ? null : list.indexOf(id);
  const ids = (list) => new Set(list.map((item) => item.id));

  function checkUnique(list, label) {
    const seen = new Set();
    list.forEach((item) => {
      if (!item.id) warn(`A ${label} has no id (${item.name || "unnamed"}).`);
      else if (seen.has(item.id))
        warn(`Two ${label}s share the id "${item.id}". Ids must be unique.`);
      seen.add(item.id);
    });
  }
  checkUnique(categories, "category");
  checkUnique(frameColors, "frame colour");
  checkUnique(shops, "shop");
  checkUnique(products, "product");

  const shopIds = ids(shops);
  const categoryIds = ids(categories);
  const colorIds = ids(frameColors);
  const productIds = ids(products);

  products.forEach((p) => {
    if (!shopIds.has(p.shopId))
      warn(
        `Product "${p.id}" has shopId "${p.shopId}", but no shop has that id — it will not appear.`,
      );
    (p.categoryIds || [])
      .filter((id) => !categoryIds.has(id))
      .forEach((id) =>
        warn(`Product "${p.id}" uses unknown category "${id}".`),
      );
    (p.colors || [])
      .filter((id) => !colorIds.has(id))
      .forEach((id) =>
        warn(`Product "${p.id}" uses unknown frame colour "${id}".`),
      );
    if (typeof p.price !== "number")
      warn(`Product "${p.id}" needs a number for price (no quotes).`);
    const VIEW_TYPES = ["FRONT", "SIDE", "BACK", "CORNER", "DETAIL", "MATERIAL", "WALL_PREVIEW", "LIFESTYLE", "PACKAGING", "PHOTO"];
    (p.views || [])
      .filter((v) => !v || !v.url || !VIEW_TYPES.includes(v.type))
      .forEach(() => warn(`Product "${p.id}" has a view without a url or with an unknown type (use ${VIEW_TYPES.join(", ")}).`));
  });
  homepage.featuredProductIds
    .concat(homepage.recommendedProductIds)
    .filter((id) => !productIds.has(id))
    .forEach((id) => warn(`HOMEPAGE lists unknown product "${id}".`));
  homepage.categoryIds
    .filter((id) => !categoryIds.has(id))
    .forEach((id) => warn(`HOMEPAGE lists unknown category "${id}".`));
  homepage.featuredShopIds
    .filter((id) => !shopIds.has(id))
    .forEach((id) => warn(`HOMEPAGE lists unknown shop "${id}".`));

  FrameX.seed = FrameX.seed || {};
  FrameX.seed.homepage = homepage;
  FrameX.seed.frameColors = frameColors;

  // Home-page categories come first (kind "style" = large gallery cards), in the HOMEPAGE order.
  FrameX.seed.categories = categories.map((c, i) => {
    const home = rank(homepage.categoryIds, c.id);
    return Object.assign({}, c, {
      kind: home === null ? "occasion" : "style",
      sortOrder: home === null ? 1000 + i : home,
    });
  });

  FrameX.seed.shops = shops.map((shop) => {
    const { ownerName, ...publicFields } = shop; // contact person stays out of the page data
    const featured = rank(homepage.featuredShopIds, shop.id);
    return Object.assign({ slug: slugify(shop.name) }, publicFields, {
      isFeatured: featured !== null,
      featuredRank: featured,
    });
  });

  FrameX.seed.products = products.map((p) => {
    const sizes = p.sizes || [];
    const priced = sizes.length && typeof sizes[0] === "object";
    const featured = rank(homepage.featuredProductIds, p.id);
    const recommended = rank(homepage.recommendedProductIds, p.id);
    return Object.assign(
      {
        slug: slugify(p.name),
        description: "",
        categoryIds: [],
        images: [p.image],
        currency: "INR",
        discountPercent: 0,
        isAvailable: true,
        isVisible: true,
        isNew: false,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
      p,
      priced
        ? { sizeOptions: sizes, sizes: sizes.map((s) => s.label) }
        : { sizes },
      {
        isFeatured: featured !== null,
        featuredRank: featured,
        isRecommended: recommended !== null,
        recommendedRank: recommended,
      },
    );
  });
})((window.FrameX = window.FrameX || {}));
