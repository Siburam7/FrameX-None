/* ==========================================================================
   Live Demo ("View on My Wall") — the subject: WHAT is shown on the wall.

   Turns the customer's current choice into one description the renderer can
   hang on a wall, whatever page it came from:

     { kind: "studio",  cfg, ctx, photoUrls }                 a FrameX Studio design (photo, product or template)
     { kind: "product", product, selection, photos }          a frame chosen on its product page
     { kind: "decor",   product, selection }                  ready-made wall art, one piece or a multi-panel set
     { kind: "panels",  name, hex, glossy, pieces }           one photo split across panels (wall-art customiser)

   build(spec) -> subject
     {
       title, sizeText          words for the screen ("Classic frame", "13.4 × 17.4 in · 34 × 44 cm")
       width, height, depth     the whole piece in METRES (its real size: from the product's own sizes)
       pieces: [{ x, y, w, h, canvas, side }]   each framed part: its centre and size on the wall, its painted front, its edge colour
       side                     edge colour of the frame
       shadow: { strength }     how strong the wall shadow is
       model                    null today. A product can later name a 3D model here (see productModel.liveDemo):
                                the Live Demo would load it instead of drawing boxes, with the same size and placement.
     }

   Sizes are never invented: they come from the size the customer chose
   (inches or centimetres in the product data). Nothing here talks to a server.
   ========================================================================== */
