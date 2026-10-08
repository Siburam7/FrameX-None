/* ==========================================================================
   FRAME X STUDIO page (studio.html). One editor for every entry point:
     studio.html?template=<slug>   start from a template
     studio.html?mode=photo        start from a single photo ("Create Your Frame")
     studio.html?product=<id>      customise a listed frame product
     studio.html?design=<id>       reopen a saved design
   The page holds no option or price logic of its own:
     options + prices  js/studio.js          (catalogue data)
     rules             services/studio-engine.js
     photos            services/upload-service.js (keeps the original, uploads it)
                       + ui/photo-uploader.js (one tile per photo space)
     text inputs       ui/template-components.js (text customizer)
     controls          ui/studio-controls.js
     saved designs     store/designs.js        cart  store/cart.js → addStudio()
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const engine = FrameX.studioEngine;
  const ui = FrameX.studioControls;
  const DRAFTS = "framex.studioDrafts.v1";

  let ctx, cfg, cat, draftKey, uploader, texts;
  let activeSlot = "photo1";
  const photoUrls = {};
  const openSections = new Set(["photos", "frame"]);
  const byId = (list, id) => (list || []).find((x) => x.id === id) || null;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /* ---------------------------------------------------------------- Drafts */
  const readDrafts = () => {
    try {
      return JSON.parse(localStorage.getItem(DRAFTS)) || {};
    } catch (e) {
      return {};
    }
  };
  function saveDraft() {
    try {
      const all = readDrafts();
      all[draftKey] = { config: cfg, updatedAt: new Date().toISOString() };
      localStorage.setItem(DRAFTS, JSON.stringify(all));
    } catch (e) {
      /* storage blocked: the session still works */
    }
  }

  /* ---------------------------------------------------------------- State */
  function setPath(path, value) {
    const keys = path.split(".");
    let node = cfg;
    keys
      .slice(0, -1)
      .forEach(
        (k) =>
          (node = node[k] =
            node[k] && typeof node[k] === "object" ? node[k] : {}),
      );
    node[keys[keys.length - 1]] = value;
  }
  const getPath = (path) =>
    path.split(".").reduce((n, k) => (n == null ? undefined : n[k]), cfg);

  function commit({ preview = true, panel = true } = {}) {
    engine.normalize(cfg, ctx);
    saveDraft();
    if (preview) renderPreview();
    if (panel) renderDynamic();
    renderPrice();
  }

  /* ---------------------------------------------------------------- Preview */
  let raf = 0;
  function renderPreview() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const g = engine.geometry(cfg, ctx);
      const maxDiag = Math.max(
        ...cat.SIZES.concat(ctx.caps.sizes).map((s) => Math.hypot(s.w, s.h)),
      );
      const scale = 0.7 + 0.3 * (Math.hypot(g.inches.w, g.inches.h) / maxDiag);
      const stage = $("#fs-preview");
      stage.style.setProperty("--size-scale", scale.toFixed(3));
      // Touch-dragging photos only while "Position & crop" is open, so the page still scrolls.
      stage.classList.toggle("is-adjusting", openSections.has("adjust"));
      stage.style.setProperty("--frame-aspect", (g.OW / g.OH).toFixed(4));
      stage.innerHTML = engine.renderPreview(cfg, ctx, {
        photoUrls,
        mode: "live",
      });
      $("#fs-preview-size").textContent =
        `${g.inches.w} × ${g.inches.h} in print · ${cfg.orientation}`;
    });
  }

  /* ---------------------------------------------------------------- Sections */
  function cropOf(slot) {
    return Object.assign(
      { fit: "fill", zoom: 1, px: 50, py: 50, rotate: 0 },
      cfg.crop[slot] || {},
    );
  }

  function photoNotice() {
    const meta = cfg.photoMeta[activeSlot];
    if (!meta || !cfg.photos[activeSlot]) return "";
    const g = engine.geometry(cfg, ctx);
    let area = { w: g.layers.photo.w, h: g.layers.photo.h };
    if (ctx.template) {
      const el = ctx.template.layout.elements.find(
        (e) => e.slot === activeSlot,
      );
      if (el) area = { w: el.width, h: el.height };
    }
    const photoWide = meta.w / meta.h > 1.08;
    const areaWide = area.w / area.h > 1.08;
    const photoTall = meta.h / meta.w > 1.08;
    const areaTall = area.h / area.w > 1.08;
    if (
      (photoWide && areaWide) ||
      (photoTall && areaTall) ||
      (!photoWide && !photoTall && !areaWide && !areaTall)
    )
      return "";
    const canSwitch =
      ctx.mode !== "template" &&
      byId(ctx.caps.orientations, photoWide ? "landscape" : "portrait") &&
      cfg.orientation !== (photoWide ? "landscape" : "portrait");
    return `<div class="fs-notice">${icon("alert")}<div><strong>Your photo is ${photoWide ? "wider" : "taller"} than this space.</strong>
      <span>Drag the photo in the preview to choose what stays in the frame${canSwitch ? `, or switch to a ${photoWide ? "landscape" : "portrait"} frame` : ", or choose Fit to show all of it"}.</span>
      ${canSwitch ? `<button class="btn btn--outline btn--sm" type="button" data-act="orient" data-value="${photoWide ? "landscape" : "portrait"}">Use ${photoWide ? "landscape" : "portrait"} frame</button>` : ""}</div></div>`;
  }

  const SECTIONS = {
    photos: {
      title: () => (ctx.caps.photoSlots.length > 1 ? "Photos" : "Photo"),
      show: () => true,
      summary: () =>
        `${ctx.caps.photoSlots.filter((s) => cfg.photos[s]).length} of ${ctx.caps.photoSlots.length} added`,
      body: () =>
        `<div id="fs-uploader"></div>
        <p class="fs-quality">${icon("check")}<span>${esc(FrameX.uploadService.qualityText)}</span></p>
        <p class="fs-hint">JPG, PNG or WebP, up to ${FrameX.uploadService.MAX_MB} MB${ctx.caps.photoSlots.length > 1 ? " each" : ""}. 4K and other high-resolution photos are welcome. FrameX prints from your original file: it is uploaded exactly as it is and kept private. What you see here is a preview copy.</p>`,
    },
    adjust: {
      title: () => "Position & crop",
      show: () => ctx.caps.crop !== false,
      summary: () =>
        ({ fill: "Fill", fit: "Fit", crop: "Custom crop" })[
          cropOf(activeSlot).fit
        ],
      dynamic: () => {
        const slots = ctx.caps.photoSlots;
        if (!slots.some((s) => cfg.photos[s]))
          return `<p class="fs-hint">Add a photo first, then drag it in the preview to position it.</p>`;
        const crop = cropOf(activeSlot);
        return `${
          slots.length > 1
            ? `<div class="fs-field"><span class="fs-label">Photo</span>${ui.segmented(
                "ui.activeSlot",
                slots.map((s, i) => ({ id: s, name: `Photo ${i + 1}` })),
                activeSlot,
                { label: "Photo to adjust" },
              )}</div>`
            : ""
        }
          ${
            cfg.photos[activeSlot]
              ? `
          <div class="fs-field"><span class="fs-label">Fit</span>${ui.segmented(
            `crop.${activeSlot}.fit`,
            [
              { id: "fill", name: "Fill" },
              { id: "fit", name: "Fit" },
              { id: "crop", name: "Crop" },
            ],
            crop.fit,
            { label: "Photo fit" },
          )}
            <p class="fs-hint">${{ fill: "Fill covers the whole space, centred. Edges may be trimmed.", fit: "Fit shows the whole photo; any gap shows the background.", crop: "Crop lets you zoom and drag the photo to choose exactly what shows." }[crop.fit]}</p></div>
          ${crop.fit !== "fit" ? ui.range(`crop.${activeSlot}.zoom`, { min: 1, max: 3, step: 0.05, value: crop.zoom, label: "Zoom", unit: "×" }) : ""}
          <div class="fs-row">
            <button class="fs-tool" type="button" data-act="rotate">${icon("chev-right")} Rotate 90°</button>
            <div class="fs-nudge" role="group" aria-label="Move photo">
              <button class="fs-tool fs-tool--icon" type="button" data-act="nudge" data-dx="-6" data-dy="0" aria-label="Move photo left">${icon("chev-left")}</button>
              <button class="fs-tool fs-tool--icon" type="button" data-act="nudge" data-dx="0" data-dy="-6" aria-label="Move photo up">${icon("chev-up")}</button>
              <button class="fs-tool fs-tool--icon" type="button" data-act="nudge" data-dx="0" data-dy="6" aria-label="Move photo down">${icon("chev-down")}</button>
              <button class="fs-tool fs-tool--icon" type="button" data-act="nudge" data-dx="6" data-dy="0" aria-label="Move photo right">${icon("chev-right")}</button>
            </div>
            <button class="fs-tool" type="button" data-act="crop-reset">Reset</button>
          </div>
          ${photoNotice()}`
              : `<p class="fs-hint">Add this photo to adjust it.</p>`
          }`;
      },
    },
    text: {
      title: () => "Text",
      show: () => ctx.caps.text,
      summary: () => Object.values(cfg.text).filter(Boolean)[0] || "",
      body: () => `<div id="fs-text"></div>`,
    },
    background: {
      title: () => "Background",
      show: () => ctx.caps.background,
      summary: () =>
        cfg.background
          ? (byId(cat.BACKGROUNDS.colors, cfg.background.colorId) || {}).name ||
            "Custom"
          : "Original",
      dynamic: () => {
        const bg = cfg.background || {};
        return `<div class="fs-field"><span class="fs-label">Colour</span>${ui.swatches("background.colorId", cat.BACKGROUNDS.colors, bg.colorId, { label: "Background colour" })}</div>
          <div class="fs-field"><span class="fs-label">Pattern</span>${ui.segmented("background.pattern", cat.BACKGROUNDS.patterns, bg.pattern != null ? bg.pattern : null, { label: "Background pattern" })}</div>
          ${cfg.background ? `<button class="fs-tool" type="button" data-act="bg-reset">Use the design's original background</button>` : ""}`;
      },
    },
    frame: {
      title: () => "Frame",
      show: () => ctx.caps.frame,
      summary: () =>
        engine.summary(cfg, ctx).find((l) => l.key === "frame").value,
      dynamic: () => {
        const types = ctx.caps.frameTypes;
        const colors = ctx.caps.colorsFor(cfg.frame.typeId);
        const finishes = ctx.caps.finishesFor(cfg.frame.typeId);
        const showPrice = ctx.mode !== "product";
        return `${
          types.length > 1
            ? `<div class="fs-field"><span class="fs-label">Frame type</span>${ui.cards(
                "frame.typeId",
                types.map((t) => ({
                  id: t.id,
                  name: t.name,
                  description: `${t.material} · ${t.description}`,
                  price: ui.delta(t.priceModifier) || "Included",
                })),
                cfg.frame.typeId,
                {
                  label: "Frame type",
                  visual: (o) =>
                    `<span class="sc-profile sc-profile--${esc(byId(types, o.id).profile)}" style="--w:${Math.round(byId(types, o.id).width / 6)}px"></span>`,
                },
              )}</div>`
            : `<p class="fs-hint">${esc(types[0] ? `${types[0].name} frame · ${types[0].material}` : "")}</p>`
        }
          <div class="fs-field"><span class="fs-label">Colour</span>${ui.swatches("frame.colorId", colors, cfg.frame.colorId, { label: "Frame colour", showPrice })}</div>
          ${
            finishes.length
              ? `<div class="fs-field"><span class="fs-label">Finish</span>${ui.cards(
                  "frame.finishId",
                  finishes.map((f) => ({
                    id: f.id,
                    name: f.name,
                    description: f.description,
                    price: ui.delta(f.priceModifier) || "Included",
                  })),
                  cfg.frame.finishId,
                  { label: "Frame finish", columns: 3 },
                )}</div>`
              : ""
          }`;
      },
    },
    border: {
      title: () => "Border",
      show: () => ctx.caps.border,
      summary: () =>
        engine.summary(cfg, ctx).find((l) => l.key === "border").value,
      dynamic:
        () => `<p class="fs-hint">The printed space between your photo and the mat or frame.</p>
        <div class="fs-field"><span class="fs-label">Thickness</span>${ui.segmented(
          "border.width",
          ctx.caps.borderPresets.map((p) => ({ id: p.width, name: p.name })),
          cfg.border.width,
          { label: "Border thickness", number: true },
        )}</div>
        ${ctx.productOptions ? "" : ui.range("border.width", { min: cat.BORDER.min, max: cat.BORDER.max, step: 1, value: cfg.border.width, label: "Fine-tune", unit: "" })}
        ${cfg.border.width ? `<div class="fs-field"><span class="fs-label">Border colour</span>${ui.swatches("border.colorId", ctx.caps.borderColors, cfg.border.colorId, { label: "Border colour" })}</div>` : ""}`,
    },
    mat: {
      title: () => "Mat",
      show: () => ctx.caps.mat,
      summary: () =>
        engine.summary(cfg, ctx).find((l) => l.key === "mat").value,
      dynamic: () => {
        const type = byId(cat.MAT.types, cfg.mat.type) || cat.MAT.types[0];
        return `<p class="fs-hint">A card mount between the frame and your print. It gives the photo room to breathe.</p>
          <div class="fs-field"><span class="fs-label">Mat</span>${ui.cards(
            "mat.type",
            ctx.caps.matTypes.map((m) => ({
              id: m.id,
              name: m.name,
              price: ui.delta(m.priceModifier) || "Included",
            })),
            cfg.mat.type,
            { label: "Mat type", columns: 3 },
          )}</div>
          ${
            type.layers
              ? `<div class="fs-field"><span class="fs-label">${type.layers > 1 ? "Outer mat colour" : "Mat colour"}</span>${ui.swatches("mat.colorId", ctx.caps.matColors, cfg.mat.colorId, { label: "Mat colour" })}</div>
            ${type.layers > 1 ? `<div class="fs-field"><span class="fs-label">Inner mat colour</span>${ui.swatches("mat.color2Id", ctx.caps.matColors, cfg.mat.color2Id, { label: "Inner mat colour" })}</div>` : ""}
            <div class="fs-field"><span class="fs-label">Mat width</span>${ui.segmented("mat.widthId", ctx.caps.matWidths, cfg.mat.widthId, { label: "Mat width" })}</div>`
              : ""
          }`;
      },
    },
    size: {
      title: () => "Size",
      show: () => true,
      summary: () =>
        engine.summary(cfg, ctx).find((l) => l.key === "size").value,
      dynamic: () => {
        const base = engine.price(
          Object.assign(clone(cfg), { sizeId: "m" }),
          ctx,
        ).total;
        return `<div class="fs-field"><span class="fs-label">Frame size</span>${ui.cards(
          "sizeId",
          ctx.caps.sizes.map((s) => {
            const p = engine.price(
              Object.assign(clone(cfg), { sizeId: s.id }),
              ctx,
            ).total;
            return {
              id: s.id,
              name: s.label,
              description: s.dims || `${s.w} × ${s.h} in`,
              price: formatPrice(p) + (s.id !== "m" && p !== base ? "" : ""),
            };
          }),
          cfg.sizeId,
          { label: "Frame size", columns: 2 },
        )}</div>
          ${
            ctx.caps.orientations.length > 1
              ? `<div class="fs-field"><span class="fs-label">Orientation</span>${ui.segmented(
                  "orientation",
                  ctx.caps.orientations.map((o) => ({
                    id: o.id,
                    name: o.name,
                  })),
                  cfg.orientation,
                  { label: "Orientation" },
                )}</div>`
              : ""
          }
          ${
            ctx.productOptions
              ? ""
              : `<div class="fs-soon"><strong>Custom size</strong><span>Enter your own width and height in inches or cm.</span><span class="placeholder-note">Coming soon</span>
            <div class="fs-soon__inputs" aria-hidden="true"><input class="input" disabled placeholder="Width"><span>×</span><input class="input" disabled placeholder="Height"><select class="select" disabled><option>in</option></select></div></div>`
          }`;
      },
    },
    print: {
      title: () => "Print",
      show: () => ctx.caps.printMaterials.length > 1,
      summary: () =>
        (byId(ctx.caps.printMaterials, cfg.printMaterialId) || {}).name || "",
      dynamic: () =>
        ui.cards(
          "printMaterialId",
          ctx.caps.printMaterials.map((m) => ({
            id: m.id,
            name: m.name,
            description: [m.finish, m.description].filter(Boolean).join(" · "),
            price: ui.delta(Number(m.priceModifier) || 0) || "Included",
          })),
          cfg.printMaterialId,
          { label: "Print material", columns: 2 },
        ),
    },
    front: {
      title: () => "Front cover",
      show: () => ctx.caps.protection.length > 1,
      summary: () => (byId(cat.PROTECTION, cfg.protection) || {}).name || "",
      dynamic: () =>
        ui.cards(
          "protection",
          ctx.caps.protection.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: ui.delta(p.priceModifier) || "Included",
          })),
          cfg.protection,
          { label: "Front cover", columns: 2 },
        ),
    },
  };

  function renderPanel() {
    let n = 0;
    $("#fs-sections").innerHTML = Object.entries(SECTIONS)
      .filter(([, s]) => s.show())
      .map(([key, s]) =>
        ui.section(key, {
          title: s.title(),
          number: ++n,
          summary: s.summary(),
          open: openSections.has(key),
          body:
            (s.body ? s.body() : "") +
            (s.dynamic
              ? `<div data-dynamic="${key}">${s.dynamic()}</div>`
              : ""),
        }),
      )
      .join("");
    mountUploader();
    if (ctx.caps.text) mountText();
  }

  /** Re-render only the parts that depend on the config, keeping focus where it was. */
  function renderDynamic() {
    const active = document.activeElement;
    const focusKey =
      active && active.dataset && active.dataset.set
        ? `${active.dataset.set}::${active.value}`
        : null;
    $$("[data-dynamic]").forEach(
      (box) => (box.innerHTML = SECTIONS[box.dataset.dynamic].dynamic()),
    );
    $$("[data-summary]").forEach(
      (el) => (el.textContent = SECTIONS[el.dataset.summary].summary()),
    );
    if (ctx.caps.textStyle) renderTextStyles();
    if (focusKey) {
      const again = $$("[data-set]").find(
        (el) => `${el.dataset.set}::${el.value}` === focusKey,
      );
      if (again) again.focus({ preventScroll: true });
    }
  }

  function renderPrice() {
    const p = engine.price(cfg, ctx);
    $("#fs-price-lines").innerHTML = p.lines
      .map(
        (l) =>
          `<div class="fs-price__row"><dt>${esc(l.label)}${l.detail ? `<span>${esc(l.detail)}</span>` : ""}</dt><dd>${l.amount < 0 ? "−" : ""}${formatPrice(Math.abs(l.amount))}</dd></div>`,
      )
      .join("");
    $$("[data-total]").forEach((el) => (el.textContent = formatPrice(p.total)));
    $("#fs-config").innerHTML = engine
      .summary(cfg, ctx)
      .map(
        (l) =>
          `<li><span>${esc(l.label)}</span><strong>${esc(l.value)}</strong></li>`,
      )
      .join("");
  }

  /* ---------------------------------------------------------------- Photos + text */
  function mountUploader() {
    if (uploader) uploader.destroy();
    uploader = FrameX.photoUploader.mount($("#fs-uploader"), {
      slots: ctx.caps.photoSlots,
      getPhoto: (slot) => (cfg.photos[slot] && photoUrls[slot] ? { id: cfg.photos[slot], url: photoUrls[slot] } : null),
      onPhoto(slot, photo) {
        photoUrls[slot] = photo.url;
        cfg.photos[slot] = photo.id;
        cfg.photoMeta[slot] = { w: photo.width, h: photo.height };
        cfg.crop[slot] = { fit: "fill", zoom: 1, px: 50, py: 50, rotate: 0 };
        activeSlot = slot;
        // First photo in photo mode: match the frame to the photo's shape.
        if (ctx.mode === "photo" && !cfg.userChoseOrientation) {
          const wide = photo.width / photo.height > 1.08;
          const want = wide ? "landscape" : "portrait";
          if (cfg.orientation !== want && byId(ctx.caps.orientations, want)) {
            cfg.orientation = want;
            FrameX.toast.show(
              `Switched to a ${want} frame to match your photo.`,
            );
          }
        }
        openSections.add("adjust");
        commit();
        renderPanelSummaries();
      },
      onRemove(slot) {
        delete photoUrls[slot];
        delete cfg.photos[slot];
        delete cfg.photoMeta[slot];
        delete cfg.crop[slot];
        commit();
      },
    });
  }

  function renderPanelSummaries() {
    $$("[data-summary]").forEach(
      (el) => (el.textContent = SECTIONS[el.dataset.summary].summary()),
    );
  }

  function mountText() {
    texts = FrameX.textCustomizer.mount($("#fs-text"), {
      fields: ctx.caps.textFields || [],
      values: cfg.text,
      onChange(fieldId, value) {
        cfg.text[fieldId] = value;
        commit({ panel: false });
        renderPanelSummaries();
      },
    });
    if (ctx.caps.textStyle) renderTextStyles();
  }

  /** Per-field style controls (font, size, colour, alignment, position). */
  function renderTextStyles() {
    $$(".text-field", $("#fs-text")).forEach((wrap) => {
      const field = wrap.dataset.field;
      const st = cfg.textStyle[field] || {};
      let box = $(".fs-textstyle", wrap);
      const open = box ? box.open : false;
      if (!box) {
        box = document.createElement("details");
        box.className = "fs-textstyle";
        wrap.appendChild(box);
      }
      box.innerHTML = `<summary>${icon("frame")} Style this text</summary>
        <div class="fs-field"><span class="fs-label">Font</span>${ui.segmented(
          `textStyle.${field}.fontId`,
          cat.FONTS.map((f) => ({ id: f.id, name: f.name })),
          st.fontId || null,
          { label: "Font" },
        )}</div>
        <div class="fs-field fs-field--inline"><span class="fs-label">Size</span>${ui.segmented(`textStyle.${field}.sizeId`, cat.TEXT_SIZES, st.sizeId || "m", { label: "Text size" })}</div>
        <div class="fs-field fs-field--inline"><span class="fs-label">Align</span>${ui.segmented(
          `textStyle.${field}.align`,
          [
            { id: "left", name: "Left" },
            { id: "center", name: "Centre" },
            { id: "right", name: "Right" },
          ],
          st.align || null,
          { label: "Text alignment" },
        )}</div>
        <div class="fs-field"><span class="fs-label">Colour</span>${ui.swatches(`textStyle.${field}.colorId`, cat.TEXT_COLORS, st.colorId || null, { label: "Text colour" })}</div>
        <div class="fs-row"><span class="fs-label">Position</span>
          <button class="fs-tool fs-tool--icon" type="button" data-act="text-move" data-field="${esc(field)}" data-dy="-15" aria-label="Move text up">${icon("chev-up")}</button>
          <button class="fs-tool fs-tool--icon" type="button" data-act="text-move" data-field="${esc(field)}" data-dy="15" aria-label="Move text down">${icon("chev-down")}</button>
          <button class="fs-tool" type="button" data-act="text-reset" data-field="${esc(field)}">Reset style</button></div>`;
      box.open = open;
    });
  }

  /* ---------------------------------------------------------------- Photo drag + live crop */
  function slotImage(slot) {
    const el = $(`#fs-preview [data-slot-id="${CSS.escape(slot)}"] img`);
    return el;
  }

  function liveCrop(slot) {
    const img = slotImage(slot);
    if (!img) return;
    const box = img.closest(".tpl-slot").getBoundingClientRect();
    img.style.cssText = FrameX.templateEngine.photoStyle(
      { width: box.width, height: box.height },
      cropOf(slot),
    );
  }

  function wirePreviewDrag() {
    const stage = $("#fs-preview");
    let drag = null;
    stage.addEventListener("pointerdown", (e) => {
      const slotEl = e.target.closest(".tpl-slot");
      if (!slotEl || !$("img", slotEl)) return;
      const slot = slotEl.dataset.slotId;
      activeSlot = slot;
      const crop = cropOf(slot);
      if (crop.fit !== "crop")
        cfg.crop[slot] = Object.assign(crop, { fit: "crop" });
      const rect = slotEl.getBoundingClientRect();
      drag = {
        slot,
        x: e.clientX,
        y: e.clientY,
        w: rect.width,
        h: rect.height,
        moved: false,
      };
      slotEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const crop = cfg.crop[drag.slot];
      const k = (100 / Math.max(1, crop.zoom)) * 1.4;
      crop.px = Math.min(
        100,
        Math.max(0, crop.px - ((e.clientX - drag.x) / drag.w) * k),
      );
      crop.py = Math.min(
        100,
        Math.max(0, crop.py - ((e.clientY - drag.y) / drag.h) * k),
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = true;
      liveCrop(drag.slot);
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      commit({ preview: false });
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    // Empty photo spaces open the file picker for that photo.
    stage.addEventListener("click", (e) => {
      const empty = e.target.closest("[data-slot]");
      if (empty) uploader.open(empty.dataset.slot);
    });
  }

  /* ---------------------------------------------------------------- Events from controls */
  function onInput(e) {
    const el = e.target.closest("[data-set]");
    if (!el) return;
    const path = el.dataset.set;
    const value = el.hasAttribute("data-number") ? Number(el.value) : el.value;
    if (path === "ui.activeSlot") {
      activeSlot = value;
      renderDynamic();
      return;
    }
    // Sliders: move the preview live, commit when released.
    if (el.type === "range") {
      const out = el.closest(".sc-range").querySelector("output");
      if (out) out.textContent = value + (el.dataset.unit || "");
      setPath(path, value);
      if (path.startsWith("crop.")) {
        if (cfg.crop[activeSlot].fit === "fill")
          cfg.crop[activeSlot].fit = "crop";
        liveCrop(activeSlot);
      } else renderPreview();
      if (e.type === "change") commit({ preview: false });
      return;
    }
    if (path.startsWith("background."))
      cfg.background = Object.assign(
        { colorId: null, pattern: "" },
        cfg.background || {},
      );
    if (path === "orientation") cfg.userChoseOrientation = true;
    if (path.startsWith("crop.")) cfg.crop[activeSlot] = cropOf(activeSlot);
    setPath(path, value);
    commit();
  }

  function onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const crop = cropOf(activeSlot);
    if (act === "rotate")
      cfg.crop[activeSlot] = Object.assign(crop, {
        rotate: (crop.rotate + 90) % 360,
      });
    if (act === "nudge")
      cfg.crop[activeSlot] = Object.assign(crop, {
        fit: "crop",
        px: Math.min(100, Math.max(0, crop.px + Number(btn.dataset.dx))),
        py: Math.min(100, Math.max(0, crop.py + Number(btn.dataset.dy))),
      });
    if (act === "crop-reset")
      cfg.crop[activeSlot] = {
        fit: "fill",
        zoom: 1,
        px: 50,
        py: 50,
        rotate: 0,
      };
    if (act === "orient") {
      cfg.orientation = btn.dataset.value;
      cfg.userChoseOrientation = true;
    }
    if (act === "bg-reset") cfg.background = null;
    if (act === "text-move") {
      const st = (cfg.textStyle[btn.dataset.field] =
        cfg.textStyle[btn.dataset.field] || {});
      st.dy = Math.max(
        -150,
        Math.min(150, (st.dy || 0) + Number(btn.dataset.dy)),
      );
    }
    if (act === "text-reset") delete cfg.textStyle[btn.dataset.field];
    commit();
  }

  /* ---------------------------------------------------------------- Actions */
  function showProblems(result) {
    const box = $("#fs-problems");
    box.hidden = result.ok;
    if (result.ok) return;
    box.innerHTML = `${icon("alert")}<div><strong>A few things before we can make this</strong><ul>${result.issues.map((i) => `<li><button type="button" data-goto="${esc(i.section)}">${esc(i.message)}</button></li>`).join("")}</ul></div>`;
    const first = result.issues[0];
    goTo(first.section);
    if (first.section === "photos") uploader.showMissing(result.missingPhotos, ctx.caps.photoSlots.length > 1 ? "This photo is still needed." : "Add your photo here.");
    if (first.section === "text" && texts)
      texts.showMissing(result.missingText);
  }

  function goTo(section) {
    const det = $(`[data-section="${CSS.escape(section)}"]`);
    if (!det) return;
    det.open = true;
    openSections.add(section);
    det.scrollIntoView({
      behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  function thumbnail() {
    const first = ctx.caps.photoSlots.map((s) => photoUrls[s]).find(Boolean);
    if (!first)
      return Promise.resolve(
        ctx.template && ctx.template.thumbnail ? ctx.template.thumbnail : "",
      );
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 160;
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext("2d").drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          160,
          160,
        );
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve("");
      img.src = first;
    });
  }

  const title = () =>
    ctx.template
      ? ctx.template.title
      : ctx.product
        ? ctx.product.name
        : "Framed photo";

  async function saveDesign({ quiet = false } = {}) {
    const record = {
      kind: "studio",
      id: cfg.designId || null,
      draftKey,
      mode: ctx.mode,
      templateId: cfg.templateId,
      productId: cfg.productId,
      title: title(),
      thumbnail: await thumbnail(),
      config: clone(cfg),
    };
    const saved = FrameX.designs.save(record);
    if (!saved) {
      FrameX.toast.show(
        "This browser couldn't save your design (storage is full or blocked).",
      );
      return null;
    }
    cfg.designId = saved.id;
    saveDraft();
    if (!quiet)
      FrameX.toast.show("Design saved on this device.", {
        action: {
          label: "View saved",
          onClick: () => (location.href = "templates.html#tpl-saved"),
        },
      });
    return saved;
  }

  /** One problem that isn't about a missing field (an upload that failed, the server's answer). */
  function showNotice(message) {
    const box = $("#fs-problems");
    box.hidden = !message;
    if (message) box.innerHTML = `${icon("alert")}<div><strong>${esc(message)}</strong></div>`;
  }

  let ordering = false;
  function setOrdering(on, text = "") {
    ordering = on;
    $$("[data-add], [data-buy]").forEach((b) => (on ? b.setAttribute("aria-busy", "true") : b.removeAttribute("aria-busy")));
    const status = $("#fs-status");
    status.hidden = !text;
    $("span", status).textContent = text;
  }

  /**
   * What both "Add to cart" and "Buy Now" need first: a complete design, saved,
   * with the ORIGINAL of every photo uploaded. A visitor who isn't logged in
   * gets the login dialog; the design stays open here meanwhile.
   * -> { saved, photos: { slot: uploadId } } or null (something is missing, or the login was dismissed)
   */
  async function prepareOrder(reason) {
    if (ordering) return null;
    const result = engine.validate(cfg, ctx);
    showProblems(result);
    if (!result.ok) return null;
    setOrdering(true);
    const saved = await saveDesign({ quiet: true });
    if (!saved) return setOrdering(false), null;
    const many = ctx.caps.photoSlots.length > 1;
    const sent = await FrameX.uploadService.forOrder({
      reason,
      itemName: title(),
      photos: Object.fromEntries(ctx.caps.photoSlots.map((slot) => [slot, cfg.photos[slot]])),
      onProgress: (percent) => setOrdering(true, percent < 100 ? `Uploading your ${many ? "photos" : "photo"}… ${percent}%` : ""),
    });
    if (uploader) uploader.refresh();
    if (!sent.ok) {
      setOrdering(false);
      if (!sent.cancelled) {
        showNotice(sent.message);
        goTo("photos");
      }
      return null;
    }
    return { saved, photos: sent.uploadIds };
  }

  async function addToCart() {
    const order = await prepareOrder("add");
    if (!order) return;
    // The complete design and the ids of its uploaded photos go to the backend,
    // which checks every option, checks the photos belong to this account and
    // works out the price itself.
    const added = await FrameX.cart.addStudio({
      design: { id: order.saved.id, config: clone(cfg), thumbnail: order.saved.thumbnail },
      photos: order.photos,
      name: title(),
    });
    setOrdering(false);
    if (!added.ok && !added.cancelled && added.code === "PHOTOS_REQUIRED") {
      showNotice(added.message);
      return goTo("photos");
    }
    FrameX.cart.announce(added, `${title()} added to your cart.`);
  }

  /** "Buy Now": this design goes straight to checkout, on its own. The cart is not changed. */
  async function buyNow() {
    const order = await prepareOrder("buy");
    if (!order) return;
    setOrdering(false);
    await FrameX.buyNow.start({
      name: title(),
      item: {
        kind: "studio",
        quantity: 1,
        design: { id: order.saved.id, config: clone(cfg), thumbnail: order.saved.thumbnail },
        photos: order.photos,
      },
    });
  }

  let resetTimer = 0;
  function reset(btn) {
    if (!btn.classList.contains("is-confirming")) {
      btn.classList.add("is-confirming");
      btn.textContent = "Tap again to reset (photos are kept)";
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btn.classList.remove("is-confirming");
        btn.textContent = "Reset customization";
      }, 4000);
      return;
    }
    const keep = {
      photos: cfg.photos,
      photoMeta: cfg.photoMeta,
      designId: cfg.designId,
    };
    cfg = Object.assign(engine.defaults(ctx), keep);
    Object.keys(keep.photos).forEach(
      (slot) =>
        (cfg.crop[slot] = { fit: "fill", zoom: 1, px: 50, py: 50, rotate: 0 }),
    );
    btn.classList.remove("is-confirming");
    btn.textContent = "Reset customization";
    renderPanel();
    commit({ panel: false });
    FrameX.toast.show("Customization reset to the defaults.");
  }

  /* ---------------------------------------------------------------- Start */
  async function load() {
    const q = (k) => FrameX.qs.param(k);
    let record = q("design") ? FrameX.designs.get(q("design")) : null;
    let template = null;
    let product = null;
    // Older template-only designs are converted on the fly.
    const legacy = record && record.kind !== "studio" ? record : null;
    const templateRef =
      (record && record.kind === "studio" && record.templateId) ||
      (legacy && legacy.templateId) ||
      q("template") ||
      q("t");
    const productRef =
      (record && record.kind === "studio" && record.productId) || q("product");
    if (templateRef) template = await FrameX.api.getTemplate(templateRef);
    else if (productRef) product = await FrameX.api.getProduct(productRef);
    if (templateRef && !template)
      throw Object.assign(new Error("missing"), {
        friendly: "That template isn't available any more.",
      });
    if (productRef && !product)
      throw Object.assign(new Error("missing"), {
        friendly: "That frame isn't available any more.",
      });
    if (template && FrameX.templateEngine.validate(template).length)
      throw Object.assign(new Error("broken"), {
        friendly: "This template can't be opened right now.",
      });

    ctx = engine.context({ template, product });
    draftKey = template
      ? `template:${template.id}`
      : product
        ? `product:${product.id}`
        : "photo";
    const base = engine.defaults(ctx);
    let start = null;
    if (record && record.kind === "studio")
      start = Object.assign(base, clone(record.config), {
        designId: record.id,
      });
    else if (legacy)
      start = Object.assign(base, {
        photos: legacy.photos || {},
        text: Object.assign(base.text, legacy.text || {}),
        sizeId: legacy.sizeId || base.sizeId,
      });
    else if (readDrafts()[draftKey])
      start = Object.assign(base, clone(readDrafts()[draftKey].config));
    // Options chosen on the product page come along (normalize drops any this product doesn't offer).
    if (product) {
      const pick = {
        size: "sizeId",
        print: "printMaterialId",
        cover: "protection",
      };
      Object.entries(pick).forEach(
        ([k, path]) => q(k) && ((start = start || base)[path] = q(k)),
      );
      if (q("color")) (start = start || base).frame.colorId = q("color");
    }
    // A photo already chosen on the product page comes along.
    const carried = product ? q("photo") : "";
    if (carried && /^ph-[a-z0-9]+$/.test(carried)) {
      const known = await FrameX.uploadService.info(carried);
      if (known && (await FrameX.uploadService.has(carried))) {
        start = start || base;
        start.photos = Object.assign({}, start.photos, { photo1: carried });
        start.photoMeta = Object.assign({}, start.photoMeta, { photo1: { w: known.width, h: known.height } });
      }
    }
    cfg = engine.normalize(start || base, ctx);

    // Photos come back from this browser's storage. One whose original is no
    // longer here (and was never uploaded) can't be printed: it has to be added again.
    await Promise.all(
      Object.entries(cfg.photos).map(async ([slot, id]) => {
        const url = (await FrameX.uploadService.has(id)) ? await FrameX.uploadService.getUrl(id) : null;
        if (url) photoUrls[slot] = url;
        else {
          delete cfg.photos[slot];
          delete cfg.photoMeta[slot];
          delete cfg.crop[slot];
        }
      }),
    );
    activeSlot =
      ctx.caps.photoSlots.find((s) => cfg.photos[s]) || ctx.caps.photoSlots[0];
  }

  function shell() {
    const modeLabel = ctx.template
      ? `Template · ${esc(ctx.template.title)}`
      : ctx.product
        ? `Frame · ${esc(ctx.product.name)}`
        : "Your photo";
    return `<div class="fs">
      <header class="fs-head">
        <div>
          <p class="fs-brand">FrameX <span>Studio</span></p>
          <p class="fs-tagline">Design your frame. Your way.</p>
        </div>
        <p class="fs-mode">${icon(ctx.template ? "image" : ctx.product ? "frame" : "upload")} ${modeLabel}</p>
      </header>
      <div class="fs-layout">
        <div class="fs-stagecol">
          <div class="fs-stage">
            <div class="fs-preview" id="fs-preview" aria-live="off"></div>
          </div>
          <p class="fs-stage__meta"><span id="fs-preview-size"></span><span>Drag a photo to reposition it. Colours and textures are approximate.</span></p>
        </div>
        <div class="fs-panel">
          <div class="fs-config">
            <div class="fs-config__head"><h1 class="fs-title">${esc(title())}</h1><p class="fs-total"><strong data-total></strong></p></div>
            <ul class="fs-config__list" id="fs-config"></ul>
          </div>
          <div class="fs-sections" id="fs-sections"></div>
          <div class="fs-price">
            <h2 class="fs-price__title">Price</h2>
            <dl class="fs-price__lines" id="fs-price-lines"></dl>
            <div class="fs-price__total"><span>Total</span><strong data-total></strong></div>
            <p class="fs-hint">Prices are confirmed with you before your frame is made.</p>
          </div>
          <div class="tpl-problems" id="fs-problems" role="alert" hidden></div>
          <p class="fs-status" id="fs-status" role="status" hidden>${icon("upload")}<span></span></p>
          <div class="fs-actions">
            <button class="btn btn--primary btn--block" type="button" data-add>${icon("bag")} Add to cart · <span data-total></span></button>
            <button class="btn btn--dark btn--block" type="button" data-buy>Buy Now · <span data-total></span></button>
            <div class="fs-actions__row">
              <button class="btn btn--outline" type="button" data-save>Save design</button>
              <button class="btn btn--outline fs-reset" type="button" data-reset>Reset customization</button>
            </div>
          </div>
        </div>
      </div>
      <div class="fs-buybar">
        <button class="fs-buybar__thumb" type="button" data-top aria-label="Back to the preview">${icon("chev-up")}</button>
        <div class="fs-buybar__price"><strong data-total></strong><span>${esc(title())}</span></div>
        <button class="btn btn--primary" type="button" data-add>Add to cart</button>
      </div>
    </div>`;
  }

  async function init() {
    const root = $("#fs-root");
    if (!root) return;
    cat = engine.catalog();
    try {
      await FrameX.uploadService.limits(); // the largest photo the server takes
      await load();
    } catch (error) {
      if (!error.friendly) console.error("Studio failed to start", error);
      root.innerHTML = `<div class="not-found">${icon("frame")}<h1>${esc(error.friendly || "FrameX Studio couldn't open this design")}</h1>
        <p>You can start again from a template or with your own photo.</p>
        <div class="final-cta__actions"><a class="btn btn--dark" href="templates.html">Browse templates</a><a class="btn btn--outline" href="studio.html?mode=photo">Frame a photo</a></div></div>`;
      return;
    }
    document.title = `${title()} · FrameX Studio`;
    root.innerHTML = shell();
    renderPanel();
    renderDynamic();
    renderPreview();
    renderPrice();
    wirePreviewDrag();

    const panel = $(".fs-panel", root);
    panel.addEventListener("change", onInput);
    panel.addEventListener(
      "input",
      (e) => e.target.type === "range" && onInput(e),
    );
    panel.addEventListener("click", (e) => {
      onClick(e);
      const go = e.target.closest("[data-goto]");
      if (go) goTo(go.dataset.goto);
    });
    panel.addEventListener(
      "toggle",
      (e) =>
        e.target.matches("[data-section]") &&
        (e.target.open
          ? openSections.add(e.target.dataset.section)
          : openSections.delete(e.target.dataset.section),
        $("#fs-preview").classList.toggle(
          "is-adjusting",
          openSections.has("adjust"),
        )),
      true,
    );
    $$("[data-add]", root).forEach((b) =>
      b.addEventListener("click", addToCart),
    );
    $$("[data-buy]", root).forEach((b) => b.addEventListener("click", buyNow));
    $("[data-save]", root).addEventListener("click", () => saveDesign());
    $("[data-reset]", root).addEventListener("click", (e) =>
      reset(e.currentTarget),
    );
    $("[data-top]", root).addEventListener("click", () =>
      $(".fs-stage").scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  FrameX.studioPage = { init };
})((window.FrameX = window.FrameX || {}));
