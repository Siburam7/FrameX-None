/* ==========================================================================
   Product model: ONE flexible product schema for every local shop.

   Shops sell very different things (wood frame + matte print, metal frame +
   glossy print + acrylic, canvas on a stretcher, a magnetic mount...). The UI
   never assumes a field exists: every section is built from whatever the shop
   actually entered, and is left out when there is nothing to show.

   Product (schema 2)
   {
     schema: 2, id, slug, name, description, category, categoryIds[], tags[],
     shopId, status: "draft" | "pending_review" | "published" | "unpublished",
     productType:  what is sold (PRODUCT_TYPES): photo-frame, custom-frame, template,
                   personalized, home-decor, wall-art, multi-panel, other
     personalization: { photos, panels }   how many photos the customer adds (within what
                   the type allows) and, for a multi-panel set, how many frames
     giftWrap:     false = this product can't be gift wrapped
     included[]:   what the customer receives ("Frame", "Your photo, printed and fitted", ...)
     care[]:       care instructions, one per line
     pricing:      { basePrice, currency, discountPercent },
     frame:        { type, material, color, colors[], finish, width, depth, weight, shape },
                   width / depth in millimetres. `type` is a FrameX Studio frame
                   type id (classic, modern, wood, metal...) or canvas / collage / none / other.
     print:        { materials: [PrintMaterial], quality, notes }
     protection:   { options: [{ type: "none"|"acrylic"|"glass", priceModifier, description }], default }
     back:         { backing, hanging, stand, standType, mounting, notes }
     border:       { available, colors[], widths[] }            Studio option ids
     mat:          { available, included, colors[], widths[], double, priceModifier }
     sizes:        [{ id, label, width, height, unit: "in"|"cm", price }]
     orientations: ["portrait" | "landscape" | "square"]
     customization:{ photoUpload, crop, frameColor, border, mat, text, textLabel, orientation }
     views:        [{ id, type, url, thumb, alt, sortOrder, isMain }]      see VIEW_TYPES
     product360:   { frames: [url], thumbs?: [url] } | null
     media:        [{ id, kind: "video", url, thumbnail, duration }]
     components:   [{ id, type, name, material, description, image }]
     specifications:[{ label, value }]                           free extra rows
     quality:      { items: { frameQuality, printQuality, ... }, source: "shop_claimed",
                     verification: { status: "not_verified" | "framex_verified", verifiedAt?, verifiedBy? } }
     availability: { status: "in_stock"|"made_to_order"|"out_of_stock", stock, leadTime,
                     pickup, delivery, deliveryNotes }
     seo:          { title, description }
     rating?, reviews?                                           only when real data exists
     createdAt, updatedAt, publishedAt
   }
   PrintMaterial = { id, type, name, description, finish, thickness, quality, image, priceModifier }

   normalize() also accepts the older product shape in js/edit.js and returns
   the same model, plus the "listing" fields cards, cart and filters already
   use (image, price, sizeOptions, colors, material, stock...).

   Shop-entered quality information is always "shop_claimed". Only the
   FrameX system may set verification to "framex_verified"; shop saves reset it.
   ========================================================================== */
