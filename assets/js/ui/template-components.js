/* ==========================================================================
   Reusable template components. All are driven by template data only, so a
   new template never needs new UI code.

   templateUI.card(template, { categoryName })   card HTML for any listing
   templateUI.priceFrom(template)                lowest price across its sizes
   templateUI.url(template) / customizeUrl(...)  page links
   textCustomizer.mount(el, options)             one input per text field
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;

  /* ---------------------------------------------------------------- Shared */
  const sizesById = () =>
    new Map((FrameX.seed.templateSizes || []).map((s) => [s.id, s]));
  const url = (t) => `template.html?t=${encodeURIComponent(t.slug)}`;
  const customizeUrl = (t, designId) =>
    designId
      ? `studio.html?design=${encodeURIComponent(designId)}`
      : `studio.html?template=${encodeURIComponent(t.slug)}`;

  /** Price for one size (base price + that size's difference). */
  function priceFor(template, sizeId) {
    const size = sizesById().get(sizeId);
    return Math.max(
      0,
      Number(template.price) + (size ? Number(size.priceDelta) || 0 : 0),
    );
  }
  const priceFrom = (t) =>
    Math.min(
      ...(t.sizes && t.sizes.length ? t.sizes : ["m"]).map((id) =>
        priceFor(t, id),
      ),
    );

  /** At most ONE badge per card, so cards never get badge-heavy. */
  function badge(t) {
    if (t.isTrending)
      return `<span class="badge tpl-badge--trending">${icon("star", "icon--fill")}Trending</span>`;
    if (t.isNew) return `<span class="badge badge--dark">New</span>`;
    if (t.isPopular)
      return `<span class="badge tpl-badge--popular">${icon("heart", "icon--fill")}Popular</span>`;
    return "";
  }

  const photoLabel = (n) => `${n} ${n === 1 ? "photo" : "photos"}`;

  /* ---------------------------------------------------------------- TemplateCard */
  function card(t, { categoryName = "" } = {}) {
    const preview = t.thumbnail
      ? `<img src="${esc(t.thumbnail)}" alt="" loading="lazy" decoding="async">`
      : FrameX.templateEngine.render(t, {
          mode: "sample",
          label: `${t.title} template preview`,
        });
    // The shared product card (components.css); only the picture area is the template's own.
    return `<article class="product-card tpl-card" data-template-id="${esc(t.id)}">
      <div class="product-card__media tpl-card__media tpl-card__media--${esc(t.orientation)}">
        ${preview}
        <a class="product-card__open" href="${url(t)}" aria-label="View ${esc(t.title)}" tabindex="-1"></a>
        <div class="product-card__badges">${badge(t)}</div>
      </div>
      <div class="product-card__body">
        <p class="product-card__cat">${esc(categoryName)}${categoryName ? " · " : ""}${photoLabel(t.photosRequired)}</p>
        <h3 class="product-card__title"><a href="${url(t)}">${esc(t.title)}</a></h3>
        <p class="product-card__price"><span>From</span><strong>${formatPrice(priceFrom(t))}</strong></p>
      </div>
      <div class="product-card__actions"><a class="btn btn--primary btn--sm" href="${customizeUrl(t)}" aria-label="Customize ${esc(t.title)}">Customize</a></div>
    </article>`;
  }

  FrameX.templateUI = {
    card,
    badge,
    url,
    customizeUrl,
    priceFor,
    priceFrom,
    photoLabel,
    sizesById,
  };

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
        if (count)
          count.textContent = `${input.value.length}/${input.maxLength}`;
        if (input.value.trim()) wrap.dataset.invalid = "false";
        onChange(wrap.dataset.field, input.value);
      });
    });

    return {
      showMissing(missing) {
        missing.forEach(
          (f) =>
            ($(
              `.text-field[data-field="${CSS.escape(f.id)}"]`,
              root,
            ).dataset.invalid = "true"),
        );
        const first =
          missing[0] &&
          $(
            `.text-field[data-field="${CSS.escape(missing[0].id)}"] input`,
            root,
          );
        if (first) first.focus();
      },
    };
  }

  FrameX.textCustomizer = { mount: mountText };
})((window.FrameX = window.FrameX || {}));
