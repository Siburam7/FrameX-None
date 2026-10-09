/* ==========================================================================
   Live Demo ("View on My Wall") — the painter.

   Draws a customised FrameX piece as a flat picture (a canvas), which the
   Live Demo then hangs on the wall as the front of a 3D frame.

   It does NOT have a look of its own. It redraws, on a canvas, exactly what
   the site already shows as layered HTML:
     a Studio design     services/studio-engine.js  geometry() + assets/css/studio.css (.fs-*)
     template artwork    services/template-engine.js render() + assets/css/templates.css (.tpl-*)
     wall art            the frame of tools/decor/scene.mjs (what the product photos show)
   so the same design object gives the same picture. If a frame type, texture
   or template feature changes there, change it here too (tests compare the two).

   Lengths in the CSS are container-query units (cqw = 1% of the piece's
   width); here `cq` is that unit in canvas pixels.
   ========================================================================== */
(function (FrameX) {
  const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
  const white = (a) => rgba(255, 255, 255, a);
  const black = (a) => rgba(0, 0, 0, a);
  const INK = (a) => rgba(31, 26, 22, a);

  /* ---------------------------------------------------------------- CSS-like primitives */

  /** A CSS linear-gradient() for a box: 0deg runs to the top, 90deg to the right. stops: [[0..1, colour]]. */
  function linear(c, x, y, w, h, deg, stops) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const g = c.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    stops.forEach(([at, color]) => g.addColorStop(Math.min(1, Math.max(0, at)), color));
    return g;
  }

  function fillLinear(c, x, y, w, h, deg, stops) {
    c.fillStyle = linear(c, x, y, w, h, deg, stops);
    c.fillRect(x, y, w, h);
  }

  /** The band between two insets of a box (what a spread-only box-shadow paints). Negative insets lie outside it. */
  function band(c, x, y, w, h, from, to, color) {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    if (w - 2 * b <= 0 || h - 2 * b <= 0) {
      c.fillStyle = color;
      c.fillRect(x + a, y + a, w - 2 * a, h - 2 * a);
      return;
    }
    c.beginPath();
    c.rect(x + a, y + a, w - 2 * a, h - 2 * a);
    c.rect(x + b, y + b, w - 2 * b, h - 2 * b);
    c.fillStyle = color;
    c.fill("evenodd");
  }

  /** repeating-linear-gradient() made of hard bands. dir "x": the bands repeat to the right; "y": upwards. */
  function stripes(c, x, y, w, h, dir, period, bands) {
    if (!(period > 0.2)) return;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    const length = dir === "x" ? w : h;
    for (let at = 0; at < length; at += period)
      bands.forEach(([from, to, color]) => {
        c.fillStyle = color;
        if (dir === "x") c.fillRect(x + at + from, y, to - from, h);
        else c.fillRect(x, y + h - at - to, w, to - from);
      });
    c.restore();
  }

  /** A soft shadow that falls INSIDE a box (box-shadow: inset dx dy blur colour). */
  function insetShadow(c, x, y, w, h, dx, dy, blur, color) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.shadowColor = color;
    c.shadowBlur = blur;
    c.shadowOffsetX = dx;
    c.shadowOffsetY = dy;
    // Everything around the box, drawn outside the clip: only its shadow shows.
    const pad = Math.max(w, h) + blur * 4 + Math.abs(dx) + Math.abs(dy);
    c.beginPath();
    c.rect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
    c.rect(x, y, w, h);
    c.fillStyle = "#000";
    c.fill("evenodd");
    c.restore();
  }

  /**
   * A box with elliptical corners, with CSS's rule for radii that don't fit
   * (all of them shrink by the same factor until none overlap).
   * radii: [topLeft, topRight, bottomRight, bottomLeft], each { x, y }.
   */
  function roundedPath(c, x, y, w, h, radii) {
    let r = radii.map((q) => ({ x: Math.max(0, q.x), y: Math.max(0, q.y) }));
    const f = Math.min(1, w / (r[0].x + r[1].x || 1), w / (r[3].x + r[2].x || 1), h / (r[0].y + r[3].y || 1), h / (r[1].y + r[2].y || 1));
    r = r.map((q) => ({ x: q.x * f, y: q.y * f }));
    c.beginPath();
    c.moveTo(x + r[0].x, y);
    c.lineTo(x + w - r[1].x, y);
    if (r[1].x && r[1].y) c.ellipse(x + w - r[1].x, y + r[1].y, r[1].x, r[1].y, 0, -Math.PI / 2, 0);
    c.lineTo(x + w, y + h - r[2].y);
    if (r[2].x && r[2].y) c.ellipse(x + w - r[2].x, y + h - r[2].y, r[2].x, r[2].y, 0, 0, Math.PI / 2);
    c.lineTo(x + r[3].x, y + h);
    if (r[3].x && r[3].y) c.ellipse(x + r[3].x, y + h - r[3].y, r[3].x, r[3].y, 0, Math.PI / 2, Math.PI);
    c.lineTo(x, y + r[0].y);
    if (r[0].x && r[0].y) c.ellipse(x + r[0].x, y + r[0].y, r[0].x, r[0].y, 0, Math.PI, Math.PI * 1.5);
    c.closePath();
  }
  const even = (v) => [0, 1, 2, 3].map(() => ({ x: v, y: v }));

  /** An SVG path (given in a viewBox of vw × vh) stretched over a box. */
  function svgPathIn(pathData, vw, vh, x, y, w, h) {
    const path = new Path2D();
    const m = new DOMMatrix([w / vw, 0, 0, h / vh, x, y]);
    path.addPath(new Path2D(pathData), m);
    return path;
  }

  const HEART_MASK = "M12 21.5S1 14.7 1 7.2C1 3.6 3.7 1 7 1c2.1 0 3.9 1.1 5 2.8C13.1 2.1 14.9 1 17 1c3.3 0 6 2.6 6 6.2 0 7.5-11 14.3-11 14.3z"; // viewBox 24 × 22
  const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.3 4.5c2 0 3.6 1.1 4.6 2.6.9-1.5 2.6-2.6 4.6-2.6 3.6 0 5.4 3.9 3.9 7.3C19.5 16.4 12 21 12 21z"; // viewBox 24 × 24
  const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z";

  /* ---------------------------------------------------------------- Template artwork (templates.css + template-engine.js) */

  const FONT = {
    display: '"Sora", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    sans: '"Plus Jakarta Sans", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
    script: "'Great Vibes', 'Segoe Script', cursive",
  };
  const GLYPH = { display: 0.62, sans: 0.56, serif: 0.55, script: 0.42 };
  const SLOT_SHAPES = new Set(["rect", "rounded", "circle", "heart", "arch"]);

  /** The customer's text style on top of the template's own (template-engine.js → styled). */
  function styled(el, style) {
    if (!style) return el;
    const out = Object.assign({}, el);
    ["font", "weight", "italic", "uppercase", "align", "color"].forEach((k) => style[k] != null && (out[k] = style[k]));
    if (style.scale) out.size = el.size * style.scale;
    if (style.dy) out.y = el.y + Number(style.dy);
    return out;
  }

  /** What one text element will draw: the words, the font and its size in layout units. */
  function textSpec(el, value) {
    if (!value) return null;
    const font = FONT[el.font] ? el.font : "sans";
    const shown = el.uppercase ? String(value).toUpperCase() : String(value);
    const spacingEm = (Number(el.spacing) || 0) / (Number(el.size) || 1);
    const upperWidth = font === "script" ? 2.7 : 1.22;
    const units = [...shown].reduce((sum, ch) => sum + (ch !== ch.toLowerCase() ? upperWidth : 1), 0);
    const estimate = (Number(el.size) || 0) * (units * GLYPH[font] + shown.length * spacingEm);
    const fit = estimate > el.width ? el.width / estimate : 1;
    return {
      shown,
      size: el.size * fit,
      spacing: (Number(el.spacing) || 0) * fit,
      family: FONT[font],
      weight: Number(el.weight) || 400,
      italic: Boolean(el.italic),
      color: el.color || "#1f1a16",
      align: ["left", "center", "right"].includes(el.align) ? el.align : "left",
    };
  }
  const fontOf = (t, px) => `${t.italic ? "italic " : ""}${t.weight} ${px}px ${t.family}`;

  /** Every font a design's text needs, as CSS font strings (so they can be loaded before drawing). */
  function fontsOf(template, { text = {}, mode = "sample", textStyles = {} } = {}) {
    const fields = new Map((template.textFields || []).map((f) => [f.id, f]));
    const out = [];
    ((template.layout && template.layout.elements) || []).forEach((el) => {
      let spec = null;
      if (el.type === "label") spec = textSpec(el, el.text);
      else if (el.type === "text") {
        const field = fields.get(el.field) || {};
        const raw = text[el.field] != null ? text[el.field] : mode === "sample" ? field.defaultValue || "" : "";
        spec = textSpec(styled(el, textStyles[el.field]), field.type === "date" ? FrameX.templateEngine.formatDate(raw) : String(raw));
      }
      if (spec) out.push({ font: fontOf(spec, 40), text: spec.shown });
    });
    return out;
  }

  function withBox(c, el, x, y, w, h, draw) {
    c.save();
    if (el.opacity != null) c.globalAlpha *= Math.min(1, Math.max(0, Number(el.opacity)));
    if (el.rotate) {
      c.translate(x + w / 2, y + h / 2);
      c.rotate((Number(el.rotate) * Math.PI) / 180);
      c.translate(-(x + w / 2), -(y + h / 2));
    }
    draw();
    c.restore();
  }

  /** A photo inside its space (template-engine.js → photoStyle: fill / fit / crop with focal point, zoom and turns). */
  function drawPhoto(c, img, x, y, w, h, el, crop) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    let px = 50, py = 50, scale = 1, dx = 0, dy = 0, rotate = 0, contain = false;
    if (crop) {
      rotate = (((Number(crop.rotate) || 0) % 360) + 360) % 360;
      const ratio = (Number(el.width) || 1) / (Number(el.height) || 1);
      const turn = rotate === 90 || rotate === 270 ? Math.max(ratio, 1 / ratio) : 1;
      if (crop.fit === "fit") contain = true;
      else {
        const cropping = crop.fit === "crop";
        px = cropping ? Math.min(100, Math.max(0, Number(crop.px) || 50)) : 50;
        py = cropping ? Math.min(100, Math.max(0, Number(crop.py) || 50)) : 50;
        const zoom = cropping ? Math.min(4, Math.max(1, Number(crop.zoom) || 1)) : 1;
        scale = zoom * turn;
        const reach = ((scale - 1) / (2 * scale)) * 100;
        dx = ((50 - px) / 50) * reach;
        dy = ((50 - py) / 50) * reach;
        if (rotate) (px = 50), (py = 50);
      }
    }
    c.save();
    c.translate(x + w / 2 + (dx / 100) * w, y + h / 2 + (dy / 100) * h);
    if (rotate) c.rotate((rotate * Math.PI) / 180);
    if (scale !== 1) c.scale(scale, scale);
    const k = contain ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
    const cw = iw * k;
    const ch = ih * k;
    c.imageSmoothingQuality = "high";
    c.drawImage(img, -w / 2 + (w - cw) * (px / 100), -h / 2 + (h - ch) * (py / 100), cw, ch);
    c.restore();
  }

  function slotPath(c, shape, x, y, w, h, cq) {
    if (shape === "heart") return svgPathIn(HEART_MASK, 24, 22, x, y, w, h);
    if (shape === "circle") roundedPath(c, x, y, w, h, even(Math.max(w, h)).map(() => ({ x: w / 2, y: h / 2 })));
    else if (shape === "rounded") roundedPath(c, x, y, w, h, even(2.4 * cq));
    else if (shape === "arch") roundedPath(c, x, y, w, h, [{ x: 999, y: 0.4 * h }, { x: 999, y: 0.4 * h }, { x: 1.2 * cq, y: 1.2 * cq }, { x: 1.2 * cq, y: 1.2 * cq }]);
    else {
      c.beginPath();
      c.rect(x, y, w, h);
    }
    return null;
  }

  function drawSlot(c, el, x, y, w, h, cq, img, crop, mode) {
    const shape = SLOT_SHAPES.has(el.shape) ? el.shape : "rect";
    withBox(c, el, x, y, w, h, () => {
      let ix = x, iy = y, iw = w, ih = h;
      if (el.frame === "polaroid") {
        c.save();
        c.shadowColor = INK(0.22);
        c.shadowBlur = 3 * cq;
        c.shadowOffsetY = 1.2 * cq;
        c.fillStyle = "#fff";
        c.fillRect(x, y, w, h);
        c.restore();
        ix += 1.6 * cq;
        iy += 1.6 * cq;
        iw -= 3.2 * cq;
        ih -= 7.6 * cq;
      } else if (el.border) {
        // A coloured edge around the photo, following the space's own shape.
        c.fillStyle = el.border;
        if (shape === "circle") roundedPath(c, x, y, w, h, even(0).map(() => ({ x: w / 2, y: h / 2 })));
        else if (shape === "rounded") roundedPath(c, x, y, w, h, even(2.4 * cq));
        else {
          c.beginPath();
          c.rect(x, y, w, h);
        }
        c.fill();
        ix += 1.1 * cq;
        iy += 1.1 * cq;
        iw -= 2.2 * cq;
        ih -= 2.2 * cq;
      }
      if (iw <= 0 || ih <= 0) return;
      c.save();
      const path = slotPath(c, shape, ix, iy, iw, ih, cq);
      if (path) c.clip(path);
      else c.clip();
      c.fillStyle = INK(0.08);
      c.fillRect(ix, iy, iw, ih);
      if (img) drawPhoto(c, img, ix, iy, iw, ih, el, crop);
      else emptySlot(c, ix, iy, iw, ih, cq, mode);
      c.restore();
    });
  }

  /** A photo space with no photo yet: the same quiet striped tile the page shows. */
  function emptySlot(c, x, y, w, h, cq, mode) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = white(0.35);
    c.fillRect(x, y, w, h);
    c.strokeStyle = white(0.2);
    c.lineWidth = 1.4 * cq * 0.7;
    for (let d = -h; d < w + h; d += 2.8 * cq * 1.414) {
      c.beginPath();
      c.moveTo(x + d, y + h);
      c.lineTo(x + d + h, y);
      c.stroke();
    }
    c.setLineDash([1.6 * cq, 1.2 * cq]);
    c.lineWidth = 0.35 * cq;
    c.strokeStyle = INK(0.28);
    c.strokeRect(x + 0.18 * cq, y + 0.18 * cq, w - 0.36 * cq, h - 0.36 * cq);
    c.setLineDash([]);
    const px = Math.max(9, Math.min(3 * cq, w / 7));
    c.font = `600 ${px}px ${FONT.sans}`;
    c.fillStyle = INK(0.6);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(mode === "live" ? "Your photo" : "Your photo", x + w / 2, y + h / 2);
    c.restore();
  }

  function drawText(c, el, spec, x, y, w, unit) {
    const px = spec.size * unit;
    if (!(px > 0.5)) return;
    const lineHeight = px * 1.12;
    withBox(c, el, x, y, w, lineHeight, () => {
      c.font = fontOf(spec, px);
      c.fillStyle = spec.color;
      c.textBaseline = "alphabetic";
      const m = c.measureText("Hg");
      const ascent = m.fontBoundingBoxAscent || px * 0.93;
      const descent = m.fontBoundingBoxDescent || px * 0.26;
      const baseline = y + (lineHeight - (ascent + descent)) / 2 + ascent;
      const gap = spec.spacing * unit;
      if (!gap || "letterSpacing" in c) {
        // Browsers that can space letters on a canvas keep the font's own kerning, exactly like the page.
        if (gap) c.letterSpacing = `${gap}px`;
        c.textAlign = spec.align;
        c.fillText(spec.shown, spec.align === "center" ? x + w / 2 : spec.align === "right" ? x + w : x, baseline);
        if (gap) c.letterSpacing = "0px";
        return;
      }
      // Older browsers: every letter keeps the same extra room after it, as in CSS (also after the last one).
      const chars = [...spec.shown];
      const widths = chars.map((ch) => c.measureText(ch).width);
      const total = widths.reduce((sum, v) => sum + v + gap, 0);
      let at = spec.align === "center" ? x + (w - total) / 2 : spec.align === "right" ? x + w - total : x;
      c.textAlign = "left";
      chars.forEach((ch, i) => {
        c.fillText(ch, at, baseline);
        at += widths[i] + gap;
      });
    });
  }

  function drawShape(c, el, x, y, w, h, unit) {
    withBox(c, el, x, y, w, h, () => {
      const color = el.color || "#000";
      if (el.shape === "heart" || el.shape === "star") {
        c.fillStyle = color;
        c.fill(svgPathIn(el.shape === "heart" ? HEART : STAR, 24, 24, x, y, w, h));
        return;
      }
      const radius = el.shape === "circle" ? { x: w / 2, y: h / 2 } : el.shape === "line" ? { x: 999, y: 999 } : { x: 0, y: 0 };
      roundedPath(c, x, y, w, h, [radius, radius, radius, radius]);
      c.fillStyle = color;
      c.fill();
      if (el.outline) {
        const line = 3 * unit;
        c.save();
        c.clip();
        roundedPath(c, x, y, w, h, [radius, radius, radius, radius]);
        c.lineWidth = line * 2; // half of it lies outside the clip: an inner border
        c.strokeStyle = el.outline;
        c.stroke();
        c.restore();
      }
    });
  }

  /** The quiet background patterns of templates.css (.tpl-canvas--dots / grid / confetti / hearts / stars). */
  function drawPattern(c, pattern, x, y, w, h, cq) {
    const dots = (tile, ox, oy, radius, color) => {
      c.fillStyle = color;
      for (let ty = oy - tile; ty < h + tile; ty += tile)
        for (let tx = ox - tile; tx < w + tile; tx += tile) {
          c.beginPath();
          c.arc(x + tx + tile / 2, y + ty + tile / 2, radius, 0, Math.PI * 2);
          c.fill();
        }
    };
    const tiles = (tile, pathData, color) => {
      c.fillStyle = color;
      for (let ty = 0; ty < h; ty += tile) for (let tx = 0; tx < w; tx += tile) c.fill(svgPathIn(pathData, 24, 24, x + tx, y + ty, tile, tile));
    };
    if (pattern === "dots") dots(5 * cq, 0, 0, 0.65 * cq, INK(0.12));
    else if (pattern === "grid") {
      c.fillStyle = INK(0.06);
      for (let ty = 0; ty < h; ty += 6 * cq) c.fillRect(x, y + ty, w, 1);
      for (let tx = 0; tx < w; tx += 6 * cq) c.fillRect(x + tx, y, 1, h);
    } else if (pattern === "confetti") {
      dots(13 * cq, 4 * cq, 6 * cq, 0.55 * cq, rgba(29, 36, 51, 0.18));
      dots(23 * cq, 7 * cq, 11 * cq, 0.65 * cq, rgba(184, 135, 43, 0.35));
      dots(17 * cq, 0, 0, 0.75 * cq, rgba(199, 87, 111, 0.35));
    } else if (pattern === "hearts") tiles(7 * cq, HEART, rgba(199, 87, 111, 0.12));
    else if (pattern === "stars") tiles(8 * cq, STAR, rgba(184, 135, 43, 0.18));
  }

  /**
   * One whole design into the box (x, y, w, h) of a canvas.
   * Same arguments as templateEngine.render, except photos are loaded pictures:
   *   images { slot: HTMLImageElement | ImageBitmap | HTMLCanvasElement }
   */
  function paintTemplate(c, x, y, w, h, template, { images = {}, text = {}, mode = "sample", crop = {}, textStyles = {}, background = null, samples = [] } = {}) {
    const layout = template.layout;
    const ux = w / layout.width; // canvas pixels per layout unit
    const uy = h / layout.height;
    const cq = w / 100;
    const bg = Object.assign({}, layout.background || {}, background || {});
    const fields = new Map((template.textFields || []).map((f) => [f.id, f]));
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = bg.color || "#ffffff";
    c.fillRect(x, y, w, h);
    if (bg.pattern) drawPattern(c, bg.pattern, x, y, w, h, cq);
    let imageIndex = 0;
    layout.elements.forEach((el) => {
      const ex = x + (Number(el.x) || 0) * ux;
      const ey = y + (Number(el.y) || 0) * uy;
      const ew = (Number(el.width) || 0) * ux;
      const eh = (Number(el.height) || 0) * uy;
      if (el.type === "image") {
        const i = imageIndex++;
        const img = images[el.slot] || (mode === "sample" && samples.length ? samples[i % samples.length] : null);
        drawSlot(c, el, ex, ey, ew, eh, cq, img, crop[el.slot], mode);
      } else if (el.type === "label") {
        const spec = textSpec(el, el.text);
        if (spec) drawText(c, el, spec, ex, ey, ew, ux);
      } else if (el.type === "text") {
        const field = fields.get(el.field) || {};
        const raw = text[el.field] != null ? text[el.field] : mode === "sample" ? field.defaultValue || "" : "";
        const s = styled(el, textStyles[el.field]);
        const spec = textSpec(s, field.type === "date" ? FrameX.templateEngine.formatDate(raw) : String(raw));
        if (spec) drawText(c, s, spec, x + (Number(s.x) || 0) * ux, y + (Number(s.y) || 0) * uy, ew, ux);
      } else drawShape(c, el, ex, ey, ew, eh, ux);
    });
    c.restore();
  }

  /* ---------------------------------------------------------------- A Studio frame (studio.css .fs-*) */

  function paintMoulding(c, x, y, w, h, { hex, texture, profile, finish, fw, cq }) {
    c.fillStyle = hex;
    c.fillRect(x, y, w, h);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    // Material: the light across the moulding, and its grain.
    // On an ornate (carved) moulding the stylesheet repeats the light in small squares, which reads as carving.
    const ornate = profile === "ornate";
    const light = (stops) => {
      if (!ornate) return fillLinear(c, x, y, w, h, 135, stops);
      const size = Math.max(2, Math.round(1.6 * cq));
      const tile = document.createElement("canvas");
      tile.width = tile.height = size;
      fillLinear(tile.getContext("2d"), 0, 0, size, size, 135, stops);
      c.save();
      c.translate(x, y);
      c.fillStyle = c.createPattern(tile, "repeat");
      c.fillRect(0, 0, w, h);
      c.restore();
    };
    if (texture === "wood") {
      light([[0, white(0.14)], [0.4, white(0)], [1, black(0.22)]]);
      stripes(c, x, y, w, h, "y", 1.3 * cq, [[0, 0.2 * cq, black(0.06)]]);
      stripes(c, x, y, w, h, "x", (ornate ? 1.6 : 1.9) * cq, [[0, 0.25 * cq, black(0.07)], [0.9 * cq, 1.1 * cq, white(0.05)]]);
    } else if (texture === "metal") {
      stripes(c, x, y, w, h, "x", 0.4 * cq, [[0, 0.15 * cq, white(0.05)]]);
      light([[0, white(0.55)], [0.3, white(0)], [0.55, white(0.25)], [1, black(0.22)]]);
    } else if (profile === "ornate") {
      fillLinear(c, x, y, w, h, 135, [[0, white(0.22)], [0.4, white(0)], [1, black(0.28)]]);
      c.fillStyle = white(0.22);
      for (let ty = 0; ty < h; ty += 1.6 * cq)
        for (let tx = 0; tx < w; tx += 1.6 * cq) {
          c.beginPath();
          c.arc(x + tx + 0.8 * cq, y + ty + 0.8 * cq, 0.4 * cq, 0, Math.PI * 2);
          c.fill();
        }
    } else fillLinear(c, x, y, w, h, 135, [[0, white(0.16)], [0.38, white(0)], [1, black(0.2)]]);
    // Profile: the steps of the moulding, from its outer edge inwards
    const rings =
      profile === "bevel"
        ? [[fw * 0.5, black(0.14)], [fw * 0.45, white(0.05)], [0.25 * cq, white(0.14)]]
        : profile === "ornate"
          ? [[fw * 0.75, black(0.2)], [fw * 0.7, white(0.06)], [fw * 0.34, black(0.22)], [fw * 0.3, white(0.08)], [0.3 * cq, black(0.3)]]
          : profile === "float"
            ? [[fw, black(0.35)], [fw * 0.55, hex], [0.25 * cq, white(0.12)]]
            : [[0.5 * cq, black(0.12)], [0.25 * cq, white(0.12)]];
    rings.forEach(([to, color]) => band(c, x, y, w, h, 0, to, color));
    // Finish: a sheen or a grain over the moulding
    if (finish === "gloss") fillLinear(c, x, y, w, h, 115, [[0, white(0.35)], [0.22, white(0)], [0.7, white(0)], [0.85, white(0.18)], [1, white(0)]]);
    else if (finish === "metallic") fillLinear(c, x, y, w, h, 100, [[0, white(0)], [0.3, white(0)], [0.45, white(0.35)], [0.6, white(0)], [1, white(0)]]);
    else if (finish === "wood-grain") stripes(c, x, y, w, h, "x", 0.6 * cq, [[0, 0.18 * cq, black(0.08)]]);
    else if (finish === "textured") {
      c.fillStyle = black(0.1);
      for (let ty = 0; ty < h; ty += 0.7 * cq) for (let tx = 0; tx < w; tx += 0.7 * cq) c.fillRect(x + tx + 0.25 * cq, y + ty + 0.25 * cq, 0.22 * cq, 0.22 * cq);
    }
    c.restore();
  }

  /**
   * A Studio design, drawn at `width` pixels across. Returns a canvas.
   *   cfg, ctx     the design and its context (studioEngine)
   *   images       { slot: loaded picture }
   *   samples      loaded sample pictures (templates shown before the customer's own photos are in)
   *   mode         "sample" fills empty photo spaces with samples; "live" leaves them as "Your photo" tiles
   */
  function paintStudio(cfg, ctx, { images = {}, samples = [], width = 1400, mode = "sample", matHex = "" } = {}) {
    const engine = FrameX.studioEngine;
    const cat = engine.catalog();
    const byId = (list, id) => (list || []).find((v) => v.id === id) || null;
    const g = engine.geometry(cfg, ctx);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round((width * g.OH) / g.OW);
    const c = canvas.getContext("2d");
    const u = canvas.width / g.OW; // canvas pixels per preview unit
    const v = canvas.height / g.OH;
    const cq = canvas.width / 100;
    const R = (r) => [r.x * u, r.y * v, r.w * u, r.h * v];
    const L = g.layers;
    const color = byId(cat.COLORS, cfg.frame.colorId) || cat.COLORS[0];
    // matHex: a product sold with a mat in a colour the Studio does not offer is drawn in its own colour.
    const matColor = matHex || (byId(cat.MAT.colors, cfg.mat.colorId) || cat.MAT.colors[0]).hex;
    const mat2Color = (byId(cat.MAT.colors, cfg.mat.color2Id) || cat.MAT.colors[0]).hex;
    const borderColor = (byId(cat.BORDER.colors, cfg.border.colorId) || cat.BORDER.colors[0]).hex;
    const framed = Boolean(ctx.caps.frame);

    // 1. Moulding
    if (framed) paintMoulding(c, ...R(L.frame), { hex: color.hex, texture: color.texture, profile: g.type.profile, finish: cfg.frame.finishId, fw: g.units.frame * u, cq });
    // 3. Mats
    if (L.mat) {
      c.fillStyle = matColor;
      c.fillRect(...R(L.mat));
      band(c, ...R(L.mat), 0, 0.12 * cq, black(0.06));
    }
    if (L.mat2) {
      band(c, ...R(L.mat2), -0.36 * cq, 0, black(0.1));
      band(c, ...R(L.mat2), -0.28 * cq, 0, white(0.7));
      c.fillStyle = mat2Color;
      c.fillRect(...R(L.mat2));
    }
    // 4. The print (its colour shows as the printed border)
    if (framed && g.type.profile === "float") {
      c.save();
      c.shadowColor = black(0.35);
      c.shadowBlur = 1.6 * cq;
      c.shadowOffsetY = 0.8 * cq;
      c.fillStyle = borderColor;
      c.fillRect(...R(L.print));
      c.restore();
    } else if (L.mat) {
      band(c, ...R(L.print), -0.36 * cq, 0, black(0.1));
      band(c, ...R(L.print), -0.28 * cq, 0, white(0.75));
    }
    c.fillStyle = borderColor;
    c.fillRect(...R(L.print));

    // 5. Artwork: the same one-photo "template" the Studio builds for photo and product designs
    const H = Math.round((1000 * L.photo.h) / L.photo.w);
    const caption = !ctx.template && ctx.caps.text ? ctx.caps.textFields[0] : null;
    const photoH = caption ? Math.round(H * 0.84) : H;
    const template = ctx.template || {
      id: "photo",
      title: "Your photo",
      textFields: caption ? [caption] : [],
      layout: {
        width: 1000,
        height: H,
        background: { color: caption && !cfg.border.width ? "#ffffff" : borderColor },
        elements: [{ type: "image", slot: "photo1", x: 0, y: 0, width: 1000, height: photoH }].concat(
          caption ? [{ type: "text", field: caption.id, x: 40, y: photoH + Math.round((H - photoH) * 0.28), width: 920, size: Math.round(Math.min(64, (H - photoH) * 0.42)), font: "serif", align: "center", color: "#2b2118" }] : [],
        ),
      },
    };
    let bg = null;
    if (cfg.background && ctx.caps.background) {
      bg = {};
      const hex = (byId(cat.BACKGROUNDS.colors, cfg.background.colorId) || {}).hex;
      if (hex) bg.color = hex;
      if (cfg.background.pattern != null) bg.pattern = cfg.background.pattern;
    }
    const textStyles = {};
    Object.entries(cfg.textStyle || {}).forEach(([field, st]) => {
      const font = byId(cat.FONTS, st.fontId);
      const size = byId(cat.TEXT_SIZES, st.sizeId);
      const col = byId(cat.TEXT_COLORS, st.colorId);
      textStyles[field] = Object.assign({}, font ? { font: font.font, weight: font.weight, italic: font.italic, uppercase: Boolean(font.uppercase) } : {}, size ? { scale: size.scale } : {}, col ? { color: col.hex } : {}, st.align ? { align: st.align } : {}, st.dy ? { dy: st.dy } : {});
    });
    paintTemplate(c, ...R(L.art), template, { images, text: cfg.text || {}, mode, crop: cfg.crop || {}, textStyles, background: bg, samples });

    // 2. The frame's lip: a soft shadow onto the mat / print
    if (framed) {
      const [ox, oy, ow, oh] = R(L.opening);
      band(c, ox, oy, ow, oh, -0.25 * cq, 0, black(0.18));
      insetShadow(c, ox, oy, ow, oh, 0, 0.7 * cq, 1.2 * cq, black(0.32));
      insetShadow(c, ox, oy, ow, oh, 0, 0, 0.3 * cq, black(0.25));
    }
    // 6. Acrylic / glass: a faint sheen
    if (cfg.protection && cfg.protection !== "none") {
      const [ox, oy, ow, oh] = R(L.opening);
      c.save();
      c.globalCompositeOperation = "screen";
      fillLinear(c, ox, oy, ow, oh, 118, [[0, white(0.2)], [0.32, white(0)], [0.62, white(0)], [0.74, white(0.1)], [0.86, white(0)], [1, white(0)]]);
      c.restore();
    }
    return { canvas, geometry: g, frameHex: framed ? color.hex : borderColor };
  }

  /* ---------------------------------------------------------------- Wall art (the frame the Home Decor product photos show) */

  /**
   * One framed panel of wall art. Returns a canvas.
   *   art     loaded picture; slice = the part of it this panel shows { x, y, w, h } in picture pixels
   *   opening width × height of the print in millimetres; frame = moulding width, mat = mat width (mm)
   *   hex     the frame's colour
   */
  function paintWallArt({ art, slice, opening, frame = 18, mat = 0, hex = "#1c1c1c", lip = "", width = 1024, sheen = true }) {
    const outerW = opening.w + 2 * (frame + mat);
    const outerH = opening.h + 2 * (frame + mat);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round((width * outerH) / outerW);
    const c = canvas.getContext("2d");
    const k = canvas.width / outerW; // canvas pixels per millimetre
    const cq = canvas.width / 100;
    const W = canvas.width;
    const H = canvas.height;
    const f = frame * k;
    const m = mat * k;
    c.fillStyle = hex;
    c.fillRect(0, 0, W, H);
    fillLinear(c, 0, 0, W, H, 135, [[0, white(0.14)], [0.4, white(0)], [1, black(0.18)]]);
    band(c, 0, 0, W, H, 0, Math.max(1, 0.2 * cq), lip || black(0.25));
    c.fillStyle = "#fbfaf7";
    c.fillRect(f, f, W - 2 * f, H - 2 * f);
    const ax = f + m;
    const ay = f + m;
    const aw = W - 2 * (f + m);
    const ah = H - 2 * (f + m);
    if (art) {
      const s = slice || { x: 0, y: 0, w: art.naturalWidth || art.width, h: art.naturalHeight || art.height };
      // The print keeps the picture's own proportions: cover the opening from the centre of its slice.
      const need = aw / ah;
      let sw = s.w, sh = s.h;
      if (sw / sh > need) sw = sh * need;
      else sh = sw / need;
      c.imageSmoothingQuality = "high";
      c.drawImage(art, s.x + (s.w - sw) / 2, s.y + (s.h - sh) / 2, sw, sh, ax, ay, aw, ah);
    } else {
      c.fillStyle = "#e9e4da";
      c.fillRect(ax, ay, aw, ah);
    }
    // the frame's lip and the cover, as on the product photos
    band(c, f, f, W - 2 * f, H - 2 * f, 0, Math.max(1, 0.12 * cq), black(0.22));
    insetShadow(c, f, f, W - 2 * f, H - 2 * f, 0, 0.5 * cq, 1.2 * cq, black(0.28));
    if (sheen) {
      c.save();
      c.globalCompositeOperation = "screen";
      fillLinear(c, f, f, W - 2 * f, H - 2 * f, 115, [[0, white(0.16)], [0.28, white(0)], [0.62, white(0)], [1, white(0.08)]]);
      c.restore();
    }
    return canvas;
  }

  FrameX.ldPaint = { paintStudio, paintTemplate, paintWallArt, fontsOf, primitives: { linear, band, stripes, insetShadow, roundedPath } };
})((window.FrameX = window.FrameX || {}));
