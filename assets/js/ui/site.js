/* Applies site-level content (stats, socials, offer, contact) to the page. */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function renderStats(stats) {
    const container = $("#hero-stats");
    if (!container) return;
    container.innerHTML = stats
      .map(
        (s, i) => `<div class="hero__stat" style="--i:${i}">
          ${s.icon ? `<span class="hero__stat-icon">${icon(s.icon)}</span>` : ""}
          <div class="hero__stat-value" data-count-to="${s.value}" data-suffix="${esc(s.suffix || "")}"><span>0</span></div>
          <div class="hero__stat-label">${esc(s.label)}</div>
        </div>`,
      )
      .join("");
    startCounters(container);
  }

  /** Count up once, when the stats scroll into view. Ends on a compact value (1000 -> 1K). */
  function startCounters(container) {
    // "en" gives 1K; the en-IN locale would render 1000 as "1T".
    const compact = new Intl.NumberFormat("en", { notation: "compact" });
    const targets = $$("[data-count-to]", container);
    const finish = (el) => {
      el.innerHTML = `${compact.format(Number(el.dataset.countTo))}<span>${esc(el.dataset.suffix)}</span>`;
    };

    if (
      FrameX.dom.prefersReducedMotion() ||
      !("IntersectionObserver" in window)
    ) {
      targets.forEach(finish);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.countTo);
        const started = performance.now();
        const duration = 1600;
        const tick = (now) => {
          const progress = Math.min((now - started) / duration, 1);
          if (progress < 1) {
            el.innerHTML = `${Math.round(end * easeOutCubic(progress))}<span>${esc(el.dataset.suffix)}</span>`;
            requestAnimationFrame(tick);
          } else {
            finish(el);
          }
        };
        requestAnimationFrame(tick);
      });
    });
    targets.forEach((el) => {
      el.innerHTML = `0<span>${esc(el.dataset.suffix)}</span>`;
      observer.observe(el);
    });
  }

  /** Social icons link to the profile URLs in assets/data/site.seed.js. An icon
      without a URL stays hidden, and so does "Follow us" when none are set. */
  function applySocials(social) {
    $$("[data-social]").forEach((link) => {
      const url = social[link.dataset.social];
      link.hidden = !url;
      if (!url) return;
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
    $$(".hero__socials").forEach((group) => {
      group.hidden = !$$("[data-social]", group).some((link) => !link.hidden);
    });
  }

  /**
   * Blocks that should stand at exactly the same height carry the same
   * data-match-height="<group>" (the home page's promo bands). The shorter
   * ones grow to the tallest; measured again when the window, the fonts or the
   * pictures change the layout.
   */
  function matchHeights() {
    const groups = new Map();
    $$("[data-match-height]").forEach((el) => {
      const key = el.dataset.matchHeight;
      groups.set(key, (groups.get(key) || []).concat(el));
    });
    const lists = [...groups.values()].filter((list) => list.length > 1);
    if (!lists.length) return;
    const apply = () =>
      lists.forEach((list) => {
        list.forEach((el) => (el.style.minHeight = ""));
        const tallest = Math.max(...list.map((el) => el.getBoundingClientRect().height));
        list.forEach((el) => (el.style.minHeight = Math.ceil(tallest) + "px"));
      });
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("resize", later);
    window.addEventListener("load", later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  }

  async function init() {
    matchHeights();
    try {
      const site = await FrameX.api.getSite();
      if (!site) return;
      renderStats(site.stats || []);
      applySocials(site.social || {});
    } catch (error) {
      console.error("Site content failed to load", error);
      renderStats([]);
    }
  }

  FrameX.site = { init };
})((window.FrameX = window.FrameX || {}));
