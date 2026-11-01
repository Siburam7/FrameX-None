/* ==========================================================================
   Home: a row of the most popular wall art in "Home Decor & Wall Art" and of
   the most popular artworks in "Art & Artists" (owner, 2026-11-01: each part
   its own row, above its picture tiles). Popular = ordered most in the last
   30 days, then viewed most (services/popular.js). Until there are orders or
   views: FrameX's chosen wall art (js/decor.js SHOWCASE "trending") and the
   newest artworks. One line that moves sideways (arrows + touchpad on a
   laptop, a swipe on a phone). No artworks = no artwork row (the tiles stay).
   ========================================================================== */
(function (FrameX) {
  const { $ } = FrameX.dom;
  const LIMIT = 10;

  const comparer = () => (FrameX.popular ? FrameX.popular.comparer() : () => 0);

  function show(rail, html) {
    rail.innerHTML = html;
    rail.hidden = false;
    if (FrameX.railNav) FrameX.railNav.attach(rail);
  }

  async function wallArt() {
    const rail = $("#decor-popular-rail");
    if (!rail || !FrameX.decorUI || !FrameX.seed.decor) return;
    try {
      const [list, byPopular] = await Promise.all([FrameX.api.getProducts({ category: FrameX.seed.decor.mainCategoryId, inStock: true, limit: 1000 }), comparer()]);
      const chosen = FrameX.seed.decor.trendingIds || [];
      const rank = (p) => (chosen.includes(p.id) ? chosen.indexOf(p.id) : chosen.length);
      const items = list.items.sort((a, b) => byPopular(a, b) || rank(a) - rank(b)).slice(0, LIMIT);
      if (!items.length) return;
      FrameX.decorUI.wire();
      show(rail, items.map(FrameX.decorUI.card).join(""));
    } catch (error) {
      /* the collection tiles below stand on their own */
    }
  }

  async function artworks() {
    const rail = $("#art-popular-rail");
    const http = FrameX.http;
    if (!rail || !http || !http.enabled() || !FrameX.artView) return;
    try {
      // (newest first from the server: the order that stays when nothing is popular yet)
      const [r, byPopular] = await Promise.all([http.get("/artworks", { limit: 48 }), comparer()]);
      const items = (r.items || []).filter((w) => w.available).sort(byPopular).slice(0, LIMIT);
      if (!items.length) return;
      show(rail, items.map((w) => FrameX.artView.artworkCard(w)).join(""));
    } catch (error) {
      /* the two tiles below stand on their own */
    }
  }

  FrameX.homePopular = { init: () => Promise.all([wallArt(), artworks()]) };
})((window.FrameX = window.FrameX || {}));
