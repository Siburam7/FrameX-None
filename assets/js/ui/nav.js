/* Header behaviour: scrolled state, mobile menu, active-section highlight. */
(function (FrameX) {
  const { $, $$ } = FrameX.dom;
  const DESKTOP_QUERY = "(min-width: 1100px)";

  function init() {
    const header = $("[data-site-header]");
    const toggle = $("#nav-toggle");
    const panel = $("#primary-nav");
    if (!header || !toggle || !panel) return;

    // Scrolled state (rAF-throttled, passive) ---------------------------------
    let ticking = false;
    const update = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();

    // Mobile menu -----------------------------------------------------------------
    const setOpen = (open) => {
      panel.classList.toggle("is-open", open);
      header.classList.toggle("is-menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.classList.toggle("is-locked", open);
    };

    toggle.addEventListener("click", () =>
      setOpen(toggle.getAttribute("aria-expanded") !== "true"),
    );
    panel.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia(DESKTOP_QUERY).addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }

  FrameX.nav = { init };
})((window.FrameX = window.FrameX || {}));
