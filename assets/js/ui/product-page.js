/* ==========================================================================
   Product Details page  (product.html?id=<productId>)
   Everything shown comes from the product / shop records. Optional fields
   (colours, extra images, description) are simply hidden when absent.

   The "visualizer" (colour + size + uploaded-photo preview) is an HONEST
   frontend mock-up: a CSS-rendered frame border around either the customer's
   own photo or the product's real photo, never a claim of an exact render.
   The page says so next to it. Nothing uploaded here is sent anywhere or
   saved — see the note under "Preview your photo".
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice, priceForSize, sizeOptions, defaultSizeId, hasSizeChoice, availability } = FrameX.pricing;
  const { FULFILMENT_METHODS } = FrameX.constants;
  const FALLBACK_IMAGE = "assets/img/ui/frame-decor.webp";
  const MAX_UPLOAD_MB = 10;
  const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const SCALE_PX_PER_IN = 9; // real-world size comparison scale

  let product, shop, categories, palette;
  const config = { sizeId: null, colorId: null, qty: 1, zoom: 1, ox: 0, oy: 0, photoName: "" };
  let photoUrl = null;
  let previewMode = "view"; // "view" = real product photo, "custom" = your photo inside the product's own frame

  const colorsOf = (p) => (p.colors || []).map((id) => palette[id]).filter(Boolean);
  const currentColor = () => colorsOf(product).find((c) => c.id === config.colorId) || colorsOf(product)[0];
  const currentSize = () => sizeOptions(product).find((o) => o.id === config.sizeId) || sizeOptions(product)[0];

  // Every product's own frame design (shape/material/border/mat) — see the
  // `frame` field documented in assets/data/products.seed.js. Products that
  // don't define one (the everyday range) fall back to a plain rectangle so
  // the page still works, but the 10 named styles each carry their own.
  const FRAME_DEFAULTS = { shape: "rectangle", style: "plain", borderWidth: "medium", double: false, ornament: false, matColor: "white", matWidth: "medium" };
  const frameOf = (p) => Object.assign({}, FRAME_DEFAULTS, p.frame || {});
  const MAT_COLORS = { none: "transparent", white: "#f7f4ee", cream: "#efe3c8", red: "#7a2020" };
  const matHex = (id) => MAT_COLORS[id] || MAT_COLORS.white;

  function parseAspect(dimensions) {
    const m = /([\d.]+)\s*×\s*([\d.]+)/.exec(dimensions || "");
    return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 4, h: 5 };
  }

  // ---- Visualizer stage (left column) ---------------------------------------------
  // Two modes, per the brief: "View Product" (default) shows the real product
  // photo exactly as sold — frame design included, since that's a real photo
  // of the real frame. "Try With Your Own Image" switches to a CSS-built
  // stage using THIS product's own frame config (frameOf), so the customer's
  // photo sits inside the same frame shape/material/mat as the product they
  // picked — never a generic shared border.
  function stageHtml() {
    const many = product.images.length > 1;
    return `<div class="pdp-visualizer">
      <div class="pdp-mode" role="tablist" aria-label="How you'd like to preview this frame">
        <button class="pdp-mode__btn" type="button" role="tab" id="pdp-mode-view" aria-selected="true" aria-controls="pdp-stage-view" tabindex="0">${icon("frame")}<span>View Product</span></button>
        <button class="pdp-mode__btn" type="button" role="tab" id="pdp-mode-custom" aria-selected="false" aria-controls="pdp-stage-custom" tabindex="-1">${icon("upload")}<span>Try With Your Own Image</span></button>
      </div>

      <div class="pdp-stage">
        <div class="pdp-stage__panel" id="pdp-stage-view" role="tabpanel" aria-labelledby="pdp-mode-view">
          <div class="pdp-stage__real">
            <img id="pdp-stage-real" src="${esc(product.image)}" alt="${esc(product.name)}" decoding="async">
          </div>
        </div>
        <div class="pdp-stage__panel" id="pdp-stage-custom" role="tabpanel" aria-labelledby="pdp-mode-custom" hidden>
          <div class="pdp-stage__frame" id="pdp-stage-frame">
            <div class="pdp-stage__mat" id="pdp-stage-mat">
              <div class="pdp-stage__photo" id="pdp-stage-photo">
                <img id="pdp-stage-img" src="" alt="Your photo inside the ${esc(product.name)} frame" decoding="async">
              </div>
            </div>
          </div>
          <p class="pdp-stage__empty" id="pdp-stage-empty">${icon("image")}<span>Upload your photo below to see it inside this frame</span></p>
        </div>
      </div>

      ${many ? `<div class="pdp-gallery__thumbs" id="pdp-stage-thumbs" role="group" aria-label="Product images">${product.images
        .map((src, i) => `<button class="pdp-gallery__thumb" type="button" data-thumb="${i}" aria-current="${i === 0}" aria-label="Show image ${i + 1} of ${product.images.length}"><img src="${esc(src)}" alt="" width="72" height="72" loading="lazy"></button>`)
        .join("")}</div>` : ""}
      <p class="pdp-stage__caption" id="pdp-stage-caption">This is the actual ${esc(product.name)} frame, shown exactly as sold.</p>
    </div>`;
  }

  function setMode(mode) {
    previewMode = mode === "custom" ? "custom" : "view";
    const isCustom = previewMode === "custom";
    const viewBtn = $("#pdp-mode-view"), customBtn = $("#pdp-mode-custom");
    viewBtn.setAttribute("aria-selected", String(!isCustom));
    viewBtn.tabIndex = isCustom ? -1 : 0;
    customBtn.setAttribute("aria-selected", String(isCustom));
    customBtn.tabIndex = isCustom ? 0 : -1;
    $("#pdp-stage-view").hidden = isCustom;
    $("#pdp-stage-custom").hidden = !isCustom;
    const thumbs = $("#pdp-stage-thumbs");
    if (thumbs) thumbs.hidden = isCustom;
    const upload = $("#pdp-upload-section");
    if (upload) upload.hidden = !isCustom;
    $("#pdp-stage-caption").textContent = isCustom
      ? "Preview only — your photo inside the actual frame design. Not an exact render; wood grain, mat and colour may vary."
      : `This is the actual ${product.name} frame, shown exactly as sold.`;
    if (isCustom) applyStage();
  }

  function applyStage() {
    const frame = frameOf(product);
    const color = currentColor();
    const { w, h } = parseAspect((currentSize() || {}).dimensions);

    const frameEl = $("#pdp-stage-frame");
    frameEl.style.setProperty("--aspect", `${w} / ${h}`);
    frameEl.style.setProperty("--swatch", color ? color.hex : "#1c1c1c");
    frameEl.className = [
      "pdp-stage__frame",
      color ? `pdp-stage__frame--${color.texture}` : "",
      `pdp-stage__frame--style-${frame.style}`,
      `pdp-stage__frame--border-${frame.borderWidth}`,
      frame.shape === "arch" ? "pdp-stage__frame--arch" : "",
      frame.shape === "square" ? "pdp-stage__frame--square" : "",
      frame.double ? "pdp-stage__frame--double" : "",
      frame.ornament ? "pdp-stage__frame--ornament" : ""
    ].filter(Boolean).join(" ");

    const matEl = $("#pdp-stage-mat");
    matEl.className = "pdp-stage__mat pdp-stage__mat--" + frame.matWidth;
    matEl.style.setProperty("--mat-color", matHex(frame.matColor));
    $("#pdp-stage-photo").classList.toggle("pdp-stage__photo--arch", frame.shape === "arch");

    const img = $("#pdp-stage-img");
    img.style.setProperty("--z", config.zoom);
    img.style.setProperty("--ox", config.ox + "%");
    img.style.setProperty("--oy", config.oy + "%");
    if (photoUrl) img.src = photoUrl;
    img.style.visibility = photoUrl ? "visible" : "hidden";
    $("#pdp-stage-empty").hidden = Boolean(photoUrl);
  }

  function wireStageThumbs() {
    const main = $("#pdp-stage-real");
    main.addEventListener("error", () => { if (main.src.indexOf(FALLBACK_IMAGE) === -1) main.src = FALLBACK_IMAGE; });
    $$("[data-thumb]").forEach((t) =>
      t.addEventListener("click", () => {
        product.image = product.images[Number(t.dataset.thumb)];
        main.src = product.image;
        $$("[data-thumb]").forEach((b) => b.setAttribute("aria-current", String(b === t)));
      })
    );

    const modeBtns = [$("#pdp-mode-view"), $("#pdp-mode-custom")];
    modeBtns[0].addEventListener("click", () => setMode("view"));
    modeBtns[1].addEventListener("click", () => setMode("custom"));
    $(".pdp-mode").addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      e.preventDefault();
      const i = modeBtns.indexOf(document.activeElement);
      if (i < 0) return;
      const next = modeBtns[(i + (e.key === "ArrowRight" ? 1 : -1) + modeBtns.length) % modeBtns.length];
      next.focus();
      next.click();
    });
  }

  // ---- Real-world size comparison --------------------------------------------------
  function comparisonHtml() {
    return `<div class="pdp-compare" id="pdp-compare" aria-hidden="false">
      <h2 class="pdp-compare__title">How big is that, really?</h2>
      <div class="pdp-compare__row" id="pdp-compare-row">
        <div class="pdp-compare__item">
          <span class="pdp-compare__shape pdp-compare__shape--frame" id="pdp-compare-frame"></span>
          <span class="pdp-compare__label" id="pdp-compare-dims">—</span>
        </div>
        <div class="pdp-compare__item">
          <span class="pdp-compare__shape pdp-compare__shape--hand" id="pdp-compare-hand">${icon("hand")}</span>
          <span class="pdp-compare__label">Average adult hand (≈7.5 in)</span>
        </div>
        <div class="pdp-compare__item">
          <span class="pdp-compare__shape pdp-compare__shape--paper" id="pdp-compare-paper"></span>
          <span class="pdp-compare__label">A4 sheet (8.27 × 11.69 in)</span>
        </div>
      </div>
      <p class="pdp-compare__note">Sizes shown are for visual reference. Actual appearance may vary depending on viewing distance and display size.</p>
    </div>`;
  }

  function applyComparison() {
    const size = currentSize();
    if (!size) return;
    const { w, h } = parseAspect(size.dimensions);
    $("#pdp-compare-frame").style.width = w * SCALE_PX_PER_IN + "px";
    $("#pdp-compare-frame").style.height = h * SCALE_PX_PER_IN + "px";
    $("#pdp-compare-dims").textContent = `${size.label} (${size.dimensions})`;
    $("#pdp-compare-hand").style.height = 7.5 * SCALE_PX_PER_IN + "px";
    $("#pdp-compare-hand").style.width = 7.5 * SCALE_PX_PER_IN * 0.72 + "px";
    $("#pdp-compare-paper").style.width = 8.27 * SCALE_PX_PER_IN + "px";
    $("#pdp-compare-paper").style.height = 11.69 * SCALE_PX_PER_IN + "px";
  }

  // ---- Info column -------------------------------------------------------------------
  function stockInfo() {
    const status = availability(product);
    if (status === "out_of_stock") return ["out", "Out of stock"];
    if (status === "low_stock" && typeof product.stock === "number") return ["low", `Only ${product.stock} left`];
    return ["in", "In stock"];
  }

  function colorPickerHtml() {
    const colors = colorsOf(product);
    if (colors.length < 2) return "";
    return `<div class="pdp-option" id="opt-color">
      <div class="pdp-option__label" id="opt-color-label"><span>Frame colour</span></div>
      <div class="pdp-swatches" role="radiogroup" aria-labelledby="opt-color-label">
        ${colors.map((c) => `<button class="pdp-swatch" type="button" role="radio" aria-checked="${c.id === config.colorId}" data-color="${esc(c.id)}" style="--swatch:${c.hex}" aria-label="${esc(c.name)}">
            <span class="pdp-swatch__dot pdp-swatch__dot--${c.texture}"></span>${icon("check", "pdp-swatch__check")}</button>`).join("")}
      </div>
      <p class="pdp-option__value" id="opt-color-value">Selected: ${esc(currentColor() ? currentColor().name : "")}</p>
    </div>`;
  }

  function sizePickerHtml() {
    const opts = sizeOptions(product);
    if (opts.length < 2) {
      const only = opts[0];
      return only ? `<p class="pdp-option__label">Size: <span class="badge badge--muted">${esc(only.label)}${only.dimensions ? " — " + esc(only.dimensions) : ""}</span></p>` : "";
    }
    return `<div class="pdp-option" id="opt-size" data-invalid="false">
      <div class="pdp-option__label" id="opt-size-label"><span>Size</span>
        <span class="form-field__error" role="alert">${icon("alert")}<span>Please choose a size</span></span></div>
      <div class="pdp-size-grid" role="radiogroup" aria-labelledby="opt-size-label">
        ${opts.map((o) => `<button class="pdp-size-card" type="button" role="radio" aria-checked="${o.id === config.sizeId}" data-size="${esc(o.id)}">
            <span class="pdp-size-card__label">${esc(o.label)}</span>
            <span class="pdp-size-card__dims">${esc(o.dimensions || "")}</span>
            <span class="pdp-size-card__delta">${o.priceDelta > 0 ? "+" : o.priceDelta < 0 ? "−" : ""}${o.priceDelta ? formatPrice(Math.abs(o.priceDelta)) : "Included"}</span>
            ${icon("check", "pdp-size-card__check")}
          </button>`).join("")}
      </div>
    </div>`;
  }

  function infoHtml() {
    const [stockKey, stockText] = stockInfo();
    const out = stockKey === "out";
    const badges = [];
    if (product.discountPercent > 0) badges.push(`<span class="badge badge--discount">${product.discountPercent}% off</span>`);
    if (product.isNew) badges.push(`<span class="badge">New</span>`);

    return `<div class="pdp-info">
      ${shop ? `<a class="pdp-info__shop" href="${FrameX.qs.shopUrl(shop.id)}">${icon("store")} ${esc(shop.name)}</a>` : ""}
      <h1 class="pdp-info__title">${esc(product.name)}</h1>
      ${badges.length ? `<div class="pdp-info__badges">${badges.join("")}</div>` : ""}
      <div class="pdp-info__price"><p class="price"><strong class="price__now" id="pdp-price">${formatPrice(priceForSize(product, config.sizeId))}</strong>
        ${product.discountPercent > 0 ? `<s class="price__was" id="pdp-price-was">${formatPrice(product.price)}</s>` : ""}</p></div>
      <p class="pdp-availability pdp-availability--${stockKey}">${icon(out ? "close" : "check")} ${stockText}</p>
      ${product.description ? `<p class="pdp-info__desc">${esc(product.description)}</p>` : ""}

      ${sizePickerHtml()}
      ${colorPickerHtml()}

      <div class="pdp-option">
        <label class="pdp-option__label" for="pdp-note">Customization note <span class="hint">(optional)</span></label>
        <div class="form-field"><textarea id="pdp-note" maxlength="200" rows="2" placeholder="e.g. text to include, a size not listed"></textarea></div>
      </div>

      ${uploadHtml()}

      <div class="pdp-summary" id="pdp-summary" aria-live="polite">
        <h2 class="pdp-summary__title">Your frame</h2>
        <dl class="pdp-summary__list">
          <dt>Product</dt><dd id="sum-product">${esc(product.name)}</dd>
          <dt>Size</dt><dd id="sum-size">—</dd>
          <dt>Frame colour</dt><dd id="sum-color">—</dd>
          <dt>Photo</dt><dd id="sum-photo">Not uploaded</dd>
          <dt>Quantity</dt><dd id="sum-qty">1</dd>
          <dt>Price</dt><dd id="sum-price">—</dd>
        </dl>
      </div>

      <div class="pdp-buybox">
        <div class="qty" role="group" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity" disabled>${icon("minus")}</button>
          <span class="qty__value" id="pdp-qty" aria-live="polite">1</span>
          <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity">${icon("plus")}</button>
        </div>
        <button class="btn btn--primary" type="button" id="pdp-add" ${out ? "disabled" : ""}>${out ? "Out of stock" : "Add to cart"}</button>
        ${FrameX.templates.wishButton(product)}
      </div>
      <p class="pdp-feedback" id="pdp-feedback" role="status">${icon("check")}<span></span></p>
    </div>`;
  }

  function uploadHtml() {
    return `<div class="pdp-upload" id="pdp-upload-section" hidden>
      <strong>Customize / Upload Photo <span class="placeholder-note">Preview only</span></strong>
      <label class="pdp-upload__zone" for="pdp-file" id="pdp-upload-zone">${icon("upload")}<span>Choose a photo (JPG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB)</span></label>
      <input class="visually-hidden" id="pdp-file" type="file" accept="${UPLOAD_TYPES.join(",")}">
      <p class="pdp-upload__error" id="pdp-upload-error" role="alert">${icon("alert")}<span></span></p>
      <div class="pdp-upload__preview" id="pdp-upload-preview">
        <img alt="Your selected photo preview" width="48" height="48">
        <div class="pdp-upload__meta"><strong id="pdp-upload-name"></strong>
          <div class="pdp-upload__meta-actions">
            <label class="cart-line__remove" for="pdp-file" style="cursor:pointer">Replace photo</label>
            <button class="cart-line__remove" type="button" id="pdp-upload-remove">Remove photo</button>
          </div>
        </div>
      </div>
      <div class="pdp-position" id="pdp-position" hidden>
        <span class="pdp-position__label">Adjust photo</span>
        <div class="pdp-position__controls" role="group" aria-label="Photo position controls">
          <button class="icon-btn" type="button" data-pos="zoom-out" aria-label="Zoom out">${icon("minus")}</button>
          <button class="icon-btn" type="button" data-pos="zoom-in" aria-label="Zoom in">${icon("plus")}</button>
          <button class="icon-btn" type="button" data-pos="left" aria-label="Move photo left">${icon("chev-left")}</button>
          <button class="icon-btn" type="button" data-pos="up" aria-label="Move photo up">${icon("chev-up")}</button>
          <button class="icon-btn" type="button" data-pos="down" aria-label="Move photo down">${icon("chev-down")}</button>
          <button class="icon-btn" type="button" data-pos="right" aria-label="Move photo right">${icon("chev-right")}</button>
          <button class="btn btn--outline btn--sm" type="button" data-pos="reset">Reset</button>
        </div>
      </div>
      <p class="pdp-upload__note">Photo upload isn't connected yet: this photo stays on your device for this preview only. It is NOT saved, NOT sent to the shop, and NOT attached to your cart or order. Use the note above or the Contact page to arrange your photo with the shop.</p>
    </div>`;
  }

  // ---- live summary + price --------------------------------------------------------
  function updateSummary() {
    const size = currentSize();
    const color = currentColor();
    $("#sum-size").textContent = size ? `${size.label}${size.dimensions ? " (" + size.dimensions + ")" : ""}` : "—";
    const colorRow = colorsOf(product).length > 0;
    $("#sum-color").previousElementSibling.hidden = $("#sum-color").hidden = !colorRow;
    if (colorRow) $("#sum-color").textContent = color ? color.name : "—";
    $("#sum-photo").textContent = photoUrl ? `Uploaded (${config.photoName})` : "Not uploaded";
    $("#sum-qty").textContent = config.qty;
    const price = priceForSize(product, config.sizeId);
    $("#sum-price").textContent = formatPrice(price);
    $("#pdp-price").textContent = formatPrice(price);
  }

  function maxQty() {
    return Math.min(FrameX.cart.MAX_QTY, typeof product.stock === "number" && product.stock > 0 ? product.stock : FrameX.cart.MAX_QTY);
  }

  // ---- wiring --------------------------------------------------------------------------
  function wireSelectors() {
    $$("[data-size]").forEach((btn) =>
      btn.addEventListener("click", () => {
        config.sizeId = btn.dataset.size;
        $$("[data-size]").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
        $("#opt-size") && ($("#opt-size").dataset.invalid = "false");
        applyStage(); applyComparison(); updateSummary();
      })
    );
    $$("[data-color]").forEach((btn) =>
      btn.addEventListener("click", () => {
        config.colorId = btn.dataset.color;
        $$("[data-color]").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
        $("#opt-color-value").textContent = `Selected: ${currentColor().name}`;
        applyStage(); updateSummary();
      })
    );
    $$(".pdp-size-grid, .pdp-swatches").forEach((group) =>
      group.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const items = $$("[role=radio]", group);
        const i = items.indexOf(document.activeElement);
        const next = items[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
        next.focus();
        next.click();
      })
    );

    $$("[data-qty]").forEach((btn) =>
      btn.addEventListener("click", () => {
        config.qty = Math.min(Math.max(config.qty + Number(btn.dataset.qty), 1), maxQty());
        $("#pdp-qty").textContent = config.qty;
        $('[data-qty="-1"]').disabled = config.qty <= 1;
        $('[data-qty="1"]').disabled = config.qty >= maxQty();
        updateSummary();
      })
    );

    $("#pdp-add").addEventListener("click", () => {
      if ($("#pdp-add").disabled) return;
      if (hasSizeChoice(product) && !config.sizeId) {
        $("#opt-size").dataset.invalid = "true";
        return $('[data-size]').focus();
      }
      const size = currentSize();
      const color = currentColor();
      const note = $("#pdp-note").value.trim();
      FrameX.cart.add(product, { sizeId: config.sizeId, size: size ? size.label + (size.dimensions ? " (" + size.dimensions + ")" : "") : null, color: color ? color.name : null, qty: config.qty, note });
      const box = $("#pdp-feedback");
      $("span", box).textContent = `${config.qty} × ${product.name}${size ? " (" + size.label + ")" : ""}${color ? ", " + color.name : ""} added to your cart.`;
      box.classList.add("is-visible");
      FrameX.toast.show("Added to cart.", { action: { label: "View cart", onClick: () => FrameX.cartDrawer.open() } });
    });
  }

  function wireUpload() {
    const input = $("#pdp-file");
    const error = $("#pdp-upload-error");
    const preview = $("#pdp-upload-preview");
    const position = $("#pdp-position");
    const zone = $("#pdp-upload-zone");
    const fail = (msg) => { $("span", error).textContent = msg; error.classList.add("is-visible"); };

    function clear() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = null; config.photoName = ""; config.zoom = 1; config.ox = 0; config.oy = 0;
      input.value = "";
      preview.classList.remove("is-visible");
      position.hidden = true;
      applyStage(); updateSummary();
    }

    function handleFile(file) {
      error.classList.remove("is-visible");
      if (!file) return;
      if (!UPLOAD_TYPES.includes(file.type)) return fail("Please choose a JPG, PNG or WebP image.");
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return fail(`That file is larger than ${MAX_UPLOAD_MB} MB.`);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(file);
      config.photoName = file.name;
      config.zoom = 1; config.ox = 0; config.oy = 0;
      $("img", preview).src = photoUrl;
      $("#pdp-upload-name").textContent = file.name;
      preview.classList.add("is-visible");
      position.hidden = false;
      applyStage(); updateSummary();
    }

    input.addEventListener("change", () => handleFile(input.files[0]));
    ["dragover", "dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.toggle("is-dragover", evt === "dragover");
        if (evt === "drop") handleFile(e.dataTransfer.files[0]);
      })
    );
    $("#pdp-upload-remove").addEventListener("click", clear);

    const PAN_STEP = 10;
    $$("[data-pos]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const action = btn.dataset.pos;
        if (action === "reset") { config.zoom = 1; config.ox = 0; config.oy = 0; }
        if (action === "zoom-in") config.zoom = Math.min(2.5, Math.round((config.zoom + 0.15) * 100) / 100);
        if (action === "zoom-out") config.zoom = Math.max(1, Math.round((config.zoom - 0.15) * 100) / 100);
        const maxPan = ((config.zoom - 1) / config.zoom) * 50;
        if (action === "left") config.ox = Math.max(-maxPan, config.ox - PAN_STEP);
        if (action === "right") config.ox = Math.min(maxPan, config.ox + PAN_STEP);
        if (action === "up") config.oy = Math.max(-maxPan, config.oy - PAN_STEP);
        if (action === "down") config.oy = Math.min(maxPan, config.oy + PAN_STEP);
        config.ox = Math.max(-maxPan, Math.min(maxPan, config.ox));
        config.oy = Math.max(-maxPan, Math.min(maxPan, config.oy));
        $('[data-pos="zoom-out"]').disabled = config.zoom <= 1;
        $('[data-pos="zoom-in"]').disabled = config.zoom >= 2.5;
        applyStage();
      })
    );
  }

  // ---- shop card + tabs + related ----------------------------------------------------
  function shopCardHtml() {
    if (!shop) return "";
    const methods = (shop.fulfilment || []).filter((id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled).map((id) => FULFILMENT_METHODS[id].label);
    return `<div class="pdp-shop-card">
      ${shop.logo ? `<img src="${esc(shop.logo)}" alt="" width="52" height="52">` : `<span class="shop-hero__logo" aria-hidden="true" style="width:52px;height:52px">${esc(shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join(""))}</span>`}
      <div class="pdp-shop-card__info"><strong>${esc(shop.name)}</strong>
        <span>${esc(FrameX.shopUtils.formatAddress(shop))}</span>
        ${methods.length ? `<span>${esc(methods.join(" · "))}</span>` : ""}</div>
      <a class="btn btn--outline btn--sm" href="${FrameX.qs.shopUrl(shop.id)}">View shop</a></div>`;
  }

  function tabsHtml() {
    const catNames = (product.categoryIds || []).map((id) => (categories.find((c) => c.id === id) || {}).name).filter(Boolean);
    const rows = [
      ["Category", catNames.join(", ")],
      ["Material", product.material],
      ["Available sizes", sizeOptions(product).map((o) => o.label).join(", ")],
      ["Available colours", colorsOf(product).map((c) => c.name).join(", ")],
      ["Availability", stockInfo()[1]],
      ["Sold by", shop && shop.name]
    ].filter(([, v]) => v);
    const methods = shop ? (shop.fulfilment || []).filter((id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled) : [];

    const tabs = [
      ["desc", "Description", product.description ? `<p>${esc(product.description)}</p>` : `<p>The shop hasn't added a description yet.</p>`],
      ["details", "Details", `<dl class="spec-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`],
      ["custom", "Customization", `<p>You can choose a size and frame colour above, add a note, and preview your own photo inside the frame — all on this page, right now. The frame "style" is the product itself: pick the style you like from the shop, then customize its colour and size.</p><p>Uploading your photo so the shop can actually print it, and custom sizes outside this list, are planned and need a backend.</p>`],
      ["delivery", "Pickup &amp; delivery", methods.length
        ? `<ul>${methods.map((id) => `<li><strong>${esc(FULFILMENT_METHODS[id].label)}:</strong> ${esc(FULFILMENT_METHODS[id].summary)}</li>`).join("")}</ul><p>Delivery fees and timing are set by the shop and confirmed at checkout, which isn't connected yet.</p>`
        : `<p>This shop hasn't listed its pickup or delivery options yet.</p>`],
      ["returns", "Returns &amp; cancellation", `<p>Orders can be cancelled or changed only before production begins. If a frame arrives damaged or incorrect, contact us within 7 days. See the <a href="faq.html#faq-cancellation" style="text-decoration:underline">FAQ</a> for details.</p>`]
    ];
    return `<div class="detail-tabs">
      <div class="detail-tabs__list" role="tablist" aria-label="Product information">${tabs.map(([id, label], i) => `<button class="detail-tabs__btn" type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join("")}</div>
      ${tabs.map(([id, , body], i) => `<div class="detail-tabs__panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${i ? "hidden" : ""}>${body}</div>`).join("")}
    </div>`;
  }

  function wireTabs() {
    const btns = $$(".detail-tabs__btn");
    const select = (btn, focus) => {
      btns.forEach((b) => {
        const on = b === btn;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        $("#" + b.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) btn.focus();
    };
    btns.forEach((b) => b.addEventListener("click", () => select(b)));
    $(".detail-tabs__list").addEventListener("keydown", (e) => {
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: btns.length - 1 };
      if (!(e.key in map)) return;
      e.preventDefault();
      select(btns[(map[e.key] + btns.length) % btns.length], true);
    });
  }

  async function loadRelated() {
    const box = $("#related-grid");
    try {
      const cat = (product.categoryIds || [])[0];
      const { items } = await FrameX.api.getProducts({ category: cat, limit: 12 });
      const related = items.filter((p) => p.id !== product.id).sort((a, b) => (b.shopId === product.shopId) - (a.shopId === product.shopId)).slice(0, 4);
      box.innerHTML = related.length
        ? related.map(FrameX.templates.productCard).join("")
        : `<div class="state-message"><strong>No related frames yet</strong><a class="btn btn--outline btn--sm" href="shop.html">Browse all frames</a></div>`;
    } catch (error) {
      console.error("Related products failed", error);
      FrameX.templates.showError(box, "Related frames couldn't be loaded.", loadRelated);
    }
  }

  function notFound(root, message) {
    document.title = "Frame not found — FrameX";
    root.innerHTML = `<div class="not-found">${icon("frame")}<h1 class="section-title">Frame not found</h1><p class="section-lead">${esc(message)}</p>
      <a class="btn btn--dark" href="shop.html">Browse all frames</a></div>`;
  }

  async function init() {
    const root = $("#pdp-root");
    if (!root) return;
    const id = FrameX.qs.param("id");
    if (!id) return notFound(root, "No product was selected.");
    root.innerHTML = `<div class="pdp"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton" style="min-height:420px"></div></div>`;
    try {
      product = await FrameX.api.getProduct(id);
      if (!product) return notFound(root, "That frame doesn't exist or is no longer available.");
      [shop, categories] = await Promise.all([FrameX.api.getShop(product.shopId), FrameX.api.getCategories()]);
    } catch (error) {
      console.error("Product failed to load", error);
      return FrameX.templates.showError(root, "This frame couldn't be loaded.", init);
    }

    palette = (FrameX.seed.frameColors || []).reduce((map, c) => ((map[c.id] = c), map), {});
    config.sizeId = defaultSizeId(product);
    config.colorId = colorsOf(product)[0] ? colorsOf(product)[0].id : null;
    document.title = `${product.name} — FrameX`;
    $("#pdp-crumb-name").textContent = product.name;

    root.innerHTML = `<div class="pdp">${stageHtml()}${infoHtml()}</div>
      <div class="split" style="margin-top:clamp(28px,5vw,56px)">${comparisonHtml()}</div>
      <div class="split split--asym" style="margin-top:clamp(28px,5vw,56px)"><div>${tabsHtml()}</div><div>${shopCardHtml()}</div></div>`;

    wireStageThumbs();
    applyStage();
    setMode("view");
    applyComparison();
    updateSummary();
    wireSelectors();
    wireUpload();
    wireTabs();
    $("#related-section").hidden = false;
    loadRelated();
  }

  FrameX.productPage = { init };
})((window.FrameX = window.FrameX || {}));
