/* ==========================================================================
   Home page hero: one slide per part of the catalogue, shown in turn.

   The slides are the list `heroSlides` in assets/data/site.seed.js. The first
   one is written in index.html (so it is there before any script runs); this
   file builds the others, the tabs under them, and moves between them.

   It moves on by itself every few seconds, and waits while the pointer is
   on one of its buttons or pictures (a link never changes under the cursor),
   while something inside it has keyboard focus, while the tab is in the
   background, when the visitor presses Pause, and for visitors who asked
   their device for reduced motion (they change slides themselves).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, prefersReducedMotion } = FrameX.dom;

  const INTERVAL = 6000;
  const SWIPE = 44; // px a finger must travel sideways to change the slide

  /** Two-line headline: the second line carries the gradient. */
  const title = (lines) => `${esc(lines[0])}${lines[1] ? ` <span>${esc(lines[1])}</span>` : ""}`;

  /** One picture of the gallery wall (layout-hero.css): artwork and designs hang in a frame, photos as prints. */
  function piece(p) {
    const label = esc(p.alt || "");
    // A personalised design is drawn by the template engine, like on the Templates page.
    if (p.template) {
      // Its sample photos wait with the slide's other pictures (see loadImages).
      const html = p.templateData ? FrameX.templateEngine.render(p.templateData, { mode: "sample", label: p.alt || p.templateData.title }).replace(/<img src="/g, '<img data-src="') : "";
      return `<a class="page-hero__piece page-hero__piece--design page-hero__piece--framed" href="${esc(p.href)}" aria-label="${label}"><span class="page-hero__mat">${html}</span></a>`;
    }
    // The artwork alone, in a frame drawn by the page (the product photo already shows one).
    if (p.art) {
      return `<a class="page-hero__piece page-hero__piece--framed" href="${esc(p.href)}" aria-label="${label}"><span class="page-hero__mat"><img data-src="${esc(p.art)}" alt="" width="800" height="1000" decoding="async"></span></a>`;
    }
    return `<a class="page-hero__piece" href="${esc(p.href)}" aria-label="${label}"><img data-src="${esc(p.image)}" alt="" width="800" height="1000" decoding="async"></a>`;
  }

  /** A light that moves from one picture of the wall to the next (layout-hero.css: .is-lit). */
  function spotlight(hero) {
    if (prefersReducedMotion()) return;
    let at = -1;
    setInterval(() => {
      if (document.hidden) return;
      const pieces = $$(".home-hero__slide.is-active .page-hero__piece", hero);
      if (!pieces.length) return;
      at = (at + 1) % pieces.length;
      $$(".page-hero__piece.is-lit", hero).forEach((el) => el.classList.remove("is-lit"));
      pieces[at].classList.add("is-lit");
    }, 1600);
  }

  const slideHtml = (s, i, total) => `<div class="home-hero__slide page-hero__grid" role="group" aria-roledescription="slide" aria-label="${esc(s.label)}, ${i + 1} of ${total}" data-slide="${esc(s.id)}">
      <div class="home-hero__copy">
        <p class="eyebrow">${esc(s.eyebrow)}</p>
        <h2 class="page-hero__title">${title(s.title)}</h2>
        <p class="page-hero__lead">${esc(s.lead)}</p>
        <div class="page-hero__actions">${s.actions
          .map((a, n) => `<a class="btn ${n === 0 ? "btn--primary" : "btn--light"}" href="${esc(a.href)}">${esc(a.label)}${n === 0 ? " " + icon("arrow-right", "icon--nudge") : ""}</a>`)
          .join("")}</div>
      </div>
      <div class="page-hero__wall">${s.pieces.map(piece).join("")}</div>
    </div>`;

  /** Slides that show personalised designs need those designs first. */
  async function withTemplates(slides) {
    const wanted = slides.flatMap((s) => s.pieces).filter((p) => p.template);
    if (!wanted.length || !FrameX.templateEngine) return slides.filter((s) => !s.pieces.some((p) => p.template));
    await Promise.all(
      wanted.map(async (p) => {
        try {
          p.templateData = await FrameX.api.getTemplate(p.template);
        } catch {
          p.templateData = null;
        }
      }),
    );
    // A slide whose designs can't be drawn is left out rather than shown with gaps.
    return slides.filter((s) => s.pieces.every((p) => !p.template || p.templateData));
  }

  /** Laptops: the wall of pictures leans a little toward the pointer (layout-hero.css reads --tilt-x / --tilt-y). */
  function lean(hero) {
    if (prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let waiting = 0;
    hero.addEventListener("pointermove", (e) => {
      if (waiting) return;
      waiting = requestAnimationFrame(() => {
        waiting = 0;
        const r = hero.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        hero.style.setProperty("--tilt-x", `${(x * 10).toFixed(2)}deg`);
        hero.style.setProperty("--tilt-y", `${(-y * 7).toFixed(2)}deg`);
      });
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--tilt-x", "0deg");
      hero.style.setProperty("--tilt-y", "0deg");
    });
  }

  async function init() {
    const hero = $("[data-hero]");
    const stage = hero && $("[data-hero-stage]", hero);
    const all = (FrameX.seed.site && FrameX.seed.site.heroSlides) || [];
    if (stage) {
      lean(hero);
      spotlight(hero);
    }
    if (!stage || all.length < 2) return;
    const slides = await withTemplates(all.map((s) => ({ ...s, pieces: s.pieces.map((p) => ({ ...p })) })));
    if (slides.length < 2) return;

    // The first slide is already in the page; add the rest after it.
    const first = $(".home-hero__slide", stage);
    first.setAttribute("aria-label", `${slides[0].label}, 1 of ${slides.length}`);
    first.insertAdjacentHTML("afterend", slides.slice(1).map((s, i) => slideHtml(s, i + 1, slides.length)).join(""));
    const els = $$(".home-hero__slide", stage);

    const tabs = $("[data-hero-tabs]", hero);
    tabs.innerHTML = slides.map((s, i) => `<button class="home-hero__tab" type="button" data-hero-tab="${i}" aria-current="${i === 0}">${esc(s.label)}</button>`).join("");
    const tabEls = $$("[data-hero-tab]", tabs);
    const toggle = $("[data-hero-toggle]", hero);
    $("[data-hero-bar]", hero).hidden = false;
    hero.style.setProperty("--hero-interval", INTERVAL + "ms");

    let index = 0;
    let timer = null;
    let userPaused = prefersReducedMotion();
    const held = new Set(); // reasons the rotation is on hold right now: "hover", "focus", "hidden"

    /** Pictures are fetched one slide ahead, not all at once. */
    const loadImages = (i) => $$("img[data-src]", els[(i + els.length) % els.length]).forEach((img) => ((img.src = img.dataset.src), img.removeAttribute("data-src")));

    function show(next) {
      next = (next + els.length) % els.length;
      if (next === index) return;
      loadImages(next);
      els.forEach((el, i) => {
        el.classList.toggle("is-active", i === next);
        el.inert = i !== next;
      });
      tabEls.forEach((t, i) => t.setAttribute("aria-current", String(i === next)));
      const glow = slides[next].glow;
      if (glow) hero.style.setProperty("--hero-glow", `rgba(${glow}, 0.2)`);
      else hero.style.removeProperty("--hero-glow");
      const tint = slides[next].tint;
      if (tint) hero.style.setProperty("--hero-tint", tint);
      else hero.style.removeProperty("--hero-tint");
      index = next;
      loadImages(next + 1);
      // Keep the current tab in view without moving the page.
      const row = tabs;
      const tab = tabEls[next];
      const left = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
      row.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      schedule();
    }

    const playing = () => !userPaused && held.size === 0;

    function schedule() {
      clearTimeout(timer);
      hero.classList.toggle("is-playing", !userPaused);
      hero.classList.toggle("is-held", held.size > 0);
      // Restart the progress line on the current tab.
      if (!userPaused) {
        hero.classList.remove("is-playing");
        void hero.offsetWidth;
        hero.classList.add("is-playing");
      }
      if (playing()) timer = setTimeout(() => show(index + 1), INTERVAL);
    }

    function hold(reason, on) {
      const before = held.size;
      if (on) held.add(reason);
      else held.delete(reason);
      if (before === held.size) return;
      // Coming back from a hold starts the wait again, so a slide is never cut short.
      schedule();
    }

    function syncToggle() {
      toggle.setAttribute("aria-pressed", String(userPaused));
      toggle.setAttribute("aria-label", userPaused ? "Play slides" : "Pause slides");
      toggle.innerHTML = icon(userPaused ? "play" : "pause");
    }

    els.forEach((el, i) => (el.inert = i !== 0));
    loadImages(1);
    syncToggle();

    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-hero-tab]");
      if (tab) show(Number(tab.dataset.heroTab));
    });
    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      show(index + (event.key === "ArrowRight" ? 1 : -1));
      tabEls[index].focus({ preventScroll: true });
    });
    $("[data-hero-prev]", hero).addEventListener("click", () => show(index - 1));
    $("[data-hero-next]", hero).addEventListener("click", () => show(index + 1));
    toggle.addEventListener("click", () => {
      userPaused = !userPaused;
      syncToggle();
      schedule();
    });

    hero.addEventListener("pointerover", (e) => e.pointerType === "mouse" && hold("hover", Boolean(e.target.closest("a, button"))));
    hero.addEventListener("pointerleave", () => hold("hover", false));
    // Keyboard focus only: a mouse click on a tab or an arrow must not leave the hero waiting.
    hero.addEventListener("focusin", (e) => hold("focus", e.target.matches(":focus-visible")));
    hero.addEventListener("focusout", (e) => !hero.contains(e.relatedTarget) && hold("focus", false));
    document.addEventListener("visibilitychange", () => hold("hidden", document.hidden));

    // Swipe on touch screens.
    let start = null;
    stage.addEventListener("pointerdown", (e) => {
      start = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener("pointerup", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener("pointercancel", () => (start = null));

    schedule();
  }

  FrameX.homeHero = { init };
})((window.FrameX = window.FrameX || {}));
