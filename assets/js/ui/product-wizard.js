/* ==========================================================================
   ProductWizard (ProductEditor): the shop's 9-step product creation and
   editing flow. Everything is a form field, toggle, selector or upload; the
   shop never touches code.

     1 Basic info   2 Frame   3 Print & quality   4 Sizes & pricing
     5 Customization   6 Images   7 Components   8 Preview   9 Publish

   Step 1 starts with "What do you want to sell?" (productModel.PRODUCT_TYPES):
   a photo frame, a custom frame, home decor, wall art, a multi-panel set, a
   personalized product, a template-based product or something else. The type
   decides which details are asked for, and whether (and how many) photos the
   customer has to add. Those rules are the platform's: the shop picks inside
   them, and the backend applies them again when the product is saved.

   State is one product-model object (product-model.js). Moving between steps
   never loses data. Drafts save automatically to the shop's account on the
   FrameX backend; edits to a product that is already live are kept aside
   (this browser) until "Save changes", so customers never see half-finished
   edits. The Preview step renders the real customer ProductPage, not a copy.

     FrameX.productWizard.open(root, { productId?, shopId, step?, onExit })
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, debounce } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const svc = () => FrameX.productService;
  const EDITOR_KEY = FrameX.config.storageKeys.shopEditor || "framex.shopEditor.v1";

  const STEPS = [
    { id: "basic", title: "Basic info" },
    { id: "frame", title: "Frame" },
    { id: "print", title: "Print & quality" },
    { id: "sizes", title: "Sizes & pricing" },
    { id: "customize", title: "Customization" },
    { id: "images", title: "Images" },
    { id: "components", title: "Components" },
    { id: "preview", title: "Preview" },
    { id: "publish", title: "Publish" }
  ];

  const SUGGEST = {
    material: ["Solid wood", "Teak wood", "Pine wood", "Oak", "Walnut", "Engineered wood (MDF)", "Aluminium", "Steel", "Polystyrene moulding", "Resin", "Canvas on pine stretcher"],
    finish: ["Matte", "Gloss", "Satin", "Natural", "Wood grain", "Brushed metal", "Antique", "Textured"],
    backing: ["MDF backing board", "Hardboard", "Foam board", "Card backing", "Solid wood back"],
    hanging: ["Sawtooth hanger", "D-rings and cord", "Wall hook", "Keyhole slot", "Magnetic mount"],
    quality: ["Standard", "Premium"],
    thickness: ["180 gsm", "230 gsm", "260 gsm", "300 gsm", "380 gsm", "2 mm", "3 mm"]
  };
  const SIZE_PRESETS = [[8, 10], [10, 12], [12, 16], [12, 18], [16, 20], [18, 24], [20, 30]];

  /* ---------------------------------------------------------------- Unsaved edits to live products */
  const readWip = () => {
    try {
      return JSON.parse(localStorage.getItem(EDITOR_KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  function writeWip(product) {
    try {
      const all = readWip();
      all[product.id] = { product, savedAt: new Date().toISOString() };
      localStorage.setItem(EDITOR_KEY, JSON.stringify(all));
    } catch (e) {
      /* storage full: edits stay in memory for this visit */
    }
  }
  function clearWip(id) {
    try {
      const all = readWip();
      delete all[id];
      localStorage.setItem(EDITOR_KEY, JSON.stringify(all));
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- Path helpers */
  const getPath = (obj, path) => path.split(".").reduce((n, k) => (n == null ? undefined : n[k]), obj);
  function setPath(obj, path, value) {
    const keys = path.split(".");
    let node = obj;
    keys.slice(0, -1).forEach((k, i) => {
      if (node[k] == null || typeof node[k] !== "object") node[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      node = node[k];
    });
    node[keys[keys.length - 1]] = value;
  }

  /* ---------------------------------------------------------------- Field builders */
  let uid = 0;
  const fid = () => `wz-f${++uid}`;
  function field(label, control, { hint = "", required = false, wide = false } = {}) {
    const id = fid();
    return `<div class="wz-field${wide ? " wz-field--wide" : ""}"><label class="wz-label" for="${id}">${esc(label)}${required ? ` <span class="wz-req" aria-hidden="true">*</span>` : ""}</label>${control.replace("__ID__", id)}${hint ? `<small class="wz-hint">${hint}</small>` : ""}</div>`;
  }
  const val = (d, path) => {
    const v = getPath(d, path);
    return v === null || v === undefined ? "" : v;
  };
  const input = (d, path, { type = "text", placeholder = "", list = "", min = "", step = "", kind = "", max = "", rerender = false, maxlength = "" } = {}) =>
    `<input class="input" id="__ID__" type="${type}" data-bind="${path}"${kind ? ` data-type="${kind}"` : type === "number" ? ` data-type="number"` : ""}${rerender ? " data-rerender" : ""} value="${esc(val(d, path))}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}${list ? ` list="wz-list-${list}"` : ""}${min !== "" ? ` min="${min}"` : ""}${max !== "" ? ` max="${max}"` : ""}${step ? ` step="${step}"` : ""}${maxlength ? ` maxlength="${maxlength}"` : ""}>`;
  const textarea = (d, path, { rows = 4, placeholder = "", maxlength = 2000 } = {}) =>
    `<textarea class="input wz-textarea" id="__ID__" data-bind="${path}" rows="${rows}" maxlength="${maxlength}" placeholder="${esc(placeholder)}">${esc(val(d, path))}</textarea>`;
  const select = (d, path, options, { kind = "", rerender = true, empty = "" } = {}) =>
    `<select class="select" id="__ID__" data-bind="${path}"${kind ? ` data-type="${kind}"` : ""}${rerender ? " data-rerender" : ""}>${empty ? `<option value="">${esc(empty)}</option>` : ""}${options
      .map((o) => `<option value="${esc(o.id)}"${String(val(d, path)) === String(o.id) ? " selected" : ""}>${esc(o.name)}</option>`)
      .join("")}</select>`;
  const toggle = (d, path, label, hint = "") =>
    `<label class="wz-toggle"><input type="checkbox" data-bind="${path}" data-type="bool" data-rerender${getPath(d, path) ? " checked" : ""}><span class="wz-toggle__ui" aria-hidden="true"></span><span class="wz-toggle__text"><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ""}</span></label>`;
  const multi = (d, path, options, render = (o) => esc(o.name)) =>
    `<div class="wz-multi" role="group">${options
      .map((o) => `<label class="wz-chip"><input type="checkbox" data-bind-list="${path}" value="${esc(o.id)}"${(getPath(d, path) || []).includes(o.id) ? " checked" : ""}><span>${render(o)}</span></label>`)
      .join("")}</div>`;
  const datalists = () => Object.entries(SUGGEST).map(([k, list]) => `<datalist id="wz-list-${k}">${list.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`).join("");
  const group = (title, body, lead = "") => `<fieldset class="wz-group"><legend class="wz-group__title">${esc(title)}</legend>${lead ? `<p class="wz-group__lead">${lead}</p>` : ""}${body}</fieldset>`;
  const rowTools = (path, i, len) => `<div class="wz-row__tools">
      <button class="iu-btn iu-btn--icon" type="button" data-act="row-move" data-path="${path}" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${icon("chev-up")}</button>
      <button class="iu-btn iu-btn--icon" type="button" data-act="row-move" data-path="${path}" data-i="${i}" data-d="1" aria-label="Move down" ${i === len - 1 ? "disabled" : ""}>${icon("chev-down")}</button>
      <button class="iu-btn iu-btn--danger iu-btn--icon" type="button" data-act="row-remove" data-path="${path}" data-i="${i}" aria-label="Remove">${icon("close")}</button></div>`;
  const swatch = (c) => `<i class="wz-swatch" style="--swatch:${esc(c.hex)}"></i>${esc(c.name)}`;

  /* ---------------------------------------------------------------- Open */
  async function open(root, { productId = null, shopId, step = "basic", onExit = () => {} } = {}) {
    const [categories, shop] = await Promise.all([FrameX.api.getCategories(), FrameX.api.getShop(shopId)]);
    let draft;
    let isNew = !productId;
    let notice = "";
    if (productId) {
      const found = await svc().getForEditing(productId);
      if (!found || found.shopId !== shopId) {
        root.innerHTML = `<div class="sd-empty">${icon("alert")}<strong>That product isn't in this shop</strong><a class="btn btn--outline btn--sm" href="#/products">Back to products</a></div>`;
        return;
      }
      // A product from the FrameX catalogue file is FrameX's to change. The shop can sell its own version of it.
      if (found.source === "catalogue") {
        root.innerHTML = `<div class="sd-empty">${icon("lock")}<strong>${esc(found.name)} is managed by FrameX</strong>
          <span>This product comes from the FrameX catalogue, so its details and price are changed by FrameX. You can make your own copy of it and sell that with your own details, pictures and price.</span>
          <div class="ad-actions"><button class="btn btn--primary btn--sm" type="button" data-copy>${icon("copy")} Make my own copy</button><a class="btn btn--outline btn--sm" href="product.html?slug=${encodeURIComponent(found.slug || found.id)}" target="_blank" rel="noopener">View it</a><a class="btn btn--outline btn--sm" href="#/products">Back to products</a></div></div>`;
        $("[data-copy]", root).addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          try {
            const copy = await svc().duplicate(Object.assign({}, found, { productType: found.productType || M().productTypeOf(found).id }));
            FrameX.toast.show(`Created “${copy.name}” as a draft in your shop.`);
            location.hash = `#/products/${encodeURIComponent(copy.id)}/edit?step=basic`;
          } catch (error) {
            e.currentTarget.disabled = false;
            FrameX.toast.show(error.friendly || "The copy couldn't be made. Please try again.");
          }
        });
        return;
      }
      draft = M().sanitizeShopInput(found);
      draft.source = found.source;
      const wip = readWip()[draft.id];
      if (wip && draft.status !== "draft" && Date.parse(wip.savedAt) > Date.parse(found.updatedAt || 0)) {
        draft = Object.assign(wip.product, { source: found.source });
        notice = `Restored your unsaved changes from ${new Date(wip.savedAt).toLocaleString()}.`;
      }
    } else draft = M().emptyProduct(shopId);
    draft = M().normalize(draft);

    let current = STEPS.some((s) => s.id === step) ? step : "basic";
    let saveState = notice ? "unsaved" : isNew ? "new" : "saved";
    let showIssues = false;
    let preview = null;
    let device = "desktop";
    const live = () => draft.status !== "draft";

    /* ---- saving ---- */
    async function persist() {
      if (isNew && !String(draft.name || "").trim()) return; // nothing worth saving yet
      draft.media = (draft.media || []).filter((m) => m && (m.url || m.thumbnail));
      if (live()) {
        writeWip(draft);
        setSaveState("unsaved");
        return;
      }
      setSaveState("saving");
      try {
        const saved = await svc().save(draft);
        ["id", "slug", "updatedAt", "listingImage", "listingImageFor", "createdAt"].forEach((k) => (draft[k] = saved[k]));
        if (isNew) {
          isNew = false;
          history.replaceState(null, "", `#/products/${encodeURIComponent(draft.id)}/edit?step=${current}`);
        }
        setSaveState("saved");
      } catch (error) {
        console.error("Draft save failed", error);
        setSaveState("error", error.friendly);
      }
    }
    const scheduleSave = debounce(persist, 700);
    function changed() {
      if (live()) setSaveState("unsaved");
      scheduleSave();
    }

    function setSaveState(state, message = "") {
      saveState = state;
      const el = $("[data-save-state]", root);
      if (!el) return;
      const text = { new: "Not saved yet", saving: "Saving…", saved: "Draft saved", unsaved: "Unsaved changes", error: message || "Couldn't save" }[state];
      el.textContent = live() && state === "saved" ? "All changes saved" : text;
      el.dataset.state = state;
      const btn = $("[data-act='save-changes']", root);
      if (btn) btn.hidden = !(live() && state === "unsaved");
    }

    window.onbeforeunload = () => (live() && saveState === "unsaved" ? "You have unsaved changes." : undefined);

    /* ---- steps ---- */
    const issuesFor = (id) => M().validateForPublish(draft).issues.filter((i) => i.step === id);

    /* ---- the product type and what the platform requires of it ---- */
    const typeOf = () => M().PRODUCT_TYPES.find((t) => t.id === draft.productType) || null;
    /** What the customer has to do for this product, in the shop's words. */
    function photoRule() {
      const type = typeOf();
      if (!type) return "";
      const need = M().photoRequirement(draft, {});
      if (!type.photos.max) return "Ready-made: customers order it as it is. They are never asked for a photo.";
      if (!need.count) return "Ready-made unless you ask for photos (step 5): right now customers upload nothing.";
      const fixed = type.photos.min === type.photos.max;
      return `Customers must upload ${need.count === 1 ? "their photo" : `${need.count} photos`} before they can add it to the cart or buy it. ${fixed ? "This is a FrameX rule for this product type." : `FrameX requires at least ${type.photos.min} for this product type; you choose how many in step 5.`}`;
    }

    function stepBasic() {
      const cats = categories.map((c) => ({ id: c.id, name: c.name }));
      const type = typeOf();
      return `${group("What do you want to sell?", `
        <div class="wz-cards wz-types" role="radiogroup" aria-label="Product type">${M().PRODUCT_TYPES.filter((t) => !t.artistOnly).map((t) => `<label class="wz-card wz-type"><input type="radio" name="wz-ptype" data-bind="productType" data-rerender value="${esc(t.id)}"${draft.productType === t.id ? " checked" : ""}><span><strong>${esc(t.name)}</strong><small>${esc(t.summary)}</small></span></label>`).join("")}</div>
        ${type ? `<div class="wz-status is-ok">${icon(type.photos.max ? "image" : "check")}<div><strong>${esc(type.name)}</strong><span>${esc(photoRule())}</span></div></div>` : `<p class="wz-empty">Choose one to continue. It decides which details FrameX asks you for.</p>`}`,
        "Pick the closest match. FrameX then shows only the details that matter for it, and applies its rules for customer photos.")}
        ${group("Product", `
        ${field("Product name", input(draft, "name", { placeholder: "e.g. Classic Walnut Photo Frame", maxlength: 90 }), { required: true, hint: `Web address: <code data-slug>product.html?slug=${esc(draft.slug || M().slugify(draft.name) || "…")}</code>` })}
        ${field("Category", select(draft, "category", cats, { empty: "Choose a category" }), { required: true })}
        <div class="wz-field wz-field--wide"><span class="wz-label">Also show it in</span>${multi(draft, "categoryIds", cats.filter((c) => c.id !== draft.category))}</div>
        ${field("Tags", `<input class="input" id="__ID__" data-bind="tags" data-type="list" value="${esc((draft.tags || []).join(", "))}" placeholder="e.g. wedding, gift, wall decor">`, { hint: "Separate with commas. Customers can search for these words." })}
        ${field("Description", textarea(draft, "description", { rows: 6, placeholder: "What it is, what makes it special, and who it's for. Leave a blank line between paragraphs." }), { wide: true, hint: "Describe only what's true of this product. Words like “Certified”, “Best Quality” or “FrameX Verified” are not allowed; FrameX adds verification itself." })}`)}
        <details class="wz-details"><summary>Search engine listing (optional)</summary>
          ${field("Page title", input(draft, "seo.title", { placeholder: draft.name ? `${draft.name} — FrameX` : "Uses the product name", maxlength: 70 }))}
          ${field("Search description", textarea(draft, "seo.description", { rows: 2, maxlength: 160, placeholder: "Uses the start of the description" }), { wide: true })}
        </details>`;
    }

    function stepFrame() {
      const types = M().frameTypes();
      const pal = Object.values(M().palette());
      const covers = M().PROTECTION_TYPES;
      const opts = draft.protection.options || [];
      const framed = draft.frame.type && !["none"].includes(draft.frame.type);
      const type = typeOf();
      const needsFrame = !type || type.frame;
      return `${needsFrame ? "" : `<p class="wz-note">${icon("check")} A ${esc(type.name.toLowerCase())} product doesn't need frame details. Fill in what applies to your product and leave the rest empty: only what you enter is shown to customers.</p>`}
        ${group("Frame", `
        <div class="wz-field wz-field--wide"><span class="wz-label">Frame type${needsFrame ? ` <span class="wz-req">*</span>` : ""}</span>
          <div class="wz-cards" role="radiogroup">${types.map((t) => `<label class="wz-card"><input type="radio" name="wz-type" data-bind="frame.type" data-rerender value="${esc(t.id)}"${draft.frame.type === t.id ? " checked" : ""}><span><strong>${esc(t.name)}</strong>${t.studio ? "" : `<small>Not in FrameX Studio yet</small>`}</span></label>`).join("")}</div></div>
        ${framed ? `${field("Frame material", input(draft, "frame.material", { list: "material", placeholder: "e.g. Teak wood" }), { required: draft.frame.type !== "canvas" })}
        ${field("Finish", input(draft, "frame.finish", { list: "finish", placeholder: "e.g. Matte" }))}
        <div class="wz-field wz-field--wide"><span class="wz-label">Frame colours you offer</span>${multi(draft, "frame.colors", pal, swatch)}
          ${(draft.frame.colors || []).length > 1 ? `<div class="wz-inline">${field("Colour shown first", select(draft, "frame.color", (draft.frame.colors || []).map((id) => ({ id, name: M().colorName(id) })), { rerender: false }))}</div>` : ""}</div>
        ${field("Frame width (mm)", input(draft, "frame.width", { type: "number", min: 0, step: "1", placeholder: "e.g. 30" }), { hint: "Width of the moulding seen from the front." })}
        ${field("Frame depth (mm)", input(draft, "frame.depth", { type: "number", min: 0, step: "1", placeholder: "e.g. 18" }))}
        ${field("Weight", input(draft, "frame.weight", { placeholder: "e.g. 650 g (medium size)" }))}
        ${field("Shape", select(draft, "frame.shape", [{ id: "rectangle", name: "Rectangle" }, { id: "square", name: "Square" }, { id: "arch", name: "Arch" }, { id: "round", name: "Round / oval" }], { rerender: false }))}` : ""}`)}
        ${group("Front protection", `
          <div class="wz-covers">${covers.map((c) => {
            const i = opts.findIndex((o) => o.type === c.id);
            const on = i >= 0;
            return `<div class="wz-cover${on ? " is-on" : ""}"><label class="wz-check"><input type="checkbox" data-act="toggle-cover" value="${c.id}"${on ? " checked" : ""}><strong>${esc(c.name)}</strong></label>
              ${on ? `<div class="wz-cover__fields">${field("Extra price (₹)", input(draft, `protection.options.${i}.priceModifier`, { type: "number", min: 0, step: "1", placeholder: "0" }))}${field("Details", input(draft, `protection.options.${i}.description`, { placeholder: c.id === "none" ? "Open front" : "e.g. 2 mm, UV-filtering" }))}
                <label class="wz-check"><input type="radio" name="wz-cover-default" data-bind="protection.default" value="${c.id}"${draft.protection.default === c.id || (!draft.protection.default && i === 0) ? " checked" : ""}> Selected by default</label></div>` : ""}</div>`;
          }).join("")}</div>`, "Tick every option you offer. With more than one, customers choose.")}
        ${group("Back", `
          ${field("Backing", input(draft, "back.backing", { list: "backing", placeholder: "e.g. MDF backing board" }))}
          ${field("Hanging method", input(draft, "back.hanging", { list: "hanging", placeholder: "e.g. Sawtooth hanger" }))}
          ${field("Mounting", input(draft, "back.mounting", { placeholder: "e.g. Turn buttons hold the backing in place" }))}
          <div class="wz-field">${toggle(draft, "back.stand", "Has a table stand")}${draft.back.stand ? input(draft, "back.standType", { placeholder: "e.g. Fold-out easel back" }).replace("__ID__", fid()) : ""}</div>
          ${field("Notes about the back", input(draft, "back.notes", { placeholder: "Anything else customers should know" }), { wide: true })}`)}
        ${group("Mat & border", `
          <div class="wz-field wz-field--wide">${toggle(draft, "mat.available", "Mat available", "A card mount between the frame and the print")}</div>
          ${draft.mat.available ? `${field("Mat included in the price", select(draft, "mat.included", [{ id: "", name: "No — mat is an option" }, { id: "single", name: "Single mat included" }, { id: "double", name: "Double mat included" }], { kind: "falsy" }))}
            ${field("Mat upgrade price (₹)", input(draft, "mat.priceModifier", { type: "number", min: 0, step: "1", placeholder: "e.g. 120" }), { hint: "Charged when a customer adds a mat (or a second layer) in FrameX Studio." })}
            <div class="wz-field wz-field--wide"><span class="wz-label">Mat colours</span>${multi(draft, "mat.colors", M().matColors(), swatch)}</div>
            <div class="wz-field wz-field--wide"><span class="wz-label">Mat widths</span>${multi(draft, "mat.widths", M().matWidths())}</div>
            <div class="wz-field wz-field--wide">${toggle(draft, "mat.double", "Double mat possible")}</div>` : ""}
          <div class="wz-field wz-field--wide">${toggle(draft, "border.available", "Printed border available", "A printed margin around the photo")}</div>
          ${draft.border.available ? `<div class="wz-field wz-field--wide"><span class="wz-label">Border colours</span>${multi(draft, "border.colors", M().borderColors(), swatch)}</div>
            <div class="wz-field wz-field--wide"><span class="wz-label">Border widths</span>${multi(draft, "border.widths", M().borderWidths())}</div>` : ""}`)}`;
    }

    function stepPrint() {
      const mats = draft.print.materials || [];
      return `${group("Print materials", `
        ${mats.length ? "" : `<p class="wz-empty">No print added. Products that include a printed photo should list the paper or canvas here.</p>`}
        <div class="wz-rows">${mats
          .map((m, i) => `<div class="wz-row wz-row--card">
            <div class="wz-row__head"><strong>Print ${i + 1}</strong>${rowTools("print.materials", i, mats.length)}</div>
            <div class="wz-grid">
              ${field("Type", select(draft, `print.materials.${i}.type`, M().PRINT_MATERIAL_TYPES, { rerender: true }))}
              ${field("Name shown to customers", input(draft, `print.materials.${i}.name`, { placeholder: "e.g. Lustre photo paper" }), { required: true })}
              ${field("Finish", input(draft, `print.materials.${i}.finish`, { list: "finish", placeholder: "e.g. Matte" }))}
              ${field("Thickness", input(draft, `print.materials.${i}.thickness`, { list: "thickness", placeholder: "e.g. 260 gsm" }))}
              ${field("Quality", input(draft, `print.materials.${i}.quality`, { list: "quality", placeholder: "e.g. Standard" }))}
              ${field("Extra price (₹)", input(draft, `print.materials.${i}.priceModifier`, { type: "number", step: "1", placeholder: "0" }), { hint: mats.length > 1 ? "Customers choose between prints." : "" })}
              ${field("Description", textarea(draft, `print.materials.${i}.description`, { rows: 2, maxlength: 300, placeholder: "How it looks and feels" }), { wide: true })}
              <div class="wz-field wz-field--wide" data-mat-image="${i}"></div>
            </div></div>`)
          .join("")}</div>
        <button class="btn btn--outline btn--sm" type="button" data-act="add-print">${icon("plus")} Add print material</button>`)}
        ${group("Quality information", `
          ${field("Print quality", input(draft, "print.quality", { list: "quality", placeholder: "e.g. Standard" }))}
          ${M().QUALITY_FIELDS.filter((q) => q.id !== "printQuality").map((q) => field(q.label, input(draft, `quality.items.${q.id}`, { list: "quality", placeholder: q.id === "durability" ? "e.g. Indoor use; keep out of direct sun" : q.id === "colorQuality" ? "e.g. 6-colour pigment inks" : "e.g. Standard" }))).join("")}`,
          "Only describe what you can stand behind. Customers see it as “Provided by your shop”. FrameX adds its own verification separately; shops can't mark products as verified or certified.")}`;
    }

    function stepSizes() {
      const sizes = draft.sizes || [];
      const base = Number(draft.pricing.basePrice) || 0;
      const disc = Number(draft.pricing.discountPercent) || 0;
      return `${group("Pricing", `
        ${field("Base price (₹)", input(draft, "pricing.basePrice", { type: "number", min: 1, step: "1", placeholder: "e.g. 899", rerender: false }), { required: true, hint: "Used for any size without its own price." })}
        ${field("Discount (%)", input(draft, "pricing.discountPercent", { type: "number", min: 0, max: 90, step: "1", placeholder: "0" }))}`)}
        ${group("Available sizes", `
          <div class="wz-presets"><span>Quick add:</span>${SIZE_PRESETS.map(([w, h]) => `<button class="chip" type="button" data-act="add-size" data-w="${w}" data-h="${h}">${w} × ${h} in</button>`).join("")}<button class="chip" type="button" data-act="add-size">Other size</button></div>
          <div class="wz-rows">${sizes
            .map((s, i) => {
              const price = s.price === null || s.price === "" || s.price === undefined ? base : Number(s.price);
              return `<div class="wz-row wz-row--size">
              ${field("Name", input(draft, `sizes.${i}.label`, { placeholder: M().sizeDims(s) || "e.g. Medium" }))}
              ${field("Width", input(draft, `sizes.${i}.width`, { type: "number", min: 0, step: "0.1" }))}
              ${field("Height", input(draft, `sizes.${i}.height`, { type: "number", min: 0, step: "0.1" }))}
              ${field("Unit", select(draft, `sizes.${i}.unit`, [{ id: "in", name: "in" }, { id: "cm", name: "cm" }], { rerender: false }))}
              ${field("Price (₹)", input(draft, `sizes.${i}.price`, { type: "number", min: 1, step: "1", placeholder: base ? String(base) : "Base price" }))}
              <p class="wz-row__note">${price ? `Customer pays ${formatPrice(Math.round((price * (100 - disc)) / 100))}` : ""}</p>
              ${rowTools("sizes", i, sizes.length)}</div>`;
            })
            .join("")}</div>
          ${sizes.length ? "" : `<p class="wz-empty">Add at least one size.</p>`}
          <div class="wz-field wz-field--wide"><span class="wz-label">Orientations</span>${multi(draft, "orientations", M().ORIENTATIONS)}</div>`)}
        ${group("Stock & availability", `
          ${field("Availability", select(draft, "availability.status", M().AVAILABILITY, { rerender: false }))}
          ${field("Stock (pieces)", input(draft, "availability.stock", { type: "number", min: 0, step: "1", placeholder: "Leave empty if made to order" }))}
          ${field("Ready in", input(draft, "availability.leadTime", { placeholder: "e.g. 2–3 days" }))}
          <div class="wz-field wz-field--wide">${toggle(draft, "availability.pickup", "Pickup from the shop")}${toggle(draft, "availability.delivery", "Delivery")}</div>
          ${draft.availability.delivery ? field("Delivery notes", input(draft, "availability.deliveryNotes", { placeholder: "e.g. Within Dhenkanal; fee confirmed when you order" }), { wide: true }) : ""}`)}
        ${group("Gift wrapping", `<div class="wz-field wz-field--wide">${toggle(draft, "giftWrap", "This product can be gift wrapped", "At checkout FrameX asks customers whether they want their order gift wrapped. Switch this off for a product that can't be wrapped (too large, fragile, sent in a tube): the option is then not offered for an order that contains it.")}</div>`,
          "The gift-wrapping charge is set by FrameX and shown to the customer before they pay.")}`;
    }

    /** How many photos the customer adds (and, for a set, how many frames): inside what the product type allows. */
    function photosGroup() {
      const type = typeOf();
      if (!type) return group("Customer photos", `<p class="wz-empty">Choose what you are selling in step 1 first.</p>`);
      const need = M().photoRequirement(draft, {});
      const range = type.photos;
      const body = !range.max
        ? `<div class="wz-status">${icon("check")}<div><strong>No customer photo</strong><span>${esc(type.name)} is sold ready-made. Customers are not asked to upload anything, and this can't be switched on for this product type.</span></div></div>`
        : `${
            range.min === range.max
              ? `<div class="wz-status is-ok">${icon("image")}<div><strong>${range.min === 1 ? "1 photo" : `${range.min} photos`}, always required</strong><span>${esc(photoRule())}</span></div></div>`
              : `${field("Photos the customer adds", input(draft, "personalization.photos", { type: "number", min: range.min, max: range.max, step: "1", placeholder: String(range.initial), rerender: true }), { hint: `Between ${range.min} and ${range.max}. Customers see one upload space per photo: “Photo 1”, “Photo 2”…${range.min ? " They can't order until every space is filled." : " With 0, the product is sold ready-made."}` })}
                 <div class="wz-status ${need.count ? "is-ok" : ""}">${icon(need.count ? "image" : "check")}<div><strong>${need.count ? `${need.count === 1 ? "1 photo" : `${need.count} photos`} required` : "No customer photo"}</strong><span>${esc(photoRule())}</span></div></div>`
          }
          ${type.panels ? field("Frames in the set", input(draft, "personalization.panels", { type: "number", min: type.panels.min, max: type.panels.max, step: "1", placeholder: "3", rerender: true }), { hint: `Between ${type.panels.min} and ${type.panels.max}.` }) : ""}`;
      return group("Customer photos", body, "The customer's photo is uploaded on your product page and travels with the order. You download the original file from your Orders page; FrameX never resizes or enhances it.");
    }

    /** Is this product made from the customer's photo (as its type and settings stand now)? */
    const photoBased = () => !typeOf() || M().photoRequirement(draft, {}).count > 0;

    function stepCustomize() {
      const support = M().studioSupport(draft);
      const extra = issuesFor("customize").filter((i) => !support.reasons.includes(i.message));
      return `${photosGroup()}
        ${group("What customers can personalise", `<div class="wz-toggles">${M().CUSTOMIZATION_OPTIONS.filter((o) => photoBased() || !["photoUpload", "crop"].includes(o.id)).map((o) => toggle(draft, `customization.${o.id}`, o.label, o.hint)).join("")}</div>
          ${draft.customization.text ? field("Text field name", input(draft, "customization.textLabel", { placeholder: "e.g. Names and date", maxlength: 30 }), { hint: "Customers fill this in; it prints under the photo." }) : ""}`,
          "Only turn on what you actually offer. Options that are off never appear to customers.")}
        <div class="wz-status ${draft.customization.photoUpload ? (support.ok ? "is-ok" : "is-warn") : ""}">
          ${draft.customization.photoUpload
            ? support.ok
              ? `${icon("check")}<div><strong>Ready for FrameX Studio</strong><span>Customers will see “Customize This Product” and only these options: ${esc(studioSummary())}.</span></div>`
              : `${icon("alert")}<div><strong>Not ready for FrameX Studio yet</strong><ul>${support.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`
            : photoBased()
              ? `${icon("frame")}<div><strong>FrameX Studio is off for this product</strong><span>Customers add their photo on the product page and order it there. Turn on “Design in FrameX Studio” to also let them crop it and choose a border or a mat with a live preview.</span></div>`
              : `${icon("frame")}<div><strong>FrameX Studio isn't used for ready-made products</strong><span>The Studio builds a frame around the customer's photo. This product is sold as it is.</span></div>`}
        </div>
        ${wallGroup()}
        ${extra.length ? `<ul class="wz-issues">${extra.map((i) => `<li>${icon("alert")} ${esc(i.message)}</li>`).join("")}</ul>` : ""}`;
    }

    /** "View on My Wall": may customers see this product on their own wall through their camera? */
    function wallGroup() {
      const wall = M().liveDemoSupport(draft);
      const off = draft.liveDemo && draft.liveDemo.enabled === false;
      return group(
        "View on My Wall (Live Demo)",
        `${field("Show “View on My Wall”", select(draft, "liveDemo.enabled", [{ id: "", name: "Automatic: on when FrameX can show this product" }, { id: "true", name: "On" }, { id: "false", name: "Off" }], { kind: "tri" }), { hint: "Customers point their phone camera at a wall and see this product on it, in the size and colour they chose." })}
          <div class="wz-status ${wall.ok ? "is-ok" : off ? "" : "is-warn"}">${
            wall.ok
              ? `${icon("check")}<div><strong>Customers will see “View on My Wall”</strong><span>On the product page${draft.customization.photoUpload ? " and in FrameX Studio" : ""}, on phones and computers with a camera. It uses the sizes you entered, so check their width and height.</span></div>`
              : off
                ? `${icon("frame")}<div><strong>“View on My Wall” is off for this product</strong><span>The button is not shown.</span></div>`
                : `${icon("alert")}<div><strong>“View on My Wall” can't be shown for this product yet</strong><ul>${wall.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`
          }</div>`,
        "FrameX draws the frame from the details you entered (frame type, colour, sizes) with the customer's own photo inside. Nothing extra is needed from you.",
      );
    }

    function studioSummary() {
      const o = M().studioOptions(draft);
      return [
        `${o.sizes.length} size${o.sizes.length === 1 ? "" : "s"}`,
        o.colorIds.length > 1 && `${o.colorIds.length} frame colours`,
        o.mat && "mat",
        o.border && "border",
        o.orientations.length > 1 && "orientation",
        o.protection.length > 1 && "front cover",
        o.printMaterials.length > 1 && "print",
        o.text && "text"
      ].filter(Boolean).join(", ");
    }

    function stepImages() {
      const frames = (draft.product360 && draft.product360.frames) || [];
      const video = (draft.media || []).find((m) => m.kind === "video") || {};
      return `${group("Product photos", `<div data-uploader></div>`, "Show the real product: front, side and back, a corner close-up, the material, and how it looks on a wall. Only the views you add are shown; there are no empty placeholders.")}
        ${group("360° view (optional)", `
          <p class="wz-group__lead">Photograph the product on a turntable at equal steps (for example 24 or 36 photos), name the files in order, and upload them together. The 360° button appears for customers when there are at least ${FrameX.productGallery ? FrameX.productGallery.MIN_360 : 8} photos.</p>
          <label class="btn btn--outline btn--sm">${icon("upload")} ${frames.length ? "Replace 360° photos" : "Upload 360° photos"}<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-360-files></label>
          <p class="wz-hint" data-360-status>${frames.length ? `${frames.length} photos in the 360° view.` : ""}</p>
          ${frames.length ? `<div class="wz-strip">${frames.slice(0, 12).map((f) => `<img data-src="${esc(f)}" alt="">`).join("")}${frames.length > 12 ? `<span>+${frames.length - 12}</span>` : ""}</div><button class="btn btn--outline btn--sm" type="button" data-act="clear-360">Remove 360° view</button>` : ""}`)}
        ${group("Product video (optional)", `
          ${field("Video link", `<input class="input" id="__ID__" data-bind="media.video.url" data-type="video-url" value="${esc(/^media:/.test(video.url || "") ? "" : video.url || "")}" placeholder="A YouTube or Vimeo link">`, { hint: "Put the video on YouTube or Vimeo and paste its link here. Video files can't be uploaded to FrameX." })}
          ${field("Duration (seconds)", `<input class="input" id="__ID__" type="number" min="0" data-bind="media.video.duration" data-type="video-num" value="${esc(video.duration || "")}">`)}
          <div class="wz-field wz-field--wide" data-video-thumb></div>`)}`;
    }

    function stepComponents() {
      const comps = draft.components || [];
      const specs = draft.specifications || [];
      const derived = M().deriveComponents(draft);
      return `${group("Frame components", `
        <p class="wz-group__lead">${comps.length ? "These parts are shown to customers, front to back." : `Nothing listed yet. Customers will see the parts worked out from your answers${derived.length ? `: ${esc(derived.map((c) => c.name).join(", "))}` : ""}.`}</p>
        <div class="wz-rows">${comps
          .map((c, i) => `<div class="wz-row wz-row--card"><div class="wz-row__head"><strong>Part ${i + 1}</strong>${rowTools("components", i, comps.length)}</div><div class="wz-grid">
            ${field("Part", select(draft, `components.${i}.type`, M().COMPONENT_TYPES, { rerender: false }))}
            ${field("Name", input(draft, `components.${i}.name`, { placeholder: "e.g. Outer Frame" }))}
            ${field("Material", input(draft, `components.${i}.material`, { placeholder: "e.g. Natural teak" }))}
            ${field("Description", input(draft, `components.${i}.description`, { placeholder: "Optional" }))}
            <div class="wz-field wz-field--wide" data-comp-image="${i}"></div></div></div>`)
          .join("")}</div>
        <div class="wz-actions-row"><button class="btn btn--outline btn--sm" type="button" data-act="build-components">${icon("frame")} ${comps.length ? "Rebuild from my answers" : "Start from my answers"}</button>
          <button class="btn btn--outline btn--sm" type="button" data-act="add-component">${icon("plus")} Add part</button></div>`)}
        ${group("What's included", `
          ${field("In the box", `<textarea class="input wz-textarea" id="__ID__" data-bind="included" data-type="lines" rows="4" maxlength="2000" placeholder="One per line, for example:&#10;The frame&#10;Your photo, printed and fitted&#10;Hanging hook and wall screws">${esc((draft.included || []).join("\n"))}</textarea>`, { wide: true, hint: "One item per line (up to 12). Customers see this as a list." })}
          ${field("Care instructions", `<textarea class="input wz-textarea" id="__ID__" data-bind="care" data-type="lines" rows="3" maxlength="2000" placeholder="One per line, for example:&#10;Wipe with a soft, dry cloth&#10;Keep out of direct sunlight">${esc((draft.care || []).join("\n"))}</textarea>`, { wide: true, hint: "One instruction per line (up to 12)." })}`)}
        ${group("Extra specifications", `
          <p class="wz-group__lead">Frame, print, size and back details already appear in the specification table. Add anything else here (e.g. Glazing thickness, Care instructions).</p>
          <div class="wz-rows">${specs.map((r, i) => `<div class="wz-row wz-row--spec">${field("Label", input(draft, `specifications.${i}.label`, { placeholder: "e.g. Care" }))}${field("Value", input(draft, `specifications.${i}.value`, { placeholder: "e.g. Wipe with a dry cloth" }))}${rowTools("specifications", i, specs.length)}</div>`).join("")}</div>
          <button class="btn btn--outline btn--sm" type="button" data-act="add-spec">${icon("plus")} Add specification</button>`)}`;
    }

    function stepPreview() {
      return `<div class="wz-preview-bar">
          <div class="segmented" role="group" aria-label="Preview size"><button class="chip" type="button" data-act="device" data-device="desktop" aria-pressed="${device === "desktop"}">Desktop</button><button class="chip" type="button" data-act="device" data-device="mobile" aria-pressed="${device === "mobile"}">Mobile</button></div>
          ${isNew ? "" : `<a class="btn btn--outline btn--sm" href="product.html?preview=${encodeURIComponent(draft.id)}" target="_blank" rel="noopener">${icon("frame")} Open full preview</a>`}
        </div>
        ${live() && saveState === "unsaved" ? `<p class="wz-note">${icon("alert")} This preview includes your unsaved changes. Customers still see the last saved version.</p>` : ""}
        <div class="wz-preview wz-preview--${device}"><div class="wz-preview__screen" data-preview></div></div>`;
    }

    function stepPublish() {
      const v = M().validateForPublish(draft);
      const status = M().STATUS[draft.status] || { label: draft.status };
      const moderation = FrameX.config.productModeration;
      const publishLabel = moderation ? "Submit for review" : draft.status === "unpublished" ? "Publish again" : "Publish";
      return `<div class="wz-publish">
        <div class="wz-check-box ${v.ready ? "is-ready" : "is-missing"}">
          ${v.ready ? `${icon("check")}<div><strong>Ready to Publish</strong><span>Every required detail is filled in.</span></div>` : `${icon("alert")}<div><strong>Missing Information</strong><span>Fix these before publishing:</span>
            <ul>${v.issues.map((i) => `<li><button type="button" data-act="goto" data-step="${i.step}">${esc(i.message)} <em>${esc((STEPS.find((s) => s.id === i.step) || {}).title || "")}</em></button></li>`).join("")}</ul></div>`}
        </div>
        <dl class="wz-summary">
          <div><dt>Status</dt><dd><span class="sd-status sd-status--${esc(draft.status)}">${esc(status.label)}</span></dd></div>
          <div><dt>Price</dt><dd>${draft.pricing.basePrice ? formatPrice(M().quote(draft, M().defaultSelection(draft)).unit) : "—"}</dd></div>
          <div><dt>Sizes</dt><dd>${(draft.sizes || []).length}</dd></div>
          <div><dt>Images</dt><dd>${(draft.views || []).length}</dd></div>
          <div><dt>FrameX Studio</dt><dd>${M().studioSupport(draft).ok ? "Yes" : "No"}</dd></div>
          <div><dt>Product type</dt><dd>${esc((typeOf() || { name: "Not chosen" }).name)}</dd></div>
          <div><dt>Customer photos</dt><dd>${typeOf() ? (M().photoRequirement(draft, {}).count ? `${M().photoRequirement(draft, {}).count} required` : "None") : "—"}</dd></div>
          <div><dt>Gift wrapping</dt><dd>${draft.giftWrap === false ? "Not offered" : "Offered"}</dd></div>
        </dl>
        <div class="wz-publish__actions">
          ${draft.status === "draft" ? `<button class="btn btn--outline" type="button" data-act="save-draft">Save draft</button>` : `<button class="btn btn--outline" type="button" data-act="save-changes-publish">Save changes</button>`}
          ${draft.status !== "published" && draft.status !== "pending_review" ? `<button class="btn btn--primary" type="button" data-act="publish" ${v.ready ? "" : "aria-disabled=\"true\""}>${esc(publishLabel)}</button>` : ""}
          ${draft.status === "published" ? `<button class="btn btn--outline" type="button" data-act="unpublish">Unpublish</button>` : ""}
          ${draft.status === "pending_review" ? `<button class="btn btn--outline" type="button" data-act="withdraw">Withdraw (back to draft)</button>` : ""}
          ${isNew ? "" : `<button class="btn btn--outline" type="button" data-act="duplicate">Duplicate</button>`}
          ${isNew ? "" : `<button class="btn btn--outline sd-danger" type="button" data-act="delete">Delete product</button>`}
        </div>
        <p class="wz-note">${icon("check")} ${moderation ? "FrameX reviews a product before it goes on sale for the first time. " : "A published product is on sale to customers straight away. "}Your products are saved in your shop's FrameX account, so they are the same on every device. FrameX can take a product off sale if it breaks the marketplace rules.</p>
      </div>`;
    }

    const RENDER = { basic: stepBasic, frame: stepFrame, print: stepPrint, sizes: stepSizes, customize: stepCustomize, images: stepImages, components: stepComponents, preview: stepPreview, publish: stepPublish };

    /* ---- shell ---- */
    function shell() {
      const status = M().STATUS[draft.status] || { label: draft.status };
      root.innerHTML = `<div class="wz">
        <header class="wz-head">
          <a class="wz-back" href="#/products">${icon("chev-left")} All products</a>
          <div class="wz-head__title"><h1 data-title>${esc(draft.name || "New product")}</h1><span class="sd-status sd-status--${esc(draft.status)}" data-status>${esc(status.label)}</span><span class="wz-save" data-save-state></span></div>
          <div class="wz-head__actions"><button class="btn btn--primary btn--sm" type="button" data-act="save-changes" hidden>Save changes</button></div>
        </header>
        ${notice ? `<p class="wz-note wz-note--restore">${icon("alert")} ${esc(notice)} <button class="iu-btn" type="button" data-act="discard-wip">Discard them</button></p>` : ""}
        <nav class="wz-steps" aria-label="Steps"><ol>${STEPS.map((s, i) => `<li><button type="button" data-act="goto" data-step="${s.id}" data-step-btn="${s.id}"><span class="wz-steps__num">${i + 1}</span><span class="wz-steps__label">${esc(s.title)}</span></button></li>`).join("")}</ol></nav>
        <section class="wz-body" aria-live="off"><div data-step-body></div></section>
        <footer class="wz-foot">
          <button class="btn btn--outline" type="button" data-act="prev">${icon("chev-left")} Back</button>
          <span class="wz-foot__count" data-count></span>
          <button class="btn btn--dark" type="button" data-act="next">Next ${icon("chev-right")}</button>
        </footer>
        ${datalists()}
      </div>`;
      setSaveState(saveState);
    }

    function renderStep({ keepScroll = false } = {}) {
      const y = window.scrollY;
      if (preview) {
        preview.destroy();
        preview = null;
      }
      const idx = STEPS.findIndex((s) => s.id === current);
      const body = $("[data-step-body]", root);
      body.innerHTML = `<h2 class="wz-body__title">${idx + 1}. ${esc(STEPS[idx].title)}</h2>${RENDER[current]()}`;
      $$("[data-step-btn]", root).forEach((b, i) => {
        const id = b.dataset.stepBtn;
        b.setAttribute("aria-current", String(id === current));
        b.classList.toggle("is-done", i < idx);
        b.classList.toggle("has-issue", showIssues && issuesFor(id).length > 0);
      });
      $("[data-count]", root).textContent = `Step ${idx + 1} of ${STEPS.length}`;
      $("[data-act='prev']", root).disabled = idx === 0;
      $("[data-act='next']", root).hidden = idx === STEPS.length - 1;
      mountWidgets();
      if (keepScroll) window.scrollTo(0, y);
    }

    function mountWidgets() {
      const up = $("[data-uploader]", root);
      if (up)
        FrameX.imageUploader.mount(up, {
          items: draft.views || [],
          productName: () => draft.name,
          onChange(list) {
            draft.views = list;
            changed();
          }
        });
      $$("[data-mat-image]", root).forEach((el) => {
        const i = Number(el.dataset.matImage);
        FrameX.imageUploader.single(el, { value: draft.print.materials[i].image || "", kind: "material", label: "Material photo (optional)", onChange: (u) => ((draft.print.materials[i].image = u), changed()) });
      });
      $$("[data-comp-image]", root).forEach((el) => {
        const i = Number(el.dataset.compImage);
        FrameX.imageUploader.single(el, { value: draft.components[i].image || "", kind: "material", label: "Part photo (optional)", onChange: (u) => ((draft.components[i].image = u), changed()) });
      });
      const vt = $("[data-video-thumb]", root);
      if (vt) FrameX.imageUploader.single(vt, { value: video().thumbnail || "", kind: "thumbnail", label: "Video cover image (optional)", onChange: (u) => ((video().thumbnail = u), changed()) });
      $$("[data-src]", root).forEach((img) => FrameX.mediaService.resolve(img.dataset.src, { thumb: true }).then((u) => (img.src = u)));
      const pv = $("[data-preview]", root);
      if (pv) preview = FrameX.productPage.render(pv, M().normalize(draft), shop, { preview: true, categories });
    }

    function video() {
      draft.media = draft.media || [];
      let v = draft.media.find((m) => m.kind === "video");
      if (!v) {
        v = { id: "video", kind: "video", url: "", thumbnail: "", duration: null };
        draft.media.push(v);
      }
      return v;
    }

    function go(id) {
      if (!STEPS.some((s) => s.id === id)) return;
      if (id === "publish") showIssues = true;
      current = id;
      history.replaceState(null, "", `#/products/${isNew ? "new" : encodeURIComponent(draft.id) + "/edit"}?step=${id}`);
      renderStep();
      $(".wz-steps", root).scrollIntoView({ block: "nearest" });
      const head = $(".wz-body__title", root);
      if (head) {
        head.setAttribute("tabindex", "-1");
        head.focus({ preventScroll: true });
      }
      window.scrollTo({ top: Math.max(0, root.getBoundingClientRect().top + window.scrollY - 80), behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth" });
    }

    /* ---- input binding ---- */
    function coerce(el) {
      const t = el.dataset.type;
      if (t === "bool") return el.checked;
      if (t === "number") return el.value === "" ? null : Number(el.value);
      if (t === "list") return el.value.split(",").map((x) => x.trim()).filter(Boolean);
      if (t === "falsy") return el.value || false;
      if (t === "tri") return el.value === "" ? null : el.value === "true"; // automatic / on / off
      // One item per line ("What's included", "Care").
      if (t === "lines") return el.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
      return el.value;
    }

    function onField(e) {
      const el = e.target;
      if (el.dataset.bindList) {
        const list = new Set(getPath(draft, el.dataset.bindList) || []);
        el.checked ? list.add(el.value) : list.delete(el.value);
        setPath(draft, el.dataset.bindList, Array.from(list));
        afterChange(el.dataset.bindList);
        renderStep({ keepScroll: true });
        changed();
        return;
      }
      if (!el.dataset.bind) return;
      const path = el.dataset.bind;
      if (el.dataset.type === "video-url") {
        video().url = el.value.trim();
      } else if (el.dataset.type === "video-num") {
        video().duration = el.value === "" ? null : Number(el.value);
      } else setPath(draft, path, coerce(el));
      afterChange(path);
      if (path === "name") {
        $("[data-title]", root).textContent = draft.name || "New product";
        const slug = $("[data-slug]", root);
        if (slug) slug.textContent = `product.html?slug=${draft.status === "draft" ? M().slugify(draft.name) || "…" : draft.slug}`;
      }
      if (e.type === "change" && el.hasAttribute("data-rerender")) renderStep({ keepScroll: true });
      changed();
    }

    /** Keep related fields consistent. */
    function afterChange(path) {
      const f = draft.frame;
      if (path === "frame.colors") {
        if (!f.colors.includes(f.color)) f.color = f.colors[0] || "";
      }
      if (path === "category") draft.categoryIds = [draft.category].concat((draft.categoryIds || []).filter((c) => c && c !== draft.category));
      if (path === "categoryIds" && draft.category && !draft.categoryIds.includes(draft.category)) draft.categoryIds.unshift(draft.category);
      const m = /^print\.materials\.(\d+)\.type$/.exec(path);
      if (m) {
        const pm = draft.print.materials[Number(m[1])];
        const t = M().PRINT_MATERIAL_TYPES.find((x) => x.id === pm.type);
        if (t && t.id !== "other" && (!pm.name || M().PRINT_MATERIAL_TYPES.some((x) => x.name === pm.name))) pm.name = t.name;
      }
      if (path === "customization.photoUpload" && draft.customization.photoUpload && !draft.customization.crop) draft.customization.crop = true;
      // Another product type: its own starting number of photos, then the platform's rules for that type.
      if (path === "productType") draft.personalization = { photos: null, panels: null };
      if (path === "productType" || path.startsWith("personalization.")) {
        const kept = { source: draft.source };
        Object.assign(draft, M().applyTypeRules(draft), kept);
      }
    }

    /* ---- actions ---- */
    async function act(btn) {
      const a = btn.dataset.act;
      const list = (path) => getPath(draft, path) || [];
      if (a === "goto") return go(btn.dataset.step);
      if (a === "next" || a === "prev") {
        const i = STEPS.findIndex((s) => s.id === current) + (a === "next" ? 1 : -1);
        if (STEPS[i]) go(STEPS[i].id);
        return;
      }
      if (a === "row-remove") {
        list(btn.dataset.path).splice(Number(btn.dataset.i), 1);
        return refresh();
      }
      if (a === "row-move") {
        const arr = list(btn.dataset.path);
        const i = Number(btn.dataset.i);
        const j = i + Number(btn.dataset.d);
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return refresh();
      }
      if (a === "add-size") {
        draft.sizes = list("sizes").concat({ id: M().newId("sz"), label: "", width: btn.dataset.w ? Number(btn.dataset.w) : null, height: btn.dataset.h ? Number(btn.dataset.h) : null, unit: "in", price: null });
        return refresh();
      }
      if (a === "add-print") {
        draft.print.materials = list("print.materials").concat({ id: M().newId("pm"), type: "photo-paper", name: "Photo Paper", description: "", finish: "", thickness: "", quality: "", image: "", priceModifier: 0 });
        return refresh();
      }
      if (a === "add-component") {
        draft.components = list("components").concat({ id: M().newId("c"), type: "other", name: "", material: "", description: "", image: "" });
        return refresh();
      }
      if (a === "build-components") {
        const own = new Map(list("components").map((c) => [c.type + ":" + c.name, c]));
        draft.components = M().deriveComponents(Object.assign({}, draft, { components: [] })).map((c) => Object.assign({}, c, { id: M().newId("c"), image: (own.get(c.type + ":" + c.name) || {}).image || "" }));
        return refresh();
      }
      if (a === "add-spec") {
        draft.specifications = list("specifications").concat({ label: "", value: "" });
        return refresh();
      }
      if (a === "toggle-cover") {
        const opts = (draft.protection.options = list("protection.options"));
        const i = opts.findIndex((o) => o.type === btn.value);
        if (btn.checked && i < 0) opts.push({ type: btn.value, priceModifier: 0, description: "" });
        if (!btn.checked && i >= 0) opts.splice(i, 1);
        if (!opts.some((o) => o.type === draft.protection.default)) draft.protection.default = (opts[0] || {}).type || "";
        return refresh();
      }
      if (a === "clear-360") {
        draft.product360 = null;
        return refresh();
      }
      if (a === "device") {
        device = btn.dataset.device;
        return renderStep({ keepScroll: true });
      }
      if (a === "discard-wip") {
        clearWip(draft.id);
        notice = "";
        return open(root, { productId: draft.id, shopId, step: current, onExit });
      }
      if (a === "save-changes" || a === "save-changes-publish") return saveChanges();
      if (a === "save-draft") {
        await persist();
        FrameX.toast.show(isNew ? "Add a product name to save the draft." : "Draft saved.");
        return;
      }
      if (a === "publish") return publish();
      if (a === "unpublish" || a === "withdraw") {
        let saved;
        try {
          saved = a === "unpublish" ? await svc().unpublish(draft) : await svc().save(draft, { status: "draft" });
        } catch (error) {
          return FrameX.toast.show(error.friendly || "That didn't work. Please try again.");
        }
        Object.assign(draft, { status: saved.status, updatedAt: saved.updatedAt });
        clearWip(draft.id);
        FrameX.toast.show(a === "unpublish" ? "Unpublished. Customers can't see it now." : "Moved back to drafts.");
        return redraw();
      }
      if (a === "duplicate") {
        let copy;
        try {
          copy = await svc().duplicate(draft);
        } catch (error) {
          return FrameX.toast.show(error.friendly || "The copy couldn't be made. Please try again.");
        }
        FrameX.toast.show(`Created “${copy.name}”. You're now editing the copy.`);
        location.hash = `#/products/${encodeURIComponent(copy.id)}/edit?step=basic`;
        return;
      }
      if (a === "delete") {
        if (!btn.classList.contains("is-confirming")) {
          btn.classList.add("is-confirming");
          btn.textContent = "Tap again to confirm";
          setTimeout(() => btn.isConnected && (btn.classList.remove("is-confirming"), (btn.textContent = "Delete product")), 4000);
          return;
        }
        try {
          await svc().remove(draft);
        } catch (error) {
          return FrameX.toast.show(error.message || "The product couldn't be deleted. Please try again.");
        }
        clearWip(draft.id);
        window.onbeforeunload = null;
        FrameX.toast.show("Product deleted.");
        location.hash = "#/products";
      }
    }

    function refresh() {
      renderStep({ keepScroll: true });
      changed();
    }

    function redraw() {
      shell();
      renderStep({ keepScroll: true });
    }

    async function saveChanges() {
      const v = M().validateForPublish(draft);
      if (draft.status === "published" && !v.ready) {
        showIssues = true;
        FrameX.toast.show("A live product must stay complete. Fix the missing information first.");
        return go("publish");
      }
      try {
        const saved = await svc().save(draft);
        ["slug", "updatedAt", "listingImage", "listingImageFor"].forEach((k) => (draft[k] = saved[k]));
        clearWip(draft.id);
        setSaveState("saved");
        FrameX.toast.show(draft.status === "published" ? "Changes saved. Customers now see the update." : "Changes saved.");
        if (current === "publish") renderStep({ keepScroll: true });
      } catch (error) {
        setSaveState("error", error.friendly);
      }
    }

    async function publish() {
      showIssues = true;
      draft.media = (draft.media || []).filter((m) => m && (m.url || m.thumbnail));
      try {
        const r = await svc().publish(draft);
        if (!r.ok) {
          FrameX.toast.show("Some information is missing. See the list below.");
          return renderStep({ keepScroll: true });
        }
        Object.assign(draft, { status: r.product.status, slug: r.product.slug, updatedAt: r.product.updatedAt, publishedAt: r.product.publishedAt, listingImage: r.product.listingImage, listingImageFor: r.product.listingImageFor });
        isNew = false;
        clearWip(draft.id);
        saveState = "saved";
        FrameX.toast.show(r.status === "pending_review" ? "Submitted. FrameX will review it before it goes live." : "Published. Customers can now find it.", {
          action: r.status === "published" ? { label: "View", onClick: () => window.open(`product.html?slug=${encodeURIComponent(draft.slug)}`, "_blank") } : null
        });
        history.replaceState(null, "", `#/products/${encodeURIComponent(draft.id)}/edit?step=publish`);
        redraw();
      } catch (error) {
        console.error("Publish failed", error);
        FrameX.toast.show(error.friendly || "The product couldn't be published. Please try again.");
      }
    }

    async function upload360(files) {
      const status = $("[data-360-status]", root);
      const arr = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const frames = [];
      for (let i = 0; i < arr.length; i++) {
        status.textContent = `Uploading photo ${i + 1} of ${arr.length}…`;
        try {
          frames.push((await FrameX.mediaService.prepare(arr[i], "frame360")).url);
        } catch (error) {
          status.textContent = error.message || "A photo couldn't be added.";
          return;
        }
      }
      draft.product360 = { frames };
      refresh();
    }

    /* ---- wire ---- */
    shell();
    renderStep();
    root.oninput = (e) => e.target.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea") && onField(e);
    root.onchange = (e) => {
      if (e.target.matches("[data-360-files]")) return upload360(e.target.files);
      if (e.target.matches("[data-act='toggle-cover']")) return act(e.target);
      if (e.target.closest("[data-uploader], [data-mat-image], [data-comp-image], [data-video-thumb]")) return;
      if (e.target.matches("select, input[type=checkbox], input[type=radio]")) return onField(e);
      // A number that the platform's rules may have corrected (photos per product, frames in a set): show what was kept.
      if (e.target.matches("input[data-rerender]")) renderStep({ keepScroll: true });
    };
    root.onclick = (e) => {
      const btn = e.target.closest("button[data-act]");
      if (btn && !btn.closest("[data-preview]")) act(btn);
    };
  }

  FrameX.productWizard = { open, STEPS };
})((window.FrameX = window.FrameX || {}));
