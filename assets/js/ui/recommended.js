/* "Highly recommended" row: the frames ordered most in the last 30 days first, then those viewed most
   (services/popular.js), then the products flagged isRecommended fill the rest, so the row is never empty. */
(function (FrameX) {
  const { $ } = FrameX.dom;

  async function init() {
    const rail = $("#recommended-rail");
    if (!rail) return;
    const limit = Number(rail.dataset.limit) || 4;
    rail.innerHTML = FrameX.templates.skeletons(Math.min(limit, 5));
    try {
      const [picks, all, popular] = await Promise.all([
        FrameX.api.getProducts({ isRecommended: true, limit }),
        FrameX.api.getProducts({ inStock: true, limit: 1000 }),
        FrameX.popular ? FrameX.popular.ids() : [],
      ]);
      const byId = new Map(all.items.map((p) => [p.id, p]));
      const liked = popular.map((id) => byId.get(id)).filter((p) => p && !p.decor); // frames only: wall art has its own part
      const seen = new Set(liked.map((p) => p.id));
      const items = liked.concat(picks.items.filter((p) => !seen.has(p.id))).slice(0, limit);
      if (!items.length) {
        rail.closest("section").hidden = true;
        return;
      }
      rail.innerHTML = items.map(FrameX.templates.productCard).join("");
      rail.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(rail);
      if (FrameX.railNav) FrameX.railNav.attach(rail);
    } catch (error) {
      console.error("Recommended products failed to load", error);
      FrameX.templates.showError(
        rail,
        "Recommended frames couldn't be loaded.",
        init,
      );
    }
  }

  FrameX.recommended = { init };
})((window.FrameX = window.FrameX || {}));
