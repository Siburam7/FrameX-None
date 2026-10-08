/* ==========================================================================
   ProductGallery: large image + labelled thumbnails, previous / next,
   swipe, click-to-zoom, fullscreen and an optional 360° view.

     FrameX.productGallery.mount(el, { name, views, product360 })
       -> { goTo(index), showView(viewId), destroy() }

   views come from productModel.sortedViews(): only the views a product has
   are shown (no empty placeholders). Only the selected large image is
   loaded; thumbnails are lazy; 360° frames load when the 360° view opens.
   "media:" references (shop uploads) are resolved by the media service.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, prefersReducedMotion } = FrameX.dom;
  const MIN_360 = 8;
  const FALLBACK = "assets/img/ui/frame-decor.webp";

  const resolve = (url, opts) =>
    FrameX.mediaService
      ? FrameX.mediaService.resolve(url, opts)
      : Promise.resolve(url);
  const typeOf = (v) =>
    FrameX.productModel
      ? FrameX.productModel.viewType(v.type)
      : { id: v.type, label: v.type, short: v.type };
  const labelOf = (v) => (v.type && v.type !== "PHOTO" ? typeOf(v).label : "");

  function mount(
    root,
    {
      name = "Product",
      views = [],
      product360 = null,
      lightbox = false,
      startIndex = 0,
      onClose = null,
    } = {},
  ) {
    const frames = (product360 && product360.frames) || [];
    const has360 = frames.length >= MIN_360;
    const items = views.map((v, i) => Object.assign({ index: i }, v));
    let index = Math.min(
      Math.max(0, startIndex),
      Math.max(0, items.length - 1),
    );
    let token = 0;
    let zoomed = false;
    let mode = "photos"; // "photos" | "360"
    const cleanups = [];

    root.innerHTML = `<div class="pg${lightbox ? " pg--lightbox" : ""}">
      <div class="pg-stage" tabindex="0" role="region" aria-roledescription="carousel" aria-label="${esc(name)} images">
        <div class="pg-stage__frame" data-frame></div>
        <div class="pg-360" data-360 hidden>
          <img class="pg-360__img" alt="${esc(name)}, 360° view" draggable="false">
          <p class="pg-360__status" data-360-status role="status"></p>
          <div class="pg-360__bar">
            <button class="pg-btn" type="button" data-360-step="-1" aria-label="Rotate left">${icon("chev-left")}</button>
            <span class="pg-360__hint">${icon("hand")} Drag to rotate</span>
            <button class="pg-btn" type="button" data-360-step="1" aria-label="Rotate right">${icon("chev-right")}</button>
          </div>
        </div>
        <p class="pg-tag" aria-live="polite"><span data-label></span><span class="pg-tag__count" data-count></span></p>
        ${
          items.length > 1
            ? `<button class="pg-nav pg-nav--prev" type="button" data-step="-1" aria-label="Previous image">${icon("chev-left")}</button>
        <button class="pg-nav pg-nav--next" type="button" data-step="1" aria-label="Next image">${icon("chev-right")}</button>`
            : ""
        }
        <div class="pg-tools">
          <button class="pg-btn" type="button" data-zoom aria-pressed="false" aria-label="Zoom in">${icon("zoom")}</button>
          ${lightbox ? `<button class="pg-btn" type="button" data-close aria-label="Close fullscreen">${icon("close")}</button>` : `<button class="pg-btn" type="button" data-full aria-label="View fullscreen">${icon("frame")}</button>`}
        </div>
        <span class="pg-spinner" aria-hidden="true"></span>
      </div>
      ${
        items.length > 1 || has360
          ? `<div class="pg-thumbs" role="tablist" aria-label="Product views">
        ${items
          .map(
            (
              v,
            ) => `<button class="pg-thumb" type="button" role="tab" data-thumb="${v.index}" aria-selected="false" aria-label="${esc(labelOf(v) || "Photo " + (v.index + 1))}">
            <span class="pg-thumb__img"><img alt="" loading="lazy" decoding="async" data-thumb-src="${esc(v.thumb || v.url)}"></span>
            ${labelOf(v) ? `<span class="pg-thumb__label">${esc(typeOf(v).short)}</span>` : ""}</button>`,
          )
          .join("")}
        ${has360 ? `<button class="pg-thumb pg-thumb--360" type="button" role="tab" data-open-360 aria-selected="false"><span class="pg-thumb__img"><b>360°</b></span><span class="pg-thumb__label">360° View</span></button>` : ""}
      </div>`
          : ""
      }
    </div>`;

    const stage = $(".pg-stage", root);
    const frame = $("[data-frame]", root);
    const box360 = $("[data-360]", root);

    // Thumbnails: resolve shop uploads, keep native lazy loading for normal URLs.
    $$("[data-thumb-src]", root).forEach((img) => {
      const src = img.dataset.thumbSrc;
      resolve(src, { thumb: true }).then((u) => (img.src = u || FALLBACK));
      img.addEventListener(
        "error",
        () => img.src.indexOf(FALLBACK) === -1 && (img.src = FALLBACK),
        { once: true },
      );
    });

    function setZoom(on, e) {
      zoomed = on && mode === "photos";
      stage.classList.toggle("is-zoomed", zoomed);
      const btn = $("[data-zoom]", root);
      btn.setAttribute("aria-pressed", String(zoomed));
      btn.setAttribute("aria-label", zoomed ? "Zoom out" : "Zoom in");
      if (zoomed && e) pan(e);
      if (!zoomed) {
        const img = $(".pg-img.is-active", frame);
        if (img) img.style.transformOrigin = "";
      }
    }

    function pan(e) {
      const img = $(".pg-img.is-active", frame);
      if (!img) return;
      const r = stage.getBoundingClientRect();
      const x = Math.min(
        100,
        Math.max(0, ((e.clientX - r.left) / r.width) * 100),
      );
      const y = Math.min(
        100,
        Math.max(0, ((e.clientY - r.top) / r.height) * 100),
      );
      img.style.transformOrigin = `${x}% ${y}%`;
    }

    function updateChrome() {
      const v = items[index];
      $("[data-label]", root).textContent =
        mode === "360" ? "360° view" : v ? labelOf(v) : "";
      $("[data-count]", root).textContent =
        mode === "360" || items.length < 2
          ? ""
          : `${index + 1} / ${items.length}`;
      $$("[data-thumb]", root).forEach((b) =>
        b.setAttribute(
          "aria-selected",
          String(mode === "photos" && Number(b.dataset.thumb) === index),
        ),
      );
      const t360 = $("[data-open-360]", root);
      if (t360) t360.setAttribute("aria-selected", String(mode === "360"));
      const active = $(`[data-thumb="${index}"]`, root);
      // Keep the chosen thumbnail in view inside its strip. Only the strip moves:
      // scrollIntoView would also scroll the page (it jumped down on load).
      const strip = active && mode === "photos" ? active.parentElement : null;
      if (strip) {
        const a = active.getBoundingClientRect();
        const s = strip.getBoundingClientRect();
        if (a.left < s.left) strip.scrollLeft -= s.left - a.left;
        else if (a.right > s.right) strip.scrollLeft += a.right - s.right;
      }
    }

    async function show(i, dir = 0) {
      if (!items.length) {
        frame.innerHTML = `<img class="pg-img is-active" src="${FALLBACK}" alt="">`;
        return;
      }
      index = (i + items.length) % items.length;
      setZoom(false);
      if (mode === "360") close360();
      updateChrome();
      const my = ++token;
      const v = items[index];
      const slow = setTimeout(() => stage.classList.add("is-loading"), 160);
      const src = (await resolve(v.url)) || FALLBACK;
      const img = new Image();
      img.className = "pg-img";
      img.alt = v.alt || name;
      img.decoding = "async";
      img.draggable = false;
      if (my === 1) img.fetchPriority = "high";
      img.style.setProperty("--dir", String(dir));
      img.src = src;
      try {
        await img.decode();
      } catch (e) {
        img.src = FALLBACK;
      }
      clearTimeout(slow);
      stage.classList.remove("is-loading");
      if (my !== token) return;
      const old = $$(".pg-img", frame);
      frame.appendChild(img);
      requestAnimationFrame(() => {
        img.classList.add("is-active");
        old.forEach((o) => {
          o.classList.remove("is-active");
          o.classList.add("is-leaving");
          setTimeout(() => o.remove(), prefersReducedMotion() ? 0 : 520);
        });
      });
    }

    /* ---- 360° ---- */
    let frameUrls = null;
    let frame360 = 0;
    async function open360() {
      mode = "360";
      setZoom(false);
      stage.classList.add("is-360");
      box360.hidden = false;
      updateChrome();
      const status = $("[data-360-status]", root);
      const img = $(".pg-360__img", root);
      if (!frameUrls) {
        let done = 0;
        status.textContent = `Loading 360° view… 0 / ${frames.length}`;
        frameUrls = await Promise.all(
          frames.map(async (f) => {
            const u = await resolve(f);
            await new Promise((ok) => {
              const pre = new Image();
              pre.onload = pre.onerror = ok;
              pre.src = u;
            });
            status.textContent = `Loading 360° view… ${++done} / ${frames.length}`;
            return u;
          }),
        );
      }
      status.textContent = "";
      img.src = frameUrls[frame360];
      stage.focus({ preventScroll: true });
    }
    function close360() {
      mode = "photos";
      stage.classList.remove("is-360");
      box360.hidden = true;
    }
    function rotate(step) {
      if (!frameUrls) return;
      frame360 = (frame360 + step + frameUrls.length) % frameUrls.length;
      $(".pg-360__img", root).src = frameUrls[frame360];
    }

    /* ---- events ---- */
    const onClick = (e) => {
      const step = e.target.closest("[data-step]");
      if (step)
        return show(
          index + Number(step.dataset.step),
          Number(step.dataset.step),
        );
      const thumb = e.target.closest("[data-thumb]");
      if (thumb)
        return show(
          Number(thumb.dataset.thumb),
          Number(thumb.dataset.thumb) > index ? 1 : -1,
        );
      if (e.target.closest("[data-open-360]")) return open360();
      const s360 = e.target.closest("[data-360-step]");
      if (s360) return rotate(Number(s360.dataset["360Step"]));
      if (e.target.closest("[data-zoom]")) return setZoom(!zoomed);
      if (e.target.closest("[data-full]")) return openLightbox();
      if (e.target.closest("[data-close]")) return onClose && onClose();
      // Clicking the photo itself toggles zoom (desktop) — touch uses the button + drag.
      if (
        mode === "photos" &&
        e.target.closest(".pg-stage__frame") &&
        e.pointerType !== "touch"
      )
        setZoom(!zoomed, e);
    };
    root.addEventListener("click", onClick);

    // Swipe between photos, drag to pan when zoomed, drag to rotate in 360°.
    let drag = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        start: frame360,
        moved: false,
        id: e.pointerId,
      };
      if (mode === "360") stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", (e) => {
      if (zoomed && (e.pointerType === "mouse" || drag)) pan(e);
      if (!drag || mode !== "360" || !frameUrls) return;
      const w = stage.getBoundingClientRect().width;
      const steps = Math.round(((e.clientX - drag.x) / w) * frameUrls.length);
      frame360 =
        (((drag.start - steps) % frameUrls.length) + frameUrls.length) %
        frameUrls.length;
      $(".pg-360__img", root).src = frameUrls[frame360];
    });
    const endDrag = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (
        mode === "photos" &&
        !zoomed &&
        Math.abs(dx) > 45 &&
        Math.abs(dx) > Math.abs(dy) * 1.4 &&
        items.length > 1
      )
        show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      drag = null;
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", () => (drag = null));
    stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        if (mode === "360") rotate(step);
        else show(index + step, step);
      }
      if (e.key === "Escape" && zoomed) setZoom(false);
    });

    /* ---- fullscreen (a lightbox that reuses this same component) ---- */
    function openLightbox() {
      const opener = document.activeElement;
      const shell = document.createElement("div");
      shell.className = "pg-lightbox";
      shell.setAttribute("role", "dialog");
      shell.setAttribute("aria-modal", "true");
      shell.setAttribute("aria-label", `${name} images, fullscreen`);
      document.body.appendChild(shell);
      document.documentElement.classList.add("pg-locked");
      let inner;
      const close = () => {
        inner.destroy();
        shell.remove();
        document.documentElement.classList.remove("pg-locked");
        document.removeEventListener("keydown", onKey);
        if (opener && opener.focus) opener.focus();
      };
      const onKey = (e) => {
        if (e.key === "Escape") close();
        if (e.key === "Tab")
          FrameX.overlay && FrameX.overlay.trapFocus
            ? FrameX.overlay.trapFocus(shell, e)
            : null;
      };
      inner = mount(shell, {
        name,
        views,
        product360,
        lightbox: true,
        startIndex: index,
        onClose: close,
      });
      document.addEventListener("keydown", onKey);
      requestAnimationFrame(() => shell.classList.add("is-open"));
      $(".pg-stage", shell).focus();
    }

    show(index, 0);

    return {
      goTo: (i) => show(i, i > index ? 1 : -1),
      showView(id) {
        const i = items.findIndex((v) => v.id === id);
        if (i >= 0) show(i, i > index ? 1 : -1);
      },
      open360: has360 ? open360 : null,
      destroy() {
        root.removeEventListener("click", onClick);
        cleanups.forEach((fn) => fn());
        root.innerHTML = "";
      },
    };
  }

  FrameX.productGallery = { mount, MIN_360 };
})((window.FrameX = window.FrameX || {}));