(function (FrameX) {
  const SCHEMA = 2;
  const FALLBACK_IMAGE = "assets/img/ui/frame-decor.webp";
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const studio = () => (FrameX.seed && FrameX.seed.studio) || null;
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const num = (v) =>
    v === "" || v === null || v === undefined || isNaN(Number(v))
      ? null
      : Number(v);
  const byId = (list, id) => (list || []).find((x) => x.id === id) || null;
  const slugify = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

  /* ---------------------------------------------------------------- Vocabularies */
  const VIEW_TYPES = [
    { id: "FRONT", label: "Front view", short: "Front" },
    { id: "SIDE", label: "Side view", short: "Side" },
    { id: "BACK", label: "Back view", short: "Back" },
    { id: "CORNER", label: "Frame corner", short: "Corner" },
    { id: "DETAIL", label: "Close-up", short: "Close-up" },
    { id: "MATERIAL", label: "Material detail", short: "Material" },
    { id: "WALL_PREVIEW", label: "On the wall", short: "On the wall" },
    { id: "LIFESTYLE", label: "In a room", short: "Lifestyle" },
    { id: "PACKAGING", label: "Packaging", short: "Packaging" },
    { id: "PHOTO", label: "Product photo", short: "Photo" }, // a photo the shop didn't label
  ];
  const VIEW_ORDER = VIEW_TYPES.reduce((m, t, i) => ((m[t.id] = i), m), {});
  const viewType = (id) => byId(VIEW_TYPES, id) || byId(VIEW_TYPES, "PHOTO");

  const STATUS = {
    draft: { label: "Draft", tone: "muted" },
    pending_review: { label: "Pending review", tone: "warn" },
    published: { label: "Published", tone: "ok" },
    unpublished: { label: "Unpublished", tone: "muted" },
  };

  // Frame types the Studio does not draw (they are still valid products).
  const EXTRA_FRAME_TYPES = [
    { id: "canvas", name: "Canvas (stretched, no moulding)", studio: "none" },
    { id: "none", name: "No frame (print only)", studio: "none" },
    { id: "collage", name: "Collage / multi-photo frame", studio: null },
    { id: "other", name: "Other", studio: null },
  ];
  // "Premium" in the Studio catalogue is a moulding style, not a quality claim.
  const TYPE_NAMES = { premium: "Ornate (carved)" };
  function frameTypes() {
    const s = studio();
    const own = s
      ? s.FRAME_TYPES.filter((t) => t.available !== false).map((t) => ({
          id: t.id,
          name: TYPE_NAMES[t.id] || t.name,
          studio: t.id,
        }))
      : [];
    return own.concat(EXTRA_FRAME_TYPES);
  }
  const frameTypeName = (id) =>
    (byId(frameTypes(), id) || { name: id || "" }).name;

  const PRINT_MATERIAL_TYPES = [
    { id: "photo-paper", name: "Photo Paper" },
    { id: "premium-photo-paper", name: "Premium Photo Paper" },
    { id: "matte-paper", name: "Matte Paper" },
    { id: "glossy-paper", name: "Glossy Paper" },
    { id: "fine-art-paper", name: "Fine Art Paper" },
    { id: "canvas", name: "Canvas" },
    { id: "other", name: "Other" },
  ];

  const PROTECTION_TYPES = [
    { id: "none", name: "No cover", short: "Open front" },
    { id: "acrylic", name: "Acrylic", short: "Acrylic sheet" },
    { id: "glass", name: "Glass", short: "Glass" },
  ];

  const COMPONENT_TYPES = [
    { id: "frame", name: "Outer Frame" },
    { id: "glass", name: "Glass" },
    { id: "acrylic", name: "Acrylic" },
    { id: "mat", name: "Mat" },
    { id: "border", name: "Inner Border" },
    { id: "print", name: "Photo Print" },
    { id: "backing", name: "Backing" },
    { id: "hardware", name: "Hanging Hardware" },
    { id: "stand", name: "Stand" },
    { id: "other", name: "Other part" },
  ];
  // Physical order, front to back (used by the exploded breakdown).
  const COMPONENT_DEPTH = {
    frame: 0,
    glass: 1,
    acrylic: 1,
    mat: 2,
    border: 3,
    print: 4,
    backing: 5,
    stand: 6,
    hardware: 6,
    other: 7,
  };

  const QUALITY_FIELDS = [
    { id: "frameQuality", label: "Frame quality" },
    { id: "printQuality", label: "Print quality" },
    { id: "materialQuality", label: "Material quality" },
    { id: "finishQuality", label: "Finish quality" },
    { id: "colorQuality", label: "Colour quality" },
    { id: "durability", label: "Durability" },
  ];

  const CUSTOMIZATION_OPTIONS = [
    {
      id: "photoUpload",
      label: "Design in FrameX Studio",
      hint: "Customers can also build it in FrameX Studio around their photo, with a live preview",
    },
    {
      id: "crop",
      label: "Crop & position",
      hint: "Customers can zoom, drag and rotate their photo",
    },
    {
      id: "frameColor",
      label: "Frame colour",
      hint: "Customers choose between the frame colours you offer",
    },
    {
      id: "border",
      label: "Printed border",
      hint: "A printed margin around the photo",
    },
    { id: "mat", label: "Mat", hint: "A card mount between frame and print" },
    {
      id: "text",
      label: "Text",
      hint: "A short caption printed under the photo",
    },
    {
      id: "orientation",
      label: "Orientation",
      hint: "Portrait or landscape, from the orientations you offer",
    },
  ];

  /* What a shop sells, and what FrameX requires of each kind.
     A shop chooses the type and, where the type allows a choice, how many
     photos the customer adds. The rules themselves (which types need the
     customer's photo, and the limits) belong to the platform: the backend loads
     this same file and applies them again, so no shop setting can switch them off.
       photos   min / max the customer must add, and the number a new product starts with
       frame    true = frame details (type, material) are part of the product
       panels   multi-panel sets: how many frames a set may have */
  const PRODUCT_TYPES = [
    {
      id: "photo-frame",
      name: "Photo Frame",
      summary: "A frame delivered with the customer's own photo printed and fitted.",
      photos: { min: 1, max: 12, initial: 1 },
      frame: true,
    },
    {
      id: "custom-frame",
      name: "Custom Frame",
      summary: "Customers build it in FrameX Studio around their photo: crop, colour, border and mat.",
      photos: { min: 1, max: 1, initial: 1 },
      frame: true,
      studio: true,
    },
    {
      id: "template",
      name: "Template-based Product",
      summary: "A fixed design with several photo spaces. The customer adds one photo for each space.",
      photos: { min: 2, max: 12, initial: 3 },
      frame: true,
    },
    {
      id: "personalized",
      name: "Personalized Product",
      summary: "Made from the customer's photo: a printed gift, a keepsake, a photo print.",
      photos: { min: 1, max: 12, initial: 1 },
      frame: false,
    },
    {
      id: "home-decor",
      name: "Home Decor",
      summary: "A ready-made piece for the home. The customer uploads nothing.",
      photos: { min: 0, max: 0, initial: 0 },
      frame: false,
    },
    {
      id: "wall-art",
      name: "Wall Art",
      summary: "Ready-made framed art or prints. The customer uploads nothing.",
      photos: { min: 0, max: 0, initial: 0 },
      frame: true,
    },
    {
      id: "multi-panel",
      name: "Multi-Panel Set",
      summary: "One design across 2 to 5 frames: ready-made, or with one customer photo per frame.",
      photos: { min: 0, max: 5, initial: 0 },
      frame: true,
      panels: { min: 2, max: 5 },
    },
    {
      id: "other",
      name: "Other",
      summary: "Accessories and anything else: stands, hooks, mounts.",
      photos: { min: 0, max: 0, initial: 0 },
      frame: false,
    },
    // An artist's finished work (Art & Artists). Artists list it from their own dashboard and FrameX
    // approves it; a shop can't choose this type.
    {
      id: "artwork",
      name: "Artwork",
      summary: "An artist's finished work. The customer uploads nothing.",
      photos: { min: 0, max: 0, initial: 0 },
      frame: false,
      artistOnly: true,
    },
  ];

  /* The words customers read about their photo. One place, used by every page and by the backend. */
  const PHOTO_TEXT = {
    quality:
      "Your uploaded image will be printed in the same original quality you provide. We do not artificially enhance or improve the image quality. For the best print result, please upload a high-quality image.",
    missingOne:
      "Please upload your photo to continue. Your photo is required to create this personalized frame.",
    missingMany: (count) =>
      `Please upload all ${count} required photos to continue.`,
    unsupported: "Please upload a supported image format.",
    failed: "We couldn't upload your image. Please try again.",
  };

  const ORIENTATIONS = [
    { id: "portrait", name: "Portrait" },
    { id: "landscape", name: "Landscape" },
    { id: "square", name: "Square" },
  ];

  const AVAILABILITY = [
    { id: "in_stock", name: "In stock" },
    { id: "made_to_order", name: "Made to order" },
    { id: "out_of_stock", name: "Out of stock" },
  ];

  /** Words a shop may not use about its own product (they imply FrameX checked it). */
  const FORBIDDEN_CLAIMS = [
    {
      re: /frame\s*x[\s-]*(verified|approved|certified|recommended)/i,
      text: "FrameX Verified / Approved",
    },
    { re: /verified\s+by\s+frame\s*x/i, text: "Verified by FrameX" },
    { re: /\bcertified\b/i, text: "Certified" },
    { re: /\bbest[\s-]+quality\b/i, text: "Best Quality" },
  ];

  /* ---------------------------------------------------------------- Colours (frame / mat / border) */
  function palette() {
    const out = {};
    ((studio() && studio().COLORS) || []).forEach((c) => (out[c.id] = c));
    ((FrameX.seed && FrameX.seed.frameColors) || []).forEach(
      (c) => (out[c.id] = Object.assign({}, out[c.id] || {}, c)),
    );
    return out;
  }
  const colorName = (id) => (palette()[id] || { name: id }).name;
  const matColors = () => (studio() ? studio().MAT.colors : []);
  const matWidths = () => (studio() ? studio().MAT.widths : []);
  const borderColors = () => (studio() ? studio().BORDER.colors : []);
  const borderWidths = () =>
    studio() ? studio().BORDER.presets.filter((p) => p.width > 0) : [];

  /* ---------------------------------------------------------------- Sizes */
  const TO_INCHES = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4 };
  const trimNum = (n) => String(Math.round(n * 100) / 100);
  function sizeDims(s) {
    if (!(s && s.width > 0 && s.height > 0)) return "";
    return `${trimNum(s.width)} × ${trimNum(s.height)} ${s.unit || "in"}`;
  }
  function parseDims(text) {
    const m = /([\d.]+)\s*[×x]\s*([\d.]+)\s*(in|cm|mm)?/i.exec(text || "");
    return m
      ? {
          width: Number(m[1]),
          height: Number(m[2]),
          unit: (m[3] || "in").toLowerCase(),
        }
      : { width: null, height: null, unit: "in" };
  }
  function sizeInches(s) {
    if (!(s && s.width > 0 && s.height > 0)) return null;
    const k = TO_INCHES[s.unit] || 1;
    return {
      w: Math.round(s.width * k * 10) / 10,
      h: Math.round(s.height * k * 10) / 10,
    };
  }

  /* ---------------------------------------------------------------- Empty product */
  const newId = (prefix = "lp") =>
    `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function emptyProduct(shopId) {
    const now = new Date().toISOString();
    return {
      schema: SCHEMA,
      id: newId(),
      slug: "",
      name: "",
      description: "",
      category: "",
      categoryIds: [],
      tags: [],
      shopId: shopId || null,
      status: "draft",
      productType: "",
      personalization: { photos: null, panels: null },
      giftWrap: true,
      included: [],
      care: [],
      pricing: {
        basePrice: null,
        currency: (FrameX.config && FrameX.config.currency) || "INR",
        discountPercent: 0,
      },
      frame: {
        type: "",
        material: "",
        color: "",
        colors: [],
        finish: "",
        width: null,
        depth: null,
        weight: "",
        shape: "rectangle",
      },
      print: { materials: [], quality: "", notes: "" },
      protection: { options: [], default: "" },
      back: {
        backing: "",
        hanging: "",
        stand: false,
        standType: "",
        mounting: "",
        notes: "",
      },
      border: { available: false, colors: [], widths: [] },
      mat: {
        available: false,
        included: false,
        colors: [],
        widths: [],
        double: false,
        priceModifier: null,
      },
      sizes: [],
      orientations: ["portrait"],
      customization: {
        photoUpload: false,
        crop: false,
        frameColor: false,
        border: false,
        mat: false,
        text: false,
        textLabel: "",
        orientation: false,
      },
      views: [],
      product360: null,
      media: [],
      components: [],
      specifications: [],
      quality: {
        items: {},
        source: "shop_claimed",
        verification: { status: "not_verified" },
      },
      availability: {
        status: "in_stock",
        stock: null,
        leadTime: "",
        pickup: true,
        delivery: false,
        deliveryNotes: "",
      },
      seo: { title: "", description: "" },
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };
  }

  /** Fill any missing branch of a schema-2 product (older drafts, partial API data). */
  function fillDefaults(p) {
    const base = emptyProduct(p.shopId);
    const out = Object.assign({}, base, p);
    [
      "pricing",
      "frame",
      "print",
      "protection",
      "back",
      "border",
      "mat",
      "customization",
      "quality",
      "availability",
      "seo",
      "personalization",
    ].forEach((k) => (out[k] = Object.assign({}, base[k], p[k] || {})));
    out.giftWrap = p.giftWrap !== false;
    [
      "included",
      "care",
      "categoryIds",
      "tags",
      "sizes",
      "orientations",
      "views",
      "media",
      "components",
      "specifications",
    ].forEach((k) => (out[k] = Array.isArray(p[k]) ? p[k] : base[k]));
    out.print.materials = Array.isArray(out.print.materials)
      ? out.print.materials
      : [];
    out.protection.options = Array.isArray(out.protection.options)
      ? out.protection.options
      : [];
    out.frame.colors = Array.isArray(out.frame.colors) ? out.frame.colors : [];
    out.quality.items = out.quality.items || {};
    out.quality.verification = out.quality.verification || {
      status: "not_verified",
    };
    if (!out.categoryIds.length && out.category)
      out.categoryIds = [out.category];
    if (out.category && !out.categoryIds.includes(out.category))
      out.categoryIds.unshift(out.category);
    out.category = out.category || out.categoryIds[0] || "";
    out.slug = out.slug || slugify(out.name);
    return out;
  }

  /* ---------------------------------------------------------------- Older js/edit.js products */
  function fromLegacy(raw) {
    const p = clone(raw);
    const f = raw.frame || null;
    const opts = FrameX.pricing ? FrameX.pricing.sizeOptions(raw) : [];
    const shape = f ? f.shape || "rectangle" : "rectangle";
    const out = emptyProduct(raw.shopId);
    Object.assign(out, {
      id: raw.id,
      slug: raw.slug || slugify(raw.name),
      name: raw.name,
      description: raw.description || "",
      category: (raw.categoryIds || [])[0] || "",
      categoryIds: raw.categoryIds || [],
      tags: raw.tags || [],
      status: raw.isVisible === false ? "unpublished" : "published",
      createdAt: raw.createdAt || out.createdAt,
      updatedAt: raw.updatedAt || out.updatedAt,
      publishedAt: raw.createdAt || null,
    });
    out.pricing = {
      basePrice: Number(raw.price) || 0,
      currency: raw.currency || "INR",
      discountPercent: Number(raw.discountPercent) || 0,
    };
    // What the catalogue file says about the customer's photo (see js/edit.js).
    out.productType = raw.productType || "";
    out.personalization = { photos: num(raw.photos), panels: null };
    out.giftWrap = raw.giftWrap !== false;
    out.included = Array.isArray(raw.included) ? raw.included : [];
    out.care = Array.isArray(raw.care) ? raw.care : [];
    // Only what the data actually says. `type` stays empty unless edit.js names it;
    // the Studio still gets a matching moulding through studioType.
    out.frame = Object.assign({}, f || {}, {
      type: (f && f.type) || "",
      studioType: f
        ? f.type ||
          (f.style === "ornate"
            ? "premium"
            : f.style === "grain"
              ? "wood"
              : "modern")
        : "",
      material: (f && f.material) || raw.material || "",
      colors: raw.colors || [],
      color: (f && f.color) || (raw.colors || [])[0] || "",
      finish: (f && f.finish) || "",
      width: f ? num(f.width) : null,
      depth: f ? num(f.depth) : null,
      weight: (f && f.weight) || "",
      shape,
    });
    out.sizes = opts.map((o) => {
      const d = parseDims(o.dimensions);
      return {
        id: o.id,
        label: o.label,
        width: d.width,
        height: d.height,
        unit: d.unit,
        price: (Number(raw.price) || 0) + (Number(o.priceDelta) || 0),
        // A set sold in several sizes can need a different number of photos per size.
        ...(num(o.photos) !== null ? { photos: num(o.photos) } : {}),
      };
    });
    out.orientations =
      raw.orientations ||
      (!f ? [] : shape === "square" ? ["square"] : ["portrait", "landscape"]);
    const hasMat = Boolean(f && f.matColor && f.matColor !== "none");
    // Older frames could already be opened in the Studio with every mat / border option.
    out.mat = {
      available: Boolean(f),
      included: hasMat ? (f.double ? "double" : "single") : false,
      colors: null,
      widths: null,
      double: true,
      priceModifier: null,
      legacyColor: hasMat ? f.matColor : null,
    };
    out.border = { available: Boolean(f), colors: null, widths: null };
    out.protection = raw.protection || { options: [], default: "" };
    const canStudio = Boolean(f) && shape !== "arch";
    out.customization = Object.assign(
      {
        photoUpload: canStudio,
        crop: canStudio,
        frameColor: canStudio && (raw.colors || []).length > 1,
        border: canStudio,
        mat: canStudio,
        text: false,
        textLabel: "",
        orientation: canStudio && shape !== "square",
      },
      raw.customization || {},
    );
    const images = raw.images && raw.images.length ? raw.images : [raw.image];
    out.views = (
      raw.views && raw.views.length
        ? raw.views
        : images.map((url, i) => ({ type: "PHOTO", url }))
    ).map((v, i) =>
      Object.assign(
        { id: "v" + i, alt: raw.name, sortOrder: i, isMain: i === 0 },
        v,
      ),
    );
    [
      "product360",
      "media",
      "components",
      "specifications",
      "print",
      "back",
      "quality",
      "rating",
      "reviews",
    ].forEach((k) => raw[k] && (out[k] = clone(raw[k])));
    out.availability = {
      status:
        raw.isAvailable === false || raw.stock === 0
          ? "out_of_stock"
          : "in_stock",
      stock: typeof raw.stock === "number" ? raw.stock : null,
      leadTime: "",
      pickup: null, // null = follow the shop's own pickup / delivery options
      delivery: null,
      deliveryNotes: "",
    };
    // Keep every original field too: cards and older code read them.
    return fillDefaults(Object.assign(p, out, { legacy: true }));
  }

  /* ---------------------------------------------------------------- Listing fields (cards, cart, filters) */
  function sortedViews(p) {
    return (p.views || [])
      .filter((v) => v && v.url)
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.isMain)) - Number(Boolean(a.isMain)) ||
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          (VIEW_ORDER[a.type] ?? 99) - (VIEW_ORDER[b.type] ?? 99),
      );
  }
  const mainView = (p) => sortedViews(p)[0] || null;

  function defaultSizeId(p) {
    const s = p.sizes || [];
    const m =
      byId(s, "m") ||
      s.find((x) => num(x.price) === num(p.pricing.basePrice)) ||
      s[0];
    return m ? m.id : null;
  }

  function listingFields(p) {
    if (p.legacy)
      return {
        customizable: studioSupport(p).ok,
        photosRequired: photoRequirement(p).count,
      };
    const base = num(p.pricing.basePrice) || 0;
    const pal = palette();
    const views = sortedViews(p);
    const mainUrl = views[0] ? views[0].url : "";
    const firstPaint = /^media:/.test(mainUrl)
      ? p.listingImage || FALLBACK_IMAGE
      : mainUrl || FALLBACK_IMAGE;
    const colors = (
      p.frame.colors && p.frame.colors.length
        ? p.frame.colors
        : p.frame.color
          ? [p.frame.color]
          : []
    ).filter((id) => pal[id]);
    const stock = num(p.availability.stock);
    const created = Date.parse(p.publishedAt || p.createdAt) || 0;
    return {
      image: p.listingImage || firstPaint,
      images: views.map((v) => v.url),
      price: base,
      currency: p.pricing.currency || "INR",
      discountPercent: Math.min(
        90,
        Math.max(0, num(p.pricing.discountPercent) || 0),
      ),
      sizeOptions: (p.sizes || []).map((s) => ({
        id: s.id,
        label: s.label || sizeDims(s),
        dimensions: sizeDims(s) || null,
        priceDelta: (num(s.price) ?? base) - base,
      })),
      colors:
        colors.length > 1 && p.customization.frameColor === false
          ? [colors[0]]
          : colors,
      material: p.frame.material || "",
      stock: p.availability.status === "out_of_stock" ? 0 : stock,
      isAvailable: p.availability.status !== "out_of_stock",
      isVisible: p.status === "published",
      isNew: created > 0 && Date.now() - created < 30 * 86400000,
      customizable: studioSupport(p).ok,
      photosRequired: photoRequirement(p).count,
    };
  }

  /** Any product shape in, one complete model (plus listing fields) out. */
  function normalize(raw) {
    if (!raw) return null;
    // Already-normalized products (schema 2, or converted older ones) only get their gaps filled.
    const p =
      raw.schema === SCHEMA || raw.legacy
        ? fillDefaults(clone(raw))
        : fromLegacy(raw);
    return Object.assign(p, listingFields(p));
  }

  /* ---------------------------------------------------------------- Product type + the customer's photo
     ONE definition of "does this product need the customer's photo, and how
     many". The product page, FrameX Studio, the shop dashboard and the backend
     (cart, Buy Now, checkout) all ask photoRequirement(). */
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /** The product's type. Older catalogue entries without one are photo frames; wall art says so itself. */
  function productTypeOf(p) {
    const named = byId(PRODUCT_TYPES, p && p.productType);
    if (named) return named;
    if (p && p.decor)
      return byId(
        PRODUCT_TYPES,
        p.decor.panelCount > 1 ? "multi-panel" : "wall-art",
      );
    return byId(PRODUCT_TYPES, "photo-frame");
  }

  /**
   * How many photos the customer has to add to order this product.
   * sel.sizeId matters for a set whose sizes hold different numbers of photos.
   * -> { type, typeName, count, required, slots: ["photo1", ...] }
   */
  function photoRequirement(p, sel = {}) {
    const type = productTypeOf(p);
    let count;
    if (p.decor) count = p.decor.customPhoto ? 1 : 0; // Home Decor: ready-made, except "your photo" sets
    else {
      const size =
        byId(p.sizes || [], sel.sizeId) || byId(p.sizes || [], defaultSizeId(p));
      const asked =
        size && num(size.photos) !== null
          ? num(size.photos)
          : num(p.personalization && p.personalization.photos);
      count = clamp(
        asked === null ? type.photos.initial : Math.round(asked),
        type.photos.min,
        type.photos.max,
      );
    }
    return {
      type: type.id,
      typeName: type.name,
      count,
      required: count > 0,
      slots: Array.from({ length: count }, (_, i) => `photo${i + 1}`),
    };
  }

  /** What to tell a customer who hasn't added every photo yet ("" when nothing is missing). */
  function photoProblem(count, have) {
    if (have >= count) return "";
    return count === 1 ? PHOTO_TEXT.missingOne : PHOTO_TEXT.missingMany(count);
  }

  /**
   * The photos a browser sent for a line, reduced to what the product needs:
   *   input   { photo1: "<upload id>" } or [{ slot, uploadId, placement }]
   * -> [{ slot, uploadId, placement }] in slot order. Unknown slots are dropped;
   * placement (where the customer put the photo) is clamped to sane numbers.
   */
  function cleanPhotos(slots, input) {
    const given = new Map();
    const take = (slot, uploadId, placement) => {
      if (typeof slot !== "string" || typeof uploadId !== "string") return;
      if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return;
      given.set(slot, { uploadId: uploadId.toLowerCase(), placement });
    };
    if (Array.isArray(input))
      input.forEach((e) => e && take(e.slot, e.uploadId, e.placement));
    else if (input && typeof input === "object")
      Object.entries(input).forEach(([slot, v]) =>
        typeof v === "string"
          ? take(slot, v, null)
          : v && take(slot, v.uploadId, v.placement),
      );
    const unit = (v, fallback) =>
      Number.isFinite(Number(v)) ? clamp(Number(v), 0, 1) : fallback;
    return slots
      .filter((slot) => given.has(slot))
      .map((slot) => {
        const { uploadId, placement } = given.get(slot);
        const at =
          placement && typeof placement === "object"
            ? {
                x: Math.round(unit(placement.x, 0.5) * 1000) / 1000,
                y: Math.round(unit(placement.y, 0.5) * 1000) / 1000,
                zoom:
                  Math.round(
                    (Number.isFinite(Number(placement.zoom))
                      ? clamp(Number(placement.zoom), 1, 4)
                      : 1) * 100,
                  ) / 100,
              }
            : null;
        return { slot, uploadId, placement: at };
      });
  }

  /**
   * The platform's rules for a product of its type, applied to a shop's record:
   * the photo count is brought inside what the type allows, a custom frame
   * always opens in FrameX Studio, and a ready-made product has no photo options.
   */
  function applyTypeRules(p) {
    p.giftWrap = p.giftWrap !== false;
    const type = byId(PRODUCT_TYPES, p.productType);
    // A draft without a type yet stays without one (it can't be published until one is chosen).
    if (!type || type.artistOnly) {
      p.productType = "";
      return p;
    }
    const asked = num(p.personalization && p.personalization.photos);
    const photos = clamp(
      asked === null ? type.photos.initial : Math.round(asked),
      type.photos.min,
      type.photos.max,
    );
    const panels = type.panels
      ? clamp(
          Math.round(num(p.personalization && p.personalization.panels) || 3),
          type.panels.min,
          type.panels.max,
        )
      : null;
    p.personalization = { photos, panels };
    p.customization = p.customization || {};
    if (type.studio) p.customization.photoUpload = true;
    if (!photos) {
      p.customization.photoUpload = false;
      p.customization.crop = false;
    }
    p.giftWrap = p.giftWrap !== false;
    return p;
  }

  /* ---------------------------------------------------------------- FrameX Studio support */
  function studioTypeOf(p) {
    const f = p.frame || {};
    // The type the shop chose wins; older catalogue items fall back to their inferred moulding.
    if (f.type) return (byId(frameTypes(), f.type) || { studio: null }).studio;
    return f.studioType || null;
  }

  function studioSizes(p) {
    return (p.sizes || [])
      .map((s) => {
        const inch = sizeInches(s);
        return inch
          ? {
              id: s.id,
              label: s.label || sizeDims(s),
              w: inch.w,
              h: inch.h,
              dims: sizeDims(s),
              available: true,
            }
          : null;
      })
      .filter(Boolean);
  }

  /** Can this product open in FrameX Studio? { ok, reasons[] } */
  function studioSupport(p) {
    const reasons = [];
    const c = p.customization || {};
    if (!c.photoUpload)
      reasons.push("Customer photo upload is not offered for this product.");
    if (
      studioTypeOf(p) === null ||
      studioTypeOf(p) === undefined ||
      studioTypeOf(p) === ""
    )
      reasons.push(
        "FrameX Studio can't draw this frame type yet (collage and other types).",
      );
    if (p.frame && p.frame.shape === "arch")
      reasons.push("FrameX Studio can't draw arched frames yet.");
    if (!studioSizes(p).length)
      reasons.push("Add at least one size with width and height.");
    if ((p.availability || {}).status === "out_of_stock")
      reasons.push("The product is out of stock.");
    return { ok: !reasons.length, reasons };
  }

  /** Everything the Studio may offer for this product, and nothing else. */
  function studioOptions(p) {
    const c = p.customization || {};
    const typeId = studioTypeOf(p);
    const allColors =
      p.frame.colors && p.frame.colors.length
        ? p.frame.colors
        : p.frame.color
          ? [p.frame.color]
          : [];
    const pal = palette();
    const colorIds = (c.frameColor ? allColors : allColors.slice(0, 1)).filter(
      (id) => pal[id],
    );
    const orient = (
      p.orientations && p.orientations.length ? p.orientations : ["portrait"]
    ).filter((o) => byId(ORIENTATIONS, o));
    const included = p.mat.included || "none";
    const matTypes =
      c.mat && p.mat.available
        ? ["none", "single"].concat(p.mat.double ? ["double"] : [])
        : [included === false ? "none" : included];
    return {
      typeId: typeId === "none" ? null : typeId,
      frame: typeId !== "none",
      colorIds,
      sizes: studioSizes(p),
      orientations: c.orientation ? orient : orient.slice(0, 1),
      mat: Boolean(c.mat && p.mat.available),
      matTypes: Array.from(new Set(matTypes.map((t) => t || "none"))),
      matIncluded: included === false ? "none" : included,
      matColors: p.mat.colors && p.mat.colors.length ? p.mat.colors : null,
      matWidths: p.mat.widths && p.mat.widths.length ? p.mat.widths : null,
      matPriceModifier: num(p.mat.priceModifier),
      legacyMatColor: p.mat.legacyColor || null,
      border: Boolean(c.border && p.border.available !== false),
      borderColors:
        p.border.colors && p.border.colors.length ? p.border.colors : null,
      borderWidths:
        p.border.widths && p.border.widths.length ? p.border.widths : null,
      protection: protectionOptions(p),
      printMaterials: (p.print.materials || []).filter((m) => m && m.name),
      text: c.text ? { label: c.textLabel || "Caption" } : null,
      crop: c.crop !== false,
    };
  }

  function protectionOptions(p) {
    return (p.protection.options || [])
      .filter((o) => o && byId(PROTECTION_TYPES, o.type))
      .map((o) => ({
        id: o.type,
        name: byId(PROTECTION_TYPES, o.type).name,
        description: o.description || byId(PROTECTION_TYPES, o.type).short,
        priceModifier: num(o.priceModifier) || 0,
      }));
  }

  /* ---------------------------------------------------------------- Pricing (product page + Studio product mode) */
  function defaultSelection(p) {
    const prot = protectionOptions(p);
    return {
      sizeId: defaultSizeId(p),
      colorId: p.frame.color || (p.frame.colors || [])[0] || null,
      printMaterialId: ((p.print.materials || [])[0] || {}).id || null,
      protection: (byId(prot, p.protection.default) || prot[0] || { id: null })
        .id,
    };
  }

  /** Itemised price for one selection. The shop discount applies to the size price. */
  function quote(p, sel = {}) {
    const lines = [];
    const sizes = p.sizes || [];
    const size = byId(sizes, sel.sizeId) || byId(sizes, defaultSizeId(p));
    const listPrice =
      size && num(size.price) !== null
        ? num(size.price)
        : num(p.pricing.basePrice) || 0;
    const discount = Math.min(
      90,
      Math.max(0, num(p.pricing.discountPercent) || 0),
    );
    const sizePrice = Math.round((listPrice * (100 - discount)) / 100);
    lines.push({
      key: "base",
      label: p.name,
      amount: sizePrice,
      detail: size ? size.label || sizeDims(size) : "",
      was: discount ? listPrice : null,
    });
    const pm = byId(p.print.materials, sel.printMaterialId);
    if (pm && num(pm.priceModifier))
      lines.push({
        key: "print",
        label: "Print",
        amount: num(pm.priceModifier),
        detail: pm.name,
      });
    const cover = byId(protectionOptions(p), sel.protection);
    if (cover && cover.priceModifier)
      lines.push({
        key: "protection",
        label: "Front cover",
        amount: cover.priceModifier,
        detail: cover.name,
      });
    const unit = Math.max(
      0,
      lines.reduce((s, l) => s + l.amount, 0),
    );
    return {
      lines,
      unit,
      discountPercent: discount,
      listPrice,
      currency: p.pricing.currency || "INR",
    };
  }

  /* ---------------------------------------------------------------- Components + specifications */
  const listNames = (ids, list) =>
    (ids || []).map((id) => (byId(list, id) || { name: id }).name).join(", ");

  /** Components built from the structured answers (used when the shop hasn't listed its own). */
  function deriveComponents(p) {
    const out = [];
    const f = p.frame || {};
    const colors = (
      f.colors && f.colors.length ? f.colors : f.color ? [f.color] : []
    ).map(colorName);
    // Older catalogue items count as framed when they carry a frame design, or
    // are a frame by type and name their material (an accessory is neither).
    const framed = p.legacy
      ? Boolean(f.studioType) || (productTypeOf(p).frame && has(f.material))
      : Boolean(f.type) && f.type !== "none";
    if (framed && (f.material || f.type)) {
      out.push({
        id: "frame",
        type: "frame",
        name: f.type === "canvas" ? "Stretcher frame" : "Outer Frame",
        material:
          [f.material, f.finish].filter(Boolean).join(", ") ||
          frameTypeName(f.type),
        description: colors.length
          ? `Colour${colors.length > 1 ? "s" : ""}: ${colors.join(", ")}`
          : "",
      });
    }
    const covers = protectionOptions(p).filter((o) => o.id !== "none");
    covers.forEach((o) =>
      out.push({
        id: o.id,
        type: o.id,
        name: o.name,
        material: covers.length > 1 ? "Optional front cover" : "Front cover",
        description: (byId(p.protection.options, o.id) || {}).description || "",
      }),
    );
    if (p.mat.legacyColor)
      out.push({
        id: "mat",
        type: "mat",
        name: "Mat",
        material:
          { white: "White mat", cream: "Cream mat", red: "Red mat" }[
            p.mat.legacyColor
          ] || "Mat",
        description: "",
      });
    else if (p.mat.available && !p.legacy)
      out.push({
        id: "mat",
        type: "mat",
        name: "Mat",
        material:
          p.mat.colors && p.mat.colors.length
            ? listNames(p.mat.colors, matColors())
            : "",
        description: p.mat.included ? "Included" : "Optional",
      });
    if (p.border.available && !p.legacy)
      out.push({
        id: "border",
        type: "border",
        name: "Inner Border",
        material: "Printed border",
        description:
          p.border.colors && p.border.colors.length
            ? `Colours: ${listNames(p.border.colors, borderColors())}`
            : "",
      });
    const prints = (p.print.materials || []).filter((m) => m && m.name);
    if (prints.length)
      out.push({
        id: "print",
        type: "print",
        name: "Photo Print",
        material: prints.map((m) => m.name).join(" or "),
        description: p.print.quality ? `Print quality: ${p.print.quality}` : "",
      });
    if (p.back.backing)
      out.push({
        id: "backing",
        type: "backing",
        name: "Backing",
        material: p.back.backing,
        description: "",
      });
    if (p.back.hanging)
      out.push({
        id: "hardware",
        type: "hardware",
        name: "Hanging Hardware",
        material: p.back.hanging,
        description: p.back.mounting || "",
      });
    if (p.back.stand)
      out.push({
        id: "stand",
        type: "stand",
        name: "Stand",
        material: p.back.standType || "Table stand",
        description: "",
      });
    return out;
  }

  function componentsOf(p) {
    const own = (p.components || []).filter((c) => c && (c.name || c.type));
    const list = own.length ? own : deriveComponents(p);
    return list
      .map((c, i) =>
        Object.assign({ id: c.id || "c" + i }, c, {
          name: c.name || (byId(COMPONENT_TYPES, c.type) || {}).name || "Part",
        }),
      )
      .sort(
        (a, b) =>
          (COMPONENT_DEPTH[a.type] ?? 7) - (COMPONENT_DEPTH[b.type] ?? 7),
      );
  }

  /** Grouped specification rows; only rows that have a value. */
  function specGroups(p, { categories = [] } = {}) {
    const f = p.frame || {};
    const mm = (v) => (num(v) ? `${trimNum(num(v))} mm` : "");
    const covers = protectionOptions(p);
    const prints = (p.print.materials || []).filter((m) => m && m.name);
    const orient = (p.orientations || [])
      .map((o) => (byId(ORIENTATIONS, o) || { name: o }).name)
      .join(" / ");
    const cats = (p.categoryIds || [])
      .map((id) => (byId(categories, id) || {}).name)
      .filter(Boolean)
      .join(", ");
    const colors = (
      f.colors && f.colors.length ? f.colors : f.color ? [f.color] : []
    )
      .map(colorName)
      .join(", ");
    const groups = [
      {
        title: "Frame",
        rows: [
          ["Frame type", f.type ? frameTypeName(f.type) : ""],
          ["Material", f.material],
          ["Colour", colors],
          ["Finish", f.finish],
          ["Frame width", mm(f.width)],
          ["Frame depth", mm(f.depth)],
          ["Weight", f.weight],
        ],
      },
      {
        title: "Print & cover",
        rows: [
          ["Print", prints.map((m) => m.name).join(", ")],
          [
            "Print finish",
            Array.from(
              new Set(prints.map((m) => m.finish).filter(Boolean)),
            ).join(", "),
          ],
          ["Print quality", p.print.quality],
          ["Protection", covers.map((c) => c.name).join(" / ")],
          [
            "Mat",
            p.mat.legacyColor
              ? `${{ white: "White", cream: "Cream", red: "Red" }[p.mat.legacyColor] || ""} mat`
              : !p.legacy && p.mat.available
                ? (p.mat.included ? "Included" : "Optional") +
                  (p.mat.colors && p.mat.colors.length
                    ? ` · ${listNames(p.mat.colors, matColors())}`
                    : "")
                : "",
          ],
          [
            "Border",
            !p.legacy && p.border.available ? "Printed border available" : "",
          ],
        ],
      },
      {
        title: "Size",
        rows: [
          [
            "Available sizes",
            (p.sizes || [])
              .map((s) =>
                sizeDims(s) && s.label && s.label !== sizeDims(s)
                  ? `${s.label} (${sizeDims(s)})`
                  : s.label || sizeDims(s),
              )
              .join(", "),
          ],
          ["Orientation", orient],
        ],
      },
      {
        title: "Back",
        rows: [
          ["Backing", p.back.backing],
          ["Hanging", p.back.hanging],
          ["Stand", p.back.stand ? p.back.standType || "Yes" : ""],
          ["Mounting", p.back.mounting],
        ],
      },
      {
        title: "More details",
        rows: [["Category", cats]].concat(
          (p.specifications || [])
            .filter((r) => r && has(r.label) && has(r.value))
            .map((r) => [r.label, r.value]),
        ),
      },
    ];
    return groups
      .map((g) => Object.assign(g, { rows: g.rows.filter(([, v]) => has(v)) }))
      .filter((g) => g.rows.length);
  }

  function qualityItems(p) {
    const items = (p.quality && p.quality.items) || {};
    return QUALITY_FIELDS.filter((q) => has(items[q.id])).map((q) => ({
      id: q.id,
      label: q.label,
      value: String(items[q.id]),
    }));
  }

  /** Only the FrameX system may verify. Anything a shop saves is "shop_claimed". */
  function sanitizeShopInput(p) {
    const out = clone(p);
    out.schema = SCHEMA;
    out.quality = Object.assign({}, out.quality, {
      source: "shop_claimed",
      verification: { status: "not_verified" },
    });
    delete out.legacy;
    delete out.verified;
    delete out.rating;
    delete out.reviews;
    delete out.decor; // Home Decor's own catalogue entries are FrameX's
    const lines = (list) =>
      (Array.isArray(list) ? list : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((x) => x.slice(0, 160));
    out.included = lines(out.included);
    out.care = lines(out.care);
    return applyTypeRules(out);
  }

  /* ---------------------------------------------------------------- Validation */
  function claimsIn(p) {
    const texts = [
      p.name,
      p.description,
      (p.tags || []).join(" "),
      p.frame.material,
      p.frame.finish,
      p.print.quality,
      p.print.notes,
      p.back.notes,
    ]
      .concat(Object.values((p.quality && p.quality.items) || {}))
      .concat(
        (p.print.materials || []).flatMap((m) => [
          m.name,
          m.description,
          m.quality,
        ]),
      )
      .concat(
        (p.components || []).flatMap((c) => [
          c.name,
          c.material,
          c.description,
        ]),
      )
      .concat((p.specifications || []).flatMap((r) => [r.label, r.value]))
      .filter(Boolean)
      .join(" \n ");
    return FORBIDDEN_CLAIMS.filter((c) => c.re.test(texts)).map((c) => c.text);
  }

  /**
   * Is the product complete enough to publish? Required: name, category, price,
   * an image, frame information and a size, plus whatever the enabled
   * customization options need. step = wizard step to fix it in.
   */
  function validateForPublish(p) {
    const issues = [];
    const add = (step, message) => issues.push({ step, message });
    if (!has(p.name)) add("basic", "Add a product name");
    else if (p.name.trim().length < 3)
      add("basic", "The product name is too short");
    if (!byId(PRODUCT_TYPES, p.productType))
      add("basic", "Choose what you are selling (the product type)");
    const type = productTypeOf(p);
    if (!has(p.category)) add("basic", "Choose a category");
    if (!(num(p.pricing.basePrice) > 0)) add("sizes", "Add a base price");
    if (!(p.views || []).some((v) => v && v.url))
      add("images", "Add at least one product image");
    // Frame details are part of a framed product; a ready-made piece or an accessory may have none.
    if (type.frame) {
      if (!has(p.frame.type)) add("frame", "Choose the frame type");
      else if (
        !["none", "canvas"].includes(p.frame.type) &&
        !has(p.frame.material)
      )
        add("frame", "Add the frame material");
    }
    if (type.studio)
      studioSupport(
        Object.assign({}, p, {
          customization: Object.assign({}, p.customization, {
            photoUpload: true,
          }),
          availability: { status: "in_stock" },
        }),
      ).reasons.forEach((r) => add("frame", r));
    if (!(p.sizes || []).length)
      add("sizes", "Add at least one available size");
    (p.sizes || []).forEach((s, i) => {
      if (!has(s.label) && !(s.width > 0 && s.height > 0))
        add("sizes", `Size ${i + 1} needs a name or width and height`);
      if (has(s.price) && !(num(s.price) > 0))
        add("sizes", `Size ${i + 1} needs a valid price`);
    });
    (p.print.materials || []).forEach(
      (m, i) =>
        !has(m.name) && add("print", `Print material ${i + 1} needs a name`),
    );
    (p.views || []).forEach(
      (v, i) =>
        v &&
        v.url &&
        !has(v.alt) &&
        add("images", `Image ${i + 1} needs a short description (alt text)`),
    );
    const c = p.customization || {};
    if (c.photoUpload && !type.studio)
      studioSupport(
        Object.assign({}, p, { availability: { status: "in_stock" } }),
      ).reasons.forEach((r) => add("customize", r));
    if (c.frameColor && (p.frame.colors || []).length < 2)
      add(
        "customize",
        "Frame colour choice needs at least two frame colours (step 2)",
      );
    if (c.mat && !p.mat.available)
      add("customize", "Turn on “Mat available” and choose mat colours");
    if (c.mat && p.mat.available && !(p.mat.colors || []).length)
      add("customize", "Choose at least one mat colour");
    if (c.border && !(p.border.colors || []).length)
      add("customize", "Choose at least one border colour");
    if (c.text && !has(c.textLabel))
      add(
        "customize",
        "Name the text field customers fill in (e.g. “Caption”)",
      );
    if (c.orientation && (p.orientations || []).length < 2)
      add("customize", "Orientation choice needs at least two orientations");
    if (
      p.product360 &&
      (p.product360.frames || []).length &&
      p.product360.frames.length < 8
    )
      add("images", "A 360° view needs at least 8 photos (or remove them)");
    (p.media || []).forEach(
      (m) =>
        m &&
        m.kind === "video" &&
        !has(m.url) &&
        add("images", "The product video needs a video link or file"),
    );
    const claims = claimsIn(p);
    if (claims.length)
      add("basic", `Remove claims only FrameX can make: ${claims.join(", ")}`);
    return { ready: !issues.length, issues };
  }

  /** Copy for "Duplicate": new id and slug, back to draft. */
  function duplicate(p, takenSlugs = []) {
    const copy = sanitizeShopInput(normalize(p));
    const now = new Date().toISOString();
    copy.id = newId();
    copy.name = `${p.name} (copy)`;
    copy.slug = uniqueSlug(copy.name, takenSlugs);
    copy.status = "draft";
    copy.sourceId = null;
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.publishedAt = null;
    return copy;
  }

  function uniqueSlug(name, taken = []) {
    const base = slugify(name) || "product";
    let slug = base;
    let n = 2;
    while (taken.includes(slug)) slug = `${base}-${n++}`;
    return slug;
  }

  /* ---------------------------------------------------------------- Cart rules
     Shared by the website and the FrameX backend, which loads this same file,
     so a cart line is checked, described and priced by one piece of code.
     The backend's answer is the one that counts: the website never sends a price. */
  const MAX_CART_QTY = 20;

  /** Can this product be ordered, and how many one cart line may hold. */
  function orderLimits(p) {
    const a = p.availability || {};
    const orderable = p.status === "published" && a.status !== "out_of_stock";
    const stock = typeof a.stock === "number" && a.stock > 0 ? a.stock : null;
    return {
      orderable,
      maxQty: orderable
        ? Math.min(MAX_CART_QTY, stock === null ? MAX_CART_QTY : stock)
        : 0,
    };
  }

  /**
   * One cart line for a product and a selection of option ids
   * ({ sizeId, colorId, printMaterialId, protection }).
   * An option that is left out falls back to the product's default; an id the
   * product doesn't offer is reported in `problems` and never priced.
   * Returns the cleaned selection, the readable labels and the unit price.
   */
  function cartLine(p, sel = {}) {
    const def = defaultSelection(p);
    const problems = [];
    const pick = (key, list, what) => {
      if (!has(sel[key]) || sel[key] === def[key]) return def[key];
      if (byId(list, sel[key])) return sel[key];
      problems.push(`That ${what} isn't offered for this product.`);
      return def[key];
    };
    const covers = protectionOptions(p);
    const materials = p.print.materials || [];
    const colors = (p.frame.colors || []).map((id) => ({ id }));
    const selection = {
      sizeId: pick("sizeId", p.sizes || [], "size"),
      colorId:
        colors.length > 1 ? pick("colorId", colors, "colour") : def.colorId,
      printMaterialId: pick("printMaterialId", materials, "print material"),
      protection: pick("protection", covers, "front cover"),
    };
    const q = quote(p, selection);
    const size = byId(p.sizes, selection.sizeId);
    const dims = size ? sizeDims(size) : "";
    const options = q.lines.slice(1).map((l) => `${l.label}: ${l.detail}`);
    const material = byId(materials, selection.printMaterialId);
    if (
      material &&
      materials.length > 1 &&
      !q.lines.some((l) => l.key === "print")
    )
      options.push(`Print: ${material.name}`);
    const cover = byId(covers, selection.protection);
    if (
      cover &&
      covers.length > 1 &&
      !q.lines.some((l) => l.key === "protection")
    )
      options.push(`Front cover: ${cover.name}`);
    return {
      selection,
      problems,
      unitPrice: q.unit,
      currency: q.currency,
      size: size
        ? size.label && dims && size.label !== dims
          ? `${size.label} (${dims})`
          : size.label || dims || null
        : null,
      color:
        colors.length > 1 && selection.colorId
          ? colorName(selection.colorId)
          : null,
      options,
      quote: q,
    };
  }

  FrameX.productModel = {
    SCHEMA,
    VIEW_TYPES,
    STATUS,
    PRINT_MATERIAL_TYPES,
    PROTECTION_TYPES,
    COMPONENT_TYPES,
    QUALITY_FIELDS,
    CUSTOMIZATION_OPTIONS,
    PRODUCT_TYPES,
    PHOTO_TEXT,
    ORIENTATIONS,
    AVAILABILITY,
    FALLBACK_IMAGE,
    frameTypes,
    frameTypeName,
    viewType,
    palette,
    colorName,
    matColors,
    matWidths,
    borderColors,
    borderWidths,
    sizeDims,
    parseDims,
    sizeInches,
    emptyProduct,
    normalize,
    sortedViews,
    mainView,
    productTypeOf,
    photoRequirement,
    photoProblem,
    cleanPhotos,
    applyTypeRules,
    studioSupport,
    studioOptions,
    protectionOptions,
    defaultSelection,
    quote,
    MAX_CART_QTY,
    orderLimits,
    cartLine,
    deriveComponents,
    componentsOf,
    specGroups,
    qualityItems,
    sanitizeShopInput,
    validateForPublish,
    claimsIn,
    duplicate,
    uniqueSlug,
    slugify,
    newId,
  };

  /** Product pricing, shared by the product page, cart and FrameX Studio. */
  FrameX.pricingService = { quote, defaultSelection, protectionOptions };
})((window.FrameX = window.FrameX || {}));
