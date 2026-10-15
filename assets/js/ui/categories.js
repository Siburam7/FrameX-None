/* "Shop by category": the six tiles (the parts of FrameX) are written in
   index.html; under them, this adds a row of links to the frame categories
   (styles and occasions) that have frames. Every link opens the Shop page
   filtered by that category. */
(function (FrameX) {
  const { $, escapeHtml: esc } = FrameX.dom;
  const byId = new Map();

  const url = (c) => FrameX.qs.shopListUrl({ category: c.id }) + "#collection";

  async function init() {
    const row = $("#category-more");
    if (!row) return [];
    try {
      const categories = (await FrameX.api.getCategories()).filter(
        (c) => c.productCount > 0,
      );
      categories.forEach((c) => byId.set(c.id, c));
      // Frame styles first, then occasions
      const sorted = [...categories.filter((c) => c.kind === "style"), ...categories.filter((c) => c.kind !== "style")];
      row.innerHTML = sorted.length
        ? `<p class="category-more" data-reveal><span class="category-more__label">Shop frames by style or occasion</span>${sorted
            .map((c) => `<a class="chip" href="${esc(url(c))}">${esc(c.name)}</a>`)
            .join("")}</p>`
        : "";
      FrameX.reveal.observe(row);
      return categories;
    } catch (error) {
      // The six tiles above still work; only the category links are missing.
      console.error("Categories failed to load", error);
      row.innerHTML = "";
      return [];
    }
  }

  FrameX.categories = {
    init,
    nameOf: (id) => (byId.get(id) ? byId.get(id).name : id),
    byId,
  };
})((window.FrameX = window.FrameX || {}));
