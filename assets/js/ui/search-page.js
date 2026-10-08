/* ==========================================================================
   Site search (search.html). One box; the backend answers with the first few
   matches of each kind: products, templates, shops, artists and artworks,
   and only what the public may see. Each group links to the page that shows
   the rest.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon, debounce } = FrameX.dom;
  const GROUPS = [
    ["products", "Products", (q) => `shop.html?q=${encodeURIComponent(q)}#collection`],
    ["artworks", "Artworks", (q) => `art.html?view=artworks&q=${encodeURIComponent(q)}#browse`],
    ["artists", "Artists", (q) => `art.html?q=${encodeURIComponent(q)}#browse`],
    ["templates", "Templates", () => "templates.html"],
    ["shops", "Shops", () => "shop.html#shops"],
  ];
  const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

  async function init() {
    const root = $("#search-root");
    if (!root) return;
    const input = $("#search-q");
    const out = $("#search-results");
    if (!FrameX.http.enabled()) return (out.innerHTML = `<div class="state-message"><strong>Search isn't available right now</strong><span>You can still browse the shop.</span><a class="btn btn--primary btn--sm" href="shop.html">Shop frames</a></div>`);
    const row = (kind, i) => {
      const meta = kind === "products" ? i.shopName : kind === "artworks" ? `by ${i.artistName} · ${rupees(i.price)}` : kind === "artists" ? `@${i.username} · ${i.city}` : kind === "shops" ? i.city : "Design template";
      return `<a class="cp-row" href="${esc(i.url)}">${i.image ? `<img class="ad-thumb" src="${esc(FrameX.http.asset(i.image))}" alt="" loading="lazy">` : `<span class="artist-photo" aria-hidden="true">${esc(String(i.name).slice(0, 1).toUpperCase())}</span>`}<span><strong>${esc(i.name)}</strong><br><span class="cp-row__meta">${esc(meta || "")}</span></span>${icon("arrow-right")}</a>`;
    };
    let last = 0;
    async function run() {
      const q = input.value.trim();
      const mine = (last += 1);
      history.replaceState(null, "", q ? `search.html?q=${encodeURIComponent(q)}` : "search.html");
      if (q.length < 2) return (out.innerHTML = `<p class="pp-muted">Type at least two letters: a frame, a design, a shop, an artist, a style or a city.</p>`);
      out.innerHTML = `<div class="skeleton" style="height:160px"></div>`;
      try {
        const r = await FrameX.http.get("/search", { q, limit: 6 });
        if (mine !== last) return; // an older answer arriving late
        const groups = GROUPS.filter(([kind]) => r.results[kind] && r.results[kind].total);
        out.innerHTML = groups.length
          ? groups.map(([kind, label, more]) => `<section class="art-section" aria-label="${label}"><div class="section-head"><h2 class="section-title section-title--sm">${label} <span class="art-count">(${r.results[kind].total})</span></h2>${r.results[kind].total > r.results[kind].items.length ? `<a class="btn btn--outline btn--sm" href="${esc(more(q))}">See all</a>` : ""}</div>${r.results[kind].items.map((i) => row(kind, i)).join("")}</section>`).join("")
          : `<div class="state-message"><strong>Nothing matches “${esc(q)}”</strong><span>Try a shorter word, or browse instead.</span><a class="btn btn--primary btn--sm" href="shop.html">Shop frames</a></div>`;
      } catch (error) {
        if (mine === last) FrameX.templates.showError(out, "Search couldn't be loaded.", run);
      }
    }
    input.value = FrameX.qs.param("q") || "";
    input.addEventListener("input", debounce(run, 300));
    $("#search-form").addEventListener("submit", (e) => (e.preventDefault(), run()));
    input.focus();
    run();
  }

  FrameX.searchPage = { init };
})((window.FrameX = window.FrameX || {}));
