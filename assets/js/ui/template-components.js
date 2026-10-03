/* ==========================================================================
   Reusable template components. All are driven by template data only, so a
   new template never needs new UI code.

   templateUI.card(template, { categoryName })   card HTML for any listing
   templateUI.priceFrom(template)                lowest price across its sizes
   templateUI.url(template) / customizeUrl(...)  page links
   photoUploader.mount(el, options)              one upload tile per photo slot
   textCustomizer.mount(el, options)             one input per text field
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;

  /* ---------------------------------------------------------------- Shared */
  const sizesById = () => new Map((FrameX.seed.templateSizes || []).map((s) => [s.id, s]));
  const url = (t) => `template.html?t=${encodeURIComponent(t.slug)}`;
  const customizeUrl = (t, designId) => (designId ? `studio.html?design=${encodeURIComponent(designId)}` : `studio.html?template=${encodeURIComponent(t.slug)}`);

  /** Price for one size (base price + that size's difference). */
  function priceFor(template, sizeId) {
    const size = sizesById().get(sizeId);
    return Math.max(0, Number(template.price) + (size ? Number(size.priceDelta) || 0 : 0));
  }
  const priceFrom = (t) => Math.min(...(t.sizes && t.sizes.length ? t.sizes : ["m"]).map((id) => priceFor(t, id)));

  /** At most ONE badge per card, so cards never get badge-heavy. */
  function badge(t) {
    if (t.isTrending) return `<span class="tpl-badge tpl-badge--trending">${icon("star", "icon--fill")}Trending</span>`;
    if (t.isNew) return `<span class="tpl-badge tpl-badge--new">New</span>`;
    if (t.isPopular) return `<span class="tpl-badge tpl-badge--popular">${icon("heart", "icon--fill")}Popular</span>`;
    return "";
  }

  const photoLabel = (n) => `${n} ${n === 1 ? "photo" : "photos"}`;

  /* ---------------------------------------------------------------- TemplateCard */
  function card(t, { categoryName = "" } = {}) {
    const preview = t.thumbnail
      ? `<img src="${esc(t.thumbnail)}" alt="" loading="lazy" decoding="async">`
      : FrameX.templateEngine.render(t, { mode: "sample", label: `${t.title} template preview` });
    return `<article class="tpl-card" data-template-id="${esc(t.id)}">
      <div class="tpl-card__media tpl-card__media--${esc(t.orientation)}">
        ${preview}
        ${badge(t)}
      </div>
      <div class="tpl-card__body">
        <p class="tpl-card__meta">${esc(categoryName)}${categoryName ? " · " : ""}${photoLabel(t.photosRequired)}</p>
        <h3 class="tpl-card__title"><a href="${url(t)}">${esc(t.title)}</a></h3>
        <div class="tpl-card__foot">
          <span class="tpl-card__price">From <strong>${formatPrice(priceFrom(t))}</strong></span>
          <a class="btn btn--dark btn--sm tpl-card__cta" href="${customizeUrl(t)}" aria-label="Customize ${esc(t.title)}">Customize</a>
        </div>
      </div>
    </article>`;
  }

  FrameX.templateUI = { card, badge, url, customizeUrl, priceFor, priceFrom, photoLabel, sizesById };

  /* ---------------------------------------------------------------- PhotoUploader
     options: { slots: ["photo1", …], getPhotoUrl(slot) -> url|null,
                onPhoto(slot, photo), onRemove(slot) }
     Returns { open(slot), refresh(), showMissing(slots) }. */
  function mountUploader(root, { slots, getPhotoUrl, onPhoto, onRemove }) {
    const uid = "up-" + Math.random().toString(36).slice(2, 7);
    root.innerHTML = `<ol class="uploader">${slots
      .map(
        (slot, i) => `<li class="uploader__tile" data-slot="${esc(slot)}">
          <input class="visually-hidden uploader__input" id="${uid}-${i}" type="file" accept="${FrameX.uploadService.TYPES.join(",")}" aria-describedby="${uid}-${i}-msg">
          <label class="uploader__drop" for="${uid}-${i}">
            <span class="uploader__thumb"><img alt="" hidden></span>
            <span class="uploader__text">
              <strong>Photo ${i + 1}</strong>
              <span class="uploader__hint">${icon("upload")} Tap to choose or drop a photo</span>
            </span>
          </label>
          <div class="uploader__progress" hidden><span></span></div>
          <p class="uploader__msg" id="${uid}-${i}-msg" role="status" aria-live="polite"></p>
          <div class="uploader__actions" hidden>
            <label class="uploader__action" for="${uid}-${i}">Replace</label>
            <button class="uploader__action" type="button" data-remove>Remove</button>
          </div>
        </li>`
      )
      .join("")}</ol>`;

    const tileOf = (slot) => $(`.uploader__tile[data-slot="${CSS.escape(slot)}"]`, root);

    function paint(slot) {
      const tile = tileOf(slot);
      const src = getPhotoUrl(slot);
      const img = $(".uploader__thumb img", tile);
      img.hidden = !src;
      if (src) img.src = src;
      tile.classList.toggle("has-photo", Boolean(src));
      $(".uploader__actions", tile).hidden = !src;
      $(".uploader__hint", tile).innerHTML = src ? `${icon("check")} Added` : `${icon("upload")} Tap to choose or drop a photo`;
    }

    function message(slot, text, kind = "") {
      const msg = $(".uploader__msg", tileOf(slot));
      msg.textContent = text;
      msg.className = "uploader__msg" + (kind ? " uploader__msg--" + kind : "");
    }

    async function handle(slot, file) {
      const tile = tileOf(slot);
      const bar = $(".uploader__progress", tile);
      tile.classList.remove("is-missing");
      message(slot, "Preparing your photo…");
      bar.hidden = false;
      try {
        const photo = await FrameX.uploadService.prepare(file, (p) => ($("span", bar).style.width = p + "%"));
        onPhoto(slot, photo);
        message(slot, `${photo.name}`, "ok");
      } catch (error) {
        message(slot, error instanceof FrameX.uploadService.UploadError ? error.message : "That photo couldn't be added. Please try another one.", "error");
      } finally {
        bar.hidden = true;
        $("span", bar).style.width = "0";
        paint(slot);
      }
    }

    slots.forEach((slot) => {
      const tile = tileOf(slot);
      const input = $(".uploader__input", tile);
      const drop = $(".uploader__drop", tile);
      input.addEventListener("change", () => {
        if (input.files[0]) handle(slot, input.files[0]);
        input.value = "";
      });
      ["dragenter", "dragover"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          tile.classList.add("is-dragover");
        })
      );
      ["dragleave", "drop"].forEach((evt) =>
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          tile.classList.remove("is-dragover");
          if (evt === "drop" && e.dataTransfer.files[0]) handle(slot, e.dataTransfer.files[0]);
        })
      );
      $("[data-remove]", tile).addEventListener("click", () => {
        onRemove(slot);
        message(slot, "");
        paint(slot);
      });
      paint(slot);
    });

    return {
      open: (slot) => $(".uploader__input", tileOf(slot)).click(),
      refresh: () => slots.forEach(paint),
      showMissing(missing) {
        missing.forEach((slot) => {
          tileOf(slot).classList.add("is-missing");
          message(slot, "This photo is needed for the design.", "error");
        });
        if (missing[0]) $(".uploader__input", tileOf(missing[0])).focus();
      }
    };
  }

  /* ---------------------------------------------------------------- TextCustomizer
     options: { fields: template.textFields, values, onChange(id, value) }
     Returns { showMissing(fields) }. */
  function mountText(root, { fields, values, onChange }) {
    const uid = "tx-" + Math.random().toString(36).slice(2, 7);
    root.innerHTML = fields.length
      ? `<div class="text-fields">${fields
          .map((f, i) => {
            const id = `${uid}-${i}`;
            const max = Number(f.maxLength) || 40;
            const value = values[f.id] || "";
            return `<div class="form-field text-field" data-field="${esc(f.id)}" data-invalid="false">
              <label for="${id}">${esc(f.label)}${f.required ? "" : ' <span class="hint">(optional)</span>'}</label>
              ${
                f.type === "date"
                  ? `<input id="${id}" type="date" value="${esc(value)}">`
                  : `<input id="${id}" type="text" maxlength="${max}" value="${esc(value)}" placeholder="${esc(f.placeholder || f.defaultValue || "")}" autocomplete="off">`
              }
              <div class="text-field__foot">
                <p class="form-field__error">${icon("alert")}<span>Please fill this in.</span></p>
                ${f.type === "date" ? "" : `<span class="text-field__count" aria-hidden="true">${value.length}/${max}</span>`}
              </div>
            </div>`;
          })
          .join("")}</div>`
      : `<p class="text-fields__none">This design has no text to change.</p>`;

    $$(".text-field", root).forEach((wrap) => {
      const input = $("input", wrap);
      const count = $(".text-field__count", wrap);
      input.addEventListener("input", () => {
        if (count) count.textContent = `${input.value.length}/${input.maxLength}`;
        if (input.value.trim()) wrap.dataset.invalid = "false";
        onChange(wrap.dataset.field, input.value);
      });
    });

    return {
      showMissing(missing) {
        missing.forEach((f) => ($(`.text-field[data-field="${CSS.escape(f.id)}"]`, root).dataset.invalid = "true"));
        const first = missing[0] && $(`.text-field[data-field="${CSS.escape(missing[0].id)}"] input`, root);
        if (first) first.focus();
      }
    };
  }

  FrameX.photoUploader = { mount: mountUploader };
  FrameX.textCustomizer = { mount: mountText };
})((window.FrameX = window.FrameX || {}));
