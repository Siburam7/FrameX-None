/* Showcase rail of featured frame styles under the hero (auto-scroll + arrows + drag). */
(function (FrameX) {
  const { $ } = FrameX.dom;
  const { templates } = FrameX;

  async function init() {
    const rail = $("#featured-rail");
    if (!rail) return;
    const group = $(".showcase__group", rail);
    try {
      const { items } = await FrameX.api.getProducts({ isFeatured: true, limit: 24 });
      if (!items.length) {
        rail.closest("section").hidden = true;
        return;
      }
      group.innerHTML = items.map(templates.frameCard).join("");
      // "Try With Your Own Image" buttons open the first featured frame that has a photo preview.
      const tryable = items.find((p) => p.frame && FrameX.pricing.availability(p) !== "out_of_stock") || items.find((p) => p.frame);
      if (tryable) document.querySelectorAll("[data-try-link]").forEach((link) => (link.href = FrameX.qs.productUrl(tryable.id) + "&mode=custom"));
      FrameX.showcase.init(rail);
    } catch (error) {
      console.error("Featured frames failed to load", error);
      rail.closest("section").hidden = true; // decorative section: hide rather than show an error
    }
  }

  FrameX.featured = { init };
})((window.FrameX = window.FrameX || {}));
