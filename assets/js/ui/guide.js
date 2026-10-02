/* "Everything you need to know" guide on the home page. The topics are
   static HTML in index.html; this wires them as an accordion with one topic
   open at a time and cross-fades the matching visual in .guide__stage. */
(function (FrameX) {
  const { $, $$ } = FrameX.dom;

  function init() {
    const root = $("#guide");
    if (!root) return;
    const items = $$(".guide-item", root);
    const figures = $$("[data-guide-figure]", root);

    const setOpen = (item, open) => {
      item.classList.toggle("is-open", open);
      $(".guide-item__button", item).setAttribute("aria-expanded", String(open));
    };

    const showFigure = (key) => {
      if (!figures.some((figure) => figure.dataset.guideFigure === key)) return;
      figures.forEach((figure) => figure.classList.toggle("is-active", figure.dataset.guideFigure === key));
    };

    items.forEach((item) => {
      $(".guide-item__button", item).addEventListener("click", () => {
        const open = !item.classList.contains("is-open");
        items.forEach((other) => setOpen(other, open && other === item));
        if (open) showFigure(item.dataset.guideItem);
      });
    });
  }

  FrameX.guide = { init };
})((window.FrameX = window.FrameX || {}));
