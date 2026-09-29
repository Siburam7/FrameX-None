/* "Highly recommended" row: products flagged isRecommended. */
(function (FrameX) {
  const { $ } = FrameX.dom;

  async function init() {
    const rail = $("#recommended-rail");
    if (!rail) return;
    rail.innerHTML = FrameX.templates.skeletons(5);
    try {
      const { items } = await FrameX.api.getProducts({ isRecommended: true, limit: 5 });
      if (!items.length) {
        rail.closest("section").hidden = true;
        return;
      }
      rail.innerHTML = items.map(FrameX.templates.productCard).join("");
      rail.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(rail);
    } catch (error) {
      console.error("Recommended products failed to load", error);
      FrameX.templates.showError(rail, "Recommended frames couldn't be loaded.", init);
    }
  }

  FrameX.recommended = { init };
})((window.FrameX = window.FrameX || {}));
