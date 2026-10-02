/* "Shop by category": a gallery of frame-style collections (categories with
   kind "style") plus a row of links for the remaining occasion categories.
   Every card/link opens the Shop page filtered by that category. */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const byId = new Map();

  const url = (c) => FrameX.qs.shopListUrl({ category: c.id }) + "#collection";
  const count = (n) => (n === 1 ? "1 frame" : `${n} frames`);

  const card = (c) => `<a class="category-card" href="${esc(url(c))}">
      <img class="category-card__image" src="${esc(c.image)}" alt="" width="720" height="720" loading="lazy" decoding="async">
      <span class="category-card__body">
        <span class="category-card__count">${count(c.productCount)}</span>
        <span class="category-card__title">${esc(c.name)}</span>
        <span class="category-card__cta">Explore Collection ${icon("arrow-right")}</span>
      </span>
    </a>`;

  async function init() {
    const row = $("#category-row");
    if (!row) return [];
    try {
      const categories = (await FrameX.api.getCategories()).filter((c) => c.productCount > 0);
      categories.forEach((c) => byId.set(c.id, c));
      let styles = categories.filter((c) => c.kind === "style");
      let others = categories.filter((c) => c.kind !== "style");
      // An API without style collections still gets the gallery, built from what it has.
      if (!styles.length) [styles, others] = [others, []];

      const more = others.length
        ? `<p class="category-more" data-reveal><span class="category-more__label">Or shop by occasion</span>${others
            .map((c) => `<a class="category-more__link" href="${esc(url(c))}">${esc(c.name)}</a>`)
            .join("")}</p>`
        : "";
      row.innerHTML = `<div class="category-gallery" data-reveal-stagger>${styles.map(card).join("")}</div>${more}`;
      FrameX.reveal.observe(row);
      return categories;
    } catch (error) {
      console.error("Categories failed to load", error);
      FrameX.templates.showError(row, "Categories couldn't be loaded.", init);
      return [];
    }
  }

  FrameX.categories = { init, nameOf: (id) => (byId.get(id) ? byId.get(id).name : id), byId };
})((window.FrameX = window.FrameX || {}));
