/* ==========================================================================
   Before / After (owner, 2026-10-27): the original photo an artwork was drawn
   or painted from, and the artwork itself, one over the other. Buyers drag
   the middle line (or use the arrow keys) to compare them.

     FrameX.beforeAfter.html(beforeUrl, afterUrl, { before, after, at })
       -> the markup (labels default to "Original photo" / "Artwork")
     FrameX.beforeAfter.bind(root)
       -> makes every slider inside root draggable; safe to call again
   Styles: .ba in assets/css/art.css.
   ========================================================================== */
(function (FrameX) {
  const esc = (s) => FrameX.dom.escapeHtml(String(s || ""));

  function html(beforeUrl, afterUrl, { before = "Original photo", after = "Artwork", at = 50 } = {}) {
    return `<div class="ba" style="--at:${at}%" data-ba>
      <img class="ba__after" src="${esc(afterUrl)}" alt="${esc(after)}" draggable="false">
      <div class="ba__before"><img src="${esc(beforeUrl)}" alt="${esc(before)}" draggable="false"></div>
      <span class="ba__tag ba__tag--l">${esc(before)}</span><span class="ba__tag ba__tag--r">${esc(after)}</span>
      <div class="ba__line" role="slider" tabindex="0" aria-label="Compare the original photo and the artwork" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${at}"><span class="ba__knob" aria-hidden="true">‹ ›</span></div>
    </div>`;
  }

  function bind(root) {
    root.querySelectorAll("[data-ba]").forEach((box) => {
      if (box.dataset.baBound) return;
      box.dataset.baBound = "1";
      const line = box.querySelector(".ba__line");
      const set = (pct) => {
        const v = Math.max(0, Math.min(100, Math.round(pct)));
        box.style.setProperty("--at", v + "%");
        line.setAttribute("aria-valuenow", String(v));
      };
      const fromPointer = (e) => {
        const r = box.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width) * 100);
      };
      box.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        box.setPointerCapture(e.pointerId);
        box.classList.add("is-dragging");
        fromPointer(e);
      });
      box.addEventListener("pointermove", (e) => {
        if (box.hasPointerCapture(e.pointerId)) fromPointer(e);
      });
      const stop = (e) => {
        if (box.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
        box.classList.remove("is-dragging");
      };
      box.addEventListener("pointerup", stop);
      box.addEventListener("pointercancel", stop);
      line.addEventListener("keydown", (e) => {
        const now = Number(line.getAttribute("aria-valuenow")) || 50;
        const step = e.shiftKey ? 20 : 5;
        const to = { ArrowLeft: now - step, ArrowRight: now + step, Home: 0, End: 100 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        set(to);
      });
    });
  }

  FrameX.beforeAfter = { html, bind };
})((window.FrameX = window.FrameX || {}));
