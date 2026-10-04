/* ==========================================================================
   Scroll reveal
   Mark elements with data-reveal (or a parent with data-reveal-stagger).
   Once an element has revealed, its data-reveal attribute is removed so the
   element goes back to its normal CSS (hover transitions are not overridden).
   ========================================================================== */
(function (FrameX) {
  const { $$, prefersReducedMotion } = FrameX.dom;
  const SETTLE_MS = 900;
  const supportsObserver = "IntersectionObserver" in window;

  const observer = supportsObserver
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            reveal(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
      )
    : null;

  function reveal(el) {
    el.classList.add("is-revealed");
    const delay =
      parseFloat(getComputedStyle(el).getPropertyValue("--reveal-delay")) || 0;
    setTimeout(() => {
      el.removeAttribute("data-reveal");
      el.classList.remove("is-revealed");
      el.style.removeProperty("--reveal-delay");
    }, SETTLE_MS + delay);
  }

  function observe(root = document) {
    $$("[data-reveal-stagger]", root).forEach((parent) => {
      Array.from(parent.children).forEach((child, i) => {
        if (!child.hasAttribute("data-reveal"))
          child.setAttribute("data-reveal", "");
        child.style.setProperty("--reveal-delay", Math.min(i, 6) * 70 + "ms");
      });
      parent.removeAttribute("data-reveal-stagger");
    });

    $$("[data-reveal]", root).forEach((el) => {
      if (el.classList.contains("is-revealed")) return;
      if (!observer || prefersReducedMotion()) {
        el.removeAttribute("data-reveal");
      } else {
        observer.observe(el);
      }
    });
  }

  FrameX.reveal = { observe };
})((window.FrameX = window.FrameX || {}));
