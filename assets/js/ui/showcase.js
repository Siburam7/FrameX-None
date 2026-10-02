/* ==========================================================================
   Showcase
   Infinite product rail that scrolls by itself AND can be driven by hand:
   prev/next arrows, mouse drag, touch swipe. Any manual input pauses the
   auto-scroll, which eases back in after a short idle period. Hovering (or
   keyboard focus inside) holds it still.

   The first group is cloned enough times to cover the viewport, and the
   offset wraps at one group width, so the loop never shows a reset.
   Markup: .showcase > .showcase__viewport > .showcase__track > .showcase__group
   plus optional [data-showcase-prev] / [data-showcase-next] buttons.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, debounce, prefersReducedMotion } = FrameX.dom;

  const RESUME_MS = 3000; // idle time after manual input before auto-scroll returns
  const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag
  const STEP_MS = 480; // arrow / focus glide duration
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function init(root) {
    const viewport = $(".showcase__viewport", root);
    const track = $(".showcase__track", root);
    const group = $(".showcase__group", track);
    if (!viewport || !group) return;

    const speed = Number(root.dataset.speed) || 30; // px per second
    let groupWidth = 0;
    let offset = 0; // px scrolled, always kept within [0, groupWidth)
    let velocity = 0; // current auto-scroll velocity (eases towards its target)
    let fling = 0; // leftover drag momentum, px per second
    let glide = null; // { from, at, to, start } for arrow / focus moves (unwrapped px)
    let drag = null; // { id, startX, lastX, lastT, moved }
    let hovering = false;
    let focused = false; // keyboard focus is inside the rail
    let visible = true;
    let pausedUntil = 0;
    let lastFrame = 0;
    let frame = 0;

    const wrap = (value) => (groupWidth ? ((value % groupWidth) + groupWidth) % groupWidth : 0);
    const render = () => {
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };
    const pause = () => {
      pausedUntil = performance.now() + RESUME_MS;
    };

    function build() {
      $$(".showcase__group[data-clone]", track).forEach((node) => node.remove());
      groupWidth = group.getBoundingClientRect().width;
      if (!groupWidth) return;
      const copies = Math.ceil(viewport.clientWidth / groupWidth) + 1;
      for (let i = 1; i < copies; i += 1) {
        const clone = group.cloneNode(true);
        clone.dataset.clone = "";
        clone.setAttribute("aria-hidden", "true");
        $$("a, button, input", clone).forEach((el) => el.setAttribute("tabindex", "-1"));
        track.appendChild(clone);
      }
      offset = wrap(offset);
      render();
    }

    /** Distance from one card to the next (card width + gap). */
    function stepSize() {
      const cards = group.children;
      if (cards.length > 1) return cards[1].offsetLeft - cards[0].offsetLeft;
      return cards[0] ? cards[0].offsetWidth : viewport.clientWidth / 2;
    }

    function glideBy(distance) {
      fling = 0;
      velocity = 0;
      pause();
      if (prefersReducedMotion()) {
        offset = wrap(offset + distance);
        render();
        return;
      }
      // Chain from the current target so quick repeated clicks add up.
      const remaining = glide ? glide.to - glide.at : 0;
      glide = { from: offset, at: offset, to: offset + remaining + distance, start: performance.now() };
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
      lastFrame = now;
      if (!groupWidth || (drag && drag.moved)) return;

      if (glide) {
        const t = Math.min(1, (now - glide.start) / STEP_MS);
        glide.at = glide.from + (glide.to - glide.from) * easeOut(t);
        offset = wrap(glide.at);
        if (t === 1) glide = null;
        render();
        return;
      }

      if (Math.abs(fling) > 4) {
        offset = wrap(offset + fling * dt);
        fling *= Math.exp(-4 * dt);
        render();
        return;
      }
      fling = 0;

      const auto = visible && !hovering && !focused && now > pausedUntil && !prefersReducedMotion();
      velocity += ((auto ? speed : 0) - velocity) * Math.min(1, dt * 3.5);
      if (Math.abs(velocity) < 0.05) return;
      offset = wrap(offset + velocity * dt);
      render();
    }

    /* Arrows ------------------------------------------------------------- */
    const prev = $("[data-showcase-prev]", root);
    const next = $("[data-showcase-next]", root);
    if (prev) prev.addEventListener("click", () => glideBy(-stepSize()));
    if (next) next.addEventListener("click", () => glideBy(stepSize()));

    /* Hover / focus hold --------------------------------------------------- */
    viewport.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") hovering = true;
    });
    viewport.addEventListener("pointerleave", () => {
      hovering = false;
      if (drag && !drag.moved) drag = null; // press that left without becoming a drag
    });

    // Keyboard users: stop the rail and bring the focused card fully into view.
    viewport.addEventListener("focusin", (event) => {
      const card = event.target.closest(".showcase__group > *");
      if (!card || drag || !event.target.matches(":focus-visible")) return;
      focused = true;
      const left = card.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
      const overflow = left + card.offsetWidth - viewport.clientWidth;
      if (left < 0) glideBy(left - 16);
      else if (overflow > 0) glideBy(overflow + 16);
    });
    viewport.addEventListener("focusout", () => {
      focused = false;
      pause();
    });

    /* Drag / swipe --------------------------------------------------------- */
    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, lastT: event.timeStamp, moved: false };
      glide = null;
      fling = 0;
      velocity = 0;
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
        drag.moved = true;
        drag.lastX = event.clientX;
        viewport.setPointerCapture(drag.id);
        root.classList.add("is-dragging");
      }
      const dx = event.clientX - drag.lastX;
      const dt = Math.max(1, event.timeStamp - drag.lastT);
      // Smoothed release velocity (px/s), opposite to the pointer direction.
      fling = fling * 0.6 + ((-dx / dt) * 1000) * 0.4;
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
      offset = wrap(offset - dx);
      render();
    });

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved;
      const stale = event.timeStamp - drag.lastT > 80; // held still before letting go
      drag = null;
      root.classList.remove("is-dragging");
      if (!moved) return;
      if (stale || prefersReducedMotion()) fling = 0;
      fling = Math.max(-2400, Math.min(2400, fling));
      pause();
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);

    // A drag must not open the product (or toggle the wishlist) it started on.
    let suppressClick = false;
    viewport.addEventListener("pointermove", () => {
      if (drag && drag.moved) suppressClick = true;
    });
    viewport.addEventListener("pointerdown", () => {
      suppressClick = false;
    });
    viewport.addEventListener(
      "click",
      (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
    viewport.addEventListener("dragstart", (event) => event.preventDefault());

    /* Lifecycle ------------------------------------------------------------- */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      }).observe(root);
    }

    let lastWidth = window.innerWidth;
    window.addEventListener(
      "resize",
      debounce(() => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        glide = null;
        build();
      }, 200)
    );
    // Card widths can settle after fonts/images load.
    window.addEventListener("load", build, { once: true });

    build();
    root.classList.add("is-ready");
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  FrameX.showcase = { init };
})((window.FrameX = window.FrameX || {}));
