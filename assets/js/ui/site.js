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
        </div>`
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

    if (FrameX.dom.prefersReducedMotion() || !("IntersectionObserver" in window)) {
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

  /** Social icons link to the profile URLs in assets/data/site.seed.js. Until a
      URL is added, the icon acts as a button that says the link is coming soon
      (never a dead "#" link). */
  function applySocials(social) {
    $$("[data-social]").forEach((link) => {
      const url = social[link.dataset.social];
      if (url) {
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return;
      }
      link.setAttribute("role", "button");
      link.tabIndex = 0;
      link.dataset.action = "coming-soon";
      link.dataset.feature = "Our " + link.dataset.social.charAt(0).toUpperCase() + link.dataset.social.slice(1) + " page";
      link.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        link.click();
      });
    });
  }

  async function init() {
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
