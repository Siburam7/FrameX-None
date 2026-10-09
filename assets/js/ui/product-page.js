/* ==========================================================================
   ProductPage: the customer product page, built entirely from the product
   model (assets/js/services/product-model.js). The SAME renderer powers:
     product.html?slug=<slug>   (or ?id=<id>)  the live page
     product.html?preview=<id>                 a shop's preview of any status
     the dashboard wizard's Preview step       FrameX.productPage.render(..., { preview: true })

   Layout: gallery + product information on top, then only the sections this
   product has data for (overview, components, materials, quality, back view,
   views, specifications, customization, video, shop, reviews).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const S = () => FrameX.productSections;
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

  /* ---------------------------------------------------------------- Info column */
  function stock(p) {
    const a = p.availability || {};
    if (a.status === "out_of_stock") return ["out", "Out of stock"];
    if (a.status === "made_to_order")
      return [
        "in",
        `Made to order${has(a.leadTime) ? ` · ready in ${a.leadTime}` : ""}`,
      ];
    if (
      typeof a.stock === "number" &&
      a.stock > 0 &&
      a.stock <= FrameX.config.lowStockThreshold
    )
      return ["low", `Only ${a.stock} left`];
    return ["in", "In stock"];
  }

  function radioGroup(name, label, options, current, renderOption, extra = "") {
    return `<div class="pp-opt" data-opt="${name}">
      <div class="pp-opt__label" id="pp-opt-${name}"><span>${esc(label)}</span><span class="pp-opt__value" data-opt-value="${name}"></span></div>
      <div class="pp-opt__choices pp-opt__choices--${name}" role="radiogroup" aria-labelledby="pp-opt-${name}">
        ${options.map((o) => `<button class="pp-choice pp-choice--${name}" type="button" role="radio" data-choice="${name}" data-value="${esc(o.id)}" aria-checked="${o.id === current}" tabindex="${o.id === current ? 0 : -1}">${renderOption(o)}</button>`).join("")}
      </div>${extra}</div>`;
  }

  function infoHtml(p, shop, sel, { preview }) {
    const [stockKey, stockText] = stock(p);
    const out = stockKey === "out";
    const pal = M().palette();
    const colors = (
      p.frame.colors && p.frame.colors.length
        ? p.frame.colors
        : p.frame.color
          ? [p.frame.color]
          : []
    ).filter((id) => pal[id]);
    const prints = (p.print.materials || []).filter((m) => m && has(m.name));
    const covers = M().protectionOptions(p);
    const badges = [];
    if (p.pricing.discountPercent > 0 && !out)
      badges.push(
        `<span class="badge badge--discount">${Math.round(p.pricing.discountPercent)}% off</span>`,
      );
    if (p.isNew && !out) badges.push(`<span class="badge">New</span>`);
    const facts = [
      ["Material", p.frame.material],
      ["Colour", colors.length === 1 ? M().colorName(colors[0]) : ""],
      ["Finish", p.frame.finish],
      ["Frame width", p.frame.width ? `${p.frame.width} mm` : ""],
      ["Print", prints.length === 1 ? prints[0].name : ""],
      ["Front", covers.length === 1 ? covers[0].name : ""],
    ].filter(([, v]) => has(v));
    const desc = String(p.description || "").trim();
    const short =
      desc.length > 240
        ? desc.slice(0, desc.lastIndexOf(" ", 220)) + "…"
        : desc;
    const support = M().studioSupport(p);
    // Home Decor: a "your photo" set needs the photo first, so it is ordered from the customiser.
    const decor = p.decor || null;
    const customPhoto = Boolean(decor && decor.customPhoto && FrameX.decorUI);
    // A product made from the customer's own photo: the photo is asked for here, before it can be ordered.
    const need = M().photoRequirement(p, sel);
    const asksPhoto = need.required && !customPhoto;
    const rating =
      p.rating && p.rating.count > 0
        ? `<p class="pp-rating">${icon("star", "icon--fill")} ${Number(p.rating.average).toFixed(1)} <span>(${p.rating.count} ${p.rating.count === 1 ? "review" : "reviews"})</span></p>`
        : "";

    return `<div class="pp-info">
      ${shop ? `<a class="pp-info__shop" href="${FrameX.qs.shopUrl(shop.id)}">${icon("store")} ${esc(shop.name)}</a>` : ""}
      <h1 class="pp-title">${esc(p.name)}</h1>
      ${rating}
      ${badges.length ? `<div class="pp-badges">${badges.join("")}</div>` : ""}
      <div class="pp-price" aria-live="polite"><strong data-price></strong><s data-was hidden></s></div>
      <dl class="pp-breakdown" data-breakdown hidden></dl>
      <p class="pp-stock pp-stock--${stockKey}">${icon(out ? "close" : "check")} ${esc(stockText)}</p>
      ${short ? `<p class="pp-lead">${esc(short)}${short !== desc ? ` <a href="#pp-overview">Read more</a>` : ""}</p>` : ""}
      ${facts.length ? `<dl class="pp-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}

      ${
        (p.sizes || []).length > 1
          ? radioGroup(
              "size",
              "Size",
              p.sizes,
              sel.sizeId,
              (s) =>
                `<strong>${esc(s.label || M().sizeDims(s))}</strong>${M().sizeDims(s) && s.label !== M().sizeDims(s) ? `<span>${esc(M().sizeDims(s))}</span>` : ""}<em data-size-price="${esc(s.id)}"></em>`,
            )
          : (p.sizes || [])[0]
            ? `<p class="pp-single"><span>Size</span><strong>${esc(p.sizes[0].label || M().sizeDims(p.sizes[0]))}${M().sizeDims(p.sizes[0]) && p.sizes[0].label !== M().sizeDims(p.sizes[0]) ? ` · ${esc(M().sizeDims(p.sizes[0]))}` : ""}</strong></p>`
            : ""
      }
      ${
        colors.length > 1
          ? radioGroup(
              "color",
              "Frame colour",
              colors.map((id) => pal[id]),
              sel.colorId,
              (c) =>
                `<span class="pp-swatch pp-swatch--${esc(c.texture || "solid")}" style="--swatch:${esc(c.hex)}"></span><span class="visually-hidden">${esc(c.name)}</span>`,
            )
          : ""
      }
      ${prints.length > 1 ? radioGroup("print", "Print", prints, sel.printMaterialId, (m) => `<strong>${esc(m.name)}</strong>${Number(m.priceModifier) ? `<em>+${formatPrice(Number(m.priceModifier))}</em>` : "<em>Included</em>"}`) : ""}
      ${covers.length > 1 ? radioGroup("cover", "Front cover", covers, sel.protection, (c) => `<strong>${esc(c.name)}</strong>${c.priceModifier ? `<em>+${formatPrice(c.priceModifier)}</em>` : "<em>Included</em>"}`) : ""}

      ${asksPhoto ? photosHtml(need, { preview }) : ""}

      <details class="pp-note"><summary>Add a note for the shop <span>(optional)</span></summary>
        <div class="form-field"><textarea data-note maxlength="200" rows="2" placeholder="e.g. text to include, a size not listed"></textarea></div></details>

      ${
        customPhoto
          ? `<div class="pp-buy"><a class="btn btn--primary" href="${preview ? "#" : FrameX.decorUI.studioUrl(p, sel)}" data-decor-create>${icon("upload")} Customize &amp; Create</a>${preview ? "" : FrameX.templates.wishButton(p)}</div>
             <p class="pp-hint">Upload one photo and see it split across the ${decor.panelCount} frames before you order. The size, frame colour and finish you pick here are carried over.</p>`
          : ""
      }
      <div class="pp-buy"${customPhoto ? " hidden" : ""}>
        <div class="qty" role="group" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity" disabled>${icon("minus")}</button>
          <span class="qty__value" data-qty-value aria-live="polite">1</span>
          <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity" ${out ? "disabled" : ""}>${icon("plus")}</button>
        </div>
        <button class="btn btn--primary" type="button" data-add ${out ? "disabled" : ""}>${out ? "Out of stock" : `${icon("bag")} Add to cart`}</button>
        ${out ? "" : `<button class="btn btn--dark" type="button" data-buy>Buy Now</button>`}
        ${preview ? "" : FrameX.templates.wishButton(p)}
      </div>
      ${
        support.ok && !out
          ? `<a class="btn btn--outline btn--block pp-studio" href="${preview ? "#" : S().studioUrl(p, sel)}" data-customize>${icon("frame")} Customize This Product</a>
           <p class="pp-hint">Want to crop it, add a border or a mat? Design it in FrameX Studio and see your photo in this frame, with only the options this product offers.</p>`
          : ""
      }
      <p class="pp-feedback" data-feedback role="status">${icon("check")}<span></span></p>
    </div>`;
  }

  /* ---------------------------------------------------------------- The customer's photos
     A product that is made from the customer's own photo can't be ordered
     without it. The pictures in the gallery are samples; this block is where
     the customer adds their own: one tile per photo the product needs
     (productModel.photoRequirement). The backend applies the same rule again
     in the cart, in Buy Now and at checkout, so nothing here is the only check. */
  const PHOTO_STORE = "framex.productPhotos.v1"; // which photos were chosen for which product (this tab)

  function photosHtml(need, { preview }) {
    const many = need.count > 1;
    return `<section class="pp-photos" id="your-photo" data-photos aria-labelledby="pp-photos-title">
      <div class="pp-photos__head">
        <h2 class="pp-photos__title" id="pp-photos-title">${icon("image")}<span data-photos-title>${many ? "Your photos" : "Your photo"}</span><span class="badge badge--accent">Required</span></h2>
        <span class="pp-photos__count" data-photos-count aria-live="polite"></span>
      </div>
      <p class="pp-photos__lead" data-photos-lead></p>
      ${
        preview
          ? `<p class="pp-photos__sample">${icon("upload")}<span>Customers add their ${many ? `${need.count} photos` : "photo"} here. They can't order without ${many ? "them" : "it"}.</span></p>`
          : `<div data-uploader></div>
      <div class="pp-fit" data-fit hidden>
        <div class="pp-fit__stage" data-fit-stage><div class="pp-fit__frame" data-fit-frame tabindex="0" role="img" aria-label="How your photo fits this size. Drag to move it."><img alt="" draggable="false"></div></div>
        <div class="pp-fit__side">
          <p class="pp-fit__title">How it fits <strong data-fit-size></strong></p>
          <p class="pp-fit__hint">Drag the photo to choose what stays inside the frame.</p>
          <label class="pp-fit__zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value="1" data-fit-zoom aria-label="Zoom"></label>
          <button class="btn btn--outline btn--sm" type="button" data-fit-reset>Centre</button>
        </div>
      </div>
      <p class="pp-photos__status" data-photos-status role="status" hidden>${icon("upload")}<span></span></p>`
      }
      <p class="pp-photos__error" data-photos-error role="alert" hidden>${icon("alert")}<span></span></p>
      <p class="pp-photos__quality">${icon("check")}<span>${esc(M().PHOTO_TEXT.quality)}</span></p>
      <p class="pp-photos__formats" data-photos-formats>JPG, PNG or WebP. 4K and other high-resolution photos are welcome.</p>
    </section>`;
  }

  /**
   * The behaviour of the photo block. Returns what the page needs from it:
   *   required()         does the product (at the chosen size) need photos?
   *   check()            are all of them added? (shows what is missing)
   *   forOrder(reason)   log in if needed, upload the originals
   *                      -> { ok, photos: { slot: { uploadId, placement } }, thumbnail }
   *   sync()             the chosen size changed
   *   firstPhotoId()     the first photo, to carry into FrameX Studio
   */
  function mountPhotos(root, p, sel, { preview }) {
    const box = $("[data-photos]", root);
    if (!box)
      return { required: () => false, check: () => true, forOrder: async () => ({ ok: true, photos: null, thumbnail: "" }), sync() {}, firstPhotoId: () => "", list: () => [], destroy() {} };
    const svc = FrameX.uploadService;
    const chosen = {}; // slot -> { id, url, width, height, x, y, zoom }
    let need = null;
    let uploader = null;
    let onChange = () => {};

    /* ---- remembered for this tab, so a reload or a login page doesn't lose the choice ---- */
    function readSaved() {
      try {
        return (JSON.parse(sessionStorage.getItem(PHOTO_STORE) || "{}") || {})[p.id] || {};
      } catch (error) {
        return {};
      }
    }
    function save() {
      try {
        const all = JSON.parse(sessionStorage.getItem(PHOTO_STORE) || "{}") || {};
        all[p.id] = Object.fromEntries(Object.entries(chosen).map(([slot, c]) => [slot, { id: c.id, x: c.x, y: c.y, zoom: c.zoom }]));
        if (!Object.keys(all[p.id]).length) delete all[p.id];
        sessionStorage.setItem(PHOTO_STORE, JSON.stringify(all));
      } catch (error) {
        /* storage blocked: the choice lasts for this page view */
      }
    }

    const added = () => need.slots.filter((slot) => chosen[slot]).length;

    function showError(message) {
      const el = $("[data-photos-error]", box);
      el.hidden = !message;
      $("span", el).textContent = message || "";
      box.classList.toggle("has-error", Boolean(message));
    }
    function showStatus(message) {
      const el = $("[data-photos-status]", box);
      if (!el) return;
      el.hidden = !message;
      $("span", el).textContent = message || "";
    }

    function paintHead() {
      const many = need.count > 1;
      $("[data-photos-title]", box).textContent = many ? "Your photos" : "Your photo";
      $("[data-photos-count]", box).textContent = preview ? "" : `${added()} of ${need.count} added`;
      $("[data-photos-lead]", box).textContent = many
        ? `This set is made with ${need.count} of your own photos, one for each frame. The pictures shown above are samples.`
        : "This is made with your own photo. The picture shown above is a sample.";
      box.classList.toggle("is-complete", !preview && added() === need.count);
    }

    /* ---- one photo: how it sits in the chosen size ---- */
    const fit = $("[data-fit]", box);
    function fitBox() {
      const photo = need.count === 1 ? chosen[need.slots[0]] : null;
      const size = (p.sizes || []).find((s) => s.id === sel.sizeId);
      if (!photo || !size || !(size.width > 0) || !(size.height > 0)) return null;
      let [w, h] = [Number(size.width), Number(size.height)];
      // A frame the shop offers both ways round is turned to suit the photo (an arch or a round frame only hangs one way).
      const turns = !["arch", "round"].includes((p.frame || {}).shape);
      const offers = (o) => turns && (p.orientations || []).includes(o);
      const wide = photo.width > photo.height * 1.08;
      const tall = photo.height > photo.width * 1.08;
      if ((wide && w < h && offers("landscape")) || (tall && w > h && offers("portrait"))) [w, h] = [h, w];
      return { w, h, photo, label: `${M().sizeDims({ width: w, height: h, unit: size.unit })}` };
    }
    function paintFit() {
      if (!fit) return;
      const b = fitBox();
      fit.hidden = !b;
      if (!b) return;
      const frame = $("[data-fit-frame]", fit);
      const img = $("img", frame);
      // The opening is drawn in the size's own proportions, as large as the space allows.
      const stage = $("[data-fit-stage]", fit);
      const room = { w: Math.max(60, stage.clientWidth - 12), h: 208 };
      const fitScale = Math.min(room.w / b.w, room.h / b.h);
      frame.style.width = Math.round(b.w * fitScale) + "px";
      frame.style.height = Math.round(b.h * fitScale) + "px";
      frame.style.borderColor = (M().palette()[sel.colorId] || {}).hex || "";
      if (img.getAttribute("src") !== b.photo.url) img.src = b.photo.url;
      $("[data-fit-size]", fit).textContent = b.label;
      $("[data-fit-zoom]", fit).value = b.photo.zoom;
      const W = frame.clientWidth;
      const H = frame.clientHeight;
      if (!W || !H) return;
      // The photo always covers the opening; x / y are the point of the photo at its centre.
      const scale = Math.max(W / b.photo.width, H / b.photo.height) * b.photo.zoom;
      const dw = b.photo.width * scale;
      const dh = b.photo.height * scale;
      const left = Math.min(0, Math.max(W - dw, W / 2 - b.photo.x * dw));
      const top = Math.min(0, Math.max(H - dh, H / 2 - b.photo.y * dh));
      Object.assign(b.photo, { x: (W / 2 - left) / dw, y: (H / 2 - top) / dh });
      Object.assign(img.style, { width: dw + "px", height: dh + "px", transform: `translate(${left}px, ${top}px)` });
      frame._fit = { dw, dh, left, top, W, H };
    }

    function changed() {
      save();
      paintHead();
      showError("");
      paintFit();
      onChange();
    }

    function mountTiles() {
      if (preview) return;
      if (uploader) uploader.destroy();
      uploader = FrameX.photoUploader.mount($("[data-uploader]", box), {
        slots: need.slots,
        getPhoto: (slot) => chosen[slot] || null,
        onPhoto(slot, photo) {
          const old = chosen[slot];
          chosen[slot] = { id: photo.id, url: photo.url, width: photo.width, height: photo.height, x: 0.5, y: 0.5, zoom: 1 };
          if (old && old.id !== photo.id) svc.remove(old.id);
          changed();
        },
        onRemove(slot) {
          const old = chosen[slot];
          delete chosen[slot];
          if (old) svc.remove(old.id);
          changed();
        },
      });
    }

    /** The number of photos can depend on the size (a set of 5 or of 9). */
    function sync() {
      const next = M().photoRequirement(p, sel);
      const same = need && next.count === need.count;
      need = next;
      paintHead();
      if (!same) mountTiles();
      paintFit();
    }

    if (!preview && fit) {
      const frame = $("[data-fit-frame]", fit);
      let drag = null;
      frame.addEventListener("pointerdown", (e) => {
        const b = fitBox();
        if (!b || !frame._fit || e.button > 0) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: frame._fit.left, top: frame._fit.top };
        frame.setPointerCapture(e.pointerId);
        frame.classList.add("is-dragging");
        e.preventDefault();
      });
      frame.addEventListener("pointermove", (e) => {
        const b = fitBox();
        if (!drag || e.pointerId !== drag.id || !b) return;
        const f = frame._fit;
        b.photo.x = (f.W / 2 - (drag.left + e.clientX - drag.x)) / f.dw;
        b.photo.y = (f.H / 2 - (drag.top + e.clientY - drag.y)) / f.dh;
        paintFit();
      });
      const drop = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        frame.classList.remove("is-dragging");
        save();
      };
      frame.addEventListener("pointerup", drop);
      frame.addEventListener("pointercancel", drop);
      // Arrow keys move the photo, + and - zoom, when the preview has focus.
      frame.addEventListener("keydown", (e) => {
        const b = fitBox();
        if (!b) return;
        const step = { ArrowLeft: [0.03, 0], ArrowRight: [-0.03, 0], ArrowUp: [0, 0.03], ArrowDown: [0, -0.03] }[e.key];
        if (step) {
          b.photo.x += step[0];
          b.photo.y += step[1];
        } else if (e.key === "+" || e.key === "=") b.photo.zoom = Math.min(3, b.photo.zoom + 0.1);
        else if (e.key === "-") b.photo.zoom = Math.max(1, b.photo.zoom - 0.1);
        else return;
        e.preventDefault();
        paintFit();
        save();
      });
      $("[data-fit-zoom]", fit).addEventListener("input", (e) => {
        const b = fitBox();
        if (!b) return;
        b.photo.zoom = Number(e.target.value) || 1;
        paintFit();
        save();
      });
      $("[data-fit-reset]", fit).addEventListener("click", () => {
        const b = fitBox();
        if (!b) return;
        Object.assign(b.photo, { x: 0.5, y: 0.5, zoom: 1 });
        paintFit();
        save();
      });
      if ("ResizeObserver" in window) new ResizeObserver(() => paintFit()).observe($("[data-fit-stage]", fit));
    }

    sync();

    // Photos chosen earlier in this tab come back from this browser's storage (only ones that can still be ordered).
    const restored = preview
      ? Promise.resolve()
      : (async () => {
          const saved = readSaved();
          await Promise.all(
            Object.entries(saved).map(async ([slot, s]) => {
              if (!s || !s.id || !(await svc.has(s.id))) return;
              const [url, known] = await Promise.all([svc.getUrl(s.id), svc.info(s.id)]);
              if (!url || !known || chosen[slot]) return;
              chosen[slot] = { id: s.id, url, width: known.width, height: known.height, x: Number(s.x) || 0.5, y: Number(s.y) || 0.5, zoom: Math.min(3, Math.max(1, Number(s.zoom) || 1)) };
            }),
          );
          if (uploader) uploader.refresh();
          paintHead();
          paintFit();
          onChange();
          svc.limits().then(() => {
            const el = $("[data-photos-formats]", box);
            if (el) el.textContent = `JPG, PNG or WebP, up to ${svc.MAX_MB} MB each. 4K and other high-resolution photos are welcome.`;
          });
        })().catch((error) => console.error("Saved photos couldn't be restored", error));

    return {
      restored,
      required: () => need.required,
      set onChange(fn) {
        onChange = fn;
      },
      sync,
      firstPhotoId: () => (need.count === 1 && chosen[need.slots[0]] ? chosen[need.slots[0]].id : ""),
      /** The photos added so far and where each sits in the opening: what "View on My Wall" shows. */
      list: () => need.slots.filter((slot) => chosen[slot]).map((slot) => Object.assign({ slot }, chosen[slot])),
      /** Every photo added? If not, say so in the customer's words and point at the empty tile. */
      check() {
        if (!need.required) return true;
        const missing = need.slots.filter((slot) => !chosen[slot]);
        if (!missing.length) return true;
        showError(M().photoProblem(need.count, added()));
        if (uploader) uploader.showMissing(missing, need.count > 1 ? "This photo is still needed." : "Add your photo here.");
        else box.scrollIntoView({ block: "center" });
        return false;
      },
      /** Log in if needed and send the originals. The preview copy is never what gets uploaded. */
      async forOrder(reason) {
        if (!need.required) return { ok: true, photos: null, thumbnail: "" };
        const many = need.count > 1;
        showError("");
        const result = await svc.forOrder({
          reason,
          itemName: p.name,
          photos: Object.fromEntries(need.slots.map((slot) => [slot, chosen[slot].id])),
          onProgress: (percent) => showStatus(percent < 100 ? `Uploading your ${many ? "photos" : "photo"}… ${percent}%` : ""),
        });
        showStatus("");
        if (uploader) uploader.refresh();
        if (!result.ok) {
          if (!result.cancelled) showError(result.message);
          return result;
        }
        const placed = Boolean(fitBox());
        return {
          ok: true,
          photos: Object.fromEntries(need.slots.map((slot) => [slot, { uploadId: result.uploadIds[slot], placement: placed ? { x: chosen[slot].x, y: chosen[slot].y, zoom: chosen[slot].zoom } : null }])),
          thumbnail: await svc.thumbnail(chosen[need.slots[0]].id),
        };
      },
      /** The server refused the photos after all (e.g. one was removed elsewhere): say why, here. */
      refused: (message) => showError(message),
      destroy() {
        if (uploader) uploader.destroy();
      },
    };
  }

  /* ---------------------------------------------------------------- Page */
  /**
   * Render a product page into `root`. Used by the live page and the shop preview.
   * opts: { preview, categories }
   */
  function render(
    root,
    product,
    shop,
    { preview = false, categories = [] } = {},
  ) {
    const p = M().normalize(product);
    const sel = Object.assign(M().defaultSelection(p), { qty: 1 });
    const ctx = { shopName: shop ? shop.name : "", categories, preview };
    const sections = [
      S().overview(p),
      S().components(p),
      S().materials(p, ctx),
      S().quality(p, ctx),
      S().back(p),
      S().views(p),
      S().specifications(p, ctx),
      S().customization(p, ctx),
      S().personalization(p),
      S().included(p),
      S().video(p),
      S().shop(p, shop),
      S().reviews(p),
      S().delivery(p, shop),
    ].filter(Boolean);
    const navItems = sections.filter((s) => s.id !== "delivery");

    root.innerHTML = `<div class="pp${preview ? " pp--preview" : ""}" data-product-page>
      <div class="pp-top">
        <div class="pp-media"><div data-gallery></div></div>
        ${infoHtml(p, shop, sel, { preview })}
      </div>
      ${navItems.length > 1 ? `<nav class="pp-nav" aria-label="Product sections"><ul>${navItems.map((s) => `<li><a href="#pp-${s.id}" data-nav="${s.id}">${esc(s.title)}</a></li>`).join("")}</ul></nav>` : ""}
      <div class="pp-sections">${sections.map((s) => s.html).join("")}</div>
      ${preview || (p.decor && p.decor.customPhoto && FrameX.decorUI) ? "" : `<div class="pp-buybar" data-buybar aria-hidden="true"><div><strong data-price></strong><span>${esc(p.name)}</span></div><button class="btn btn--primary btn--sm" type="button" data-add tabindex="-1" ${stock(p)[0] === "out" ? "disabled" : ""}>Add to cart</button>${stock(p)[0] === "out" ? "" : `<button class="btn btn--dark btn--sm" type="button" data-buy tabindex="-1">Buy Now</button>`}</div>`}
    </div>`;

    // Reviews come from the backend, written by customers whose order of this product was delivered.
    if (!preview && FrameX.http && FrameX.http.enabled() && !$("#pp-reviews", root))
      FrameX.http
        .get("/reviews", { targetType: "PRODUCT", targetId: p.id, limit: 10 })
        .then((r) => {
          if (!r.items.length || $("#pp-reviews", root)) return;
          const made = S().reviews({ reviews: r.items.map((x) => ({ rating: x.rating, text: x.body || `Rated ${x.rating} out of 5.`, author: x.author })) });
          const before = $("#pp-delivery", root);
          if (made && before) before.insertAdjacentHTML("beforebegin", made.html);
          else if (made) $(".pp-sections", root).insertAdjacentHTML("beforeend", made.html);
        })
        .catch(() => {});

    const gallery = FrameX.productGallery.mount($("[data-gallery]", root), {
      name: p.name,
      views: M().sortedViews(p),
      product360: p.product360,
    });

    /* ---- the customer's own photos (products that are made from them) ---- */
    const photos = mountPhotos(root, p, sel, { preview });
    const studioLinks = () =>
      $$("[data-customize]", root).forEach(
        (a) => !preview && (a.href = S().studioUrl(p, sel, photos.firstPhotoId())),
      );
    photos.onChange = studioLinks; // a photo chosen here opens in FrameX Studio too

    /* ---- "View on My Wall": this product, as chosen here, on the customer's own wall through their camera.
       Only for products that can be shown (productModel.liveDemoSupport) and only where a camera can open;
       the button reads the choice when it is pressed and changes nothing on this page. ---- */
    const wall = !preview && FrameX.liveDemo ? M().liveDemoSupport(p) : { ok: false };
    if (wall.ok && wall.kind !== "panels" && $(".pg-stage", root))
      FrameX.liveDemo.mount($(".pg-stage", root), {
        context: { productId: p.id, page: "product" },
        getSpec: () =>
          wall.kind === "decor"
            ? { kind: "decor", product: p, selection: { sizeId: sel.sizeId, colorId: sel.colorId, printMaterialId: sel.printMaterialId } }
            : { kind: "product", product: p, selection: { sizeId: sel.sizeId, colorId: sel.colorId, printMaterialId: sel.printMaterialId, protection: sel.protection }, photos: photos.list() },
      });

    /* ---- price + options ---- */
    function refresh() {
      photos.sync(); // a set's size can change how many photos it needs
      const q = M().quote(p, sel);
      $$("[data-price]", root).forEach(
        (el) => (el.textContent = formatPrice(q.unit * sel.qty)),
      );
      const was = $("[data-was]", root);
      was.hidden = !q.discountPercent;
      was.textContent = q.discountPercent
        ? formatPrice(
            (q.listPrice + q.lines.slice(1).reduce((s, l) => s + l.amount, 0)) *
              sel.qty,
          )
        : "";
      const bd = $("[data-breakdown]", root);
      bd.hidden = q.lines.length < 2 && sel.qty < 2;
      bd.innerHTML =
        q.lines
          .map(
            (l) =>
              `<div><dt>${esc(l.key === "base" ? l.detail || "Frame" : l.label + " · " + l.detail)}</dt><dd>${formatPrice(l.amount)}</dd></div>`,
          )
          .join("") +
        (sel.qty > 1
          ? `<div><dt>× ${sel.qty}</dt><dd>${formatPrice(q.unit * sel.qty)}</dd></div>`
          : "");
      $$("[data-size-price]", root).forEach(
        (el) =>
          (el.textContent = formatPrice(
            M().quote(
              p,
              Object.assign({}, sel, { sizeId: el.dataset.sizePrice }),
            ).lines[0].amount,
          )),
      );
      const values = {
        size: (() => {
          const s = (p.sizes || []).find((x) => x.id === sel.sizeId);
          return s ? s.label || M().sizeDims(s) : "";
        })(),
        color: sel.colorId ? M().colorName(sel.colorId) : "",
        print:
          (
            (p.print.materials || []).find(
              (m) => m.id === sel.printMaterialId,
            ) || {}
          ).name || "",
        cover:
          (
            M()
              .protectionOptions(p)
              .find((c) => c.id === sel.protection) || {}
          ).name || "",
      };
      $$("[data-opt-value]", root).forEach(
        (el) => (el.textContent = values[el.dataset.optValue] || ""),
      );
      studioLinks();
      $$("[data-decor-create]", root).forEach(
        (a) => !preview && (a.href = FrameX.decorUI.studioUrl(p, sel)),
      );
      S().updateCompare(root, p, sel.sizeId);
    }

    const KEYS = {
      size: "sizeId",
      color: "colorId",
      print: "printMaterialId",
      cover: "protection",
    };
    root.addEventListener("click", (e) => {
      const choice = e.target.closest("[data-choice]");
      if (choice) {
        sel[KEYS[choice.dataset.choice]] = choice.dataset.value;
        $$(`[data-choice="${choice.dataset.choice}"]`, root).forEach((b) => {
          b.setAttribute("aria-checked", String(b === choice));
          b.tabIndex = b === choice ? 0 : -1;
        });
        refresh();
        return;
      }
      const qtyBtn = e.target.closest("[data-qty]");
      if (qtyBtn) {
        const max = Math.min(
          FrameX.cart.MAX_QTY,
          typeof p.availability.stock === "number" && p.availability.stock > 0
            ? p.availability.stock
            : FrameX.cart.MAX_QTY,
        );
        sel.qty = Math.min(
          Math.max(sel.qty + Number(qtyBtn.dataset.qty), 1),
          max,
        );
        $("[data-qty-value]", root).textContent = sel.qty;
        $('[data-qty="-1"]', root).disabled = sel.qty <= 1;
        $('[data-qty="1"]', root).disabled = sel.qty >= max;
        refresh();
        return;
      }
      if (e.target.closest("[data-add]")) return addToCart();
      if (e.target.closest("[data-buy]")) return buyNow();
      const custom = e.target.closest("[data-customize]");
      if (custom && preview) {
        e.preventDefault();
        FrameX.toast.show(
          "Preview: customers will open FrameX Studio from here.",
        );
        return;
      }
      const viewBtn = e.target.closest("[data-show-view]");
      if (viewBtn) {
        gallery.showView(viewBtn.dataset.showView);
        $(".pp-media", root).scrollIntoView({
          behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
        return;
      }
      if (e.target.closest("[data-show-360]") && gallery.open360) {
        gallery.open360();
        $(".pp-media", root).scrollIntoView({
          behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
      }
    });
    // Arrow keys move between options inside a radio group.
    root.addEventListener("keydown", (e) => {
      const group = e.target.closest("[role=radiogroup]");
      if (
        !group ||
        !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)
      )
        return;
      e.preventDefault();
      const items = $$("[role=radio]", group);
      const i = items.indexOf(document.activeElement);
      const next =
        items[
          (i +
            (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) +
            items.length) %
            items.length
        ];
      next.focus();
      next.click();
    });

    /* The page sends what was chosen (ids and a quantity). The backend checks
       it against the catalogue, prices it and answers with the cart line.
       A visitor who isn't logged in gets the login dialog first; their choice
       stays on the page and is added as soon as they are in. */
    const chosen = () => ({
      productId: p.id,
      quantity: sel.qty,
      selection: {
        sizeId: sel.sizeId,
        colorId: sel.colorId,
        printMaterialId: sel.printMaterialId,
        protection: sel.protection,
      },
      note: ($("[data-note]", root).value || "").trim(),
    });

    /* "Buy Now": the same choice goes straight to checkout, for this item only.
       The cart is not changed. A visitor who isn't logged in logs in first. */
    let adding = false;
    const hold = (selector, on) =>
      $$(selector, root).forEach((b) =>
        on ? b.setAttribute("aria-busy", "true") : b.removeAttribute("aria-busy"),
      );

    /* A product made from the customer's photo: every photo has to be added
       first. Then the visitor logs in (if needed) and the ORIGINAL files are
       uploaded; the order line carries their ids. The backend refuses the line
       without them, whatever this page does. */
    async function withPhotos(reason, item) {
      if (!photos.required()) return item;
      if (!photos.check()) return null;
      const sent = await photos.forOrder(reason);
      if (!sent.ok) return null;
      return Object.assign(item, { photos: sent.photos, thumbnail: sent.thumbnail });
    }

    async function buyNow() {
      if (adding || stock(p)[0] === "out") return;
      if (preview) {
        FrameX.toast.show(
          "Preview: customers will order this product directly here.",
        );
        return;
      }
      adding = true;
      hold("[data-buy]", true);
      const item = await withPhotos("buy", chosen());
      adding = false;
      hold("[data-buy]", false);
      if (item) FrameX.buyNow.start({ name: p.name, item });
    }

    async function addToCart() {
      if (adding || stock(p)[0] === "out") return;
      if (preview) {
        FrameX.toast.show(
          "Preview: customers will add this product to their cart here.",
        );
        return;
      }
      const qty = sel.qty;
      adding = true;
      hold("[data-add]", true);
      const item = await withPhotos("add", chosen());
      const result = item
        ? await FrameX.cart.add(Object.assign({ name: p.name }, item))
        : { ok: false, cancelled: true };
      adding = false;
      hold("[data-add]", false);
      const box = $("[data-feedback]", root);
      if (!result.ok) {
        box.classList.remove("is-visible");
        // The server's own words about the photos belong next to the photos.
        if (result.code === "PHOTOS_REQUIRED") photos.refused(result.message);
        else FrameX.cart.announce(result);
        return;
      }
      const size = result.item && result.item.size;
      $("span", box).textContent =
        `${qty} × ${p.name}${size ? ` (${size})` : ""} added to your cart.`;
      box.classList.add("is-visible");
      FrameX.cart.announce(result, "Added to cart.");
    }

    /* ---- behaviour: sections, scroll spy, mobile buy bar ---- */
    S().hydrate(root);
    S().wireComponents(root);
    S().wireVideo(root);
    refresh();
    FrameX.reveal.observe(root);

    const io = [];
    if ("IntersectionObserver" in window) {
      const links = $$("[data-nav]", root);
      if (links.length) {
        const spy = new IntersectionObserver(
          (entries) =>
            entries.forEach(
              (en) =>
                en.isIntersecting &&
                links.forEach((a) =>
                  a.setAttribute(
                    "aria-current",
                    String(a.dataset.nav === en.target.id.replace("pp-", "")),
                  ),
                ),
            ),
          { rootMargin: "-40% 0px -55% 0px" },
        );
        $$(".pp-section", root).forEach((s) => spy.observe(s));
        io.push(spy);
      }
      const bar = $("[data-buybar]", root);
      const main = $(".pp-buy [data-add]", root);
      if (bar && main) {
        const watch = new IntersectionObserver(([en]) => {
          const show = !en.isIntersecting && en.boundingClientRect.top < 0;
          bar.classList.toggle("is-visible", show);
          bar.setAttribute("aria-hidden", String(!show));
          $$("button", bar).forEach((b) => (b.tabIndex = show ? 0 : -1));
        });
        watch.observe(main);
        io.push(watch);
      }
    }

    return {
      product: p,
      gallery,
      destroy() {
        io.forEach((o) => o.disconnect());
        gallery.destroy();
        photos.destroy();
        root.innerHTML = "";
      },
    };
  }

  /* ---------------------------------------------------------------- SEO */
  function setMeta(selector, attr, key, value) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(
        selector.startsWith("link") ? "link" : "meta",
      );
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute(selector.startsWith("link") ? "href" : "content", value);
  }

  function applySeo(p, shop, categories) {
    const cat = (categories.find((c) => c.id === p.category) || {}).name;
    const title =
      (p.seo && p.seo.title) ||
      `${p.name}${shop ? ` by ${shop.name}` : ""} — FrameX`;
    const desc = (
      (p.seo && p.seo.description) ||
      p.description ||
      `${p.name}${cat ? `, ${cat.toLowerCase()}` : ""}${shop ? ` from ${shop.name}` : ""} on FrameX.`
    ).slice(0, 160);
    const url = new URL(
      `product.html?slug=${encodeURIComponent(p.slug || p.id)}`,
      location.href,
    ).href;
    const main = M().mainView(p);
    const image =
      main && !/^media:/.test(main.url)
        ? new URL(main.url, location.href).href
        : "";
    document.title = title;
    setMeta('meta[name="description"]', "name", "description", desc);
    setMeta('link[rel="canonical"]', "rel", "canonical", url);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta(
      'meta[property="og:description"]',
      "property",
      "og:description",
      desc,
    );
    setMeta('meta[property="og:type"]', "property", "og:type", "product");
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    if (image)
      setMeta('meta[property="og:image"]', "property", "og:image", image);
    // Structured data with only real fields (no invented ratings or brands).
    const q = M().quote(p, M().defaultSelection(p));
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: desc,
      sku: p.id,
      url,
      category: cat || undefined,
      image: image || undefined,
      material: p.frame.material || undefined,
      offers: {
        "@type": "Offer",
        price: q.unit,
        priceCurrency: q.currency,
        availability:
          p.availability.status === "out_of_stock"
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        seller: shop ? { "@type": "Organization", name: shop.name } : undefined,
      },
    };
    if (p.rating && p.rating.count > 0)
      ld.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: p.rating.average,
        reviewCount: p.rating.count,
      };
    let script = document.getElementById("pp-jsonld");
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "pp-jsonld";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(ld);
  }

  /* ---------------------------------------------------------------- Live page */
  function notFound(root, message) {
    document.title = "Frame not found — FrameX";
    root.innerHTML = `<div class="not-found">${icon("frame")}<h1 class="section-title">Frame not found</h1><p class="section-lead">${esc(message)}</p>
      <a class="btn btn--dark" href="shop.html">Browse all frames</a></div>`;
  }

  async function loadRelated(p) {
    const box = $("#related-grid");
    if (!box) return;
    $("#related-section").hidden = false;
    try {
      const wallArt = Boolean(p.decor && FrameX.decorUI);
      const { items } = await FrameX.api.getProducts({
        category: wallArt ? "hd-" + p.decor.collection : p.category,
        limit: wallArt ? 60 : 12,
      });
      const related = items
        .filter((x) => x.id !== p.id && (!wallArt || !x.decor.customPhoto))
        .sort((a, b) => (b.shopId === p.shopId) - (a.shopId === p.shopId))
        .slice(0, 4);
      if (wallArt) FrameX.decorUI.wire();
      box.innerHTML = related.length
        ? related.map(wallArt ? FrameX.decorUI.card : FrameX.templates.productCard).join("")
        : `<div class="state-message"><strong>No related frames yet</strong><a class="btn btn--outline btn--sm" href="shop.html">Browse all frames</a></div>`;
    } catch (error) {
      console.error("Related products failed", error);
      FrameX.templates.showError(
        box,
        "Related frames couldn't be loaded.",
        () => loadRelated(p),
      );
    }
  }

  async function init() {
    const root = $("#pdp-root");
    if (!root) return;
    const q = FrameX.qs.param;
    const previewId = q("preview");
    const ref = q("slug") || q("id");
    if (!ref && !previewId) return notFound(root, "No product was selected.");
    root.innerHTML = `<div class="pp-top"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton" style="min-height:420px"></div></div>`;
    let product, shop, categories;
    try {
      product = previewId
        ? await FrameX.productService.getForEditing(previewId)
        : await FrameX.productService.get(ref);
      if (!product)
        return notFound(
          root,
          "That frame doesn't exist or is no longer available.",
        );
      [shop, categories] = await Promise.all([
        FrameX.api.getShop(product.shopId),
        FrameX.api.getCategories(),
      ]);
    } catch (error) {
      console.error("Product failed to load", error);
      return FrameX.templates.showError(
        root,
        "This frame couldn't be loaded.",
        init,
      );
    }

    // For the visitor statistics (sent only if the visitor allowed them): which product was looked at.
    if (!previewId && FrameX.analytics)
      FrameX.analytics.track("view_item", {
        itemType: "product",
        itemId: product.id,
        itemName: product.name,
        category: (product.categoryIds || [])[0] || "",
        value: (product.pricing || {}).basePrice,
      });

    // Older links asked for the in-page photo preview; that lives in FrameX Studio now.
    if (!previewId && q("mode") === "custom" && M().studioSupport(product).ok) {
      location.replace(S().studioUrl(product));
      return;
    }
    // Readable, shareable URL: product.html?slug=classic-walnut-photo-frame
    if (!previewId && product.slug && q("slug") !== product.slug)
      history.replaceState(
        null,
        "",
        `product.html?slug=${encodeURIComponent(product.slug)}`,
      );

    $("#pdp-crumb-name").textContent = product.name;
    if (product.decor && FrameX.decorUI) {
      const ui = FrameX.decorUI;
      const shopCrumb = $('.page-banner__crumbs a[href="shop.html"]');
      if (shopCrumb) {
        shopCrumb.href = ui.PAGE;
        shopCrumb.textContent = "Home Decor";
        shopCrumb.insertAdjacentHTML(
          "afterend",
          ` <span aria-hidden="true">/</span> <a href="${ui.collectionUrl(product.decor.collection)}">${esc(ui.collectionName(product.decor.collection))}</a>`,
        );
      }
      $$(".primary-nav__list a").forEach((a) =>
        a.getAttribute("href") === ui.PAGE
          ? a.setAttribute("aria-current", "page")
          : a.removeAttribute("aria-current"),
      );
      const more = $("#related-section .section-head a");
      if (more) {
        more.href = ui.collectionUrl(product.decor.collection);
        more.firstChild.textContent = `More ${ui.collectionName(product.decor.collection)} `;
      }
    }
    if (previewId) {
      root.insertAdjacentHTML(
        "beforebegin",
        `<div class="pp-preview-banner" role="status">${icon("alert")}<span><strong>Preview</strong> · ${esc((M().STATUS[product.status] || {}).label || product.status)}. ${product.status === "published" ? "This is how customers see it." : "Customers can't see this product until it's published."}</span><a class="btn btn--outline btn--sm" href="shop-dashboard.html#/products/${encodeURIComponent(product.id)}/edit">Back to editing</a></div>`,
      );
      document.title = `Preview: ${product.name} — FrameX`;
    } else applySeo(product, shop, categories);

    render(root, product, shop, { preview: Boolean(previewId), categories });
    // A card's "Add Your Photo" opens the page at the photo step (it exists only now, so the browser couldn't jump to it).
    if (location.hash === "#your-photo") {
      const step = $("#your-photo", root);
      if (step) step.scrollIntoView({ block: "center" });
    }
    if (!previewId) loadRelated(product);
  }

  FrameX.productPage = { init, render };
})((window.FrameX = window.FrameX || {}));
