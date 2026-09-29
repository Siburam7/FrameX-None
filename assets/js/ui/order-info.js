/* ==========================================================================
   "Pickup or delivery" + order status explainer.
   Informational only: it explains how ordering will work. It does not show
   any real order. The order-status list comes from core/constants.js.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, prefersReducedMotion } = FrameX.dom;
  const { FULFILMENT_METHODS, ORDER_FLOW, ORDER_STATUS } = FrameX.constants;

  function renderMethods() {
    const grid = $("#method-grid");
    if (!grid) return;
    grid.innerHTML = Object.values(FULFILMENT_METHODS)
      .filter((m) => m.enabled)
      .map(
        (m) => `<article class="method-card">
          <span class="method-card__icon">${icon(m.icon)}</span>
          <h3>${esc(m.label)}</h3>
          <p>${esc(m.summary)}</p>
        </article>`
      )
      .join("");
    grid.setAttribute("data-reveal-stagger", "");
  }

  function renderTracker() {
    const tracker = $("#order-tracker");
    if (!tracker) return;
    tracker.innerHTML = ORDER_FLOW.map(
      (status) => `<li class="tracker__step"><span class="tracker__dot">${icon("check")}</span><span>${esc(ORDER_STATUS[status].label)}</span></li>`
    ).join("");

    const steps = $$(".tracker__step", tracker);
    const lightAll = () => steps.forEach((s) => s.classList.add("is-lit"));
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return lightAll();

    // One orchestrated moment: steps light up in sequence when scrolled into view.
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      steps.forEach((step, i) => setTimeout(() => step.classList.add("is-lit"), i * 320));
    }, { threshold: 0.4 });
    observer.observe(tracker);
  }

  function init() {
    renderMethods();
    renderTracker();
    FrameX.reveal.observe($("#order-options") || document);
  }

  FrameX.orderInfo = { init };
})((window.FrameX = window.FrameX || {}));
