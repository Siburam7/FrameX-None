/* ==========================================================================
   Previous / next buttons for a horizontally scrolling rail (community
   photos, reviews). Markup: a [data-rail-arrows="<rail id>"] group holding
   [data-rail-prev] and [data-rail-next] buttons. The group hides itself
   whenever everything already fits, and each button is disabled at its end.
   ========================================================================== */
(function (FrameX) {
  const { $, debounce, prefersReducedMotion } = FrameX.dom;

  function attach(rail) {
    const group = rail && $(`[data-rail-arrows="${rail.id}"]`);
    if (!group) return;
    const prev = $("[data-rail-prev]", group);
    const next = $("[data-rail-next]", group);

    // One card (plus the gap) per click.
    const step = () => {
      const cards = rail.children;
      if (cards.length > 1) return cards[1].offsetLeft - cards[0].offsetLeft;
      return rail.clientWidth * 0.8;
    };
    const go = (dir) =>
      rail.scrollBy({
        left: dir * step(),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });

    function sync() {
      const max = rail.scrollWidth - rail.clientWidth;
      group.hidden = max <= 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max - 2;
    }

    if (!group.dataset.wired) {
      group.dataset.wired = "true";
      prev.addEventListener("click", () => go(-1));
      next.addEventListener("click", () => go(1));
      rail.addEventListener("scroll", debounce(sync, 60), { passive: true });
      window.addEventListener("resize", debounce(sync, 150));
      // Images loading late can change the rail width.
      window.addEventListener("load", sync, { once: true });
    }
    sync();
  }

  FrameX.railNav = { attach };
})((window.FrameX = window.FrameX || {}));
