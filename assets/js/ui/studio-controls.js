/* ==========================================================================
   FrameX Studio — reusable option controls. Each returns HTML; the Studio page
   listens for changes with ONE delegated handler. Every input carries
   data-set="<config path>" (e.g. "frame.colorId", "border.width"), so a new
   option needs data, not new event code.
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  let uid = 0;
  const id = () => "sc-" + ++uid;

  const delta = (amount) => (amount > 0 ? `+${formatPrice(amount)}` : amount < 0 ? `−${formatPrice(-amount)}` : "");

  /** Colour / material swatches (radio group). options: [{ id, name, hex, texture?, priceModifier? }] */
  function swatches(path, options, selected, { label, showPrice = false } = {}) {
    const name = id();
    return `<div class="sc-swatches" role="radiogroup" aria-label="${esc(label || "Colour")}">${options
      .map(
        (o) => `<label class="sc-swatch" title="${esc(o.name)}">
          <input type="radio" name="${name}" value="${esc(o.id)}" data-set="${esc(path)}" ${o.id === selected ? "checked" : ""}>
          <span class="sc-swatch__chip sc-tex--${esc(o.texture || "solid")}" style="--c:${esc(o.hex)}"></span>
          <span class="sc-swatch__name">${esc(o.name)}</span>
          ${showPrice && o.priceModifier ? `<span class="sc-swatch__price">${delta(o.priceModifier)}</span>` : ""}
        </label>`
      )
      .join("")}</div>`;
  }

  /** Option cards (radio group). options: [{ id, name, description?, meta?, price? }] */
  function cards(path, options, selected, { label, columns = 2, visual } = {}) {
    const name = id();
    return `<div class="sc-cards sc-cards--${columns}" role="radiogroup" aria-label="${esc(label || "")}">${options
      .map(
        (o) => `<label class="sc-card">
          <input type="radio" name="${name}" value="${esc(o.id)}" data-set="${esc(path)}" ${o.id === selected ? "checked" : ""}>
          <span class="sc-card__body">
            ${visual ? visual(o) : ""}
            <strong>${esc(o.name)}</strong>
            ${o.description ? `<span class="sc-card__desc">${esc(o.description)}</span>` : ""}
            ${o.price != null ? `<span class="sc-card__price">${esc(o.price)}</span>` : ""}
          </span>
        </label>`
      )
      .join("")}</div>`;
  }

  /** Segmented choice (radio pills). options: [{ id, name, icon? }] */
  function segmented(path, options, selected, { label, number = false } = {}) {
    const name = id();
    return `<div class="sc-seg" role="radiogroup" aria-label="${esc(label || "")}">${options
      .map(
        (o) => `<label class="sc-seg__item">
          <input type="radio" name="${name}" value="${esc(o.id)}" data-set="${esc(path)}" ${number ? "data-number" : ""} ${String(o.id) === String(selected) ? "checked" : ""}>
          <span>${o.icon ? icon(o.icon) : ""}${esc(o.name)}</span>
        </label>`
      )
      .join("")}</div>`;
  }

  /** Range slider with a live value label. */
  function range(path, { min, max, step = 1, value, label, unit = "" }) {
    const inputId = id();
    return `<div class="sc-range">
      <label for="${inputId}"><span>${esc(label)}</span><output for="${inputId}">${esc(String(value))}${esc(unit)}</output></label>
      <input id="${inputId}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-set="${esc(path)}" data-number data-unit="${esc(unit)}">
    </div>`;
  }

  /** Accordion section (native <details>, keyboard accessible without JS). */
  function section(key, { title, number, summary = "", body, open = false }) {
    return `<details class="sc-section" data-section="${esc(key)}" ${open ? "open" : ""}>
      <summary><span class="sc-section__num">${number}</span><span class="sc-section__title">${esc(title)}</span><span class="sc-section__summary" data-summary="${esc(key)}">${esc(summary)}</span>${icon("chev-down")}</summary>
      <div class="sc-section__body">${body}</div>
    </details>`;
  }

  FrameX.studioControls = { swatches, cards, segmented, range, section, delta };
})((window.FrameX = window.FrameX || {}));
