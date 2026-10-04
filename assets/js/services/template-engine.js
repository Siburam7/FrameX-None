/* ==========================================================================
   Template layout engine.
   Turns a template's `layout` (js/templates.js) plus the customer's photos and
   text into HTML. One renderer draws every template: cards, the detail page,
   and the live preview in the customizer all call render().

   Coordinates are the layout's own units (e.g. 800 × 1000). They become
   percentages of the canvas, and text sizes become container-query units
   (cqw), so a design scales from a 160px card to a full-screen preview. A
   future print service can read the same layout at 300 dpi.

   render(template, { photos, text, mode })
     photos  { photo1: url, … }   customer photos (object URLs or remote URLs)
     text    { fieldId: value }   customer text
     mode    "sample" (cards / detail: fill gaps with samplePhotos + default text)
             "live"   (customizer: empty slots become "Add photo" buttons)
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc, icon } = FrameX.dom;

  const FONTS = {
    display: "var(--font-display)",
    sans: "var(--font-body)",
    serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
    script: "'Great Vibes', 'Segoe Script', cursive",
  };
  // Rough average glyph width (in em) per font, used to shrink long text to fit its box.
  const GLYPH = { display: 0.62, sans: 0.56, serif: 0.55, script: 0.42 };
  const SHAPES = new Set(["rect", "rounded", "circle", "heart", "arch"]);

  const pct = (value, total) => `${((Number(value) || 0) / total) * 100}%`;
  const cqw = (value, width) =>
    `${(((Number(value) || 0) / width) * 100).toFixed(3)}cqw`;

  /** "2026-10-04" -> "4 October 2026" (left as typed if it isn't an ISO date). */
  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(
      (FrameX.config && FrameX.config.locale) || "en-IN",
      { day: "numeric", month: "long", year: "numeric" },
    );
  }

  /** Problems that would stop a template from rendering (empty array = fine). */
  function validate(template) {
    const errors = [];
    const layout = template && template.layout;
    if (!template || !template.id) errors.push("missing id");
    if (!layout || !(layout.width > 0) || !(layout.height > 0))
      errors.push("layout needs a positive width and height");
    if (!layout || !Array.isArray(layout.elements) || !layout.elements.length)
      errors.push("layout has no elements");
    ((layout && layout.elements) || []).forEach((el, i) => {
      if (!["image", "text", "label", "shape"].includes(el.type))
        errors.push(`element ${i} has unknown type "${el.type}"`);
      if (el.type === "image" && !el.slot)
        errors.push(`image element ${i} has no slot`);
      if (
        el.type === "text" &&
        !(template.textFields || []).some((f) => f.id === el.field)
      )
        errors.push(`text element ${i} uses unknown field "${el.field}"`);
    });
    return errors;
  }

  /** Photo slot ids in layout order: ["photo1", "photo2", …]. */
  const slotsOf = (template) =>
    ((template.layout && template.layout.elements) || [])
      .filter((e) => e.type === "image")
      .map((e) => e.slot);

  function box(el, layout) {
    const parts = [
      `left:${pct(el.x, layout.width)}`,
      `top:${pct(el.y, layout.height)}`,
      `width:${pct(el.width, layout.width)}`,
    ];
    if (el.height != null)
      parts.push(`height:${pct(el.height, layout.height)}`);
    if (el.rotate) parts.push(`transform:rotate(${Number(el.rotate)}deg)`);
    if (el.opacity != null) parts.push(`opacity:${Number(el.opacity)}`);
    return parts.join(";");
  }

  /** Inline style for a photo inside its slot.
      crop: { fit: "fill" | "fit" | "crop", zoom, px, py, rotate }
        fill  cover, centred (default)
        fit   whole photo visible (contain)
        crop  cover + the customer's focal point (px, py in %) and zoom
      Rotations of 90° / 270° scale up so the slot stays covered. */
  function photoStyle(el, crop) {
    if (!crop) return "";
    const rotate = (((Number(crop.rotate) || 0) % 360) + 360) % 360;
    const ratio = (Number(el.width) || 1) / (Number(el.height) || 1);
    const turn =
      rotate === 90 || rotate === 270 ? Math.max(ratio, 1 / ratio) : 1;
    if (crop.fit === "fit")
      return `object-fit:contain;transform:rotate(${rotate}deg)`;
    const px =
      crop.fit === "crop"
        ? Math.min(100, Math.max(0, Number(crop.px) || 50))
        : 50;
    const py =
      crop.fit === "crop"
        ? Math.min(100, Math.max(0, Number(crop.py) || 50))
        : 50;
    const zoom =
      crop.fit === "crop"
        ? Math.min(4, Math.max(1, Number(crop.zoom) || 1))
        : 1;
    // Rotate and zoom around the centre; the focal point (px, py) pans the photo,
    // limited so the slot always stays covered.
    const scale = zoom * turn;
    const reach = ((scale - 1) / (2 * scale)) * 100;
    const dx = ((50 - px) / 50) * reach;
    const dy = ((50 - py) / 50) * reach;
    const pos = rotate ? "50% 50%" : `${px}% ${py}%`;
    return `object-fit:cover;object-position:${pos};transform:translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) rotate(${rotate}deg) scale(${scale.toFixed(3)})`;
  }

  function imageEl(el, layout, url, index, mode, crop) {
    const shape = SHAPES.has(el.shape) ? el.shape : "rect";
    const classes = [
      "tpl-slot",
      `tpl-slot--${shape}`,
      el.frame === "polaroid" ? "tpl-slot--polaroid" : "",
      el.border ? "tpl-slot--bordered" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const style =
      box(el, layout) + (el.border ? `;--slot-border:${esc(el.border)}` : "");
    const inner = url
      ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false" style="${photoStyle(el, crop)}">`
      : mode === "live"
        ? `<button class="tpl-slot__empty" type="button" data-slot="${esc(el.slot)}" aria-label="Add photo ${index + 1}">${icon("upload")}<span>Photo ${index + 1}</span></button>`
        : `<span class="tpl-slot__empty" aria-hidden="true">${icon("image")}<span>Your photo</span></span>`;
    return `<div class="${classes}" style="${style}" data-slot-id="${esc(el.slot)}"><div class="tpl-slot__clip">${inner}</div></div>`;
  }

  /** Apply a customer text style ({ font, weight, italic, uppercase, scale, align, color, dy })
      on top of the template's own element settings. */
  function styled(el, style) {
    if (!style) return el;
    const out = Object.assign({}, el);
    ["font", "weight", "italic", "uppercase", "align", "color"].forEach(
      (k) => style[k] != null && (out[k] = style[k]),
    );
    if (style.scale) out.size = el.size * style.scale;
    if (style.dy) out.y = el.y + Number(style.dy);
    return out;
  }

  function textEl(el, layout, value) {
    if (!value) return "";
    const font = FONTS[el.font] ? el.font : "sans";
    const shown = el.uppercase ? value.toUpperCase() : value;
    // Shrink long text so it stays inside its box.
    const spacingEm = (Number(el.spacing) || 0) / (Number(el.size) || 1);
    // Capitals are wider than lower case, much wider in a script font.
    const upperWidth = font === "script" ? 2.7 : 1.22;
    const units = [...shown].reduce(
      (sum, ch) => sum + (ch !== ch.toLowerCase() ? upperWidth : 1),
      0,
    );
    const estimate =
      (Number(el.size) || 0) * (units * GLYPH[font] + shown.length * spacingEm);
    const scale = estimate > el.width ? el.width / estimate : 1;
    const style = [
      box(el, layout),
      `font-family:${FONTS[font]}`,
      `font-size:${cqw(el.size * scale, layout.width)}`,
      `font-weight:${Number(el.weight) || 400}`,
      `color:${esc(el.color || "#1f1a16")}`,
      `text-align:${["left", "center", "right"].includes(el.align) ? el.align : "left"}`,
      el.italic ? "font-style:italic" : "",
      el.spacing
        ? `letter-spacing:${cqw(el.spacing * scale, layout.width)}`
        : "",
    ]
      .filter(Boolean)
      .join(";");
    return `<p class="tpl-text" style="${style}">${esc(shown)}</p>`;
  }

  function shapeEl(el, layout) {
    const color = esc(el.color || "#000");
    const base = box(el, layout);
    if (el.shape === "heart" || el.shape === "star") {
      const path =
        el.shape === "heart"
          ? "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.3 4.5c2 0 3.6 1.1 4.6 2.6.9-1.5 2.6-2.6 4.6-2.6 3.6 0 5.4 3.9 3.9 7.3C19.5 16.4 12 21 12 21z"
          : "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z";
      return `<svg class="tpl-shape" style="${base}" viewBox="0 0 24 24" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="${color}"/></svg>`;
    }
    const radius =
      el.shape === "circle" ? "50%" : el.shape === "line" ? "999px" : "0";
    const fill = el.outline
      ? `border:${cqw(3, layout.width)} solid ${esc(el.outline)};background:${color}`
      : `background:${color}`;
    return `<span class="tpl-shape" style="${base};${fill};border-radius:${radius}" aria-hidden="true"></span>`;
  }

  /** HTML for a whole design. `label` names the canvas for screen readers. */
  /* Optional customer choices (FrameX Studio):
       crop        { slot: crop }        see photoStyle()
       textStyles  { fieldId: style }    see styled()
       background  { color, pattern }    replaces the template background */
  function render(
    template,
    {
      photos = {},
      text = {},
      mode = "sample",
      label,
      crop = {},
      textStyles = {},
      background = null,
    } = {},
  ) {
    if (validate(template).length) {
      return `<div class="tpl-canvas tpl-canvas--broken" role="img" aria-label="Design unavailable"><span>${icon("alert")} This design can't be shown right now.</span></div>`;
    }
    const layout = template.layout;
    const bg = Object.assign({}, layout.background || {}, background || {});
    const fields = new Map((template.textFields || []).map((f) => [f.id, f]));
    const samples = template.samplePhotos || [];
    let imageIndex = 0;

    const body = layout.elements
      .map((el) => {
        if (el.type === "image") {
          const i = imageIndex++;
          const url =
            photos[el.slot] ||
            (mode === "sample" ? samples[i % (samples.length || 1)] : "");
          return imageEl(el, layout, url, i, mode, crop[el.slot]);
        }
        if (el.type === "label") return textEl(el, layout, el.text);
        if (el.type === "text") {
          const field = fields.get(el.field) || {};
          const raw =
            text[el.field] != null
              ? text[el.field]
              : mode === "sample"
                ? field.defaultValue || ""
                : "";
          return textEl(
            styled(el, textStyles[el.field]),
            layout,
            field.type === "date" ? formatDate(raw) : String(raw),
          );
        }
        return shapeEl(el, layout);
      })
      .join("");

    const style = [
      `aspect-ratio:${layout.width} / ${layout.height}`,
      `background-color:${esc(bg.color || "#ffffff")}`,
      bg.gradient ? `background-image:${esc(bg.gradient)}` : "",
    ]
      .filter(Boolean)
      .join(";");
    const pattern = bg.pattern ? ` tpl-canvas--${esc(bg.pattern)}` : "";
    // Live previews contain "Add photo" buttons, so they can't be a single image to screen readers.
    const role = mode === "live" ? "group" : "img";
    return `<div class="tpl-canvas${pattern}" style="${style}" role="${role}" aria-label="${esc(label || template.title + " design")}">${body}</div>`;
  }

  FrameX.templateEngine = { render, validate, slotsOf, formatDate, photoStyle };
})((window.FrameX = window.FrameX || {}));
