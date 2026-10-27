/* ==========================================================================
   "Add a frame" in 4 easy steps (owner, 2026-10-27) — for a shop's own
   dashboard and for the FrameX admin acting for any shop.

     1. Photos            model photos (the first is the main one); the frame
                          FRONT (background outside and photo space inside
                          removed by the server, the photo space found and
                          adjustable); the full PNG for "View on My Wall";
                          or "I only have model photos"
     2. Details           name, category, style, material, colour, front cover,
                          customer photos, description, sizes + prices, stock
     3. Frame Components  the layers, front to back: add, change, order, remove
     4. Check & publish   how customers see it; save a draft or publish

   FrameX.frameEditor.open(root, { base, productId, admin, onExit })
     base   "/shops/<Shop ID>" (a shop) or "/admin/shops/<shop id>" (the admin)
   The record is the website's product model (productModel); the server
   rebuilds and checks it again whatever this page sends.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const M = () => FrameX.productModel;
  const http = () => FrameX.http;
  const media = () => FrameX.mediaService;

  const STEPS = ["Photos", "Details", "Frame Components", "Check & publish"];
  const STEP_OF = { images: 1, basic: 2, frame: 2, print: 2, sizes: 2, customize: 2, components: 3, publish: 4 };
  const SAMPLE = "assets/img/home/hero-newborn.webp"; // a sample photo for the previews
  const QUICK = [[5, 7], [8, 10], [8.27, 11.69, "A4"], [12, 16], [12, 18], [16, 20], [18, 24]];
  const USUAL = (d) => [
    { type: "frame", name: "Frame", material: [d.frame.material, M().colorName(d.frame.color)].filter(Boolean).join(", ") },
    { type: d.protection.default === "acrylic" ? "acrylic" : "glass", name: "Front cover", material: d.protection.default === "none" ? "Open front (no cover)" : d.protection.default === "acrylic" ? "Acrylic" : "Glass" },
    { type: "mat", name: "Mat (mount)", material: "" },
    { type: "print", name: "Your photo", material: "Printed on photo paper" },
    { type: "backing", name: "Backing", material: "MDF board" },
    { type: "hardware", name: "Hanging", material: "Hook on the back" },
  ];

  const sizeLabel = (s) => (s.labelText ? s.labelText : `${M().sizeDims({ width: s.width, height: s.height, unit: s.unit || "in" })}`);
  const money = (n) => (n > 0 ? "₹" + Math.round(n).toLocaleString("en-IN") : "—");

  /** A new frame with sensible defaults: everything the simple form doesn't ask is filled in. */
  function newFrame() {
    const d = M().normalize(M().emptyProduct(null));
    d.productType = "photo-frame";
    d.personalization.photos = 1;
    Object.assign(d.frame, { type: "modern", material: "Wood", color: "black" });
    d.protection = { options: [{ id: "glass", priceModifier: 0, description: "" }], default: "glass" };
    d.sizes = [{ id: M().newId("sz"), label: "", width: 8, height: 10, unit: "in", price: null }];
    d.componentOrder = "own";
    d.components = [];
    return d;
  }

  async function open(root, { base, productId = null, admin = false, onExit = () => {} } = {}) {
    root.innerHTML = FrameX.templates ? FrameX.templates.skeletonPage("dash") : "";
    const [categories, found] = await Promise.all([
      FrameX.api && FrameX.api.getCategories ? FrameX.api.getCategories().catch(() => []) : [],
      productId ? http().get(`${base}/products/${encodeURIComponent(productId)}`).then((r) => r.product) : null,
    ]);
    let d = found ? M().normalize(found) : newFrame();
    d.frameArt = M().cleanFrameArt(d.frameArt);
    if (!d.componentOrder && !(d.components || []).length) d.componentOrder = "own";
    let step = 1;
    let issues = [];
    let note = { front: "", wall: "" };
    let dirty = false;
    const urls = new Map(); // "media:…" -> an address the browser can show

    const show = async (ref, thumb = false) => {
      if (!ref) return "";
      const key = ref + (thumb ? ":t" : "");
      if (!urls.has(key)) urls.set(key, await media().resolve(ref, { thumb }));
      return urls.get(key);
    };
    const views = () => (d.views || []).filter((v) => v && v.url);
    const prices = () => (d.sizes || []).map((s) => Number(s.price) || 0).filter((n) => n > 0);

    /* ---------------------------------------------------------------- the page */
    function frameNote(kind) {
      const n = note[kind];
      return n ? `<p class="af-ok${/couldn|mark|check/i.test(n) ? " af-warn" : ""}">${esc(n)}</p>` : "";
    }
    function stepPhotos() {
      const a = d.frameArt;
      return `<div class="af-card"><h3>1. Model photos <span class="af-tag">Required</span></h3>
        <p>Nice photos of the frame (on a wall, on a table). The first one is the main photo. Up to 8. JPG, PNG or WebP.</p>
        <div class="af-pics">${views()
          .map((v, i) => `<div class="af-pic"><img data-ref="${esc(v.thumb || v.url)}" alt="">${i === 0 ? "<em>Main</em>" : `<button type="button" class="af-mini" data-act="main" data-i="${i}">Make main</button>`}<button type="button" class="af-x" data-act="drop-view" data-i="${i}" aria-label="Remove photo">✕</button></div>`)
          .join("")}${views().length < 8 ? `<label class="af-add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-up="views" hidden>＋<br>Add photo</label>` : ""}</div>
        <p class="af-status" data-status="views"></p></div>
      <div class="af-card af-modelonly"><label class="af-check"><input type="checkbox" data-f="frameArt.modelOnly"${a.modelOnly ? " checked" : ""}> I only have model photos</label>
        <p>Fine: the frame is listed with its photos. Customers then can't see their own photo inside it or use “View on My Wall” until you add the frame front.</p></div>
      ${
        a.modelOnly
          ? ""
          : `<div class="af-card"><h3>2. Frame front (PNG) <span class="af-tag af-tag--opt">Recommended</span></h3>
        <p>The empty frame, straight from the front. FrameX removes the background outside it AND the space inside it, so the customer's own photo shows inside it — on the product page, in the cart and in the order. Photograph it on a plain wall; or upload a PNG that already has no background.</p>
        ${
          a.front
            ? `<div class="af-two"><div class="af-box af-checker"><div class="af-front" data-front><img data-ref="${esc(a.front)}" alt="The frame's front">${a.opening ? `<div class="af-open" data-open style="left:${a.opening.x * 100}%;top:${a.opening.y * 100}%;width:${a.opening.w * 100}%;height:${a.opening.h * 100}%"><span data-h="nw"></span><span data-h="ne"></span><span data-h="sw"></span><span data-h="se"></span></div>` : ""}</div>
              <p class="af-cap">The orange box is where the customer's photo goes. Drag it or its corners to adjust.</p></div>
              <div class="af-box af-wallbg"><canvas data-sample="front" class="af-sample"></canvas><p class="af-cap">With a sample photo</p></div></div>`
            : ""
        }
        <div class="af-row"><label class="af-btn af-btn--dark"><input type="file" accept="image/jpeg,image/png,image/webp" data-up="front" hidden>✨ ${a.front ? "Replace and remove background" : "Upload and remove background"}</label>
          <label class="af-btn"><input type="file" accept="image/png,image/webp" data-up="front-keep" hidden>Upload a ready PNG</label>
          ${a.front ? `<button class="af-btn" type="button" data-act="drop-front">Remove</button>` : ""}</div>
        <p class="af-status" data-status="front"></p>${frameNote("front")}</div>
      <div class="af-card"><h3>3. Full frame PNG — for “View on My Wall” <span class="af-tag af-tag--opt">Optional</span></h3>
        <p>The whole frame (outside and inside background removed) as it hangs on a wall. Shown on the customer's phone camera in “View on My Wall”.</p>
        <label class="af-check"><input type="checkbox" data-act="same-wall"${a.wall ? "" : " checked"}> Use the frame front from step 2 (same picture)</label>
        ${
          a.wall
            ? `<div class="af-row" style="margin-top:10px"><div class="af-box af-checker af-wallthumb"><img data-ref="${esc(a.wall)}" alt=""></div><label class="af-btn"><input type="file" accept="image/jpeg,image/png,image/webp" data-up="wall" hidden>Replace</label></div>${frameNote("wall")}`
            : `<div data-wall-up hidden><label class="af-btn" style="margin-top:10px"><input type="file" accept="image/jpeg,image/png,image/webp" data-up="wall" hidden>Upload the full PNG</label></div>`
        }<p class="af-status" data-status="wall"></p></div>`
      }`;
    }

    function chips(path, value, list) {
      return `<div class="af-chips">${list.map(([id, label]) => `<button type="button" class="${String(value) === String(id) ? "on" : ""}" data-chip="${path}" data-v="${esc(String(id))}">${esc(label)}</button>`).join("")}</div>`;
    }
    function stepDetails() {
      const cats = (categories || []).filter((c) => c && c.id).map((c) => [c.id, c.name || c.id]);
      const types = M().frameTypes().map((t) => [t.id, t.name]);
      const palette = M().palette();
      const photosNeeded = Number(d.personalization.photos) || 0;
      return `<div class="af-card"><div class="af-row af-between"><h3>Details</h3>${admin ? "" : `<button class="af-btn" type="button" data-act="copy-from">⧉ Copy details from another frame</button>`}</div>
        <div class="af-copy" data-copy hidden></div>
        <div class="af-two">
          <div class="af-f"><label for="af-name">Frame name</label><input class="af-in" id="af-name" data-f="name" maxlength="140" value="${esc(d.name)}" placeholder="e.g. Modern Oak Wall Frame"></div>
          <div class="af-f"><label>Category</label>${cats.length ? chips("category", d.category, cats.slice(0, 14)) : `<input class="af-in" data-f="category" value="${esc(d.category)}">`}</div>
          <div class="af-f"><label for="af-style">Style</label><select class="af-in" id="af-style" data-f="frame.type">${types.map(([id, n]) => `<option value="${esc(id)}"${d.frame.type === id ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          <div class="af-f"><label>Material &amp; colour</label><div class="af-row"><input class="af-in" data-f="frame.material" value="${esc(d.frame.material)}" placeholder="e.g. Wood" style="flex:1">
            <select class="af-in" data-f="frame.color" style="flex:1">${Object.entries(palette).map(([id, c]) => `<option value="${esc(id)}"${d.frame.color === id ? " selected" : ""}>${esc(c.name || id)}</option>`).join("")}</select></div></div>
          <div class="af-f"><label>Front cover</label>${chips("cover", d.protection.default || "glass", [["glass", "Glass"], ["acrylic", "Acrylic"], ["none", "None"]])}</div>
          <div class="af-f"><label>Customer photos needed</label>${chips("photos", photosNeeded > 3 ? "more" : photosNeeded, [[0, "0 (ready-made)"], [1, "1"], [2, "2"], [3, "3"], ["more", "More…"]])}
            ${photosNeeded > 3 || d._morePhotos ? `<input class="af-in" type="number" min="4" max="12" data-f="personalization.photos" value="${photosNeeded > 3 ? photosNeeded : 4}" style="width:110px;margin-top:8px">` : ""}</div>
          <div class="af-f af-span"><label for="af-desc">Short description</label><textarea class="af-in" id="af-desc" rows="3" data-f="description" maxlength="2000" placeholder="What makes this frame nice, in a sentence or two.">${esc(d.description)}</textarea></div>
        </div></div>
      <div class="af-card"><h3>Sizes and prices</h3><p>One line per size. Width × height in inches.</p>
        <table class="af-tbl"><thead><tr><th>Width (in)</th><th>Height (in)</th><th>Price (₹)</th><th></th></tr></thead><tbody>
        ${(d.sizes || []).map((s, i) => `<tr><td><input class="af-in" type="number" min="1" step="0.01" data-f="sizes.${i}.width" value="${esc(s.width ?? "")}"></td><td><input class="af-in" type="number" min="1" step="0.01" data-f="sizes.${i}.height" value="${esc(s.height ?? "")}"></td><td><input class="af-in" type="number" min="1" step="1" data-f="sizes.${i}.price" value="${esc(s.price ?? "")}" placeholder="e.g. 699"></td><td><button class="af-ic" type="button" data-act="drop-size" data-i="${i}" aria-label="Remove size">✕</button></td></tr>`).join("")}
        </tbody></table>
        <div class="af-row" style="margin-top:10px"><button class="af-btn" type="button" data-act="add-size">＋ Add size</button><span class="af-quick">Quick: ${QUICK.map(([w, h, n]) => `<button type="button" data-act="quick-size" data-w="${w}" data-h="${h}">${n || `${w}×${h}`}</button>`).join(" · ")}</span></div>
        <div class="af-two" style="margin-top:14px"><div class="af-f"><label for="af-disc">Discount (%)</label><input class="af-in" id="af-disc" type="number" min="0" max="90" data-f="pricing.discountPercent" value="${esc(d.pricing.discountPercent || 0)}"></div>
          <div class="af-f"><label for="af-stock">Stock</label><input class="af-in" id="af-stock" type="number" min="0" data-f="availability.stock" value="${esc(d.availability.stock ?? "")}" placeholder="Empty = made to order"></div></div></div>`;
    }

    function stepLayers() {
      const list = d.components || [];
      return `<div class="af-card"><div class="af-row af-between"><h3>Layers (front to back)</h3><button class="af-btn" type="button" data-act="usual-layers">↺ Use the usual layers</button></div>
        <p>What the frame is made of. Customers see this as “Frame Components” on the product page.</p>
        ${list.length ? "" : `<p class="af-empty">No layers yet. Press “Use the usual layers”, or add your own.</p>`}
        ${list
          .map(
            (c, i) => `<div class="af-layer"><span class="af-n">${i + 1}</span>
          <label class="af-lthumb" title="Layer photo (optional)">${c.image ? `<img data-ref="${esc(c.image)}" alt="">` : "📷"}<input type="file" accept="image/jpeg,image/png,image/webp" data-up="layer" data-i="${i}" hidden></label>
          <input class="af-in" data-f="components.${i}.name" value="${esc(c.name)}" placeholder="Layer, e.g. Frame">
          <input class="af-in" data-f="components.${i}.material" value="${esc(c.material || c.description || "")}" placeholder="Detail, e.g. Natural oak, 26 mm">
          <span class="af-row af-nowrap"><button class="af-ic" type="button" data-act="layer-up" data-i="${i}" aria-label="Move up"${i ? "" : " disabled"}>↑</button><button class="af-ic" type="button" data-act="layer-down" data-i="${i}" aria-label="Move down"${i < list.length - 1 ? "" : " disabled"}>↓</button><button class="af-ic" type="button" data-act="layer-drop" data-i="${i}" aria-label="Remove layer">✕</button></span></div>`,
          )
          .join("")}
        <div class="af-row" style="margin-top:12px"><button class="af-btn" type="button" data-act="add-layer">＋ Add layer</button><span class="af-quick">e.g. “Velvet back”, “LED light”, “Name plate”</span></div></div>`;
    }

    function stepCheck() {
      const v = views();
      const price = prices();
      const a = d.frameArt;
      const ready = !issues.length;
      return `<div class="af-three">
        <div class="af-card"><h3 class="af-h4">In the shop list</h3>${v.length ? `<img class="af-cardimg" data-ref="${esc(v[0].thumb || v[0].url)}" alt="">` : `<div class="af-cardimg af-noimg">No photo yet</div>`}
          <p class="af-name">${esc(d.name || "Untitled frame")}</p><p class="af-sub">${price.length ? `from ${money(Math.min(...price))}` : "No price yet"}</p></div>
        <div class="af-card"><h3 class="af-h4">With the customer's photo</h3>${a.front && a.opening && !a.modelOnly ? `<div class="af-wallbg af-big"><canvas data-sample="front" class="af-sample"></canvas></div><p class="af-sub">The product page, the cart and the order show this.</p>` : `<p class="af-sub">${a.modelOnly ? "Only model photos: customers see the photos." : "Add the frame front (step 1) to show this."}</p>`}</div>
        <div class="af-card"><h3 class="af-h4">View on My Wall</h3>${a.front && a.opening && !a.modelOnly ? `<div class="af-wallscene"><canvas data-sample="wall" class="af-sample"></canvas></div>` : `<p class="af-sub">Needs the frame front.</p>`}</div></div>
      <div class="af-card"><h3>${ready ? "Ready to publish" : "Before you publish"}</h3>
        ${ready ? `<ul class="af-list"><li>✓ ${v.length} model photo${v.length === 1 ? "" : "s"}</li><li>${a.front ? "✓ Frame front with the photo space" : a.modelOnly ? "✓ Only model photos" : "– No frame front (optional)"}</li><li>✓ ${(d.sizes || []).length} size${(d.sizes || []).length === 1 ? "" : "s"} with prices</li><li>✓ ${(d.components || []).length} layers in Frame Components</li></ul>`
          : `<ul class="af-issues">${issues.map((i) => `<li><button type="button" data-act="goto" data-step="${STEP_OF[i.step] || 2}">${esc(i.message)} <em>Step ${STEP_OF[i.step] || 2}</em></button></li>`).join("")}</ul>`}
        <p class="af-sub">${admin ? "As FrameX you publish it straight away." : "FrameX checks new frames before they go live (usually within a day)."}</p></div>`;
    }

    function render({ keepScroll = false } = {}) {
      const y = window.scrollY;
      const body = [stepPhotos, stepDetails, stepLayers, stepCheck][step - 1]();
      root.innerHTML = `<div class="af">
        <header class="sd-head"><div><h1 class="sd-title">${found ? "Edit frame" : "Add a frame"}</h1><p class="sd-lead">${["Photos first: they are what customers see.", "The basics. Everything else has a sensible default.", "What the frame is made of, layer by layer.", "Check how customers will see it, then publish."][step - 1]}</p></div>
          <div class="af-row">${!admin && found ? `<a class="af-link" href="#/products/${encodeURIComponent(d.id)}/advanced">Full editor</a>` : ""}<span class="af-saved" data-saved>${d.status ? `Status: ${esc((M().STATUS[d.status] || { label: d.status }).label)}` : ""}</span><button class="af-btn" type="button" data-act="save">Save draft</button></div></header>
        <div class="af-steps" role="tablist">${STEPS.map((t, i) => `<button type="button" role="tab" class="${i + 1 < step ? "ok" : i + 1 === step ? "on" : ""}" data-act="goto" data-step="${i + 1}" aria-selected="${i + 1 === step}"><b>${i + 1 < step ? "✓" : i + 1}</b>${t}</button>`).join("")}</div>
        ${body}
        <div class="af-foot"><button class="af-btn" type="button" data-act="${step === 1 ? "exit" : "back"}">${step === 1 ? "Cancel" : "← " + STEPS[step - 2]}</button>
          ${step < 4 ? `<button class="af-btn af-btn--pri" type="button" data-act="next">Next: ${STEPS[step]} →</button>` : `<span class="af-row"><button class="af-btn" type="button" data-act="save">Save draft</button><button class="af-btn af-btn--pri" type="button" data-act="publish">${admin ? "Publish now" : "Publish frame"}</button></span>`}</div>
      </div>`;
      if (keepScroll) window.scrollTo(0, y);
      $$("img[data-ref]", root).forEach(async (img) => (img.src = await show(img.dataset.ref, /:thumb$/.test(img.dataset.ref))));
      paintSamples();
      wireBox();
    }

    /* ---------------------------------------------------------------- previews with a sample photo */
    let sampleTimer = 0;
    function paintSamples() {
      clearTimeout(sampleTimer);
      sampleTimer = setTimeout(async () => {
        const a = d.frameArt;
        const canvases = $$("canvas[data-sample]", root);
        if (!canvases.length || !a.front || !a.opening || !FrameX.frameArt) return;
        const like = { frameArt: { front: await show(a.front), opening: a.opening, wall: "", modelOnly: false } };
        for (const c of canvases) {
          const made = await FrameX.frameArt.compose(like, SAMPLE, {}, { width: 600 });
          if (!made) continue;
          c.width = made.width;
          c.height = made.height;
          c.getContext("2d").drawImage(made, 0, 0);
        }
      }, 120);
    }

    /* ---------------------------------------------------------------- the photo-space box: drag it or its corners */
    function wireBox() {
      const box = $("[data-open]", root);
      const holder = $("[data-front]", root);
      if (!box || !holder) return;
      let drag = null;
      box.addEventListener("pointerdown", (e) => {
        const r = holder.getBoundingClientRect();
        drag = { id: e.pointerId, h: e.target.dataset.h || "move", x: e.clientX, y: e.clientY, o: Object.assign({}, d.frameArt.opening), W: r.width, H: r.height };
        try {
          box.setPointerCapture(e.pointerId);
        } catch (error) {
          /* synthetic events */
        }
        e.preventDefault();
      });
      box.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = (e.clientX - drag.x) / drag.W;
        const dy = (e.clientY - drag.y) / drag.H;
        const o = Object.assign({}, drag.o);
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        if (drag.h === "move") Object.assign(o, { x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) });
        else {
          let [x0, y0, x1, y1] = [o.x, o.y, o.x + o.w, o.y + o.h];
          if (drag.h.includes("w")) x0 = clamp(x0 + dx, 0, x1 - 0.05);
          if (drag.h.includes("e")) x1 = clamp(x1 + dx, x0 + 0.05, 1);
          if (drag.h.includes("n")) y0 = clamp(y0 + dy, 0, y1 - 0.05);
          if (drag.h.includes("s")) y1 = clamp(y1 + dy, y0 + 0.05, 1);
          Object.assign(o, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        }
        d.frameArt.opening = o;
        Object.assign(box.style, { left: o.x * 100 + "%", top: o.y * 100 + "%", width: o.w * 100 + "%", height: o.h * 100 + "%" });
        dirty = true;
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        paintSamples();
      };
      box.addEventListener("pointerup", end);
      box.addEventListener("pointercancel", end);
    }

    /* ---------------------------------------------------------------- reading the fields */
    function setPath(path, value) {
      const keys = path.split(".");
      let o = d;
      for (let i = 0; i < keys.length - 1; i++) o = o[/^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i]];
      o[keys[keys.length - 1]] = value;
    }
    function fieldValue(el) {
      if (el.type === "checkbox") return el.checked;
      if (el.type === "number") return el.value === "" ? null : Number(el.value);
      return el.value;
    }

    /** What the form shows becomes the product record (the server checks it all again). */
    function finish() {
      const photos = Number(d.personalization.photos) || 0;
      d.productType = photos > 0 ? "photo-frame" : "wall-art";
      d.personalization.photos = photos > 0 ? Math.min(12, photos) : null;
      d.customization = Object.assign({}, d.customization, { photoUpload: false });
      d.views = views().map((v, i) => Object.assign({}, v, { isMain: i === 0, sortOrder: i, type: v.type || "PHOTO", alt: v.alt || `${d.name || "Frame"}, photo ${i + 1}` }));
      d.sizes = (d.sizes || []).map((s) => Object.assign({}, s, { unit: "in", label: s.width > 0 && s.height > 0 ? M().sizeDims({ width: s.width, height: s.height, unit: "in" }) : s.label || "" }));
      const p = prices();
      d.pricing.basePrice = p.length ? Math.min(...p) : d.pricing.basePrice;
      if (d.category) d.categoryIds = [d.category].concat((d.categoryIds || []).filter((c) => c !== d.category));
      d.componentOrder = "own";
      d.components = (d.components || []).filter((c) => c && (c.name || c.material));
      if (d.frameArt.modelOnly) d.frameArt = Object.assign({}, d.frameArt, { modelOnly: true });
      return Object.assign({}, d);
    }
    function check() {
      issues = M().validateForPublish(M().normalize(finish())).issues;
      return issues;
    }

    async function save(status) {
      const body = finish();
      body.status = status;
      try {
        const saved = (await http().put(`${base}/products/${encodeURIComponent(d.id)}`, body)).product;
        d = Object.assign(M().normalize(saved), { frameArt: M().cleanFrameArt(saved.frameArt) });
        dirty = false;
        FrameX.toast.show(status === "published" ? (d.status === "pending_review" ? "Sent. FrameX will check it before it goes live." : "Published. Customers can now find it.") : "Saved as a draft.");
        render({ keepScroll: true });
        return true;
      } catch (error) {
        const list = error.details && error.details.issues;
        if (list && list.length) {
          issues = list;
          step = 4;
          render();
          FrameX.toast.show("Some information is missing. See the list.");
        } else FrameX.toast.show(error.fields ? Object.values(error.fields)[0] : error.message || "That couldn't be saved. Please try again.");
        return false;
      }
    }

    async function uploadFrameArt(file, which, keep) {
      const status = $(`[data-status="${which === "wall" ? "wall" : "front"}"]`, root);
      if (status) status.textContent = "Uploading and removing the background…";
      try {
        const m = (await http().upload(`${base}/media/frame-art?mode=${keep ? "keep" : "auto"}`, file, { name: file.name })).media;
        const said = m.alreadyCut ? "Your PNG is kept as it is." : m.removedBackground ? "Background removed." : "No plain background found: the picture is kept as it is.";
        if (which === "wall") {
          d.frameArt.wall = m.ref;
          d.frameArt.wallOpening = m.opening || d.frameArt.opening;
          note.wall = said;
        } else {
          d.frameArt.front = m.ref;
          d.frameArt.frontSize = { w: m.width, h: m.height };
          d.frameArt.opening = m.opening || { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
          note.front = `${said} ${m.opening ? "Photo space found automatically — check the orange box." : "Couldn't find the photo space: drag the orange box onto it."}`;
        }
        dirty = true;
        render({ keepScroll: true });
      } catch (error) {
        if (status) status.textContent = error.message || "That picture couldn't be used. Please try another one.";
      }
    }

    /* ---------------------------------------------------------------- actions */
    root.onclick = async (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) {
        const v = chip.dataset.v;
        const path = chip.dataset.chip;
        if (path === "category") d.category = v;
        if (path === "cover") d.protection = { options: [{ id: v, priceModifier: 0, description: "" }], default: v };
        if (path === "photos") {
          d._morePhotos = v === "more";
          d.personalization.photos = v === "more" ? Math.max(4, Number(d.personalization.photos) || 4) : Number(v);
        }
        dirty = true;
        return render({ keepScroll: true });
      }
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT") return;
      const act = btn.dataset.act;
      const i = Number(btn.dataset.i);
      if (act === "goto") {
        step = Number(btn.dataset.step) || 1;
        if (step === 4) check();
        return render();
      }
      if (act === "next") {
        step = Math.min(4, step + 1);
        if (step === 3 && !(d.components || []).length) d.components = USUAL(d).map((c) => Object.assign({ id: M().newId("c"), description: "", image: "" }, c));
        if (step === 4) check();
        window.scrollTo(0, 0);
        return render();
      }
      if (act === "back") {
        step = Math.max(1, step - 1);
        window.scrollTo(0, 0);
        return render();
      }
      if (act === "exit") {
        if (dirty && !window.confirm("Leave without saving your changes?")) return;
        return onExit();
      }
      if (act === "save") return save("draft");
      if (act === "publish") {
        if (check().length) return render({ keepScroll: true });
        return save("published");
      }
      if (act === "main") {
        const list = views();
        const [v] = list.splice(i, 1);
        d.views = [v].concat(list);
      }
      if (act === "drop-view") d.views = views().filter((_, k) => k !== i);
      if (act === "drop-front") {
        d.frameArt = Object.assign({}, d.frameArt, { front: "", frontSize: null, opening: null });
        note.front = "";
      }
      if (act === "add-size") d.sizes = (d.sizes || []).concat({ id: M().newId("sz"), label: "", width: null, height: null, unit: "in", price: null });
      if (act === "quick-size") d.sizes = (d.sizes || []).concat({ id: M().newId("sz"), label: "", width: Number(btn.dataset.w), height: Number(btn.dataset.h), unit: "in", price: null });
      if (act === "drop-size") d.sizes = (d.sizes || []).filter((_, k) => k !== i);
      if (act === "usual-layers") d.components = USUAL(d).map((c) => Object.assign({ id: M().newId("c"), description: "", image: "" }, c));
      if (act === "add-layer") d.components = (d.components || []).concat({ id: M().newId("c"), type: "other", name: "", material: "", description: "", image: "" });
      if (act === "layer-drop") d.components = (d.components || []).filter((_, k) => k !== i);
      if (act === "layer-up" || act === "layer-down") {
        const list = (d.components || []).slice();
        const j = act === "layer-up" ? i - 1 : i + 1;
        if (list[j]) [list[i], list[j]] = [list[j], list[i]];
        d.components = list;
      }
      if (act === "copy-from") return copyFrom();
      dirty = true;
      render({ keepScroll: true });
    };

    root.oninput = (e) => {
      const el = e.target.closest("[data-f]");
      if (!el || el.type === "checkbox") return;
      setPath(el.dataset.f, fieldValue(el));
      dirty = true;
    };
    root.onchange = async (e) => {
      const el = e.target;
      if (el.matches("[data-f]") && (el.type === "checkbox" || el.tagName === "SELECT")) {
        setPath(el.dataset.f, fieldValue(el));
        dirty = true;
        return render({ keepScroll: true });
      }
      if (el.matches("[data-act='same-wall']")) {
        if (el.checked) d.frameArt = Object.assign({}, d.frameArt, { wall: "", wallOpening: null });
        else {
          const up = $("[data-wall-up]", root);
          if (up) up.hidden = false;
          return;
        }
        dirty = true;
        return render({ keepScroll: true });
      }
      const up = el.dataset.up;
      if (!up || !el.files || !el.files.length) return;
      const files = Array.from(el.files);
      if (up === "front" || up === "front-keep") return uploadFrameArt(files[0], "front", up === "front-keep");
      if (up === "wall") return uploadFrameArt(files[0], "wall", false);
      const status = $(`[data-status="views"]`, root);
      try {
        if (up === "views") {
          for (const [k, file] of files.slice(0, 8 - views().length).entries()) {
            if (status) status.textContent = `Uploading photo ${k + 1} of ${files.length}…`;
            const r = await media().prepare(file, "view", () => {}, { base });
            d.views = views().concat({ id: M().newId("v"), url: r.url, thumb: r.thumb, type: "PHOTO", alt: "", width: r.width, height: r.height });
          }
        }
        if (up === "layer") {
          const r = await media().prepare(files[0], "material", () => {}, { base });
          d.components[Number(el.dataset.i)].image = r.url;
        }
        dirty = true;
        render({ keepScroll: true });
      } catch (error) {
        if (status) status.textContent = error.message || "That picture couldn't be added.";
        else FrameX.toast.show(error.message || "That picture couldn't be added.");
      }
    };

    /** Copy everything except the name and the pictures from another of the shop's frames. */
    async function copyFrom() {
      const box = $("[data-copy]", root);
      if (!box) return;
      box.hidden = false;
      box.innerHTML = "Loading your frames…";
      try {
        const items = ((await http().get(`${base}/products`)).items || []).filter((x) => x.id !== d.id);
        if (!items.length) return (box.innerHTML = "No other frames to copy from yet.");
        box.innerHTML = `<label class="af-f"><span>Copy the details of</span><select class="af-in" data-copy-pick><option value="">Choose a frame…</option>${items.map((x) => `<option value="${esc(x.id)}">${esc(x.name || "Untitled")}</option>`).join("")}</select></label>`;
        $("[data-copy-pick]", box).addEventListener("change", async (ev) => {
          const id = ev.target.value;
          if (!id) return;
          const src = M().normalize((await http().get(`${base}/products/${encodeURIComponent(id)}`)).product);
          ["category", "categoryIds", "frame", "protection", "pricing", "availability", "personalization", "productType", "description", "print", "back", "included", "care", "componentOrder"].forEach((k) => (d[k] = JSON.parse(JSON.stringify(src[k] ?? d[k]))));
          d.sizes = (src.sizes || []).map((s) => Object.assign({}, s, { id: M().newId("sz") }));
          d.components = (src.components || []).map((c) => Object.assign({}, c, { id: M().newId("c") }));
          dirty = true;
          FrameX.toast.show(`Copied the details of “${src.name}”. The name and photos stay yours.`);
          render({ keepScroll: true });
        });
      } catch (error) {
        box.innerHTML = "Your frames couldn't be loaded.";
      }
    }

    render();
    return { destroy: () => (root.onclick = root.oninput = root.onchange = null) };
  }

  /** The list of frames: "My frames" for a shop, "All frames" for the admin (rows from the server). */
  function listHtml(items, { admin = false } = {}) {
    if (!items.length) return `<div class="sd-empty">${icon("frame")}<strong>No frames yet</strong><span>Add your first frame in 4 easy steps.</span></div>`;
    const status = { published: ["Live", "live"], pending_review: ["Waiting for FrameX", "wait"], draft: ["Draft", "draft"], unpublished: ["Hidden", "draft"] };
    return `<table class="af-listtbl"><thead><tr><th></th><th>Frame</th>${admin ? "<th>Shop</th>" : ""}<th>Sizes &amp; price</th><th>Your-photo preview</th><th>Status</th><th></th></tr></thead><tbody>
      ${items
        .map((x) => {
          const [label, tone] = status[x.status] || [x.status, "draft"];
          const priceText = x.priceFrom ? (x.priceTo && x.priceTo !== x.priceFrom ? `${money(x.priceFrom)}–${money(x.priceTo).replace("₹", "")}` : money(x.priceFrom)) : "—";
          return `<tr data-frame="${esc(x.id)}" data-shop="${esc(x.shopId || "")}"><td>${x.image ? `<img src="${esc(FrameX.http.asset(x.image))}" alt="" loading="lazy">` : ""}</td><td><b>${esc(x.name || "Untitled")}</b></td>${admin ? `<td>${esc(x.shopName || "")}<br><small>${esc(x.shopCode || "")}</small></td>` : ""}
            <td>${x.sizes || 0} size${x.sizes === 1 ? "" : "s"} · ${priceText}</td><td class="${x.hasFront ? "af-good" : "af-miss"}">${x.hasFront ? "✓ Front" : x.modelOnly ? "Model photos only" : "Front missing"}</td>
            <td><span class="af-pill af-pill--${tone}">${esc(label)}</span></td>
            <td><span class="af-row af-nowrap"><button class="af-btn af-btn--sm" type="button" data-row="edit">Edit</button><button class="af-btn af-btn--sm" type="button" data-row="duplicate">⧉ Duplicate</button>${admin && x.status === "pending_review" ? `<button class="af-btn af-btn--sm af-btn--dark" type="button" data-row="approve">Approve</button>` : ""}${admin && x.status === "published" ? `<button class="af-btn af-btn--sm" type="button" data-row="hide">Hide</button>` : ""}${admin && x.status === "unpublished" ? `<button class="af-btn af-btn--sm" type="button" data-row="approve">Show again</button>` : ""}</span></td></tr>`;
        })
        .join("")}</tbody></table>`;
  }

  /** A shop's own record -> a row of the list (the admin's list comes from the server already in this shape). */
  function summary(r) {
    const p = (r.sizes || []).map((s) => Number(s.price) || 0).filter((n) => n > 0);
    const a = r.frameArt || {};
    return { id: r.id, name: r.name, status: r.status, image: r.listingImage || "", sizes: (r.sizes || []).length, priceFrom: p.length ? Math.min(...p) : Number((r.pricing || {}).basePrice) || null, priceTo: p.length ? Math.max(...p) : null, hasFront: Boolean(a.front && a.opening), modelOnly: Boolean(a.modelOnly) };
  }

  /** "Duplicate": a copy of the record as a new draft (same pictures, " (copy)" in the name). */
  async function duplicate(base, id) {
    const src = (await http().get(`${base}/products/${encodeURIComponent(id)}`)).product;
    const copy = M().duplicate(src);
    copy.status = "draft";
    return (await http().put(`${base}/products/${encodeURIComponent(copy.id)}`, copy)).product;
  }

  FrameX.frameEditor = { open, listHtml, summary, duplicate };
})((window.FrameX = window.FrameX || {}));
