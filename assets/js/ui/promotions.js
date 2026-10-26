/* ==========================================================================
   Promotions (owner, 2026-10-26): the home page's picture banners and the
   slim promotion strips on the home, shop, product and Home Decor pages.
   They come from Admin -> Promotions (GET /api/promotions, asked once per
   page). The pictures written in the page itself are what shows when the
   backend can't be reached.

   A place on a page: an element with data-promo-slot="<placement>"
   (home-banners is the offers track, ui/offers.js; the others are
   .promo-strip boxes). Each promotion is one link with a laptop and a phone
   picture (<picture>), its words drawn in.

   A promotion about a coupon (data-offer-coupon="<code>") goes when the
   backend no longer lists that coupon (GET /api/coupons); one with
   data-offer-feature="firstOrderFree" goes when that offer is switched off
   (GET /api/config). ui/offers.js does the same for the banners.
   ========================================================================== */
(function (FrameX) {
  const { $$, escapeHtml: esc } = FrameX.dom;

  let loading = null;
  /** Today's promotions, or null when the backend can't be asked (the page keeps its own pictures). */
  function load() {
    loading =
      loading ||
      (FrameX.http && FrameX.http.enabled && FrameX.http.enabled()
        ? FrameX.http
            .get("/promotions")
            .then((r) => (r && Array.isArray(r.items) ? r.items : null))
            .catch(() => null)
        : Promise.resolve(null));
    return loading;
  }

  const url = (path) => esc(FrameX.http && FrameX.http.asset ? FrameX.http.asset(path) : path);
  const hideAttrs = (p) => (p.hide && p.hide.coupon ? ` data-offer-coupon="${esc(p.hide.coupon)}"` : p.hide && p.hide.feature ? ` data-offer-feature="${esc(p.hide.feature)}"` : "");
  const picture = (p, phoneMedia, size, lazy) => `<picture>
      <source media="(max-width: 639px)" srcset="${url(p.phone)}" width="${size.phone[0]}" height="${size.phone[1]}">
      <img src="${url(p.laptop)}" alt="${esc(p.title)}" width="${size.laptop[0]}" height="${size.laptop[1]}"${lazy ? ' loading="lazy"' : ""} decoding="async">
    </picture>`;
  const BANNER = { laptop: [2400, 760], phone: [1080, 608] };
  const STRIP = { laptop: [2400, 300], phone: [1080, 260] };
  // A short name for the slide ("Diwali offer" from "Diwali offer: 10% off …")
  const slideName = (title) => String(title).split(/[:.]/)[0].slice(0, 60);

  /** The home banners (ui/offers.js calls this before it starts the slides). */
  async function fillBanners(track) {
    const items = await load();
    if (!items || !track) return; // the page's own banners stay
    const banners = items.filter((p) => p.placement === "home-banners");
    if (!banners.length) {
      const section = track.closest("[data-offers]");
      if (section) section.remove();
      return;
    }
    track.innerHTML = banners
      .map(
        (p, i) => `<a class="offer offer--pic" href="${esc(p.link || "#")}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${banners.length}: ${esc(slideName(p.title))}"${hideAttrs(p)}>
          ${picture(p, true, BANNER, i > 0)}
        </a>`,
      )
      .join("");
  }

  /** The strips: today's promotions in each place (none = the place goes). */
  async function fillStrips() {
    const slots = $$(".promo-strip[data-promo-slot]");
    if (!slots.length) return;
    const items = await load();
    if (!items) return;
    slots.forEach((slot) => {
      const mine = items.filter((p) => p.placement === slot.dataset.promoSlot);
      if (!mine.length) return slot.remove();
      slot.innerHTML = mine.map((p) => `<a class="promo-strip__link" href="${esc(p.link || "#")}"${hideAttrs(p)}>${picture(p, true, STRIP, true)}</a>`).join("");
    });
  }

  /** A strip whose coupon has ended, or whose offer is switched off, goes (its box too when it was the last one). */
  function hideEnded() {
    const links = $$(".promo-strip [data-offer-coupon], .promo-strip [data-offer-feature]");
    if (!links.length || !FrameX.http) return;
    const drop = (link) => {
      const box = link.closest(".promo-strip");
      link.remove();
      if (box && !box.querySelector(".promo-strip__link")) box.remove();
    };
    const coupons = links.filter((l) => l.dataset.offerCoupon);
    const features = links.filter((l) => l.dataset.offerFeature);
    if (coupons.length)
      FrameX.http
        .get("/coupons")
        .then((r) => {
          const live = new Set(((r && r.items) || []).map((c) => c.code));
          coupons.forEach((l) => !live.has(l.dataset.offerCoupon) && drop(l));
        })
        .catch(() => {});
    if (features.length && FrameX.http.serverConfig)
      FrameX.http
        .serverConfig()
        .then((settings) => {
          if (!settings) return;
          const on = { firstOrderFree: Boolean(settings.delivery && settings.delivery.firstOrderFree) };
          features.forEach((l) => !on[l.dataset.offerFeature] && drop(l));
        })
        .catch(() => {});
  }

  async function init() {
    await fillStrips();
    hideEnded();
  }

  FrameX.promotions = { init, load, fillBanners };
})((window.FrameX = window.FrameX || {}));