(function (FrameX) {
  const INCH = 0.0254; // metres
  const MM = 0.001;
  const TO_INCH = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4 };
  const round1 = (n) => Math.round(n * 10) / 10;

  /** A picture, ready to draw. null when it can't be loaded (the piece is then drawn without it). */
  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      // A picture from another address may only be drawn if that server allows it; otherwise it is left out.
      try {
        if (new URL(url, location.href).origin !== location.origin && !/^(blob|data):/.test(url)) img.crossOrigin = "anonymous";
      } catch (error) {
        /* a relative address: same origin */
      }
      img.decoding = "async";
      img.onload = () => resolve(img.naturalWidth ? img : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  const soon = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

  function sizeText(widthM, heightM) {
    const wi = widthM / INCH;
    const hi = heightM / INCH;
    return `${round1(wi)} × ${round1(hi)} in · ${Math.round(widthM * 100)} × ${Math.round(heightM * 100)} cm`;
  }

  /** Darker shade of a colour, for the frame's sides when it has none of its own. */
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return "#1c1c1c";
    return "#" + [1, 2, 3].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * k))).toString(16).padStart(2, "0")).join("");
  }

  /* ---------------------------------------------------------------- A Studio design */
  const DEPTH_MM = { flat: 20, bevel: 22, ornate: 30, float: 35 };

  async function fromStudio({ cfg, ctx, photoUrls = {}, images = null, title = "", matHex = "" }) {
    const engine = FrameX.studioEngine;
    const paint = FrameX.ldPaint;
    const slots = ctx.caps.photoSlots || [];
    const loaded = images || {};
    if (!images)
      await Promise.all(
        slots.map(async (slot) => {
          if (cfg.photos && cfg.photos[slot] && photoUrls[slot]) loaded[slot] = await loadImage(photoUrls[slot]);
        }),
      );
    // The fonts the design's text uses have to be in before it is drawn.
    if (ctx.template && document.fonts && document.fonts.load)
      await soon(Promise.all(paint.fontsOf(ctx.template, { text: cfg.text || {}, mode: "live" }).map((f) => document.fonts.load(f.font, f.text).catch(() => {}))), 2500);

    const painted = paint.paintStudio(cfg, ctx, { images: loaded, width: 1400, mode: "live", matHex });
    const g = painted.geometry;
    const perUnit = (g.inches.w / 1000) * INCH; // metres per preview unit: the print is 1000 units wide
    const width = g.OW * perUnit;
    const height = g.OH * perUnit;
    const product = ctx.product || null;
    const framed = Boolean(ctx.caps.frame);
    const ownDepth = product && product.frame && Number(product.frame.depth) > 0 ? Number(product.frame.depth) : 0;
    const depth = (ownDepth || (framed ? DEPTH_MM[g.type.profile] || 20 : 6)) * MM;
    const missing = slots.filter((slot) => !loaded[slot]).length;
    const name = title || (ctx.template ? ctx.template.title : product ? product.name : "Your framed photo");
    return {
      kind: "studio",
      title: name,
      sizeText: sizeText(width, height),
      printText: `${g.inches.w} × ${g.inches.h} in print`,
      width,
      height,
      depth,
      side: framed ? shade(painted.frameHex, 0.82) : "#f4f1ea",
      pieces: [{ x: 0, y: 0, w: width, h: height, canvas: painted.canvas }],
      shadow: { strength: framed ? 0.36 : 0.26 },
      missingPhotos: missing,
      model: (product && product.liveDemo && product.liveDemo.model) || null,
    };
  }

  /* ---------------------------------------------------------------- A frame on its product page
     The page keeps a size, a colour, and where the customer's photo sits in the
     opening ("How it fits"). The same Studio engine draws it, with exactly that part of the photo. */
  async function fromProduct({ product, selection = {}, photos = [] }) {
    const engine = FrameX.studioEngine;
    // The page offers every listed colour and turns the frame to suit the photo, whatever the shop lets
    // customers change inside FrameX Studio. So the engine is asked about the product as the page sells it.
    const asOnPage = Object.assign({}, product, { customization: Object.assign({}, product.customization, { photoUpload: true, frameColor: true, orientation: true }) });
    const ctx = engine.context({ product: asOnPage });
    const cfg = engine.defaults(ctx);
    const has = (list, id) => (list || []).some((x) => x.id === id);
    if (has(ctx.caps.sizes, selection.sizeId)) cfg.sizeId = selection.sizeId;
    if (has(ctx.caps.colorsFor(cfg.frame.typeId), selection.colorId)) cfg.frame.colorId = selection.colorId;
    if (has(ctx.caps.protection, selection.protection)) cfg.protection = selection.protection;
    if (has(ctx.caps.printMaterials, selection.printMaterialId)) cfg.printMaterialId = selection.printMaterialId;

    const photo = photos.find((p) => p && p.url) || null;
    const size = (product.sizes || []).find((s) => s.id === cfg.sizeId);
    let aspect = 0;
    if (size && size.width > 0 && size.height > 0) {
      let [w, h] = [Number(size.width), Number(size.height)];
      // The page turns a frame the shop offers both ways round to suit the photo. Do the same.
      if (photo) {
        const turns = !["arch", "round"].includes((product.frame || {}).shape);
        const offers = (o) => turns && has(ctx.caps.orientations, o);
        const wide = photo.width > photo.height * 1.08;
        const tall = photo.height > photo.width * 1.08;
        if ((wide && w < h && offers("landscape")) || (tall && w > h && offers("portrait"))) [w, h] = [h, w];
        if (w > h && offers("landscape")) cfg.orientation = "landscape";
        else if (h > w && offers("portrait")) cfg.orientation = "portrait";
      }
      aspect = w / h;
    }
    engine.normalize(cfg, ctx);

    const images = {};
    if (photo) {
      const img = await loadImage(photo.url);
      if (img) {
        cfg.photos.photo1 = photo.id || "photo";
        images.photo1 = aspect ? cropLikePage(img, aspect, photo) : img;
      }
    }
    // Sold with a mat in a colour FrameX Studio has no mat for (the Studio draws cream instead):
    // on the wall it is the product's own colour, measured from its photo.
    const ownMat = (product.mat || {}).legacyColor || (product.frame || {}).matColor || "";
    return fromStudio({ cfg, ctx, images, title: product.name, matHex: OWN_MAT[ownMat] || "" });
  }
  const OWN_MAT = { red: "#ca2219" };

  /** The part of the photo the product page's "How it fits" shows: x, y = the photo point at the centre, zoom ≥ 1. */
  function cropLikePage(img, aspect, { x = 0.5, y = 0.5, zoom = 1 }) {
    const pw = img.naturalWidth;
    const ph = img.naturalHeight;
    const W = aspect;
    const H = 1;
    const scale = Math.max(W / pw, H / ph) * Math.min(3, Math.max(1, Number(zoom) || 1));
    const dw = pw * scale;
    const dh = ph * scale;
    const left = Math.min(0, Math.max(W - dw, W / 2 - (Number(x) || 0.5) * dw));
    const top = Math.min(0, Math.max(H - dh, H / 2 - (Number(y) || 0.5) * dh));
    const sw = W / scale;
    const sh = H / scale;
    const canvas = document.createElement("canvas");
    const k = Math.min(1, 1600 / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const c = canvas.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(img, -left / scale, -top / scale, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /* ---------------------------------------------------------------- Ready-made wall art (Home Decor) */
  const DECOR = { frameShare: 0.031, frameMin: 12, frameMax: 22, matShare: 0.065, depth: 22 }; // millimetres; shares are of the print's width

  function inches(text) {
    const m = String(text || "").match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*(in|cm|mm)?/i);
    if (!m) return null;
    const k = TO_INCH[(m[3] || "in").toLowerCase()] || 1;
    return { w: Number(m[1]) * k, h: Number(m[2]) * k };
  }

  /** The panels of a set, as parts of the artwork (the same rule tools/decor/scene.mjs draws the product photos with). */
  function slices(artW, artH, { panels, gap, stagger }) {
    if (panels <= 1) return [{ x: 0, y: 0, w: artW, h: artH }];
    const w = (artW - gap * (panels - 1)) / panels;
    return Array.from({ length: panels }, (_, i) => {
      const d = Math.abs(i - (panels - 1) / 2) / ((panels - 1) / 2);
      const h = stagger ? artH * (1 - 0.34 * d) : artH;
      return { x: i * (w + gap), y: (artH - h) / 2, w, h };
    });
  }

  async function fromDecor({ product, selection = {} }) {
    const decor = product.decor || {};
    const art = decor.art || {};
    const img = await loadImage(art.url);
    if (!img) throw Object.assign(new Error("The artwork picture could not be loaded."), { code: "ASSET" });
    const panels = Math.max(1, Number(decor.panelCount) || 1);
    const sizeId = selection.sizeId || (product.sizes && product.sizes[0] && product.sizes[0].id);
    const raw = (product.sizeOptions || []).find((s) => s.id === sizeId) || {};
    const model = (product.sizes || []).find((s) => s.id === sizeId) || {};
    // One panel's print, in inches: a set lists it separately; a single piece is its own size.
    const each = panels > 1 ? inches(raw.panel) : model.width > 0 && model.height > 0 ? { w: model.width * (TO_INCH[model.unit] || 1), h: model.height * (TO_INCH[model.unit] || 1) } : inches(raw.dimensions);
    if (!each) throw Object.assign(new Error("This product has no size to show."), { code: "DATA" });
    const gapIn = Number(art.wallGapIn) || 2;
    const pal = (FrameX.productModel && FrameX.productModel.palette()) || {};
    const hex = (pal[selection.colorId] || pal[(product.frame && product.frame.colors && product.frame.colors[0]) || ""] || { hex: "#1c1c1c" }).hex;
    const printW = each.w * 25.4; // millimetres
    const frame = Math.min(DECOR.frameMax, Math.max(DECOR.frameMin, printW * DECOR.frameShare));
    const mat = art.mat ? printW * DECOR.matShare : 0;
    const parts = slices(img.naturalWidth, img.naturalHeight, { panels, gap: Number(art.gapPx) || 0, stagger: Boolean(decor.stagger) });
    const pieces = parts.map((s, i) => {
      const openH = each.h * 25.4 * (s.h / img.naturalHeight);
      const canvas = FrameX.ldPaint.paintWallArt({ art: img, slice: s, opening: { w: printW, h: openH }, frame, mat, hex, width: panels > 1 ? 720 : 1280, sheen: !/matte/i.test(selection.printMaterialId || "") });
      const w = (printW + 2 * (frame + mat)) * MM;
      const h = (openH + 2 * (frame + mat)) * MM;
      return { x: (i - (panels - 1) / 2) * (each.w + gapIn) * INCH, y: 0, w, h, canvas };
    });
    const width = pieces[pieces.length - 1].x + pieces[pieces.length - 1].w / 2 - (pieces[0].x - pieces[0].w / 2);
    const height = Math.max(...pieces.map((p) => p.h));
    return {
      kind: "decor",
      title: product.name,
      sizeText: sizeText(width, height),
      printText: panels > 1 ? `${panels} panels, each ${round1(each.w)} × ${round1(each.h)} in` : `${round1(each.w)} × ${round1(each.h)} in print`,
      width,
      height,
      depth: (Number(product.frame && product.frame.depth) > 0 ? Number(product.frame.depth) : DECOR.depth) * MM,
      side: shade(hex, 0.82),
      pieces,
      shadow: { strength: 0.36 },
      missingPhotos: 0,
      model: (product.liveDemo && product.liveDemo.model) || null,
    };
  }

  /* ---------------------------------------------------------------- One photo across panels (wall-art customiser)
     The customiser works out the panels itself (it already draws them): each piece comes
     with its place and size in inches and the part of the photo behind its opening. */
  async function fromPanels({ name = "Your photo, split across panels", hex = "#1c1c1c", glossy = false, pieces = [], image = null, depthMm = 22 }) {
    if (!pieces.length) throw Object.assign(new Error("Nothing to show yet."), { code: "DATA" });
    const made = pieces.map((p) => {
      const frame = p.frameIn * 25.4;
      const canvas = FrameX.ldPaint.paintWallArt({ art: image, slice: image ? p.slice : null, opening: { w: p.w * 25.4 - 2 * frame, h: p.h * 25.4 - 2 * frame }, frame, mat: 0, hex, width: 720, sheen: glossy });
      return { x: p.x * INCH, y: p.y * INCH, w: p.w * INCH, h: p.h * INCH, canvas };
    });
    const left = Math.min(...made.map((p) => p.x - p.w / 2));
    const right = Math.max(...made.map((p) => p.x + p.w / 2));
    const bottom = Math.min(...made.map((p) => p.y - p.h / 2));
    const top = Math.max(...made.map((p) => p.y + p.h / 2));
    return {
      kind: "panels",
      title: name,
      sizeText: sizeText(right - left, top - bottom),
      printText: `${made.length} panels`,
      width: right - left,
      height: top - bottom,
      depth: depthMm * MM,
      side: shade(hex, 0.82),
      pieces: made,
      shadow: { strength: 0.36 },
      missingPhotos: image ? 0 : 1,
      model: null,
    };
  }

  async function build(spec) {
    if (!spec || !spec.kind) throw Object.assign(new Error("Nothing to show."), { code: "DATA" });
    const subject =
      spec.kind === "studio" ? await fromStudio(spec) : spec.kind === "product" ? await fromProduct(spec) : spec.kind === "decor" ? await fromDecor(spec) : spec.kind === "panels" ? await fromPanels(spec) : null;
    if (!subject || !(subject.width > 0) || !(subject.height > 0)) throw Object.assign(new Error("This design has no size to show."), { code: "DATA" });
    return subject;
  }

  FrameX.ldSubject = { build, loadImage, sizeText };
})((window.FrameX = window.FrameX || {}));
