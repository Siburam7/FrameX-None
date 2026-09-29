/* ==========================================================================
   Marquee
   Seamless infinite horizontal scroll. Clones the first group as many times
   as needed for the current width and sets the loop distance/duration as
   CSS variables. Falls back to a plain scrollable row for reduced motion.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, debounce, prefersReducedMotion } = FrameX.dom;

  function build(marquee) {
    const track = $(".marquee__track", marquee);
    const group = $(".marquee__group:not([data-clone])", track);
    if (!group) return;
    $$(".marquee__group[data-clone]", track).forEach((node) => node.remove());
    marquee.classList.remove("marquee--scrollable");

    if (prefersReducedMotion()) {
      marquee.classList.add("marquee--scrollable");
      return;
    }

    const groupWidth = group.getBoundingClientRect().width;
    if (!groupWidth) return;

    const copies = Math.ceil(marquee.clientWidth / groupWidth) + 1;
    for (let i = 1; i < copies; i += 1) {
      const clone = group.cloneNode(true);
      clone.dataset.clone = "";
      clone.setAttribute("aria-hidden", "true");
      $$("a, button, input", clone).forEach((el) => el.setAttribute("tabindex", "-1"));
      track.appendChild(clone);
    }

    const speed = Number(marquee.dataset.speed) || 40; // px per second
    track.style.setProperty("--marquee-distance", groupWidth + "px");
    track.style.setProperty("--marquee-duration", groupWidth / speed + "s");
  }

  function init(marquee) {
    build(marquee);
    let lastWidth = window.innerWidth;
    window.addEventListener(
      "resize",
      debounce(() => {
        if (window.innerWidth !== lastWidth) {
          lastWidth = window.innerWidth;
          build(marquee);
        }
      }, 200)
    );
  }

  FrameX.marquee = { init, build };
})((window.FrameX = window.FrameX || {}));
