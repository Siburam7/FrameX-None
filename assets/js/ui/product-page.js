/* ==========================================================================
   Product Details page  (product.html?id=<productId>)
   Everything shown comes from the product / shop records. Optional fields
   (colors, extra images, description) are simply hidden when absent.
   Supported by the current data model: sizes, material, categories, stock.
   NOT in the data model yet (so not shown as options): frame colours/styles,
   per-size pricing, ratings on products. Add `colors: [...]` to a product to
   enable the colour selector.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice, finalPrice, availability } = FrameX.pricing;
  const { FULFILMENT_METHODS } = FrameX.constants;
  const FALLBACK_IMAGE = "assets/img/ui/frame-decor.webp";
  const MAX_UPLOAD_MB = 10;
  const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

  let product, shop, categories;
  const config = { size: null, color: null, qty: 1, note: "" };

  const isVariant = (list) => Array.isArray(list) && list.length > 1;

  // ---- gallery -----------------------------------------------------------------
  function galleryHtml(images) {
    const many = images.length > 1;
    return `<div class="pdp-gallery">
      <div class="pdp-gallery__stage" id="pdp-stage">
        <img id="pdp-main" src="${esc(images[0])}" alt="${esc(product.name)}" width="900" height="900" decoding="async" fetchpriority="high">
        <button class="icon-btn pdp-gallery__zoom" type="button" id="pdp-zoom" aria-pressed="false" aria-label="Zoom image">${icon("zoom")}</button>
        ${many ? `<button class="pdp-gallery__nav pdp-gallery__nav--prev" type="button" data-gallery-step="-1" aria-label="Previous image">${icon("chev-left")}</button>
                  <button class="pdp-gallery__nav pdp-gallery__nav--next" type="button" data-gallery-step="1" aria-label="Next image">${icon("chev-right")}</button>` : ""}
      </div>
      ${many ? `<div class="pdp-gallery__thumbs" role="group" aria-label="Product images">${images
        .map((src, i) => `<button class="pdp-gallery__thumb" type="button" data-thumb="${i}" aria-current="${i === 0}" aria-label="Show image ${i + 1} of ${images.length}"><img src="${esc(src)}" alt="" width="72" height="72" loading="lazy"></button>`)
        .join("")}</div>` : ""}
    </div>`;
  }

  function wireGallery(images) {
    const main = $("#pdp-main");
    const stage = $("#pdp-stage");
    let index = 0;
    main.addEventListener("error", () => { if (main.src.indexOf(FALLBACK_IMAGE) === -1) main.src = FALLBACK_IMAGE; });
    const show = (i) => {
      index = (i + images.length) % images.length;
      main.src = images[index];
      $$("[data-thumb]").forEach((t) => t.setAttribute("aria-current", String(Number(t.dataset.thumb) === index)));
    };
    $$("[data-thumb]").forEach((t) => t.addEventListener("click", () => show(Number(t.dataset.thumb))));
    $$("[data-gallery-step]").forEach((b) => b.addEventListener("click", () => show(index + Number(b.dataset.galleryStep))));
    stage.addEventListener("keydown", (e) => {
      if (images.length > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) show(index + (e.key === "ArrowRight" ? 1 : -1));
    });
    const zoom = $("#pdp-zoom");
    const toggleZoom = () => {
      const on = stage.classList.toggle("is-zoomed");
      zoom.setAttribute("aria-pressed", String(on));
    };
    zoom.addEventListener("click", toggleZoom);
    main.addEventListener("click", toggleZoom);
  }

  // ---- info column --------------------------------------------------------------
  function stockInfo() {
    const status = availability(product);
    if (status === "out_of_stock") return ["out", "Out of stock"];
    if (status === "low_stock" && typeof product.stock === "number") return ["low", `Only ${product.stock} left`];
    return ["in", "In stock"];
  }

  function optionGroup(id, label, choices, requiredMsg) {
    return `<div class="pdp-option" id="opt-${id}" data-invalid="false">
      <div class="pdp-option__label" id="opt-${id}-label"><span>${label}</span>
        <span class="form-field__error" role="alert">${icon("alert")}<span>${requiredMsg}</span></span></div>
      <div class="pdp-option__choices" role="radiogroup" aria-labelledby="opt-${id}-label">
        ${choices.map((c) => `<button class="chip" type="button" role="radio" aria-checked="false" data-opt="${id}" data-value="${esc(c)}">${esc(c)}</button>`).join("")}
      </div></div>`;
  }

  function infoHtml() {
    const [stockKey, stockText] = stockInfo();
    const out = stockKey === "out";
    const badges = [];
    if (product.discountPercent > 0) badges.push(`<span class="badge badge--discount">${product.discountPercent}% off</span>`);
    if (product.isNew) badges.push(`<span class="badge">New</span>`);
    const sizes = product.sizes || [];
    const colors = product.colors || [];

    return `<div class="pdp-info">
      ${shop ? `<a class="pdp-info__shop" href="${FrameX.qs.shopUrl(shop.id)}">${icon("store")} ${esc(shop.name)}</a>` : ""}
      <h1 class="pdp-info__title">${esc(product.name)}</h1>
      ${badges.length ? `<div class="pdp-info__badges">${badges.join("")}</div>` : ""}
      <div class="pdp-info__price">${FrameX.templates.priceBlock(product)}</div>
      <p class="pdp-availability pdp-availability--${stockKey}">${icon(out ? "close" : "check")} ${stockText}</p>
      ${product.description ? `<p class="pdp-info__desc">${esc(product.description)}</p>` : ""}

      ${isVariant(sizes) ? optionGroup("size", "Size", sizes, "Please choose a size") : sizes.length === 1 ? `<p class="pdp-option__label">Size: <span class="badge badge--muted">${esc(sizes[0])}</span></p>` : ""}
      ${isVariant(colors) ? optionGroup("color", "Frame colour", colors, "Please choose a colour") : ""}

      <div class="pdp-option">
        <label class="pdp-option__label" for="pdp-note">Customization note <span class="hint" style="font-weight:400;color:var(--muted)">(optional)</span></label>
        <div class="form-field"><textarea id="pdp-note" maxlength="200" rows="2" placeholder="e.g. mat colour, text to include, size not listed"></textarea></div>
      </div>

      <div class="pdp-upload" id="pdp-upload">
        <strong>Preview your photo <span class="placeholder-note">Preview only</span></strong>
        <label class="pdp-upload__zone" for="pdp-file">${icon("upload")}<span>Choose a photo (JPG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB)</span></label>
        <input class="visually-hidden" id="pdp-file" type="file" accept="${UPLOAD_TYPES.join(",")}">
        <p class="pdp-upload__error" id="pdp-upload-error" role="alert">${icon("alert")}<span></span></p>
        <div class="pdp-upload__preview" id="pdp-upload-preview">
          <img alt="Your selected photo preview" width="64" height="64">
          <div class="pdp-upload__meta"><strong></strong><button class="cart-line__remove" type="button" id="pdp-upload-remove">Remove photo</button></div>
        </div>
        <p class="pdp-upload__note">Photo upload isn't connected yet: this photo stays on your device, is not saved, and is not sent to the shop or added to your cart. Use the note above or the Contact page to arrange your photo with the shop.</p>
      </div>

      <div class="pdp-buybox">
        <div class="qty" role="group" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity" disabled>${icon("minus")}</button>
          <span class="qty__value" id="pdp-qty" aria-live="polite">1</span>
          <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity">${icon("plus")}</button>
        </div>
        <button class="btn btn--primary" type="button" id="pdp-add" ${out ? "disabled" : ""}${!out && isVariant(sizes) ? ' aria-disabled="true"' : ""}>${out ? "Out of stock" : "Add to cart"}</button>
        ${FrameX.templates.wishButton(product)}
      </div>
      <p class="pdp-feedback" id="pdp-feedback" role="status">${icon("check")}<span></span></p>
    </div>`;
  }

  function maxQty() {
    return Math.min(FrameX.cart.MAX_QTY, typeof product.stock === "number" && product.stock > 0 ? product.stock : FrameX.cart.MAX_QTY);
  }

  function wireInfo() {
    const add = $("#pdp-add");
    const needsSize = isVariant(product.sizes);
    const needsColor = isVariant(product.colors);
    const ready = () => (!needsSize || config.size) && (!needsColor || config.color);
    const syncAdd = () => add && !add.disabled && add.setAttribute("aria-disabled", String(!ready()));

    $$("[data-opt]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.opt;
        config[id] = btn.dataset.value;
        $$(`[data-opt="${id}"]`).forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
        $(`#opt-${id}`).dataset.invalid = "false";
        syncAdd();
      })
    );
    // radiogroup keyboard: arrows move + select
    $$(".pdp-option__choices").forEach((group) =>
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
      })
    );

    add.addEventListener("click", () => {
      if (add.disabled) return;
      let firstBad = null;
      [["size", needsSize], ["color", needsColor]].forEach(([id, needed]) => {
        if (needed && !config[id]) {
          $(`#opt-${id}`).dataset.invalid = "true";
          firstBad = firstBad || $(`[data-opt="${id}"]`);
        }
      });
      if (firstBad) return firstBad.focus();

      const note = $("#pdp-note").value.trim();
      const size = config.size || (product.sizes || [])[0] || null;
      FrameX.cart.add(product, { size, qty: config.qty, note });
      const box = $("#pdp-feedback");
      $("span", box).textContent = `${config.qty} × ${product.name}${size ? " (" + size + ")" : ""} added to your cart.`;
      box.classList.add("is-visible");
      FrameX.toast.show("Added to cart.", { action: { label: "View cart", onClick: () => FrameX.cartDrawer.open() } });
    });

    wireUpload();
  }

  function wireUpload() {
    const input = $("#pdp-file");
    const error = $("#pdp-upload-error");
    const preview = $("#pdp-upload-preview");
    let url = null;
    const fail = (msg) => { $("span", error).textContent = msg; error.classList.add("is-visible"); };
    const clear = () => {
      if (url) URL.revokeObjectURL(url);
      url = null; input.value = "";
      preview.classList.remove("is-visible");
    };
    input.addEventListener("change", () => {
      error.classList.remove("is-visible");
      const file = input.files[0];
      if (!file) return;
      if (!UPLOAD_TYPES.includes(file.type)) { clear(); return fail("Please choose a JPG, PNG or WebP image."); }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { clear(); return fail(`That file is larger than ${MAX_UPLOAD_MB} MB.`); }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(file);
      $("img", preview).src = url;
      $("strong", preview).textContent = file.name;
      preview.classList.add("is-visible");
    });
    $("#pdp-upload-remove").addEventListener("click", clear);
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
      ["Available sizes", (product.sizes || []).join(", ")],
      ["Availability", stockInfo()[1]],
      ["Sold by", shop && shop.name]
    ].filter(([, v]) => v);
    const methods = shop ? (shop.fulfilment || []).filter((id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled) : [];

    const tabs = [
      ["desc", "Description", product.description ? `<p>${esc(product.description)}</p>` : `<p>The shop hasn't added a description yet.</p>`],
      ["details", "Details", `<dl class="spec-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`],
      ["custom", "Customization", `<p>Today you can add a note with your cart item and preview a photo on this page. Uploading photos to the shop, custom sizes and frame colour/style options are planned and need a backend.</p>`],
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

    document.title = `${product.name} — FrameX`;
    $("#pdp-crumb-name").textContent = product.name;
    const images = (product.images && product.images.length ? product.images : [product.image]).filter(Boolean);

    root.innerHTML = `<div class="pdp">${galleryHtml(images)}${infoHtml()}</div>
      <div class="split split--asym" style="margin-top:clamp(28px,5vw,56px)"><div>${tabsHtml()}</div><div>${shopCardHtml()}</div></div>`;
    wireGallery(images);
    wireInfo();
    wireTabs();
    $("#related-section").hidden = false;
    loadRelated();
  }

  FrameX.productPage = { init };
})((window.FrameX = window.FrameX || {}));
