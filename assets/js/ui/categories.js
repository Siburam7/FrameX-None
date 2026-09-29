/* "Shop by category" tiles. Clicking one filters the collection. */
(function (FrameX) {
  const { $, escapeHtml: esc } = FrameX.dom;
  const byId = new Map();

  async function init() {
    const row = $("#category-row");
    if (!row) return [];
    try {
      const categories = (await FrameX.api.getCategories()).filter((c) => c.productCount > 0);
      categories.forEach((c) => byId.set(c.id, c));
      row.innerHTML = categories
        .map(
          (c) => `<button class="category-tile" type="button" data-action="filter-category" data-category-id="${esc(c.id)}">
            <span class="category-tile__circle"><img src="${esc(c.image)}" alt="" width="320" height="320" loading="lazy" decoding="async"></span>
            <span>${esc(c.name)}</span>
          </button>`
        )
        .join("");
      row.setAttribute("data-reveal-stagger", "");
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
