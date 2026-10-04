/* ==========================================================================
   Gallery / inspiration page.
   One mosaic of frame-style photos with in-place filters (All + one per
   gallery section) and a full-screen viewer: previous / next, keyboard
   arrows, swipe, and — when the photo is a product image — buttons that open
   that product. Data comes from the gallery list plus the product catalogue.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, focusable } = FrameX.dom;

  let items = []; // every photo: { src, alt, sectionId, sectionTitle, product }
  let shown = []; // photos matching the current filter, in display order
  let filter = "all";
  let current = 0;
  let lastFocus = null;
  let els = {};

  const tile = (
    item,
    i,
  ) => `<button class="gallery-tile${i % 7 === 0 ? " gallery-tile--feature" : ""}" type="button" data-index="${i}" aria-label="Open photo: ${esc(item.alt)}">
      <img src="${esc(item.src)}" alt="" width="640" height="800" loading="lazy" decoding="async">
      <span class="gallery-tile__overlay">
        <span class="gallery-tile__tag">${esc(item.sectionTitle)}</span>
        <span class="gallery-tile__name">${esc(item.product ? item.product.name : "View photo")}</span>
      </span>
      <span class="gallery-tile__zoom">${icon("zoom")}</span>
    </button>`;

  function renderFilters(sections) {
    const chips = [{ id: "all", title: "All", count: items.length }].concat(
      sections.map((s) => ({
        id: s.id,
        title: s.title,
        count: s.items.length,
      })),
    );
    els.nav.innerHTML = chips
      .map(
        (c) =>
          `<button class="chip" type="button" data-gallery-filter="${esc(c.id)}" aria-pressed="${c.id === filter}">${esc(c.title)} <span class="gallery-nav__count">${c.count}</span></button>`,
      )
      .join("");
  }

  function renderGrid() {
    shown =
      filter === "all"
        ? items
        : items.filter((item) => item.sectionId === filter);
    els.root.innerHTML = `<div class="gallery-grid">${shown.map(tile).join("")}</div>`;
    $$("[data-gallery-filter]", els.nav).forEach((chip) =>
      chip.setAttribute(
        "aria-pressed",
        String(chip.dataset.galleryFilter === filter),
      ),
    );
  }

  /* Viewer ------------------------------------------------------------------ */
  function buildViewer() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" hidden>
        <button class="lightbox__close" type="button" data-lightbox-close aria-label="Close photo viewer">${icon("close")}</button>
        <button class="lightbox__nav lightbox__nav--prev" type="button" data-lightbox-step="-1" aria-label="Previous photo">${icon("chev-left")}</button>
        <figure class="lightbox__figure">
          <div class="lightbox__media"><img id="lightbox-img" alt=""></div>
          <figcaption class="lightbox__caption">
            <div>
              <p class="lightbox__tag" id="lightbox-tag"></p>
              <p class="lightbox__text" id="lightbox-text"></p>
            </div>
            <div class="lightbox__actions" id="lightbox-actions"></div>
          </figcaption>
        </figure>
        <button class="lightbox__nav lightbox__nav--next" type="button" data-lightbox-step="1" aria-label="Next photo">${icon("chev-right")}</button>
      </div>`,
    );
    const box = $("#lightbox");
    box.addEventListener("click", (event) => {
      const step = event.target.closest("[data-lightbox-step]");
      if (step) return show(current + Number(step.dataset.lightboxStep));
      // Close on the close button, or a click on the dark area around the photo.
      if (event.target.closest("[data-lightbox-close]") || event.target === box)
        close();
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") show(current - 1);
      if (event.key === "ArrowRight") show(current + 1);
      FrameX.overlay.trapFocus(box, event);
    });
    // Swipe left / right on touch screens
    let startX = null;
    box.addEventListener(
      "pointerdown",
      (event) =>
        (startX = event.pointerType === "touch" ? event.clientX : null),
    );
    box.addEventListener("pointerup", (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    });
    return box;
  }

  function show(index) {
    if (!shown.length) return;
    current = (index + shown.length) % shown.length;
    const item = shown[current];
    const img = $("#lightbox-img");
    img.src = item.src;
    img.alt = item.alt;
    $("#lightbox-tag").textContent =
      `${item.sectionTitle} · ${current + 1} of ${shown.length}`;
    $("#lightbox-text").textContent = item.product
      ? item.product.name
      : item.alt;
    $("#lightbox-actions").innerHTML = item.product
      ? `<a class="btn btn--primary btn--sm" href="${FrameX.qs.productUrl(item.product)}">View Product</a>${
          item.product.frame && item.product.frame.shape !== "arch"
            ? `<a class="btn btn--outline-dark btn--sm" href="studio.html?product=${encodeURIComponent(item.product.id)}">Try With Your Own Image</a>`
            : ""
        }`
      : `<a class="btn btn--outline-dark btn--sm" href="${FrameX.qs.pages.shop}">Shop Frames</a>`;
  }

  function open(index) {
    const box = els.box || (els.box = buildViewer());
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add("is-locked");
    show(index);
    (focusable(box)[0] || box).focus();
  }

  function close() {
    els.box.hidden = true;
    document.body.classList.remove("is-locked");
    if (lastFocus) lastFocus.focus();
  }

  async function init() {
    els = { root: $("#gallery-root"), nav: $("#gallery-nav") };
    if (!els.root) return;
    try {
      const [sections, products] = await Promise.all([
        FrameX.api.getGallery(),
        FrameX.api.getProducts({ limit: 1000 }),
      ]);
      // A photo that is also a product image links to that product.
      const productByImage = new Map(products.items.map((p) => [p.image, p]));
      items = sections.flatMap((s) =>
        s.items.map((item) => ({
          src: item.src,
          alt: item.alt,
          sectionId: s.id,
          sectionTitle: s.title,
          product: productByImage.get(item.src) || null,
        })),
      );

      renderFilters(sections);
      renderGrid();

      els.nav.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-gallery-filter]");
        if (!chip) return;
        filter = chip.dataset.galleryFilter;
        renderGrid();
      });
      els.root.addEventListener("click", (event) => {
        const button = event.target.closest(".gallery-tile");
        if (button) open(Number(button.dataset.index));
      });
      // Never leave a broken image behind
      els.root.addEventListener(
        "error",
        (e) =>
          e.target.closest &&
          e.target.closest(".gallery-tile") &&
          e.target.closest(".gallery-tile").remove(),
        true,
      );
    } catch (error) {
      console.error("Gallery failed to load", error);
      FrameX.templates.showError(
        els.root,
        "The gallery couldn't be loaded.",
        init,
      );
    }
  }

  FrameX.galleryPage = { init };
})((window.FrameX = window.FrameX || {}));
