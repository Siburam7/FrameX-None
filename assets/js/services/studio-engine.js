/* ==========================================================================
   FrameX Studio engine — one customization system for every entry point:
     template mode   a personalised template (js/templates.js)
     photo mode      a single photo, framed
     product mode    a listed frame product (js/edit.js) with the customer's photo

   Everything works on one plain "config" object (the design), so it can be
   saved, put in the cart, sent to a server, or rendered at print size later:

   {
     version: 1, mode: "template" | "photo" | "product",
     templateId?, productId?,
     photos:     { slot: photoId },            photo ids from uploadService
     photoMeta:  { slot: { w, h } },           pixel size of each photo
     crop:       { slot: { fit, zoom, px, py, rotate } },
     text:       { fieldId: value },
     textStyle:  { fieldId: { fontId, sizeId, align, colorId, dy } },
     background: { colorId, pattern } | null,
     frame:      { typeId, colorId, finishId },
     border:     { width, colorId },
     mat:        { type, colorId, color2Id, widthId },
     sizeId, orientation, protection
   }

   Functions (all pure, no DOM):
     context(...)        what is being customised + which options are allowed
     defaults(ctx)       starting config for that context
     normalize(cfg,ctx)  swap any option the context doesn't allow for one it does
     geometry(cfg,ctx)   layer rectangles in normalized units (preview + future print)
     price(cfg,ctx)      itemised price  — the ONLY place prices are added up
     validate(cfg,ctx)   what's missing before ordering
     summary(cfg,ctx)    readable lines for the cart and the order message
     renderPreview(...)  HTML for the live, layered frame preview
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc } = FrameX.dom;
  const catalog = () => FrameX.seed.studio;
  const byId = (list, id) => (list || []).find((x) => x.id === id) || null;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const available = (list) => (list || []).filter((x) => x.available !== false);

  /* ---------------------------------------------------------------- Context + capabilities */

  /** Map a listed product's own frame settings onto Studio options. */
  function productPreset(product) {
    const f = product.frame || {};
    const typeId =
      f.style === "ornate"
        ? "premium"
        : f.style === "grain"
          ? "wood"
          : "modern";
    const matType =
      !f.matColor || f.matColor === "none"
        ? "none"
        : f.double
          ? "double"
          : "single";
    const matColor =
      { white: "white", cream: "cream", red: "cream" }[f.matColor] || "white";
    const matWidth =
      { thin: "slim", medium: "classic", wide: "wide" }[f.matWidth] ||
      "classic";
    return {
      typeId,
      matType,
      matColor,
      matWidth,
      square: f.shape === "square",
    };
  }

  /**
   * ctx = { mode, template?, product?, caps }
   * caps lists ONLY the options this design can use; the UI shows nothing else.
   * A template can narrow them with `studio: { … }` in js/templates.js.
   */
  function context({ template = null, product = null } = {}) {
    const c = catalog();
    const mode = template ? "template" : product ? "product" : "photo";
    const rules = (template && template.studio) || {};
    const pick = (list, allowed) =>
      allowed
        ? available(list).filter((x) => allowed.includes(x.id))
        : available(list);

    let frameTypes = pick(c.FRAME_TYPES, rules.supportedFrameTypes);
    let sizes = pick(
      c.SIZES,
      rules.supportedSizes || (template && template.sizes),
    );
    let colorIds = null;
    let preset = null;
    let textFields = (template && template.textFields) || [];
    // Product mode: the product's own options (product-model.js → studioOptions) and nothing else.
    const model =
      product && FrameX.productModel
        ? FrameX.productModel.normalize(product)
        : null;
    const po = model ? FrameX.productModel.studioOptions(model) : null;
    if (product) {
      preset = productPreset(product);
      frameTypes = available(c.FRAME_TYPES).filter(
        (t) => t.id === preset.typeId,
      );
      colorIds = (product.colors || []).length ? product.colors : null;
      const ids = FrameX.pricing.sizeOptions(product).map((o) => o.id);
      sizes = available(c.SIZES).filter((s) => ids.includes(s.id));
    }
    if (po) {
      preset.typeId = po.typeId;
      preset.matType = po.matIncluded;
      preset.square =
        po.orientations.length === 1 && po.orientations[0] === "square";
      if (po.matColors && !po.matColors.includes(preset.matColor))
        preset.matColor = po.matColors[0];
      if (po.matWidths && !po.matWidths.includes(preset.matWidth))
        preset.matWidth = po.matWidths[0];
      frameTypes = po.typeId
        ? available(c.FRAME_TYPES).filter((t) => t.id === po.typeId)
        : [];
      colorIds = po.colorIds.length ? po.colorIds : null;
      sizes = po.sizes;
      if (po.text)
        textFields = [
          {
            id: "caption",
            label: po.text.label,
            maxLength: 40,
            placeholder: "e.g. names or a date",
            defaultValue: "",
          },
        ];
    }

    const square =
      (preset && preset.square) || available(c.SIZES).some((s) => s.w === s.h);
    const orientations = po
      ? c.ORIENTATIONS.filter((o) => po.orientations.includes(o.id))
      : (rules.supportedOrientations
          ? c.ORIENTATIONS.filter((o) =>
              rules.supportedOrientations.includes(o.id),
            )
          : c.ORIENTATIONS
        ).filter((o) =>
          preset && preset.square
            ? o.id === "square"
            : o.id !== "square" || square,
        );
    const only = (list, ids) =>
      ids ? list.filter((x) => ids.includes(x.id)) : list;
    const matOn = po
      ? po.mat || po.matIncluded !== "none"
      : rules.mat !== false;

    const caps = {
      photoSlots: template
        ? FrameX.templateEngine.slotsOf(template)
        : ["photo1"],
      textFields,
      text: textFields.length > 0 && rules.text !== false,
      textStyle:
        Boolean(template) &&
        textFields.length > 0 &&
        rules.text !== false &&
        rules.textStyle !== false,
      background: Boolean(template) && rules.background !== false,
      frame: po ? po.frame && frameTypes.length > 0 : rules.frame !== false,
      border: po ? po.border : rules.border !== false,
      mat: matOn,
      crop: po ? po.crop : true,
      matColors: only(c.MAT.colors, po && po.matColors),
      matWidths: only(c.MAT.widths, po && po.matWidths),
      borderColors: only(c.BORDER.colors, po && po.borderColors),
      borderPresets:
        po && po.borderWidths
          ? c.BORDER.presets.filter(
              (p) => p.width === 0 || po.borderWidths.includes(p.id),
            )
          : c.BORDER.presets,
      printMaterials: po ? po.printMaterials : [],
      frameTypes,
      colorsFor: (typeId) => {
        const type = byId(frameTypes, typeId) || frameTypes[0];
        const ids = colorIds || (type ? type.colors : []);
        return c.COLORS.filter((col) => ids.includes(col.id));
      },
      finishesFor: (typeId) => {
        if (product) return []; // a listed product comes in its own finish
        const type = byId(frameTypes, typeId) || frameTypes[0];
        const ids = rules.supportedFinishes
          ? (type ? type.finishes : []).filter((f) =>
              rules.supportedFinishes.includes(f),
            )
          : type
            ? type.finishes
            : [];
        return available(c.FINISHES).filter((f) => ids.includes(f.id));
      },
      matTypes: po
        ? c.MAT.types.filter((m) => po.matTypes.includes(m.id))
        : pick(c.MAT.types, rules.supportedMatOptions),
      sizes,
      orientations,
      // A product offers only its shop's covers, at the shop's own prices.
      protection: po ? po.protection : available(c.PROTECTION),
      customSize: po ? { available: false } : c.CUSTOM_SIZE,
    };
    return {
      mode,
      template,
      product: model || product,
      caps,
      preset,
      productOptions: po,
    };
  }

  /* ---------------------------------------------------------------- Defaults + normalize */

  function defaults(ctx) {
    const c = catalog();
    const base = clone(
      ctx.mode === "template" ? c.DEFAULTS.template : c.DEFAULTS.photo,
    );
    const cfg = Object.assign(base, {
      version: 1,
      mode: ctx.mode,
      templateId: ctx.template ? ctx.template.id : null,
      productId: ctx.product ? ctx.product.id : null,
      photos: {},
      photoMeta: {},
      crop: {},
      text: {},
      textStyle: {},
      background: null,
    });
    if (ctx.template) {
      (ctx.template.textFields || []).forEach(
        (f) => (cfg.text[f.id] = f.defaultValue || ""),
      );
      cfg.orientation =
        ctx.template.orientation === "landscape" ? "landscape" : "portrait";
    }
    if (ctx.preset) {
      cfg.frame.typeId = ctx.preset.typeId;
      cfg.frame.colorId = (ctx.product.colors || [])[0] || cfg.frame.colorId;
      cfg.mat = {
        type: ctx.preset.matType,
        colorId: ctx.preset.matColor,
        color2Id: "white",
        widthId: ctx.preset.matWidth,
      };
      cfg.border.width = ctx.preset.matType === "none" ? 10 : 0;
      if (ctx.preset.square) cfg.orientation = "square";
    }
    return normalize(cfg, ctx);
  }

  /** Keep every choice inside what this context allows (e.g. after a frame type change). */
  function normalize(cfg, ctx) {
    const c = catalog();
    const caps = ctx.caps;
    const out = cfg;
    if (!byId(caps.frameTypes, out.frame.typeId) && caps.frameTypes[0])
      out.frame.typeId = caps.frameTypes[0].id;
    const colors = caps.colorsFor(out.frame.typeId);
    if (!byId(colors, out.frame.colorId) && colors[0])
      out.frame.colorId = colors[0].id;
    const finishes = caps.finishesFor(out.frame.typeId);
    out.frame.finishId = finishes.length
      ? byId(finishes, out.frame.finishId)
        ? out.frame.finishId
        : finishes[0].id
      : null;
    if (!byId(caps.sizes, out.sizeId) && caps.sizes.length)
      out.sizeId = (byId(caps.sizes, "m") || caps.sizes[0]).id;
    if (!byId(caps.orientations, out.orientation) && caps.orientations[0])
      out.orientation = caps.orientations[0].id;
    if (!byId(caps.matTypes, out.mat.type))
      out.mat.type = caps.matTypes[0] ? caps.matTypes[0].id : "none";
    if (!caps.mat) out.mat.type = "none";
    if (!byId(caps.matColors, out.mat.colorId) && caps.matColors[0])
      out.mat.colorId = caps.matColors[0].id;
    if (!byId(caps.matColors, out.mat.color2Id) && caps.matColors[0])
      out.mat.color2Id = (caps.matColors[1] || caps.matColors[0]).id;
    if (!byId(caps.matWidths, out.mat.widthId) && caps.matWidths[0])
      out.mat.widthId = (
        byId(caps.matWidths, "classic") || caps.matWidths[0]
      ).id;
    if (!byId(caps.borderColors, out.border.colorId) && caps.borderColors[0])
      out.border.colorId = caps.borderColors[0].id;
    if (!caps.border) out.border.width = 0;
    out.border.width = Math.min(
      c.BORDER.max,
      Math.max(c.BORDER.min, Number(out.border.width) || 0),
    );
    if (
      caps.border &&
      caps.borderPresets !== c.BORDER.presets &&
      !caps.borderPresets.some((p) => p.width === out.border.width)
    )
      out.border.width = (caps.borderPresets[1] || caps.borderPresets[0]).width;
    if (!byId(caps.protection, out.protection))
      out.protection = caps.protection[0] ? caps.protection[0].id : "none";
    if (
      caps.printMaterials.length &&
      !byId(caps.printMaterials, out.printMaterialId)
    )
      out.printMaterialId = caps.printMaterials[0].id;
    if (!caps.printMaterials.length) delete out.printMaterialId;
    return out;
  }

  /* ---------------------------------------------------------------- Geometry
     All measurements in units where the PRINT AREA is 1000 units wide. */

  // A product's own sizes (any width × height a shop entered) come first.
  const sizeOf = (cfg, ctx) =>
    byId(ctx && ctx.caps.sizes, cfg.sizeId) ||
    byId(catalog().SIZES, cfg.sizeId) ||
    catalog().SIZES[1];

  /** Print area in inches, oriented. */
  function printInches(cfg, ctx) {
    const s = sizeOf(cfg, ctx);
    if (cfg.orientation === "square")
      return { w: Math.min(s.w, s.h), h: Math.min(s.w, s.h) };
    return cfg.orientation === "landscape"
      ? { w: Math.max(s.w, s.h), h: Math.min(s.w, s.h) }
      : { w: Math.min(s.w, s.h), h: Math.max(s.w, s.h) };
  }

  function geometry(cfg, ctx) {
    const c = catalog();
    const inches = printInches(cfg, ctx);
    const pw = 1000;
    const ph = (1000 * inches.h) / inches.w;
    const type = byId(c.FRAME_TYPES, cfg.frame.typeId) || c.FRAME_TYPES[0];
    // Moulding has a fixed real width, so it looks slimmer on bigger prints (type.width is at 12 in wide).
    const f = ctx.caps.frame ? (type.width * 12) / inches.w : 0;
    const matType = byId(c.MAT.types, cfg.mat.type) || c.MAT.types[0];
    const m1 = matType.layers
      ? (byId(c.MAT.widths, cfg.mat.widthId) || c.MAT.widths[1]).width
      : 0;
    const m2 = matType.layers > 1 ? c.MAT.innerWidth : 0;
    const b = Number(cfg.border.width) || 0;

    const inset = f + m1 + m2;
    const OW = pw + 2 * inset;
    const OH = ph + 2 * inset;
    const rect = (d) => ({ x: d, y: d, w: OW - 2 * d, h: OH - 2 * d });
    const layers = { frame: rect(0), opening: rect(f) };
    if (m1) layers.mat = rect(f);
    if (m2) layers.mat2 = rect(f + m1);
    layers.print = rect(inset);
    layers.photo = rect(inset + b);

    // Template artwork keeps its own shape inside the photo area (centred).
    const area = layers.photo;
    let art = Object.assign({}, area);
    if (ctx.template) {
      const ratio = ctx.template.layout.width / ctx.template.layout.height;
      if (area.w / area.h > ratio)
        art = {
          x: area.x + (area.w - area.h * ratio) / 2,
          y: area.y,
          w: area.h * ratio,
          h: area.h,
        };
      else
        art = {
          x: area.x,
          y: area.y + (area.h - area.w / ratio) / 2,
          w: area.w,
          h: area.w / ratio,
        };
    }
    layers.art = art;
    return {
      OW,
      OH,
      inches,
      units: { frame: f, mat: m1, mat2: m2, border: b },
      layers,
      type,
    };
  }

  /* ---------------------------------------------------------------- Pricing (single source of truth) */

  function price(cfg, ctx) {
    const c = catalog();
    const lines = [];
    const add = (label, amount, detail) =>
      amount && lines.push({ label, amount, detail });
    const size = sizeOf(cfg, ctx);
    const cover = byId(ctx.caps.protection, cfg.protection);

    if (ctx.productOptions) {
      // The shop's own price for this size, print and cover (productModel.quote),
      // plus a mat upgrade beyond what the product includes.
      const q = FrameX.productModel.quote(ctx.product, {
        sizeId: cfg.sizeId,
        printMaterialId: cfg.printMaterialId,
        protection: cfg.protection,
      });
      q.lines.forEach((l) =>
        lines.push({
          label: l.label,
          amount: l.amount,
          detail:
            l.key === "base" ? `${l.detail || size.label} frame` : l.detail,
        }),
      );
      const included =
        (byId(c.MAT.types, ctx.productOptions.matIncluded) || {}).layers || 0;
      const mat = byId(c.MAT.types, cfg.mat.type);
      if (mat && mat.layers > included) {
        const own = ctx.productOptions.matPriceModifier;
        add(
          "Mat upgrade",
          own !== null
            ? own
            : mat.priceModifier -
                ((byId(c.MAT.types, ctx.productOptions.matIncluded) || {})
                  .priceModifier || 0),
          mat.name,
        );
      }
      const total = Math.max(
        0,
        lines.reduce((sum, l) => sum + l.amount, 0),
      );
      return { lines, total, currency: q.currency };
    }

    if (ctx.mode === "product") {
      // The listed product's own price for this size (shop discount included).
      lines.push({
        label: ctx.product.name,
        amount: FrameX.pricing.priceForSize(ctx.product, cfg.sizeId),
        detail: `${size.label} frame`,
      });
      const included = ctx.preset
        ? (byId(c.MAT.types, ctx.preset.matType) || {}).layers || 0
        : 0;
      const mat = byId(c.MAT.types, cfg.mat.type);
      if (mat && mat.layers > included)
        add(
          "Mat upgrade",
          mat.priceModifier -
            ((byId(c.MAT.types, ctx.preset.matType) || {}).priceModifier || 0),
          mat.name,
        );
    } else {
      const type = byId(c.FRAME_TYPES, cfg.frame.typeId);
      const color = byId(c.COLORS, cfg.frame.colorId);
      const finish = byId(c.FINISHES, cfg.frame.finishId);
      const mat = byId(c.MAT.types, cfg.mat.type);
      lines.push(
        ctx.template
          ? {
              label: "Design",
              amount: Number(ctx.template.price) || 0,
              detail: ctx.template.title,
            }
          : {
              label: "Photo print",
              amount: c.BASE.photoPrint,
              detail: "Printed and mounted",
            },
      );
      add(
        "Size",
        size.priceModifier,
        `${size.label} (${printInches(cfg, ctx).w} × ${printInches(cfg, ctx).h} in)`,
      );
      add("Frame", type && type.priceModifier, type && type.name);
      add("Frame colour", color && color.priceModifier, color && color.name);
      add("Finish", finish && finish.priceModifier, finish && finish.name);
      add("Mat", mat && mat.priceModifier, mat && mat.name);
      add(
        "Border",
        cfg.border.width ? c.BORDER.priceModifier : 0,
        "Printed border",
      );
    }
    add("Front", cover && cover.priceModifier, cover && cover.name);
    const total = Math.max(
      0,
      lines.reduce((sum, l) => sum + l.amount, 0),
    );
    return { lines, total, currency: "INR" };
  }

  /* ---------------------------------------------------------------- Validation + summary */

  function validate(cfg, ctx) {
    const missingPhotos = ctx.caps.photoSlots.filter(
      (slot) => !cfg.photos[slot],
    );
    const missingText = ctx.caps.text
      ? (ctx.caps.textFields || []).filter(
          (f) => f.required && !String(cfg.text[f.id] || "").trim(),
        )
      : [];
    const issues = [];
    if (missingPhotos.length)
      issues.push({
        section: "photos",
        message:
          missingPhotos.length === 1 && ctx.caps.photoSlots.length === 1
            ? "Add your photo"
            : `Add ${missingPhotos.length} more ${missingPhotos.length === 1 ? "photo" : "photos"}`,
      });
    missingText.forEach((f) =>
      issues.push({ section: "text", message: `Fill in “${f.label}”` }),
    );
    if (!byId(ctx.caps.sizes, cfg.sizeId))
      issues.push({ section: "size", message: "Choose a size" });
    if (ctx.caps.frame && !byId(ctx.caps.frameTypes, cfg.frame.typeId))
      issues.push({ section: "frame", message: "Choose a frame" });
    return { ok: !issues.length, issues, missingPhotos, missingText };
  }

  function summary(cfg, ctx) {
    const c = catalog();
    const size = sizeOf(cfg, ctx);
    const inches = printInches(cfg, ctx);
    const type = byId(c.FRAME_TYPES, cfg.frame.typeId);
    const print = byId(ctx.caps.printMaterials, cfg.printMaterialId);
    const color = byId(c.COLORS, cfg.frame.colorId);
    const finish = byId(c.FINISHES, cfg.frame.finishId);
    const mat = byId(c.MAT.types, cfg.mat.type);
    const matColor = byId(c.MAT.colors, cfg.mat.colorId);
    const borderColor = byId(c.BORDER.colors, cfg.border.colorId);
    const cover = byId(ctx.caps.protection, cfg.protection);
    const preset = c.BORDER.presets.find(
      (p) => p.width === Number(cfg.border.width),
    );
    // A listed product shows its own material, not the Studio's moulding name.
    const frameName = ctx.productOptions
      ? ctx.product.frame.material || (type && type.name)
      : type && type.name;
    return [
      ctx.caps.frame && {
        key: "frame",
        label: "Frame",
        value: [frameName, color && color.name, finish && finish.name]
          .filter(Boolean)
          .join(", "),
      },
      ctx.caps.border && {
        key: "border",
        label: "Border",
        value: cfg.border.width
          ? `${preset ? preset.name : cfg.border.width + " units"}, ${borderColor ? borderColor.name : ""}`
          : "None",
      },
      ctx.caps.mat && {
        key: "mat",
        label: "Mat",
        value:
          mat && mat.layers
            ? `${mat.name}, ${matColor ? matColor.name : ""}`
            : "No mat",
      },
      {
        key: "size",
        label: "Size",
        value:
          [
            size.label,
            size.dims && cfg.orientation !== "landscape"
              ? size.dims
              : `${inches.w} × ${inches.h} in`,
          ]
            .filter((v, i, a) => v && a.indexOf(v) === i)
            .join(" · ") + ` · ${cfg.orientation}`,
      },
      print && { key: "print", label: "Print", value: print.name },
      cover && { key: "front", label: "Front", value: cover.name },
    ].filter(Boolean);
  }

  /* ---------------------------------------------------------------- Preview renderer (screen)
     Layers, back to front: frame moulding → frame inner edge → mat(s) → printed
     border → photo / template artwork → text (inside the artwork) → cover sheen.
     Every position is a percentage of the outer frame, every thickness a
     container-query unit, so nothing depends on screen pixels. A production
     renderer can draw the same geometry() at print resolution. */
  function renderPreview(cfg, ctx, { photoUrls = {}, mode = "live" } = {}) {
    const c = catalog();
    const g = geometry(cfg, ctx);
    const pos = (r) =>
      `left:${(r.x / g.OW) * 100}%;top:${(r.y / g.OH) * 100}%;width:${(r.w / g.OW) * 100}%;height:${(r.h / g.OH) * 100}%`;
    const color = byId(c.COLORS, cfg.frame.colorId) || c.COLORS[0];
    const matColor = (byId(c.MAT.colors, cfg.mat.colorId) || c.MAT.colors[0])
      .hex;
    const mat2Color = (byId(c.MAT.colors, cfg.mat.color2Id) || c.MAT.colors[0])
      .hex;
    const borderColor = (
      byId(c.BORDER.colors, cfg.border.colorId) || c.BORDER.colors[0]
    ).hex;
    const unit = (u) => `${((u / g.OW) * 100).toFixed(3)}cqw`; // preview units -> container width

    // Photo / product mode: one photo filling the print, or photo + caption strip
    // when the product offers text.
    const H = Math.round((1000 * g.layers.photo.h) / g.layers.photo.w);
    const caption =
      !ctx.template && ctx.caps.text ? ctx.caps.textFields[0] : null;
    const photoH = caption ? Math.round(H * 0.84) : H;
    const template = ctx.template || {
      id: "photo",
      title: "Your photo",
      textFields: caption ? [caption] : [],
      layout: {
        width: 1000,
        height: H,
        background: {
          color: caption && !cfg.border.width ? "#ffffff" : borderColor,
        },
        elements: [
          {
            type: "image",
            slot: "photo1",
            x: 0,
            y: 0,
            width: 1000,
            height: photoH,
          },
        ].concat(
          caption
            ? [
                {
                  type: "text",
                  field: caption.id,
                  x: 40,
                  y: photoH + Math.round((H - photoH) * 0.28),
                  width: 920,
                  size: Math.round(Math.min(64, (H - photoH) * 0.42)),
                  font: "serif",
                  align: "center",
                  color: "#2b2118",
                },
              ]
            : [],
        ),
      },
    };

    let bg = null;
    if (cfg.background && ctx.caps.background) {
      bg = {};
      const hex = (byId(c.BACKGROUNDS.colors, cfg.background.colorId) || {})
        .hex;
      if (hex) bg.color = hex;
      if (cfg.background.pattern != null) bg.pattern = cfg.background.pattern;
    }
    const textStyles = {};
    Object.entries(cfg.textStyle || {}).forEach(([field, st]) => {
      const font = byId(c.FONTS, st.fontId);
      const size = byId(c.TEXT_SIZES, st.sizeId);
      const col = byId(c.TEXT_COLORS, st.colorId);
      textStyles[field] = Object.assign(
        {},
        font
          ? {
              font: font.font,
              weight: font.weight,
              italic: font.italic,
              uppercase: Boolean(font.uppercase),
            }
          : {},
        size ? { scale: size.scale } : {},
        col ? { color: col.hex } : {},
        st.align ? { align: st.align } : {},
        st.dy ? { dy: st.dy } : {},
      );
    });
    const art = FrameX.templateEngine.render(template, {
      photos: photoUrls,
      text: cfg.text,
      mode,
      crop: cfg.crop,
      textStyles,
      background: bg,
      label: `Preview of your ${template.title} frame`,
    });

    const L = g.layers;
    const classes = [
      "fs-frame",
      `fs-frame--${g.type.profile}`,
      `fs-tex--${color.texture}`,
      cfg.frame.finishId ? `fs-finish--${cfg.frame.finishId}` : "",
      ctx.caps.frame ? "" : "fs-frame--none",
      `fs-cover--${cfg.protection}`,
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${classes}" style="aspect-ratio:${g.OW.toFixed(1)} / ${g.OH.toFixed(1)};--frame:${esc(color.hex)};--fw:${unit(g.units.frame)}">
      <span class="fs-layer fs-layer--frame" style="${pos(L.frame)}"></span>
      ${L.mat ? `<span class="fs-layer fs-layer--mat" style="${pos(L.mat)};background:${esc(matColor)}"></span>` : ""}
      ${L.mat2 ? `<span class="fs-layer fs-layer--mat2" style="${pos(L.mat2)};background:${esc(mat2Color)}"></span>` : ""}
      <span class="fs-layer fs-layer--print" style="${pos(L.print)};background:${esc(borderColor)}"></span>
      <div class="fs-layer fs-layer--art" style="${pos(L.art)}">${art}</div>
      <span class="fs-layer fs-layer--edge" style="${pos(L.opening)}"></span>
      ${cfg.protection !== "none" ? `<span class="fs-layer fs-layer--cover" style="${pos(L.opening)}"></span>` : ""}
    </div>`;
  }

  FrameX.studioEngine = {
    context,
    defaults,
    normalize,
    geometry,
    price,
    validate,
    summary,
    renderPreview,
    printInches,
    productPreset,
    catalog,
  };
})((window.FrameX = window.FrameX || {}));
