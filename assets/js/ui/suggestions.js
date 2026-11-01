/* ==========================================================================
   Suggestions under a product (owner, 2026-11-01), in this order:
     Similar products       every product of its category (wall art: of its
                            collection), the closest first: most categories
                            in common, the same shop, popular ones, a near price
     You may also like      from other categories: wall art in a matching style
                            and frames. Nothing from "Similar" again.
     Recently viewed        what this visitor opened before, newest first. Kept
                            in this browser only (no account needed).
     More products for you  frames, wall art and artworks mixed, PAGE at a time;
                            the next ones come as the visitor scrolls down.
                            Things already in a row above come last.
   The first three are one-line rows that move sideways: arrows and the
   touchpad on a laptop, a swipe on a phone (not on their own: owner's choice).
   Popular products (ordered most in the last 30 days, then viewed most;
   services/popular.js) go first where the order is otherwise open. Artworks come from the FrameX backend; without
   it (or when it is slow) the rest is shown without them.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc } = FrameX.dom;
  const RECENT_KEY = "framex.recentlyViewed.v1";
  const RECENT_MAX = 20;
  const LIKE_MAX = 12;
  const PAGE = 12;
  const ARTWORK_WAIT_MS = 2500;

  // Wall-art collections that suit a frame of this category
  const STYLE = {
    luxury: ["luxury"], premium: ["luxury"], decorative: ["abstract", "luxury"], classic: ["nature", "abstract"],
    modern: ["modern", "abstract"], metal: ["modern"], minimal: ["minimalist"], wooden: ["nature"],
    family: ["kids", "emotional"], wedding: ["couple"], portraits: ["couple"], gifts: ["quotes", "couple"],
    personalized: ["quotes"], custom: ["quotes"], collage: ["multi-panel"], "gallery-frames": ["multi-panel"],
  };
  const ANY_STYLE = ["nature", "abstract", "motivational"];
  // Collections that go together (a wall-art product's "You may also like")
  const NEAR = {
    motivational: ["quotes", "sports"], quotes: ["motivational", "emotional"], funny: ["emotional", "kids"],
    emotional: ["quotes", "couple"], gaming: ["anime", "movies"], anime: ["gaming", "movies"], movies: ["anime", "music"],
    cars: ["sports", "travel"], nature: ["travel", "minimalist"], travel: ["nature", "cars"], sports: ["motivational", "cars"],
    music: ["movies", "abstract"], minimalist: ["abstract", "modern"], abstract: ["minimalist", "modern"],
    couple: ["emotional", "quotes"], kids: ["funny", "nature"], luxury: ["modern", "abstract"], modern: ["minimalist", "luxury"],
    "3d": ["abstract", "modern"], "multi-panel": ["nature", "abstract"],
  };

  /* ---------------------------------------------------------------- Recently viewed */
  function recentIds() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
    } catch (error) {
      return [];
    }
  }

  function rememberView(id) {
    try {
      const list = [id].concat(recentIds().filter((x) => x !== id)).slice(0, RECENT_MAX + 1); // + the one open now
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (error) {
      /* storage blocked: nothing is remembered */
    }
  }

  /* ---------------------------------------------------------------- Cards */
  const card = (p) => (p.kind === "artwork" ? artworkCard(p.artwork) : p.decor && FrameX.decorUI ? FrameX.decorUI.card(p) : FrameX.templates.productCard(p));

  /** An artist's artwork in the same card as the products around it. */
  function artworkCard(w) {
    const url = esc(FrameX.qs.artworkUrl(w));
    const artist = w.artist ? [w.artist.name, w.artist.city].filter(Boolean).join(" · ") : "";
    const sizes = (w.sizes || []).length;
    return `<article class="product-card" data-artwork-id="${esc(w.id)}">
      <div class="product-card__media">
        ${w.image ? `<img src="${esc(FrameX.http.asset(w.image))}" alt="${esc(w.title)}" width="800" height="1000" loading="lazy" decoding="async">` : ""}
        <a class="product-card__open" href="${url}" aria-label="View ${esc(w.title)}" tabindex="-1"></a>
        <div class="product-card__badges"><span class="badge badge--dark">Artwork</span></div>
      </div>
      <div class="product-card__body">
        <p class="product-card__cat">${esc(artist ? "Artwork by " + artist : "Artwork")}</p>
        <h3 class="product-card__title"><a href="${url}">${esc(w.title)}</a></h3>
        <p class="product-card__price">${sizes > 1 ? "<span>From</span>" : ""}<strong>${FrameX.pricing.formatPrice(w.price)}</strong></p>
        <p class="product-card__meta"><span>${esc([w.kind === "PRINT" ? "Print" : "Original", w.artTypeName].filter(Boolean).join(" · "))}</span></p>
      </div>
      <div class="product-card__actions"><a class="btn btn--dark btn--sm" href="${url}">View Artwork</a></div>
    </article>`;
  }

  /** Approved artworks that can be bought, as feed items; none without the backend or when it is slow. */
  function artworks() {
    const http = FrameX.http;
    if (!http || !http.enabled()) return Promise.resolve([]);
    const asked = http
      .get("/artworks", { limit: 48 })
      .then((r) => (r.items || []).filter((w) => w.available).map((w) => ({ id: "artwork:" + w.id, kind: "artwork", artwork: w })))
      .catch(() => []);
    return Promise.race([asked, new Promise((resolve) => setTimeout(() => resolve([]), ARTWORK_WAIT_MS))]);
  }

  /* ---------------------------------------------------------------- Helpers */
  /** One from each list in turn: a, b, c, a, b, c… */
  function takeTurns(lists) {
    const out = [];
    const queues = lists.map((l) => l.slice());
    while (queues.some((q) => q.length)) queues.forEach((q) => q.length && out.push(q.shift()));
    return out;
  }

  /** The list without repeats (the first one stays). */
  function unique(items) {
    const seen = new Set();
    return items.filter((x) => !seen.has(x.id) && seen.add(x.id));
  }

  /** The same list with these ids moved to the end. */
  const lastly = (items, ids) => items.filter((x) => !ids.has(x.id)).concat(items.filter((x) => ids.has(x.id)));

  const inCollection = (c) => (x) => x.decor && (x.categoryIds || []).includes("hd-" + c);

  /* ---------------------------------------------------------------- Rows */
  function showRow(name, items) {
    const section = $(`#${name}-section`);
    const rail = $(`#${name}-rail`);
    if (!section || !rail) return;
    section.hidden = !items.length;
    if (!items.length) return;
    rail.innerHTML = items.map(card).join("");
    if (FrameX.railNav) FrameX.railNav.attach(rail);
  }

  /* ---------------------------------------------------------------- More products for you */
  function feed(pools, pattern) {
    const grid = $("#more-grid");
    const section = $("#more-section");
    const sentinel = $("#more-sentinel");
    if (!grid || !section) return;
    const order = ["F", "W", "A"];
    let turn = 0;
    const next = () => {
      const want = pattern[turn++ % pattern.length];
      const from = [want].concat(order.filter((k) => k !== want)).find((k) => pools[k].length);
      return from ? pools[from].shift() : null;
    };
    const left = () => order.some((k) => pools[k].length);
    const shown = new Set();

    function more() {
      const page = [];
      while (page.length < PAGE && left()) {
        const item = next();
        if (item && !shown.has(item.id)) {
          shown.add(item.id);
          page.push(item);
        }
      }
      if (page.length) grid.insertAdjacentHTML("beforeend", page.map(card).join(""));
      if (!left()) done();
    }
    function done() {
      if (observer) observer.disconnect();
      if (sentinel) sentinel.hidden = true;
    }

    grid.innerHTML = "";
    section.hidden = false;
    let observer = null;
    more();
    if (!left() || !sentinel) return;
    if (!("IntersectionObserver" in window)) {
      more();
      more();
      return done();
    }
    observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: "0px 0px 800px 0px" });
    observer.observe(sentinel);
  }

  /* ---------------------------------------------------------------- All four */
  async function load(p) {
    rememberView(p.id);
    const wallArt = Boolean(p.decor);
    const top = $("#similar-section");
    if (top) top.hidden = false; // its placeholders show while the lists are worked out
    if (FrameX.decorUI) FrameX.decorUI.wire();
    try {
      const artworksAsked = artworks();
      const [list, byPopular] = await Promise.all([
        FrameX.api.getProducts({ limit: 100000 }),
        FrameX.popular ? FrameX.popular.comparer() : () => 0,
      ]);
      const all = list.items.filter((x) => x.id !== p.id);
      const frames = all.filter((x) => !x.decor);
      const art = all.filter((x) => x.decor);
      const price = (x) => FrameX.pricing.startingPrice(x);
      const shared = (x) => (x.categoryIds || []).filter((c) => (p.categoryIds || []).includes(c)).length;

      // 1. Similar products
      const similar = (wallArt ? art.filter((x) => inCollection(p.decor.collection)(x) && !x.decor.customPhoto) : frames.filter((x) => (x.categoryIds || []).includes(p.category)))
        .sort((a, b) => shared(b) - shared(a) || (b.shopId === p.shopId) - (a.shopId === p.shopId) || byPopular(a, b) || Math.abs(price(a) - price(p)) - Math.abs(price(b) - price(p)));
      const $sub = $("#similar-sub");
      if ($sub) $sub.textContent = wallArt ? "More wall art like this one" : "More frames like this one";
      showRow("similar", similar);
      const above = new Set(similar.map((x) => x.id));

      // 2. You may also like
      const styles = wallArt ? NEAR[p.decor.collection] || ANY_STYLE : [...new Set((p.categoryIds || []).flatMap((c) => STYLE[c] || []))];
      // (a collection's own wall art before what is only also in it)
      const own = (c) => (a, b) => byPopular(a, b) || (b.decor.collection === c) - (a.decor.collection === c);
      const styleArt = takeTurns((styles.length ? styles : ANY_STYLE).map((c) => art.filter((x) => inCollection(c)(x) && !above.has(x.id)).sort(own(c))));
      const goodFrames = frames.filter((x) => !above.has(x.id)).sort((a, b) => byPopular(a, b) || (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
      const like = (wallArt ? takeTurns([goodFrames.slice(0, 6), styleArt.slice(0, 6)]) : takeTurns([styleArt.slice(0, 8), goodFrames.slice(0, 4)])).slice(0, LIKE_MAX);
      showRow("like", like);
      like.forEach((x) => above.add(x.id));

      // 3. Recently viewed
      const byId = new Map(all.map((x) => [x.id, x]));
      const recent = recentIds().map((id) => byId.get(id)).filter(Boolean).slice(0, RECENT_MAX);
      showRow("recent", recent);

      // 4. More products for you: this product's own kind a little more often
      const sameFirst = (items, same) => items.filter(same).concat(items.filter((x) => !same(x)));
      const F = lastly(sameFirst(frames.slice().sort(byPopular), (x) => (x.categoryIds || []).includes(p.category)), above);
      const collections = [...new Set(art.map((x) => x.decor.collection))];
      const first = wallArt ? [p.decor.collection].concat(NEAR[p.decor.collection] || []) : styles;
      const W = lastly(unique(takeTurns(sameFirst(collections, (c) => first.includes(c)).map((c) => art.filter((x) => x.decor.collection === c).sort(byPopular)))), above);
      // (the rows above are already showing while the artworks are on their way: ARTWORK_WAIT_MS at most)
      feed({ F, W, A: await artworksAsked }, wallArt ? "WFWAWFWFWAWF" : "FWFAFWFWFAFW");
    } catch (error) {
      console.error("Suggestions failed", error);
      const rail = $("#similar-rail");
      if (rail) FrameX.templates.showError(rail, "Suggestions couldn't be loaded.", () => load(p));
    }
  }

  FrameX.suggestions = { load, rememberView, recentIds };
})((window.FrameX = window.FrameX || {}));
