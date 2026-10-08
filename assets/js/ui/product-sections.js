/* ==========================================================================
   Product page sections. Every renderer reads the product model and returns
   null when the product has nothing to show for it, so a section only appears
   when the shop actually provided that information.

     ComponentBreakdown   components()      exploded frame layers + parts list
     MaterialSection      materials()       frame material + print materials
     QualitySection       quality()         shop-provided, kept apart from FrameX verification
     BackView             back()            back image + hanging / backing details
     ProductViews         views()           every view as a labelled tile
     SpecificationTable   specifications()  grouped rows, only filled fields
     Customization        customization()   what can be personalised + Studio link
     Personalization      personalization() products made from the customer's photo: how many,
                                            that it is printed as provided, that it is private
     Included + care      included()        what the customer receives, and how to look after it
     ShopSection          shop()            the shop that made it
     VideoSection         video()           only when a video was added
     Reviews              reviews()         only when real reviews exist
   ========================================================================== */
(function (FrameX) {
  const { $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const FALLBACK = "assets/img/ui/frame-decor.webp";
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const plus = (n) =>
    n > 0 ? `+${formatPrice(n)}` : n < 0 ? `−${formatPrice(Math.abs(n))}` : "";

  /** <img> for any image reference; "media:" uploads are filled in by hydrate(). */
  const img = (ref, alt, attrs = "") =>
    ref
      ? `<img ${/^media:/.test(ref) ? `data-media-src="${esc(ref)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="` : `src="${esc(ref)}"`} alt="${esc(alt || "")}" loading="lazy" decoding="async" ${attrs}>`
      : "";

  /** Resolve uploaded-file references inside a rendered block. */
  function hydrate(root) {
    $$("[data-media-src]", root).forEach((el) => {
      const ref = el.getAttribute("data-media-src");
      el.removeAttribute("data-media-src");
      const done = (u) => (el.src = u || FALLBACK);
      FrameX.mediaService
        ? FrameX.mediaService
            .resolve(ref, { thumb: el.hasAttribute("data-thumb") })
            .then(done)
        : done("");
    });
    $$("[data-media-bg]", root).forEach((el) => {
      const ref = el.getAttribute("data-media-bg");
      el.removeAttribute("data-media-bg");
      // An absolute address: inside a CSS variable, a relative one would be read from the stylesheet's folder.
      const set = (u) =>
        u &&
        el.style.setProperty(
          "--print",
          `url("${new URL(u, document.baseURI).href}")`,
        );
      FrameX.mediaService && /^media:/.test(ref)
        ? FrameX.mediaService.resolve(ref, { thumb: true }).then(set)
        : set(ref);
    });
  }

  const section = (id, title, body, { lead = "", className = "" } = {}) => ({
    id,
    title,
    html: `<section class="pp-section ${className}" id="pp-${id}" aria-labelledby="pp-${id}-title" data-reveal>
      <div class="pp-section__head"><h2 class="pp-section__title" id="pp-${id}-title">${esc(title)}</h2>${lead ? `<p class="pp-section__lead">${lead}</p>` : ""}</div>
      ${body}</section>`,
  });

  /* ---------------------------------------------------------------- Overview */
  function overview(p) {
    const paras = String(p.description || "")
      .split(/\n{2,}|\r\n\r\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = (p.tags || []).filter(Boolean);
    // A short one-paragraph description is already shown in full beside the gallery.
    if (
      !tags.length &&
      paras.length < 2 &&
      String(p.description || "").trim().length <= 240
    )
      return null;
    return section(
      "overview",
      "Overview",
      `<div class="pp-overview">${paras.map((t) => `<p>${esc(t)}</p>`).join("")}
        ${tags.length ? `<ul class="pp-tags" aria-label="Tags">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</div>`,
    );
  }

  /* ---------------------------------------------------------------- Frame Components */
  const MAT_HEX = { white: "#f7f4ee", cream: "#efe3c8", red: "#7a2020" };
  function layerStyle(c, p) {
    const pal = M().palette();
    if (c.type === "frame")
      return `--c:${(pal[p.frame.color || (p.frame.colors || [])[0]] || {}).hex || "#6b4a33"}`;
    if (c.type === "mat") {
      const id = (p.mat.colors || [])[0];
      const hex = p.mat.legacyColor
        ? MAT_HEX[p.mat.legacyColor]
        : (
            M()
              .matColors()
              .find((m) => m.id === id) || {}
          ).hex;
      return `--c:${hex || "#efe3c8"}`;
    }
    return "";
  }

  function components(p) {
    const list = M().componentsOf(p);
    if (!list.length) return null;
    const main = M().mainView(p);
    const visual = list.length >= 2 && list.some((c) => c.type === "frame");
    const n = list.length;
    const layers = visual
      ? `<div class="pc-visual" aria-hidden="true" style="--n:${n}"><div class="pc-scene">${list
          .map((c, i) => {
            const art =
              c.type === "print" && main
                ? ` data-media-bg="${esc(main.thumb || main.url)}"`
                : "";
            return `<span class="pc-layer pc-layer--${esc(c.type || "other")}" data-layer="${esc(c.id)}" style="--z:${n - 1 - i};${layerStyle(c, p)}"><i${art}></i></span>`;
          })
          .join("")}</div></div>`
      : "";
    const items = list
      .map(
        (c, i) => `<li class="pc-item" data-layer="${esc(c.id)}" tabindex="0">
          <span class="pc-item__num" aria-hidden="true">${i + 1}</span>
          ${c.image ? `<span class="pc-item__img">${img(c.image, "", "data-thumb")}</span>` : ""}
          <div class="pc-item__text"><strong>${esc(c.name)}</strong>${has(c.material) ? `<span>${esc(c.material)}</span>` : ""}${has(c.description) ? `<p>${esc(c.description)}</p>` : ""}</div></li>`,
      )
      .join("");
    return section(
      "components",
      "Frame Components",
      `<div class="pc${visual ? "" : " pc--list"}">${layers}<ol class="pc-list">${items}</ol></div>`,
      {
        lead: visual
          ? "What you're buying, layer by layer, from the front of the frame to the back."
          : "What comes with this product.",
      },
    );
  }

  /** Explode the layers when the section scrolls into view; highlight on hover / focus. */
  function wireComponents(root) {
    const box = root.querySelector(".pc");
    if (!box) return;
    const visual = box.querySelector(".pc-visual");
    if (visual && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach(
            (e) =>
              e.isIntersecting &&
              (box.classList.add("is-exploded"), io.disconnect()),
          ),
        { threshold: 0.35 },
      );
      io.observe(visual);
    } else box.classList.add("is-exploded");
    const set = (id) =>
      $$("[data-layer]", box).forEach((el) =>
        el.classList.toggle("is-active", el.dataset.layer === id),
      );
    box.addEventListener("pointerover", (e) => {
      const item = e.target.closest(".pc-item");
      if (item) set(item.dataset.layer);
    });
    box.addEventListener("pointerleave", () => set(null));
    box.addEventListener(
      "focusin",
      (e) =>
        e.target.closest(".pc-item") &&
        set(e.target.closest(".pc-item").dataset.layer),
    );
    box.addEventListener("focusout", () => set(null));
  }

  /* ---------------------------------------------------------------- Print Materials */
  function materials(p, { shopName } = {}) {
    const prints = (p.print.materials || []).filter((m) => m && has(m.name));
    const f = p.frame || {};
    const cards = [];
    if (has(f.material) && p.frame.type !== "none") {
      const colors = (
        f.colors && f.colors.length ? f.colors : f.color ? [f.color] : []
      ).map(M().colorName);
      const rows = [
        ["Colour", colors.join(", ")],
        ["Finish", f.finish],
        ["Width", f.width ? `${f.width} mm` : ""],
        ["Depth", f.depth ? `${f.depth} mm` : ""],
      ].filter(([, v]) => has(v));
      cards.push(`<article class="pm-card pm-card--frame">
        <span class="pm-card__swatch pm-card__swatch--frame" aria-hidden="true"></span>
        <div class="pm-card__body"><p class="pm-card__kind">Frame material</p><h3 class="pm-card__name">${esc(f.material)}</h3>
          ${rows.length ? `<dl class="pm-card__facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}</div></article>`);
    }
    prints.forEach((m) => {
      const type = M().PRINT_MATERIAL_TYPES.find((t) => t.id === m.type);
      const facts = [
        ["Finish", m.finish],
        ["Thickness", m.thickness],
        ["Quality", m.quality],
      ].filter(([, v]) => has(v));
      cards.push(`<article class="pm-card">
        ${m.image ? `<span class="pm-card__img">${img(m.image, m.name, "data-thumb")}</span>` : `<span class="pm-card__swatch pm-card__swatch--${esc(m.type || "other")}" aria-hidden="true"></span>`}
        <div class="pm-card__body"><p class="pm-card__kind">${esc(type && type.id !== "other" ? type.name : "Print material")}</p><h3 class="pm-card__name">${esc(m.name)}</h3>
          ${has(m.description) ? `<p class="pm-card__desc">${esc(m.description)}</p>` : ""}
          ${facts.length ? `<dl class="pm-card__facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
          ${prints.length > 1 && Number(m.priceModifier) ? `<p class="pm-card__price">${plus(Number(m.priceModifier))}</p>` : ""}</div></article>`);
    });
    if (!prints.length && cards.length < 1) return null;
    if (!prints.length && !p.legacy)
      return section(
        "materials",
        "Materials",
        `<div class="pm-grid">${cards.join("")}</div>`,
      );
    if (!prints.length) return null; // older catalogue items: frame material already shows in the specifications
    return section(
      "materials",
      "Print Materials",
      `<div class="pm-grid">${cards.join("")}</div>`,
      {
        lead:
          prints.length > 1
            ? "Choose the print you prefer above. " +
              (shopName ? `Details provided by ${esc(shopName)}.` : "")
            : shopName
              ? `Details provided by ${esc(shopName)}.`
              : "",
      },
    );
  }

  /* ---------------------------------------------------------------- Quality */
  function quality(p, { shopName } = {}) {
    const items = M().qualityItems(p);
    if (!items.length) return null;
    const v = (p.quality && p.quality.verification) || {};
    const verified = v.status === "framex_verified" && v.verifiedBy; // set only by the FrameX system
    return section(
      "quality",
      "Quality information",
      `<dl class="pq-list">${items.map((q) => `<div class="pq-row"><dt>${esc(q.label)}</dt><dd>${esc(q.value)}</dd></div>`).join("")}</dl>
       <p class="pp-provenance">${icon("store")} Provided by ${esc(shopName || "the shop")}. ${verified ? `<span class="pp-verified">${icon("badge-check")} Checked by FrameX${v.verifiedAt ? " on " + esc(new Date(v.verifiedAt).toLocaleDateString()) : ""}</span>` : "FrameX has not independently checked this information."}</p>`,
    );
  }

  /* ---------------------------------------------------------------- Back view */
  function back(p) {
    const backView = M()
      .sortedViews(p)
      .find((v) => v.type === "BACK");
    const b = p.back || {};
    const rows = [
      ["Backing", b.backing, "package"],
      ["Hanging", b.hanging, "pin"],
      ["Stand", b.stand ? b.standType || "Table stand included" : "", "frame"],
      ["Mounting", b.mounting, "ruler"],
      ["Notes", b.notes, "alert"],
    ].filter(([, v]) => has(v));
    if (!backView && !rows.length) return null;
    return section(
      "back",
      backView ? "Back View" : "Back & hanging",
      `<div class="pb${backView ? "" : " pb--text"}">
        ${backView ? `<button class="pb__media" type="button" data-show-view="${esc(backView.id)}" aria-label="Open the back view in the gallery">${img(backView.thumb || backView.url, backView.alt || "Back of the frame", "data-thumb")}<span class="pb__zoom">${icon("zoom")}</span></button>` : ""}
        ${rows.length ? `<ul class="pb__list">${rows.map(([k, v, ic]) => `<li>${icon(ic)}<div><strong>${esc(k)}</strong><span>${esc(v)}</span></div></li>`).join("")}</ul>` : `<p class="pp-muted">The shop hasn't described the back of this product yet.</p>`}
      </div>`,
      { lead: "How it's backed and how it hangs or stands." },
    );
  }

  /* ---------------------------------------------------------------- Product views */
  function views(p) {
    const list = M().sortedViews(p);
    const has360 =
      p.product360 &&
      (p.product360.frames || []).length >= FrameX.productGallery.MIN_360;
    if (list.length < 2 && !has360) return null;
    return section(
      "views",
      "Product Views",
      `<ul class="pv-grid">${list
        .map((v) => {
          const t = M().viewType(v.type);
          return `<li><button class="pv-tile" type="button" data-show-view="${esc(v.id)}">${img(v.thumb || v.url, v.alt, "data-thumb")}<span class="pv-tile__label">${esc(v.type !== "PHOTO" ? t.label : "Photo")}</span></button></li>`;
        })
        .join(
          "",
        )}${has360 ? `<li><button class="pv-tile pv-tile--360" type="button" data-show-360><b>360°</b><span class="pv-tile__label">360° View</span></button></li>` : ""}</ul>`,
    );
  }

  /* ---------------------------------------------------------------- Specifications */
  function specifications(p, { categories = [] } = {}) {
    const groups = M().specGroups(p, { categories });
    if (!groups.length) return null;
    return section(
      "specs",
      "Specifications",
      `<div class="ps">${groups
        .map(
          (g) =>
            `<div class="ps-group"><h3 class="ps-group__title">${esc(g.title)}</h3><dl class="ps-table">${g.rows.map(([k, v]) => `<div class="ps-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>`,
        )
        .join("")}</div>
      <div class="ps-compare" data-compare hidden>
        <h3 class="ps-group__title">How big is that, really?</h3>
        <div class="ps-compare__row">
          <div class="ps-compare__item"><span class="ps-compare__shape ps-compare__shape--frame" data-compare-frame></span><span data-compare-label></span></div>
          <div class="ps-compare__item"><span class="ps-compare__shape ps-compare__shape--paper" style="width:${(8.27 * 9).toFixed(1)}px;height:${(11.69 * 9).toFixed(1)}px"></span><span>A4 sheet (8.3 × 11.7 in)</span></div>
        </div>
        <p class="pp-muted">Drawn to the same scale. The frame's outer edge adds to these print sizes.</p>
      </div>`,
    );
  }

  /** Update the size comparison for the selected size. */
  function updateCompare(root, p, sizeId) {
    const box = root.querySelector("[data-compare]");
    if (!box) return;
    const size = (p.sizes || []).find((s) => s.id === sizeId);
    const inch = size && M().sizeInches(size);
    box.hidden = !inch;
    if (!inch) return;
    const el = box.querySelector("[data-compare-frame]");
    el.style.width = inch.w * 9 + "px";
    el.style.height = inch.h * 9 + "px";
    box.querySelector("[data-compare-label]").textContent =
      `${size.label || ""}${size.label ? " · " : ""}${M().sizeDims(size)}`;
  }

  /* ---------------------------------------------------------------- Customization */
  function customization(p, { preview } = {}) {
    const c = p.customization || {};
    const on = M().CUSTOMIZATION_OPTIONS.filter((o) => c[o.id]);
    if (!on.length) return null;
    const support = M().studioSupport(p);
    return section(
      "customize",
      "Customization",
      `<ul class="pz-list">${on.map((o) => `<li>${icon("check")}<div><strong>${esc(o.id === "text" && c.textLabel ? `Text: ${c.textLabel}` : o.label)}</strong><span>${esc(o.hint)}</span></div></li>`).join("")}</ul>
       ${
         support.ok
           ? `<div class="pz-cta"><div><strong>Design it in FrameX Studio</strong><span>Upload your photo, pick from this product's options and see a live preview with the final price.</span></div>
             <a class="btn btn--primary" href="${preview ? "#" : studioUrl(p)}" data-customize>${icon("frame")} Customize This Product</a></div>`
           : c.photoUpload
             ? `<p class="pp-muted">Add your photo on this page before you order. It is uploaded with your order.</p>`
             : ""
       }`,
    );
  }

  /* ---------------------------------------------------------------- Personalization (the customer's photo) */
  function personalization(p) {
    const need = M().photoRequirement(p, M().defaultSelection(p));
    if (!need.required) return null;
    // A set whose sizes hold different numbers of photos says so instead of naming one number.
    const counts = Array.from(new Set((p.sizes || []).map((s) => M().photoRequirement(p, { sizeId: s.id }).count))).sort((a, b) => a - b);
    const how = counts.length > 1 ? `${counts.join(" or ")} photos, depending on the size you choose` : need.count === 1 ? "one photo" : `${need.count} photos, one for each frame or space`;
    const text = M().PHOTO_TEXT;
    const rows = [
      [need.count === 1 && counts.length < 2 ? "Made with your own photo" : "Made with your own photos", `You add ${how} on this page before you order. The pictures shown here are samples: your order is made from the ${need.count === 1 && counts.length < 2 ? "photo" : "photos"} you upload.`],
      ["Printed as you provide it", text.quality],
      ["High-resolution photos welcome", "JPG, PNG or WebP. 4K and camera originals are accepted, and the file is kept exactly as you upload it: it is never resized or re-compressed."],
      ["Kept private", "Your photo is used only to make your order. Only you, FrameX and the shop that makes your order can open it."],
    ];
    return section("personalization", "Personalization", `<ul class="pz-list pz-list--wide">${rows.map(([title, body]) => `<li>${icon("check")}<div><strong>${esc(title)}</strong><span>${esc(body)}</span></div></li>`).join("")}</ul>`, { lead: "This product is personalised with your own photo." });
  }

  /* ---------------------------------------------------------------- What's included + care */
  function included(p) {
    const items = (p.included || []).filter(has);
    const care = (p.care || []).filter(has);
    if (!items.length && !care.length) return null;
    const list = (title, ic, rows) => (rows.length ? `<div class="pi-col"><h3 class="pi-col__title">${icon(ic)} ${esc(title)}</h3><ul class="pi-list">${rows.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "");
    return section("included", items.length ? "What's included" : "Care", `<div class="pi">${list("In the box", "package", items)}${list("Care instructions", "shield", care)}</div>`);
  }

  /** photoId: a photo already chosen on the product page (it opens in the Studio too). */
  function studioUrl(p, sel, photoId) {
    const q = new URLSearchParams({ product: p.id });
    if (photoId) q.set("photo", photoId);
    if (sel)
      Object.entries({
        size: sel.sizeId,
        color: sel.colorId,
        print: sel.printMaterialId,
        cover: sel.protection,
      }).forEach(([k, v]) => v && q.set(k, v));
    return `studio.html?${q.toString()}`;
  }

  /* ---------------------------------------------------------------- Shop */
  function shop(p, s) {
    if (!s) return null;
    const { FULFILMENT_METHODS } = FrameX.constants;
    const a = p.availability || {};
    const shopMethods = (s.fulfilment || []).filter(
      (id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled,
    );
    // A product can narrow the shop's own options; null means "same as the shop".
    const methods =
      a.pickup === null || a.pickup === undefined
        ? shopMethods.map((id) => FULFILMENT_METHODS[id].label)
        : [a.pickup && "Pickup", a.delivery && "Delivery"].filter(Boolean);
    const logo = s.logo
      ? `<img src="${esc(s.logo)}" alt="" width="56" height="56">`
      : `<span aria-hidden="true">${esc(
          String(s.name)
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join(""),
        )}</span>`;
    const address = FrameX.shopUtils.formatAddress(s);
    return section(
      "shop",
      "Sold by",
      `<div class="pshop">
        <div class="pshop__logo">${logo}</div>
        <div class="pshop__body">
          <h3 class="pshop__name">${esc(s.name)} ${s.isSample ? `<span class="badge badge--sample">Sample shop</span>` : ""}</h3>
          ${address ? `<p class="pshop__line">${icon("pin")}<span>${esc(address)}</span></p>` : ""}
          ${has(s.description) ? `<p class="pshop__desc">${esc(s.description)}</p>` : ""}
          ${methods.length ? `<ul class="pshop__chips">${methods.map((m) => `<li>${icon(/pickup/i.test(m) ? "store" : "truck")} ${esc(m)}</li>`).join("")}</ul>` : ""}
          ${has(a.leadTime) ? `<p class="pshop__line">${icon("clock")}<span>Ready in ${esc(a.leadTime)}</span></p>` : ""}
          ${has(a.deliveryNotes) ? `<p class="pshop__line">${icon("truck")}<span>${esc(a.deliveryNotes)}</span></p>` : ""}
        </div>
        <div class="pshop__actions"><a class="btn btn--outline btn--sm" href="${FrameX.qs.shopUrl(s.id)}">View shop</a><a class="btn btn--outline btn--sm" href="${FrameX.qs.shopListUrl({ shop: s.catalogRef || s.id })}#collection">More from this shop</a></div>
      </div>`,
    );
  }

  /* ---------------------------------------------------------------- Video */
  function videoEmbed(url) {
    const yt =
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(
        url || "",
      );
    if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
    const vm = /vimeo\.com\/(\d+)/.exec(url || "");
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return null;
  }

  function video(p) {
    const v = (p.media || []).find(
      (m) => m && m.kind === "video" && has(m.url),
    );
    if (!v) return null;
    const embed = videoEmbed(v.url);
    const dur = Number(v.duration)
      ? ` · ${Math.floor(v.duration / 60)}:${String(Math.round(v.duration % 60)).padStart(2, "0")}`
      : "";
    const player = embed
      ? `<div class="pvid__frame"><iframe src="${esc(embed)}" title="${esc(p.name)} video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`
      : `<video class="pvid__video" controls playsinline preload="none" ${v.thumbnail && !/^media:/.test(v.thumbnail) ? `poster="${esc(v.thumbnail)}"` : ""} data-video-src="${esc(v.url)}" ${/^media:/.test(v.thumbnail || "") ? `data-video-poster="${esc(v.thumbnail)}"` : ""}></video>`;
    return section(
      "video",
      "Product video",
      `<div class="pvid">${player}</div>`,
      { lead: `See it from every side${dur}.` },
    );
  }

  /** Video sources load only when the section is near (and uploads are resolved). */
  function wireVideo(root) {
    const el = root.querySelector("[data-video-src]");
    if (!el) return;
    const load = async () => {
      const r = (u) =>
        FrameX.mediaService
          ? FrameX.mediaService.resolve(u)
          : Promise.resolve(u);
      if (el.dataset.videoPoster) el.poster = await r(el.dataset.videoPoster);
      el.src = await r(el.dataset.videoSrc);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (e) => e[0].isIntersecting && (io.disconnect(), load()),
        { rootMargin: "200px" },
      );
      io.observe(el);
    } else load();
  }

  /* ---------------------------------------------------------------- Reviews (real data only) */
  function reviews(p) {
    const list = (p.reviews || []).filter((r) => r && has(r.text));
    if (!list.length) return null;
    return section(
      "reviews",
      "Reviews",
      `<ul class="prev-list">${list
        .map(
          (r) =>
            `<li class="prev"><p class="prev__stars" aria-label="${Number(r.rating) || 0} out of 5">${"★".repeat(Math.round(Number(r.rating) || 0))}</p><p>${esc(r.text)}</p><span>${esc(r.author || "Customer")}${r.date ? " · " + esc(new Date(r.date).toLocaleDateString()) : ""}</span></li>`,
        )
        .join("")}</ul>`,
    );
  }

  /* ---------------------------------------------------------------- Delivery + returns */
  /** p / shop: what this product and its shop say about getting it to the customer. */
  function delivery(p = null, shop = null) {
    const a = (p && p.availability) || {};
    const ready = has(a.leadTime) ? ` This product is usually ready in ${esc(a.leadTime)}.` : "";
    const notes = has(a.deliveryNotes) ? ` ${esc(a.deliveryNotes)}` : "";
    const canWrap = !p || (p.giftWrap !== false && !(shop && shop.giftWrap === false));
    return section(
      "delivery",
      "Pickup, delivery & returns",
      `<div class="pp-accordion">
        <details><summary>Pickup and delivery</summary><p>The delivery charge is shown at checkout before you pay. Delivery timing is confirmed by the shop when it prepares your order.${ready}${notes}</p></details>
        <details><summary>Gift wrapping</summary><p>${canWrap ? "At checkout you are asked whether you would like your order gift wrapped. The charge is shown as its own line in the price before you pay." : "Gift wrapping is not available for this product. If it is in your order, the gift-wrapping option is switched off at checkout."}</p></details>
        <details><summary>Cancellation and returns</summary><p>Orders can be cancelled or changed only before production begins. If a frame arrives damaged or incorrect, contact us within 7 days. See the <a href="faq.html#faq-cancellation">FAQ</a> for details.</p></details>
      </div>`,
    );
  }

  FrameX.productSections = {
    overview,
    components,
    materials,
    quality,
    back,
    views,
    specifications,
    customization,
    personalization,
    included,
    shop,
    video,
    reviews,
    delivery,
    hydrate,
    wireComponents,
    wireVideo,
    updateCompare,
    studioUrl,
    img,
  };
})((window.FrameX = window.FrameX || {}));
