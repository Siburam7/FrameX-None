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
      image: "assets/img/categories/style-classic.webp",
      isActive: true,
    },
    {
      id: "modern",
      name: "Modern Frames",
      image: "assets/img/categories/style-modern.webp",
      isActive: true,
    },
    {
      id: "wooden",
      name: "Wooden Frames",
      image: "assets/img/categories/style-wooden.webp",
      isActive: true,
    },
    {
      id: "luxury",
      name: "Luxury Frames",
      image: "assets/img/categories/style-luxury.webp",
      isActive: true,
    },
    {
      id: "minimal",
      name: "Minimal Frames",
      image: "assets/img/categories/style-minimal.webp",
      isActive: true,
    },
    {
      id: "decorative",
      name: "Decorative Frames",
      image: "assets/img/categories/style-decorative.webp",
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
    {
      id: "premium",
      name: "Premium Frames",
      image: "assets/img/products/imperial-gold.webp",
      isActive: true,
    },
    {
      id: "metal",
      name: "Metal Frames",
      image: "assets/img/products/urban-black.webp",
      isActive: true,
    },
    {
      id: "gallery-frames",
      name: "Gallery Frames",
      image: "assets/img/products/nordic-oak.webp",
      isActive: true,
    },
    {
      id: "collage",
      name: "Collage Frames",
      image: "assets/img/products/collage-set.webp",
      isActive: true,
    },
    {
      id: "floating",
      name: "Floating Frames",
      image: "assets/img/products/signature-frame.webp",
      isActive: true,
    },
    {
      id: "canvas",
      name: "Canvas",
      image: "assets/img/categories/wall-art.webp",
      isActive: true,
    },
    {
      id: "photo-prints",
      name: "Photo Prints",
      image: "assets/img/categories/photo-frames.webp",
      isActive: true,
    },
    {
      id: "custom",
      name: "Custom Frames",
      image: "assets/img/products/wedding-anniversary.webp",
      isActive: true,
    },
    {
      id: "personalized",
      name: "Personalized Frames",
      image: "assets/img/products/family-memory.webp",
      isActive: true,
    },

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

  /* ========================================================================
     3b. HOW A FRAME IS BUILT (reusable details)
     ------------------------------------------------------------------------
     What a frame is made of and what comes with it, so you don't retype it
     for every product. Use one in a product with:   build: BUILD.wood

     A build fills in: print (the paper), protection (the front cover), back
     (backing and hanging), included (what the customer receives) and care.
     A product can still set any of those itself: its own value wins.

     The product page shows all of it: in the specification table, in
     "What's included" and as the layers of "Frame Components".

     These are placeholders until each shop confirms its own materials.
     ======================================================================== */
  const CARE = [
    "Dust the frame with a soft, dry cloth",
    "Wipe the front with a slightly damp microfibre cloth; don't spray cleaner onto it",
    "Hang it away from direct sunlight, heat and damp walls",
  ];
  const PAPER = {
    materials: [
      {
        id: "pm1",
        type: "photo-paper",
        name: "Lustre Photo Paper",
        finish: "Lustre (low glare)",
        thickness: "260 gsm",
        priceModifier: 0,
      },
    ],
  };
  const ACRYLIC = {
    options: [
      {
        type: "acrylic",
        priceModifier: 0,
        description: "2 mm clear acrylic: lighter than glass and shatter-resistant",
      },
    ],
    default: "acrylic",
  };
  const GLASS = {
    options: [
      {
        type: "glass",
        priceModifier: 0,
        description: "2 mm clear float glass",
      },
    ],
    default: "glass",
  };
  const WALL_BACK = {
    backing: "MDF backing board",
    hanging: "Sawtooth hanger fitted on the back",
    mounting: "Turn clips hold the backing in place, so the print can be changed",
    stand: false,
  };
  const BUILD = {
    // A wooden wall frame: photo-paper print behind clear acrylic
    wood: {
      print: PAPER,
      protection: ACRYLIC,
      back: WALL_BACK,
      included: [
        "The frame, assembled",
        "Your photo, printed and fitted",
        "Hanging hook fitted on the back",
        "Protective packaging",
      ],
      care: CARE,
    },
    // The same, with a glass front (heavier, formal frames)
    woodGlass: {
      print: PAPER,
      protection: GLASS,
      back: WALL_BACK,
      included: [
        "The frame, assembled",
        "Your photo, printed and fitted",
        "Hanging hook fitted on the back",
        "Protective packaging with corner guards",
      ],
      care: CARE,
    },
    // A slim metal wall frame
    metal: {
      print: PAPER,
      protection: ACRYLIC,
      back: {
        backing: "MDF backing board",
        hanging: "Hanging hooks fitted on the back",
        mounting: "Spring clips hold the backing in place, so the print can be changed",
        stand: false,
      },
      included: [
        "The frame, assembled",
        "Your photo, printed and fitted",
        "Hanging hooks fitted on the back",
        "Protective packaging",
      ],
      care: CARE,
    },
    // A frame that stands on a table (it can hang too)
    tabletop: {
      print: PAPER,
      protection: ACRYLIC,
      back: {
        backing: "MDF backing board",
        hanging: "Wall hook on the back",
        mounting: "Turn clips hold the backing in place, so the print can be changed",
        stand: true,
        standType: "Fold-out easel back",
      },
      included: [
        "The frame, assembled",
        "Your photo, printed and fitted",
        "Fold-out stand and a wall hook on the back",
        "Protective packaging",
      ],
      care: CARE,
    },
    // A set of several frames: one photo for each
    set: {
      print: PAPER,
      protection: ACRYLIC,
      back: WALL_BACK,
      included: [
        "Every frame in the set, assembled",
        "Your photos, printed and fitted: one for each frame",
        "A hanging hook fitted on the back of each frame",
        "Protective packaging",
      ],
      care: CARE,
    },
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
      coverImage: "assets/img/shops/cover-stock-1.webp",
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
      coverImage: "assets/img/shops/cover-stock-2.webp",
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
      coverImage: "assets/img/shops/cover-stock-3.webp",
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
     productType      what the product is. Leave it out for a PHOTO FRAME: the
                      customer must then add their own photo before they can
                      add it to the cart or buy it (the shop prints that photo).
                        "photo-frame"   (the default) the customer's photo is required
                        "other"         an accessory: no photo is asked for
                      The full list (custom-frame, template, personalized, home-decor,
                      wall-art, multi-panel) is in assets/js/services/product-model.js.
     photos           how many photos the customer adds. Leave it out for 1.
                      A set of 4 frames needs photos: 4. When the sizes of a set hold
                      different numbers, put it on each size instead:
                        sizes: [{ id: "0", label: "Set of 5", priceDelta: 0, photos: 5 }, …]
     giftWrap         false = this product can't be gift wrapped (default: it can)
     build            a preset from section 3b (BUILD.wood, BUILD.woodGlass,
                      BUILD.metal, BUILD.tabletop, BUILD.set): the print, the
                      front cover, the back, what's included and care.
     look             which drawn "frame corner" and "back of the frame" pictures
                      to show after the product's own photo: "black", "white",
                      "oak", "walnut" or "gold". Leave it out to show none. They
                      are illustrations; when the shop sends real photos of the
                      corner and the back, list them in `views` instead.
     included         what the customer receives, one line each:
                        ["The frame", "Your photo, printed and fitted", "Hanging hook"]
                      (a build already gives a list; set this to use your own)
     care             care instructions, one line each (also part of a build)
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
                        finish  e.g. "Matte"
                        width   width of the moulding seen from the front, in mm
                        depth   how far the frame stands off the wall, in mm
                      Optional, only when the shop has told you: inside `frame`
                        type    "classic" | "modern" | "minimal" | "premium" | "wood" |
                                "metal" | "gallery" | "floating" | "canvas" | "collage"

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
     Prices, discounts, stock, materials and dimensions below are placeholders
     until each shop confirms its own.
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
        "A warm walnut-finish frame with a bold mat border, built for the portrait you want front and centre.\n\nThe moulding has a lightly carved profile with a satin finish, and a deep red mat sets the photo back from the frame so it reads from across the room. Your photo is printed on lustre photo paper and fitted behind clear acrylic, ready to hang.",
      build: BUILD.wood,
      look: "walnut",
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
        finish: "Satin",
        width: 26,
        depth: 20,
      },
    },
    {
      id: "p-002",
      shopId: "shop-001",
      name: "Classic Square",
      image: "assets/img/products/classic-square.webp",
      description:
        "A soft white-wash square frame that keeps the focus on the photo — a quiet, everyday favourite.\n\nThe wide profile shows the wood grain through a matte white-wash, and a broad white mat gives a small photo room to breathe. It suits a single square picture on a shelf wall, or a grid of several.",
      build: BUILD.wood,
      look: "white",
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
        finish: "Matte white-wash",
        width: 44,
        depth: 22,
      },
    },
    {
      id: "p-003",
      shopId: "shop-001",
      name: "Grand Frame",
      image: "assets/img/products/grand-frame.webp",
      description:
        "A substantial solid-wood frame with real presence — suited to a headboard wall or a wedding portrait.\n\nThe deep, wide moulding is finished in a natural satin stain, with a wide white mat that lets a large print sit comfortably inside it. A glass front keeps the print flat and is easy to wipe clean.",
      build: BUILD.woodGlass,
      look: "walnut",
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
        finish: "Natural satin",
        width: 48,
        depth: 28,
      },
    },
    {
      id: "p-004",
      shopId: "shop-001",
      name: "Signature Frame",
      image: "assets/img/products/signature-frame.webp",
      description:
        "A slim dark-wood frame with clean lines, equally at home on a desk or a gallery wall.\n\nA narrow white mat lifts the photo off the dark moulding without taking attention from it. The straight, square-edged profile lines up neatly when several are hung side by side.",
      build: BUILD.wood,
      look: "black",
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
        finish: "Matte",
        width: 30,
        depth: 20,
      },
    },
    {
      id: "p-011",
      shopId: "shop-001",
      name: "Personalized Family Memory Wooden Photo Frame",
      image: "assets/img/products/family-memory-photo.webp",
      description:
        "A warm wooden frame for the family photo that lives on the table, the shelf or the desk.\n\nIt stands on a fold-out easel back, so there is nothing to drill, and it can also hang from the hook on the back. Your photo is printed on lustre photo paper and fitted behind clear acrylic.",
      build: BUILD.tabletop,
      categoryIds: [
        "photo-frames",
        "family",
        "gifts",
        "wooden",
        "classic",
        "personalized",
      ],
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
      image: "assets/img/products/wedding-anniversary-photo.webp",
      description:
        "A wall frame for the wedding or anniversary photo you want to see every day.\n\nA slim, dark moulding with a white mat keeps the look formal and lets the photo carry the colour. It is made in three large sizes, so it can hang on its own or as the centre of a gallery wall.",
      build: BUILD.wood,
      look: "black",
      categoryIds: [
        "photo-frames",
        "wedding",
        "gifts",
        "luxury",
        "classic",
        "custom",
      ],
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
        "An arched silhouette with an ornate mat — a frame built for a moment worth dressing up.\n\nThe photo sits in an arch-cut mat inside a carved moulding with a fine inner line and a small crest. It hangs upright: choose a photo with the subject near the centre, because the arch trims the top corners.",
      build: BUILD.wood,
      look: "gold",
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
        finish: "Antique",
        width: 28,
        depth: 22,
      },
    },
    {
      id: "p-006",
      shopId: "shop-002",
      name: "Midnight Luxe",
      image: "assets/img/products/midnight-luxe.webp",
      description:
        "A deep matte-black frame for black-and-white portraits and moody, low-light photos.\n\nThere is no mat: the print runs to the inner edge of a thin, flat moulding, so the photo fills the frame. The matte finish keeps reflections off the frame itself.",
      build: BUILD.wood,
      look: "black",
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
        finish: "Matte",
        width: 22,
        depth: 20,
      },
    },
    {
      id: "p-007",
      shopId: "shop-002",
      name: "Imperial Gold",
      image: "assets/img/products/imperial-gold.webp",
      description:
        "A gold-finish statement frame with a wide profile, made to anchor a gallery wall.\n\nThe carved moulding is finished in antique gold and paired with a wide cream mat, which softens the gold against the photo. A glass front suits the weight and formality of the frame.",
      build: BUILD.woodGlass,
      look: "gold",
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
        finish: "Antique gold",
        width: 50,
        depth: 30,
      },
    },
    {
      id: "p-008",
      shopId: "shop-002",
      name: "Vintage Legacy",
      image: "assets/img/products/vintage-legacy.webp",
      description:
        "An antique-finish frame with a weathered edge, for photos that feel like they've always been there.\n\nA carved moulding with a fine inner line and a cream mat gives old family portraits and restored photographs a period setting. The finish is deliberately uneven, so each frame looks slightly different.",
      build: BUILD.wood,
      look: "walnut",
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
        finish: "Antique, hand-distressed",
        width: 35,
        depth: 25,
      },
    },
    {
      id: "p-013",
      shopId: "shop-002",
      name: "Multi-Photo Collage Wall Display Frame Set",
      image: "assets/img/products/collage-set-photo.webp",
      description:
        "A collage display for a wall of memories: five or nine of your photos, framed and hung together as one set.\n\nEvery piece has the same slim moulding and white mat, so mixed photos read as a group. You add one photo for each space when you order, and the set arrives printed, fitted and ready to hang.",
      build: BUILD.set,
      look: "black",
      categoryIds: [
        "photo-frames",
        "wall-art",
        "family",
        "decorative",
        "modern",
        "collage",
      ],
      price: 1099,
      discountPercent: 40,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      material: "Wood",
      // One photo for every frame in the set.
      sizes: [
        { id: "0", label: "Set of 5", priceDelta: 0, photos: 5 },
        { id: "1", label: "Set of 9", priceDelta: 0, photos: 9 },
      ],
    },

    // ---------------- Photo Frame Shop C (shop-003) ----------------
    {
      id: "p-009",
      shopId: "shop-003",
      name: "Nordic Oak Frame",
      image: "assets/img/products/nordic-oak.webp",
      description:
        "A pale oak frame with a thin, modern profile — minimal enough to hang in a row.\n\nThe natural finish shows the grain and stays light on the wall. A narrow white mat separates the photo from the wood, and the slim moulding keeps the whole frame close to the wall.",
      build: BUILD.wood,
      look: "oak",
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
        finish: "Natural matte",
        width: 20,
        depth: 22,
      },
    },
    {
      id: "p-010",
      shopId: "shop-003",
      name: "Urban Black",
      image: "assets/img/products/urban-black.webp",
      description:
        "A slim black metal frame with a contemporary edge, built for a clean, gallery-style hang.\n\nThe narrow metal profile holds a white mat and your print behind clear acrylic. The corners are joined square, so frames of different sizes line up crisply on the same wall.",
      build: BUILD.metal,
      look: "black",
      categoryIds: [
        "photo-frames",
        "new-arrivals",
        "wall-art",
        "modern",
        "minimal",
        "metal",
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
        finish: "Matte powder coat",
        width: 12,
        depth: 20,
      },
    },
    {
      id: "p-014",
      shopId: "shop-003",
      name: "Luxury HD Printed Personalized Picture Frame",
      image: "assets/img/products/luxury-hd-photo.webp",
      description:
        "A large wooden frame for the picture that deserves a wall of its own, with your photo printed at the size you choose.\n\nThe print is made on lustre photo paper and fitted behind clear acrylic. Three large sizes are available: choose a high-resolution photo so it holds up at that size.",
      build: BUILD.wood,
      categoryIds: [
        "photo-frames",
        "new-arrivals",
        "wall-art",
        "luxury",
        "personalized",
      ],
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
      image: "assets/img/products/modern-wooden-photo.webp",
      description:
        "A small wooden wall frame with a clean, modern profile: easy to hang alone, better in a group.\n\nThe narrow moulding and white mat suit small prints, and the three sizes are made to mix on one wall. Each frame holds one of your photos, printed and fitted behind clear acrylic.",
      build: BUILD.wood,
      look: "walnut",
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
      description:
        "Four matching white frames in A4, for four of your photos hung as a set.\n\nThe frames have a lightly textured white finish over MDF, each with a white mat. You add four photos when you order (one for each frame), and the set arrives printed, fitted and ready to hang in a row or two by two.",
      build: BUILD.set,
      // Drawn pictures (tools/decor/frames.mjs), until the shop sends its own photos.
      views: [
        {
          type: "WALL_PREVIEW",
          url: "assets/img/products/white-texture-set.webp",
          alt: "Four white A4 frames on a wall, each with a sample picture",
        },
        {
          type: "LIFESTYLE",
          url: "assets/img/products/white-texture-set-room.webp",
          alt: "The set of four above a sofa, for scale",
        },
        {
          type: "CORNER",
          url: "assets/img/decor/_corner-white.webp",
          alt: "Frame corner, close up (illustration)",
        },
        {
          type: "BACK",
          url: "assets/img/decor/_back-white.webp",
          alt: "Back of a frame with its hanger (illustration)",
        },
      ],
      categoryIds: ["photo-frames", "new-arrivals", "minimal", "modern"],
      price: 649,
      discountPercent: 10,
      stock: 20,
      isAvailable: true,
      isVisible: true,
      isNew: true,
      material: "Textured MDF",
      sizes: ["A4"],
      photos: 4, // one for each of the four frames
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
      productType: "other", // an accessory: no photo is needed to order it
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
    //   build: BUILD.wood,
    //   look: "walnut",
    //   frame: { shape: "rectangle", style: "grain", borderWidth: "medium", matColor: "white", matWidth: "thin", finish: "Matte", width: 30, depth: 20 }
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
     recommendedProductIds  "Highly recommended frames" (shown in this order; 8 fill two lines of four on a laptop)
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
    recommendedProductIds: ["p-011", "p-012", "p-013", "p-014", "p-015", "p-007", "p-009", "p-008"],
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

  // The drawn "frame corner" and "back of the frame" pictures (assets/img/decor/_corner-*.webp, _back-*.webp).
  const LOOKS = ["black", "white", "oak", "walnut", "gold"];

  /** A product with its `build` preset filled in (its own fields win) and its drawn corner / back views. */
  function withBuild(p) {
    const { build, look, ...own } = p;
    const out = Object.assign({}, build && typeof build === "object" ? build : {}, own);
    if (look && LOOKS.includes(look) && !out.views) {
      const photos = out.images && out.images.length ? out.images : [out.image];
      out.views = photos
        .map((url) => ({ type: "PHOTO", url, alt: out.name }))
        .concat([
          {
            type: "CORNER",
            url: `assets/img/decor/_corner-${look}.webp`,
            alt: "Frame corner, close up (illustration)",
          },
          {
            type: "BACK",
            url: `assets/img/decor/_back-${look}.webp`,
            alt: "Back of the frame with its hanger (illustration)",
          },
        ]);
    }
    return out;
  }

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
    if ("build" in p && (!p.build || typeof p.build !== "object"))
      warn(
        `Product "${p.id}" has a build that isn't in section 3b (use BUILD.wood, BUILD.woodGlass, BUILD.metal, BUILD.tabletop or BUILD.set).`,
      );
    if (p.look && !LOOKS.includes(p.look))
      warn(
        `Product "${p.id}" has look "${p.look}". Use one of: ${LOOKS.join(", ")}.`,
      );
    const VIEW_TYPES = [
      "FRONT",
      "SIDE",
      "BACK",
      "CORNER",
      "DETAIL",
      "MATERIAL",
      "WALL_PREVIEW",
      "LIFESTYLE",
      "PACKAGING",
      "PHOTO",
    ];
    (p.views || [])
      .filter((v) => !v || !v.url || !VIEW_TYPES.includes(v.type))
      .forEach(() =>
        warn(
          `Product "${p.id}" has a view without a url or with an unknown type (use ${VIEW_TYPES.join(", ")}).`,
        ),
      );
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

  FrameX.seed.products = products.map(withBuild).map((p) => {
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
