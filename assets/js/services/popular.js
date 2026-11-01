/* ==========================================================================
   Popular products (owner, 2026-11-01): the products ordered most in the
   last 30 days, then those viewed most, most first. The FrameX backend
   counts them (GET /api/catalog/popular: product ids only). "Highly
   recommended frames" on the home page and the product page's suggestions
   put them first, so they change with every order and view.
   Asked once per page. A slow backend (a free host sleeps when nobody
   visits) must not hold a row up: after WAIT_MS the list from an earlier
   page stands in, or no list at all; without a backend there is none.
   ========================================================================== */
(function (FrameX) {
  const KEY = "framex.popular.v1";
  const WAIT_MS = 1500;
  let asked = null;

  function remembered() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      return saved && Array.isArray(saved.ids) ? saved.ids : [];
    } catch (error) {
      return [];
    }
  }

  function remember(ids) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ids, at: Date.now() }));
    } catch (error) {
      /* storage blocked: the next page asks again */
    }
  }

  /** The popular products' ids: ordered most first, then viewed most. */
  function ids() {
    if (asked) return asked;
    const http = FrameX.http;
    if (!http || !http.enabled()) return (asked = Promise.resolve([]));
    const fresh = http
      .get("/catalog/popular")
      .then((r) => {
        const list = (r.items || []).map(String);
        remember(list);
        return list;
      })
      .catch(() => remembered());
    const late = new Promise((resolve) => setTimeout(() => resolve(remembered()), WAIT_MS));
    asked = Promise.race([fresh, late]);
    return asked;
  }

  /** A comparer for sort(): popular products first (in the order above); the others keep their order. */
  async function comparer() {
    const rank = new Map((await ids()).map((id, i) => [id, i]));
    const at = (p) => (rank.has(p.id) ? rank.get(p.id) : Infinity);
    return (a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1);
  }

  FrameX.popular = { ids, comparer };
})((window.FrameX = window.FrameX || {}));
