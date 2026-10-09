/* ==========================================================================
   Wall-art customiser (wall-art-studio.html): one photo, split across 2 to 5
   framed panels, with a live preview.

   The customer adds ONE photo. It is never changed: the page only keeps
   where the picture sits (a focus point and a zoom) and draws each panel as
   a window onto a preview copy of it. When the customer orders, the ORIGINAL
   file is uploaded to FrameX exactly as it is (services/upload-service.js)
   and the order line carries its id: the set is printed from that file.

   What is ordered:
     product      one of the "Your Photo — N Panel Split" products (js/decor.js)
     selection    size, frame colour, print finish        (priced by the backend)
     customization { layout, spacing, border, photo: { x, y, zoom } }
                  (the photo's name and pixel size are the uploaded file's own)
     photos       { photo1: <id of the uploaded original> }
     thumbnail    a small picture of the preview, for the cart and the order

   The backend checks all of it with the same rules (FrameX.decorRules) and
   works out the price itself. Nothing here sends a price.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const rules = () => FrameX.decorRules;

  const DRAFT = "framex.wallArt.v1";
  const WALLS = [
    ["linen", "Light wall", "#efeae1"],
    ["warm", "Warm wall", "#eadfce"],
    ["sage", "Sage wall", "#d6ddd0"],
    ["dark", "Dark wall", "#34373c"],
  ];
  const WALL_FILL = { linen: ["#efeae1", "#e3dccf"], warm: ["#eadfce", "#dccdb7"], sage: ["#d6ddd0", "#c3cdbb"], dark: ["#34373c", "#26282c"] };

  let root;
  let siblings = new Map(); // panel count -> product
  let product = null;
  const sel = { sizeId: null, colorId: null, printMaterialId: null, qty: 1 };
  const custom = { layout: "side", spacing: "standard", border: "medium" };
  const view = { x: 0.5, y: 0.5, zoom: 1 };
  let photo = null; // { id, url, name, width, height, image }
  let wall = "linen";
  let busy = false;
  let moved = false; // the customer has dragged the picture at least once

  const C = () => rules().CUSTOM;
  const find = (list, id) => list.find((item) => item.id === id) || list[0];
  const panelsOf = (p) => p.decor.panelCount;

  /* ---------------------------------------------------------------- Geometry
     One panel is 2 : 3. Side by side they stand upright next to each other;
     stacked they lie on their side, one above the other. The gap is a share
     of the set's long side. */
  function layoutOf(maxW, maxH) {
    const count = panelsOf(product);
    const side = custom.layout !== "stacked";
    const gapShare = find(C().spacing, custom.spacing).gap;
    const unit = side ? { w: 2, h: 3 } : { w: 3, h: 2 };
    const along = (count * (side ? unit.w : unit.h)) / (1 - (count - 1) * gapShare);
    const total = side ? { w: along, h: unit.h } : { w: unit.w, h: along };
    const k = Math.min(maxW / total.w, maxH / total.h);
    const gap = gapShare * along * k;
    const pw = unit.w * k;
    const ph = unit.h * k;
    return {
      w: total.w * k,
      h: total.h * k,
      side,
      panels: Array.from({ length: count }, (_, i) => (side ? { x: i * (pw + gap), y: 0, w: pw, h: ph } : { x: 0, y: i * (ph + gap), w: pw, h: ph })),
    };
  }

  /** Where the whole photo sits behind a set of W x H: it always covers the set. */
  function place(W, H) {
    const scale = Math.max(W / photo.width, H / photo.height) * view.zoom;
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    const left = Math.min(0, Math.max(W - dw, W / 2 - view.x * dw));
    const top = Math.min(0, Math.max(H - dh, H / 2 - view.y * dh));
    return { dw, dh, left, top, x: (W / 2 - left) / dw, y: (H / 2 - top) / dh };
  }

  /* ---------------------------------------------------------------- Price + words */
  const quote = () => M().quote(product, sel);
  const sizeRaw = () => (product.sizeOptions || []).find((s) => s.id === sel.sizeId) || {};

  /** The overall size on the wall for the chosen layout, e.g. "40 × 18 in". */
  function overall() {
    const each = String(sizeRaw().panel || "").match(/([\d.]+)\s*×\s*([\d.]+)/);
    if (!each) return { text: "", inches: 0 };
    const [w, h] = [Number(each[1]), Number(each[2])];
    const count = panelsOf(product);
    const gapShare = find(C().spacing, custom.spacing).gap;
    const along = Math.round((count * w) / (1 - (count - 1) * gapShare));
    return custom.layout === "stacked" ? { text: `${h} × ${along} in`, inches: h } : { text: `${along} × ${h} in`, inches: along };
  }

  /* ---------------------------------------------------------------- Draft (survives a reload or a login) */
  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({ productId: product.id, sel, custom, view, wall, photo: photo ? { id: photo.id, name: photo.name, width: photo.width, height: photo.height } : null }));
    } catch (error) {
      /* storage blocked: the draft lasts for this page view */
    }
  }
  function readDraft() {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT) || "null");
    } catch (error) {
      return null;
    }
  }

  /* ---------------------------------------------------------------- Drawing the preview */
  function drawStage() {
    const wallEl = $(".was-stage__wall", root);
    const set = $(".was-set", root);
    const style = getComputedStyle(wallEl);
    const availW = wallEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = wallEl.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const box = layoutOf(availW, availH);
    const frame = Math.max(3, Math.round(find(C().border, custom.border).width * Math.min(box.panels[0].w, box.panels[0].h)));
    const color = (M().palette()[sel.colorId] || { hex: "#1c1c1c" }).hex;
    const glossy = /gloss/i.test(sel.printMaterialId || "");
    set.style.width = box.w + "px";
    set.style.height = box.h + "px";
    set.style.setProperty("--frame-w", frame + "px");
    set.style.setProperty("--frame-c", color);
    set.style.setProperty("--sheen", glossy ? "0.24" : "0.04");
    set.classList.toggle("is-empty", !photo);
    const p = photo ? place(box.w, box.h) : null;
    if (p) Object.assign(view, { x: p.x, y: p.y });
    const panels = $$(".was-panel", set);
    if (panels.length !== box.panels.length) set.innerHTML = box.panels.map(() => `<div class="was-panel"></div>`).join("");
    $$(".was-panel", set).forEach((el, i) => {
      const r = box.panels[i];
      Object.assign(el.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
      el.style.backgroundImage = photo ? `url("${photo.url}")` : "";
      el.style.backgroundSize = p ? `${p.dw}px ${p.dh}px` : "";
      el.style.backgroundPosition = p ? `${p.left - r.x}px ${p.top - r.y}px` : "";
    });
    $(".was-stage__empty", root).hidden = Boolean(photo);
    $(".was-stage__hint", root).hidden = !photo || moved;
    set.setAttribute("aria-label", photo ? `Preview: ${photo.name} split across ${box.panels.length} panels. Drag to move the picture.` : `${box.panels.length} empty panels. Add a photo to see it split.`);
  }

  /** A small picture of the preview, for the cart line and the order. */
  function thumbnail() {
    if (!photo || !photo.image) return "";
    const limit = C().thumbnailBytes;
    for (const width of [420, 340, 260]) {
      const height = Math.round(width * 0.75);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const fill = ctx.createLinearGradient(0, 0, 0, height);
      fill.addColorStop(0, WALL_FILL[wall][0]);
      fill.addColorStop(1, WALL_FILL[wall][1]);
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, width, height);
      const box = layoutOf(width * 0.84, height * 0.78);
      const ox = (width - box.w) / 2;
      const oy = (height - box.h) / 2;
      const p = place(box.w, box.h);
      const k = photo.image.naturalWidth / p.dw; // preview-image pixels per drawn pixel
      const frame = Math.max(2, find(C().border, custom.border).width * Math.min(box.panels[0].w, box.panels[0].h));
      ctx.fillStyle = (M().palette()[sel.colorId] || { hex: "#1c1c1c" }).hex;
      for (const r of box.panels) {
        ctx.shadowColor = "rgba(0,0,0,.35)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.fillRect(ox + r.x, oy + r.y, r.w, r.h);
        ctx.shadowColor = "transparent";
        // the picture shows through the opening inside the frame
        ctx.drawImage(photo.image, (r.x + frame - p.left) * k, (r.y + frame - p.top) * k, (r.w - frame * 2) * k, (r.h - frame * 2) * k, ox + r.x + frame, oy + r.y + frame, r.w - frame * 2, r.h - frame * 2);
      }
      for (const q of [0.72, 0.6, 0.48]) {
        const url = canvas.toDataURL("image/jpeg", q);
        if (url.length <= limit) return url;
      }
    }
    return "";
  }

  /* ---------------------------------------------------------------- Controls */
  const option = (group, id, label, small, checked) =>
    `<button class="was-option" type="button" role="radio" data-set="${group}" data-value="${esc(id)}" aria-checked="${checked}">${esc(label)}${small ? `<small>${esc(small)}</small>` : ""}</button>`;

  function controlsHtml() {
    const pal = M().palette();
    const colors = (product.frame.colors || []).filter((id) => pal[id]);
    const prints = product.print.materials || [];
    const counts = [...siblings.keys()].sort();
    return `
      <section class="was-card" aria-labelledby="was-h-photo">
        <h2 id="was-h-photo">Your photo <span data-photo-meta></span></h2>
        <div class="was-upload">
          <input class="visually-hidden" type="file" id="was-file" accept="image/jpeg,image/png,image/webp">
          <div class="was-row" style="margin-top:0">
            <label class="btn btn--primary btn--sm" for="was-file" data-upload-label>${icon("upload")} Choose a photo</label>
            <button class="btn btn--outline btn--sm" type="button" data-remove hidden>${icon("trash")} Remove</button>
          </div>
          <div class="was-progress" hidden><i></i></div>
          <p class="was-error" role="alert" hidden></p>
          <p class="was-status" data-upload-status role="status" hidden></p>
          <p class="was-upload__quality">${icon("check")}<span>${esc(FrameX.uploadService.qualityText)}</span></p>
          <p class="was-upload__meta">JPG, PNG or WebP, up to ${FrameX.uploadService.MAX_MB} MB. 4K and other high-resolution photos are welcome.</p>
        </div>
      </section>
      <section class="was-card" aria-labelledby="was-h-panels">
        <h2 id="was-h-panels">Panels</h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-panels">${counts.map((n) => option("panels", String(n), `${n} panels`, `from ${formatPrice(M().quote(siblings.get(n), { sizeId: "s" }).unit)}`, n === panelsOf(product))).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-layout">
        <h2 id="was-h-layout">Layout</h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-layout">${C().layouts.map((l) => option("layout", l.id, l.name, l.id === "side" ? "wide set" : "tall set", l.id === custom.layout)).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-size">
        <h2 id="was-h-size">Size <span data-overall></span></h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-size">${(product.sizes || []).map((s) => option("sizeId", s.id, s.label, `${(product.sizeOptions.find((o) => o.id === s.id) || {}).panel || ""} each`, s.id === sel.sizeId)).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-color">
        <h2 id="was-h-color">Frame colour <span data-color-name></span></h2>
        <div class="was-swatches" role="radiogroup" aria-labelledby="was-h-color">${colors.map((id) => `<button class="was-swatch" type="button" role="radio" data-set="colorId" data-value="${esc(id)}" aria-checked="${id === sel.colorId}" style="--swatch:${esc(pal[id].hex)}"><i></i>${esc(pal[id].name)}</button>`).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-border">
        <h2 id="was-h-border">Frame thickness</h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-border">${C().border.map((b) => option("border", b.id, b.name, "", b.id === custom.border)).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-spacing">
        <h2 id="was-h-spacing">Space between panels</h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-spacing">${C().spacing.map((s) => option("spacing", s.id, s.name, "", s.id === custom.spacing)).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-print">
        <h2 id="was-h-print">Print finish</h2>
        <div class="was-options" role="radiogroup" aria-labelledby="was-h-print">${prints.map((m) => option("printMaterialId", m.id, m.name, m.description || "", m.id === sel.printMaterialId)).join("")}</div>
      </section>
      <section class="was-card" aria-labelledby="was-h-zoom">
        <h2 id="was-h-zoom">Position &amp; zoom <span data-zoom-value></span></h2>
        <div class="was-range"><span aria-hidden="true">${icon("minus")}</span><input type="range" id="was-zoom" min="${C().zoom.min}" max="${C().zoom.max}" step="0.01" value="${view.zoom}" aria-label="Zoom" disabled><span aria-hidden="true">${icon("plus")}</span></div>
        <div class="was-row">
          <button class="btn btn--outline btn--sm" type="button" data-centre disabled>Centre the picture</button>
          <button class="btn btn--outline btn--sm" type="button" data-fit disabled>Show the most</button>
        </div>
      </section>
      <section class="was-order" aria-label="Order">
        <div class="was-order__price" aria-live="polite"><strong data-price></strong><s data-was hidden></s><em data-off hidden></em></div>
        <p class="was-order__summary" data-summary></p>
        <div class="was-order__buttons">
          <div class="qty" role="group" aria-label="Quantity">
            <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity" disabled>${icon("minus")}</button>
            <span class="qty__value" data-qty-value aria-live="polite">1</span>
            <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity">${icon("plus")}</button>
          </div>
          <button class="btn btn--primary" type="button" data-add>${icon("bag")} Add to cart</button>
          <button class="btn btn--dark" type="button" data-buy>Buy Now</button>
        </div>
        <p class="was-order__note">${icon("image")}<span>Your original photo is uploaded to FrameX with your order and kept private. It is printed as it is, placed exactly as shown here.</span></p>
      </section>`;
  }

  function render() {
    root.innerHTML = `
      <div class="was-stage-wrap">
        <div class="was-stage" data-wall="${esc(wall)}">
          <div class="was-stage__wall">
            <div class="was-set" tabindex="0" role="img"></div>
            <div class="was-stage__empty"><label class="btn btn--primary" for="was-file">${icon("upload")} Add your photo</label><p>or drop a picture here to see it split across the panels</p></div>
            <span class="was-stage__hint" hidden>${icon("hand")} Drag to move the picture</span>
          </div>
          <div class="was-stage__bar">
            <div class="was-photo"><span data-quality></span></div>
            <div class="was-walls" role="group" aria-label="Wall colour for the preview"><span>Wall</span>${WALLS.map(([id, label, hex]) => `<button class="was-wall" type="button" data-wall="${id}" aria-pressed="${id === wall}" aria-label="${esc(label)}" title="${esc(label)}" style="background:${hex}"></button>`).join("")}</div>
          </div>
        </div>
      </div>
      <div class="was-controls">${controlsHtml()}</div>`;
    refresh();
    mountWallButton();
  }

  /* ---------------------------------------------------------------- "View on My Wall"
     The set as it is now (panels, layout, spacing, frame thickness and colour, size, and
     the part of the photo behind each panel) on the customer's own wall, through their
     camera. The Live Demo only reads this; the customiser is as it was when it closes. */
  function liveSpec() {
    const each = String(sizeRaw().panel || "").match(/([\d.]+)\s*×\s*([\d.]+)/);
    if (!each) throw new Error("This size has no measurements.");
    const side = custom.layout !== "stacked";
    const box = layoutOf(1000, 1000);
    // Inches per layout unit: a panel standing upright is as wide as its short side, lying down as wide as its long side.
    const k = (side ? Number(each[1]) : Number(each[2])) / box.panels[0].w;
    const frame = find(C().border, custom.border).width * Math.min(box.panels[0].w, box.panels[0].h);
    const p = photo && photo.image ? place(box.w, box.h) : null;
    const px = p ? photo.image.naturalWidth / p.dw : 0; // preview-picture pixels per layout unit
    return {
      kind: "panels",
      name: product.name,
      hex: (M().palette()[sel.colorId] || { hex: "#1c1c1c" }).hex,
      glossy: /gloss/i.test(sel.printMaterialId || ""),
      image: p ? photo.image : null,
      pieces: box.panels.map((r) => ({
        x: (r.x + r.w / 2 - box.w / 2) * k,
        y: -(r.y + r.h / 2 - box.h / 2) * k,
        w: r.w * k,
        h: r.h * k,
        frameIn: frame * k,
        slice: p ? { x: (r.x + frame - p.left) * px, y: (r.y + frame - p.top) * px, w: (r.w - frame * 2) * px, h: (r.h - frame * 2) * px } : null,
      })),
    };
  }

  function mountWallButton() {
    if (!FrameX.liveDemo || !M().liveDemoSupport) return;
    const stage = $(".was-stage", root);
    const controls = $(".was-controls", root);
    if (!stage || !controls) return;
    const on = M().liveDemoSupport(product).ok;
    const context = { productId: product.id, page: "wall-art-studio" };
    // On a wide screen the button sits in a corner of the preview. On a phone that corner belongs to
    // "Add your photo", so it is a full-width button under the preview (the preview itself stays pinned).
    const corner = FrameX.liveDemo.mount(stage, { variant: "corner", getSpec: liveSpec, context });
    corner.el.classList.add("ld-cta--wide-only");
    corner.setVisible(on);
    const row = FrameX.liveDemo.mount(controls, { variant: "row", getSpec: liveSpec, context });
    row.el.classList.add("ld-cta--phone-only");
    controls.prepend(row.el);
    row.setVisible(on);
  }

  /** Everything that follows from the current choices. */
  function refresh() {
    drawStage();
    const q = quote();
    $("[data-price]", root).textContent = formatPrice(q.unit * sel.qty);
    const was = $("[data-was]", root);
    const off = $("[data-off]", root);
    was.hidden = off.hidden = !q.discountPercent;
    if (q.discountPercent) {
      was.textContent = formatPrice((q.listPrice + q.lines.slice(1).reduce((sum, l) => sum + l.amount, 0)) * sel.qty);
      off.textContent = `${Math.round(q.discountPercent)}% off`;
    }
    const size = (product.sizes || []).find((s) => s.id === sel.sizeId);
    const color = sel.colorId ? M().colorName(sel.colorId) : "";
    const o = overall();
    $("[data-overall]", root).textContent = o.text ? `about ${o.text} on the wall` : "";
    $("[data-color-name]", root).textContent = color;
    $("[data-summary]", root).textContent = [`${panelsOf(product)} panels, ${find(C().layouts, custom.layout).name.toLowerCase()}`, size ? size.label : "", color ? `${color} frame` : "", (find(product.print.materials || [{}], sel.printMaterialId) || {}).name || ""].filter(Boolean).join(" · ");
    $("[data-zoom-value]", root).textContent = photo ? `${view.zoom.toFixed(2)}×` : "";
    $("[data-photo-meta]", root).textContent = photo ? `${photo.name} · ${photo.width} × ${photo.height} px` : "";
    $("[data-upload-label]", root).innerHTML = `${icon("upload")} ${photo ? "Replace photo" : "Choose a photo"}`;
    $("[data-remove]", root).hidden = !photo;
    ["#was-zoom", "[data-centre]", "[data-fit]"].forEach((s) => ($(s, root).disabled = !photo));
    $("#was-zoom", root).value = view.zoom;
    // Plain facts about the file. No judgement about how it will print: it is printed as it is.
    $("[data-quality]", root).innerHTML = photo ? `<span class="was-quality">${icon("image")} ${esc(`${photo.width} × ${photo.height} px`)}</span>` : "No photo yet";
    $$("[data-set]", root).forEach((b) => {
      const key = b.dataset.set;
      const current = key === "panels" ? String(panelsOf(product)) : key in custom ? custom[key] : sel[key];
      b.setAttribute("aria-checked", String(b.dataset.value === current));
    });
    $$("[data-wall]", root).forEach((b) => b.hasAttribute("aria-pressed") && b.setAttribute("aria-pressed", String(b.dataset.wall === wall)));
    $(".was-stage", root).dataset.wall = wall;
    const max = Math.min(FrameX.cart.MAX_QTY, M().orderLimits(product).maxQty || FrameX.cart.MAX_QTY);
    $('[data-qty="-1"]', root).disabled = sel.qty <= 1;
    $('[data-qty="1"]', root).disabled = sel.qty >= max;
    $("[data-qty-value]", root).textContent = sel.qty;
    saveDraft();
  }

  /** Switch to the product with another number of panels, keeping every other choice that still exists. */
  function usePanels(count) {
    const next = siblings.get(count);
    if (!next || next === product) return;
    product = next;
    const def = M().defaultSelection(product);
    const keep = (key, list) => (list.some((x) => (x.id || x) === sel[key]) ? sel[key] : def[key]);
    sel.sizeId = keep("sizeId", product.sizes || []);
    sel.colorId = keep("colorId", product.frame.colors || []);
    sel.printMaterialId = keep("printMaterialId", product.print.materials || []);
    sel.qty = 1;
    setHeading();
    history.replaceState(null, "", `${location.pathname.split("/").pop()}?product=${encodeURIComponent(product.id)}`);
    render();
  }

  function setHeading() {
    $("#was-title").textContent = product.name;
    $("#was-crumb").textContent = product.name;
    document.title = `${product.name} — FrameX`;
  }

  /* ---------------------------------------------------------------- Photo */
  function showError(message) {
    const box = $(".was-error", root);
    box.textContent = message || "";
    box.hidden = !message;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image"));
      image.src = url;
    });
  }

  async function setPhoto(file) {
    if (!file || busy) return;
    showError("");
    const bar = $(".was-progress", root);
    bar.hidden = false;
    busy = true;
    try {
      const saved = await FrameX.uploadService.prepare(file, (percent) => bar.style.setProperty("--value", percent + "%"));
      const old = photo;
      photo = { id: saved.id, url: saved.url, name: saved.name, width: saved.width, height: saved.height, image: await loadImage(saved.url) };
      Object.assign(view, { x: 0.5, y: 0.5, zoom: 1 });
      if (old) FrameX.uploadService.remove(old.id);
    } catch (error) {
      showError(error instanceof FrameX.uploadService.UploadError ? error.message : "That photo couldn't be used. Please try another one.");
    }
    busy = false;
    bar.hidden = true;
    $("#was-file", root).value = "";
    refresh();
  }

  function removePhoto() {
    if (photo) FrameX.uploadService.remove(photo.id);
    photo = null;
    Object.assign(view, { x: 0.5, y: 0.5, zoom: 1 });
    refresh();
  }

  /* ---------------------------------------------------------------- Ordering */
  function chosen(uploadId) {
    return {
      productId: product.id,
      quantity: sel.qty,
      selection: { sizeId: sel.sizeId, colorId: sel.colorId, printMaterialId: sel.printMaterialId },
      note: "",
      customization: { layout: custom.layout, spacing: custom.spacing, border: custom.border, photo: { name: photo.name, width: photo.width, height: photo.height, x: view.x, y: view.y, zoom: view.zoom } },
      photos: { photo1: uploadId },
      thumbnail: thumbnail(),
    };
  }

  function showStatus(message) {
    const box = $("[data-upload-status]", root);
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
  }

  /** Log in if needed, then send the ORIGINAL photo. -> its upload id, or null. */
  async function sendOriginal(reason) {
    const sent = await FrameX.uploadService.forOrder({
      reason,
      itemName: product.name,
      photos: { photo1: photo.id },
      onProgress: (percent) => showStatus(percent < 100 ? `Uploading your photo… ${percent}%` : ""),
    });
    showStatus("");
    if (sent.ok) return sent.uploadIds.photo1;
    if (!sent.cancelled) {
      showError(sent.message);
      $("#was-h-photo").scrollIntoView({ block: "center", behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
    }
    return null;
  }

  function needPhoto() {
    if (photo) return false;
    showError(M().PHOTO_TEXT.missingOne);
    $("[data-upload-label]", root).focus();
    $("#was-h-photo").scrollIntoView({ block: "center", behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
    return true;
  }

  async function addToCart() {
    if (busy || needPhoto()) return;
    const button = $("[data-add]", root);
    busy = true;
    button.setAttribute("aria-busy", "true");
    showError("");
    const uploadId = await sendOriginal("add");
    const result = uploadId ? await FrameX.cart.add(Object.assign({ name: product.name }, chosen(uploadId))) : { ok: false, cancelled: true };
    busy = false;
    button.removeAttribute("aria-busy");
    if (!result.ok && !result.cancelled && result.code === "PHOTOS_REQUIRED") return showError(result.message);
    FrameX.cart.announce(result, `${product.name} added to cart.`);
  }

  async function buyNow() {
    if (busy || needPhoto()) return;
    const button = $("[data-buy]", root);
    busy = true;
    button.setAttribute("aria-busy", "true");
    showError("");
    const uploadId = await sendOriginal("buy");
    busy = false;
    button.removeAttribute("aria-busy");
    if (uploadId) FrameX.buyNow.start({ name: product.name, item: chosen(uploadId) });
  }

  /* ---------------------------------------------------------------- Events */
  function listen() {
    root.addEventListener("click", (event) => {
      const pick = event.target.closest("[data-set]");
      if (pick) {
        const key = pick.dataset.set;
        if (key === "panels") return usePanels(Number(pick.dataset.value));
        if (key in custom) custom[key] = pick.dataset.value;
        else sel[key] = pick.dataset.value;
        return refresh();
      }
      const wallBtn = event.target.closest(".was-wall");
      if (wallBtn) {
        wall = wallBtn.dataset.wall;
        return refresh();
      }
      const qty = event.target.closest("[data-qty]");
      if (qty) {
        const max = Math.min(FrameX.cart.MAX_QTY, M().orderLimits(product).maxQty || FrameX.cart.MAX_QTY);
        sel.qty = Math.min(max, Math.max(1, sel.qty + Number(qty.dataset.qty)));
        return refresh();
      }
      if (event.target.closest("[data-remove]")) return removePhoto();
      if (event.target.closest("[data-centre]")) {
        Object.assign(view, { x: 0.5, y: 0.5 });
        return refresh();
      }
      if (event.target.closest("[data-fit]")) {
        Object.assign(view, { x: 0.5, y: 0.5, zoom: 1 });
        return refresh();
      }
      if (event.target.closest("[data-add]")) return addToCart();
      if (event.target.closest("[data-buy]")) return buyNow();
      // An empty set is one big "add a photo" button.
      if (!photo && event.target.closest(".was-set")) $("#was-file", root).click();
    });

    root.addEventListener("change", (event) => {
      if (event.target.id === "was-file") setPhoto(event.target.files[0]);
    });
    root.addEventListener("input", (event) => {
      if (event.target.id !== "was-zoom" || !photo) return;
      view.zoom = Number(event.target.value);
      refresh();
    });

    // Drag the picture behind the panels.
    let drag = null;
    root.addEventListener("pointerdown", (event) => {
      const set = event.target.closest(".was-set");
      if (!set || !photo || event.button > 0) return;
      const p = place(set.clientWidth, set.clientHeight);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: p.left, top: p.top, dw: p.dw, dh: p.dh, w: set.clientWidth, h: set.clientHeight };
      set.setPointerCapture(event.pointerId);
      set.classList.add("is-dragging");
    });
    root.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      view.x = (drag.w / 2 - (drag.left + event.clientX - drag.x)) / drag.dw;
      view.y = (drag.h / 2 - (drag.top + event.clientY - drag.y)) / drag.dh;
      drawStage();
    });
    const drop = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      moved = true;
      $(".was-set", root).classList.remove("is-dragging");
      refresh();
    };
    root.addEventListener("pointerup", drop);
    root.addEventListener("pointercancel", drop);

    // Arrow keys move the picture, + and - zoom, when the preview has focus.
    root.addEventListener("keydown", (event) => {
      if (!photo || !event.target.closest(".was-set")) return;
      const step = { ArrowLeft: [0.02, 0], ArrowRight: [-0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[event.key];
      if (step) {
        view.x += step[0];
        view.y += step[1];
      } else if (event.key === "+" || event.key === "=") view.zoom = Math.min(C().zoom.max, view.zoom + 0.1);
      else if (event.key === "-") view.zoom = Math.max(C().zoom.min, view.zoom - 0.1);
      else return;
      event.preventDefault();
      refresh();
    });

    // Drop a file on the wall.
    ["dragenter", "dragover"].forEach((type) =>
      root.addEventListener(type, (event) => {
        const stage = event.target.closest(".was-stage");
        if (!stage) return;
        event.preventDefault();
        stage.classList.add("is-drop");
      }),
    );
    ["dragleave", "drop"].forEach((type) =>
      root.addEventListener(type, (event) => {
        const stage = event.target.closest(".was-stage");
        if (!stage) return;
        event.preventDefault();
        stage.classList.remove("is-drop");
        if (type === "drop" && event.dataTransfer.files[0]) setPhoto(event.dataTransfer.files[0]);
      }),
    );

    if ("ResizeObserver" in window) new ResizeObserver(() => $(".was-set", root) && drawStage()).observe(root);
    else window.addEventListener("resize", drawStage);
  }

  /* ---------------------------------------------------------------- Start */
  async function init() {
    root = $("#was-root");
    if (!root) return;
    if (!rules() || !FrameX.seed.decor) {
      root.innerHTML = `<div class="state-message"><strong>The customiser couldn't be loaded</strong><a class="btn btn--outline btn--sm" href="home-decor.html">Back to Home Decor</a></div>`;
      return;
    }
    root.innerHTML = `<div class="skeleton" style="aspect-ratio:4/3"></div><div class="skeleton" style="min-height:420px"></div>`;
    await FrameX.uploadService.limits(); // the largest photo the server takes
    try {
      const { items } = await FrameX.api.getProducts({ category: "hd-multi-panel", limit: 500 });
      items.filter((p) => rules().isCustomPhoto(p)).forEach((p) => siblings.set(p.decor.panelCount, p));
    } catch (error) {
      console.error("Customiser failed to load", error);
    }
    if (!siblings.size) {
      root.innerHTML = `<div class="state-message"><strong>Custom photo sets aren't available right now</strong><a class="btn btn--outline btn--sm" href="home-decor.html">Back to Home Decor</a></div>`;
      return;
    }
    const param = FrameX.qs.param;
    const draft = readDraft();
    const wanted = [...siblings.values()].find((p) => p.id === param("product"));
    const resumed = draft && (!wanted || wanted.id === draft.productId) ? [...siblings.values()].find((p) => p.id === draft.productId) : null;
    product = wanted || resumed || siblings.get(3) || [...siblings.values()][0];

    const def = M().defaultSelection(product);
    const valid = (value, list) => (list.some((x) => (x.id || x) === value) ? value : null);
    const saved = resumed && draft.sel && draft.custom && draft.view ? draft : null;
    sel.sizeId = valid(param("size"), product.sizes || []) || (saved && valid(saved.sel.sizeId, product.sizes || [])) || def.sizeId;
    sel.colorId = valid(param("color"), product.frame.colors || []) || (saved && valid(saved.sel.colorId, product.frame.colors || [])) || def.colorId;
    sel.printMaterialId = valid(param("print"), product.print.materials || []) || (saved && valid(saved.sel.printMaterialId, product.print.materials || [])) || def.printMaterialId;
    if (saved) {
      const clean = rules().cleanCustomization(product, Object.assign({}, saved.custom, { photo: Object.assign({ name: "x", width: 1, height: 1 }, saved.view) })).value;
      Object.assign(custom, { layout: clean.layout, spacing: clean.spacing, border: clean.border });
      Object.assign(view, { x: clean.photo.x, y: clean.photo.y, zoom: clean.photo.zoom });
      if (WALL_FILL[saved.wall]) wall = saved.wall;
      if (saved.photo && saved.photo.id) {
        // Only a photo whose original is still here (or already uploaded) can be ordered.
        const url = (await FrameX.uploadService.has(saved.photo.id)) ? await FrameX.uploadService.getUrl(saved.photo.id) : null;
        if (url) {
          try {
            photo = { id: saved.photo.id, url, name: String(saved.photo.name || "Your photo"), width: Number(saved.photo.width) || 1, height: Number(saved.photo.height) || 1, image: await loadImage(url) };
          } catch (error) {
            photo = null;
          }
        }
      }
    }
    // The options a link carried are used once; from here on the saved draft decides (also after a reload).
    history.replaceState(null, "", `${location.pathname.split("/").pop()}?product=${encodeURIComponent(product.id)}`);
    setHeading();
    render();
    listen();
  }

  FrameX.decorStudio = { init };
})((window.FrameX = window.FrameX || {}));
