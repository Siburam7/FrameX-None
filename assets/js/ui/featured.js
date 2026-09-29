/* Auto-scrolling rail of featured frame styles under the hero. */
(function (FrameX) {
  const { $ } = FrameX.dom;
  const { templates } = FrameX;

  async function init() {
    const rail = $("#featured-rail");
    if (!rail) return;
    const group = $(".marquee__group", rail);
    try {
      const { items } = await FrameX.api.getProducts({ isFeatured: true, limit: 24 });
      if (!items.length) {
        rail.closest("section").hidden = true;
        return;
      }
      group.innerHTML = items.map(templates.frameCard).join("");
      FrameX.marquee.init(rail);
    } catch (error) {
      console.error("Featured frames failed to load", error);
      rail.closest("section").hidden = true; // decorative section: hide rather than show an error
    }
  }

  FrameX.featured = { init };
})((window.FrameX = window.FrameX || {}));
