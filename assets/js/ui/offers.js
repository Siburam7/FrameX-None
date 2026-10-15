/* ==========================================================================
   Offer banners on the home page, under the strip of reasons below the hero
   (index.html, layout-hero.css).

   The banners sit in a row that scrolls sideways and snaps to each one, so a
   finger can swipe them. This adds the dots, the arrows, and the slide to the
   next banner every few seconds. It waits while the mouse is over a banner,
   while one has keyboard focus, for a while after a finger touches it, and
   while the tab is in the background. Visitors who asked their device for
   less motion change banners themselves.

   A coupon banner (data-offer-coupon="<code>") has a button that copies its
   code, and is taken away when the backend's list of coupons that can be
   used now (GET /api/coupons) doesn't have that code any more. A banner
   with data-offer-feature="firstOrderFree" goes the same way when the
   backend's settings (GET /api/config, delivery.firstOrderFree) have that
   offer switched off.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, prefersReducedMotion } = FrameX.dom;

  const INTERVAL = 5000;

  function init() {
    const root = $("[data-offers]");
    const track = root && $("[data-offers-track]", root);
    if (!track) return;
    let banners = $$(".offer", track);
    const dotsBox = $("[data-offers-dots]", root);
    let dots = [];

    // One dot per banner; arrows and dots only when there is more than one
    const layout = () => {
      banners = $$(".offer", track);
      const many = banners.length > 1;
      root.querySelectorAll(".offers__arrow").forEach((b) => (b.hidden = !many));
      dotsBox.innerHTML = many
        ? banners.map((_, i) => `<button class="offers__dot" type="button" data-offers-dot="${i}" aria-label="Show offer ${i + 1}" aria-current="${i === 0}"></button>`).join("")
        : "";
      dots = $$("[data-offers-dot]", dotsBox);
      banners.forEach((b, i) => b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^\d+ of \d+/,`${i + 1} of ${banners.length}`)));
    };
    layout();

    // "Copy code" on a coupon banner
    track.addEventListener("click", async (e) => {
      const button = e.target.closest("[data-copy-coupon]");
      if (!button) return;
      e.preventDefault();
      const code = button.dataset.copyCoupon;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied!";
      } catch (error) {
        // Copying isn't allowed here: select the code so it can be copied by hand
        const text = button.previousElementSibling;
        const range = document.createRange();
        range.selectNodeContents(text);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        button.textContent = "Select & copy";
      }
      setTimeout(() => (button.textContent = "Copy code"), 2200);
    });

    // An offer the backend has switched off takes its banner with it
    const featureBanners = $$("[data-offer-feature]", track);
    if (featureBanners.length && FrameX.http && FrameX.http.serverConfig) {
      FrameX.http
        .serverConfig()
        .then((settings) => {
          if (!settings) return;
          const on = { firstOrderFree: Boolean(settings.delivery && settings.delivery.firstOrderFree) };
          const gone = featureBanners.filter((b) => !on[b.dataset.offerFeature]);
          gone.forEach((b) => b.remove());
          if (gone.length) layout();
        })
        .catch(() => {
          /* settings can't be read: the banner stays */
        });
    }

    // A coupon that can't be used any more takes its banner with it
    const couponBanners = $$("[data-offer-coupon]", track);
    if (couponBanners.length && FrameX.http) {
      FrameX.http
        .get("/coupons")
        .then((r) => {
          const live = new Set(((r && r.items) || []).map((c) => c.code));
          let gone = false;
          couponBanners.forEach((b) => {
            if (!live.has(b.dataset.offerCoupon)) {
              b.remove();
              gone = true;
            }
          });
          if (gone) {
            layout();
            track.scrollTo({ left: 0, behavior: "auto" });
          }
        })
        .catch(() => {
          /* the backend can't be reached: the banner stays (the checkout checks the coupon anyway) */
        });
    }

    const current = () => Math.round(track.scrollLeft / track.clientWidth);
    const go = (i) => {
      if (banners.length < 2) return;
      const n = (i + banners.length) % banners.length;
      track.scrollTo({ left: n * track.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };

    // The dots follow the row, however it was moved
    let frame = 0;
    track.addEventListener("scroll", () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const at = current();
        dots.forEach((d, i) => d.setAttribute("aria-current", String(i === at)));
      });
    }, { passive: true });

    dotsBox.addEventListener("click", (e) => {
      const dot = e.target.closest("[data-offers-dot]");
      if (dot) go(Number(dot.dataset.offersDot));
    });
    $("[data-offers-prev]", root).addEventListener("click", () => go(current() - 1));
    $("[data-offers-next]", root).addEventListener("click", () => go(current() + 1));

    // Sliding by itself, unless something says wait
    if (prefersReducedMotion()) return;
    const waiting = new Set();
    let touchedUntil = 0;
    setInterval(() => {
      if (waiting.size || document.hidden || Date.now() < touchedUntil) return;
      go(current() + 1);
    }, INTERVAL);
    root.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && waiting.add("hover"));
    root.addEventListener("pointerleave", () => waiting.delete("hover"));
    root.addEventListener("focusin", (e) => e.target.matches(":focus-visible") && waiting.add("focus"));
    root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && waiting.delete("focus"));
    track.addEventListener("touchstart", () => (touchedUntil = Date.now() + 8000), { passive: true });
  }

  FrameX.offers = { init };
})((window.FrameX = window.FrameX || {}));
