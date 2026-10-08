/* ==========================================================================
   Home Decor & Wall Art (home-decor.html).

     FrameX.decorUI     the wall-art product card and its links, also used by
                        the product page for related wall art
     FrameX.decorPage   the page: featured collections, category chips,
                        trending, multi-panel sets, custom photo, premium and
                        the searchable "All wall art" grid

   Products come from the catalogue (js/decor.js) through FrameX.api, like on
   every other page. "Add to Cart" uses the one FrameX cart: the backend looks
   the product up and prices it; nothing here sends a price.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, debounce, prefersReducedMotion } = FrameX.dom;
  const { formatPrice, finalPrice, sizeOptions, availability } = FrameX.pricing;

  const PAGE = "home-decor.html";
  const STUDIO = "wall-art-studio.html";
  const PER_PAGE = 24;
  const decor = () => (FrameX.seed && FrameX.seed.decor) || null;

  /* ---------------------------------------------------------------- Links */
  const collectionUrl = (id) => `${PAGE}?c=${encodeURIComponent(id)}#browse`;
  /** The customiser for a custom-photo product, keeping any options already chosen. */
  function studioUrl(product, selection = {}) {
    const q = new URLSearchParams({ product: product.id });
    if (selection.sizeId) q.set("size", selection.sizeId);
    if (selection.colorId) q.set("color", selection.colorId);
    if (selection.printMaterialId) q.set("print", selection.printMaterialId);
    return `${STUDIO}?${q}`;
  }
  const collectionName = (id) => {
    const found = decor() && decor().collections.find((c) => c.id === id);
    return found ? found.name : "";
  };

  /* ---------------------------------------------------------------- Card */
  function sizesLine(product) {
    const sizes = sizeOptions(product);
    if (!sizes.length) return "";
    const first = sizes[0].dimensions || sizes[0].label;
    const last = sizes[sizes.length - 1].dimensions || sizes[sizes.length - 1].label;
    return sizes.length > 1 ? `${sizes.length} sizes · ${first} to ${last}` : first;
  }

  /**
   * One wall-art product: picture, name, category, rating (only when real
   * reviews exist), price with the original price and discount, sizes, and
   * the two actions.
   */
  function card(product) {
    const d = product.decor || {};
    const url = FrameX.qs.productUrl(product);
    const out = availability(product) === "out_of_stock";
    const off = Number(product.discountPercent) || 0;
    const badges = [];
    if (off > 0 && !out) badges.push(`<span class="badge badge--discount">${off}% off</span>`);
    if (d.customPhoto) badges.push(`<span class="badge badge--accent">${icon("upload")} Your photo</span>`);
    if (d.panelCount > 1) badges.push(`<span class="badge badge--dark">${d.panelCount} panels</span>`);
    const rating =
      product.rating && product.rating.count > 0
        ? `<p class="product-card__rating">${icon("star", "icon--fill")} ${Number(product.rating.average).toFixed(1)} <span>(${product.rating.count})</span></p>`
        : "";
    const primary = d.customPhoto
      ? `<a class="btn btn--primary btn--sm" href="${studioUrl(product)}">Customize &amp; Create</a>`
      : `<a class="btn btn--dark btn--sm" href="${url}">View Product</a>`;
    const add = d.customPhoto
      ? ""
      : `<button class="btn btn--outline btn--sm" type="button" data-decor-add data-product-id="${esc(product.id)}" ${out ? "disabled" : ""}>${out ? "Out of stock" : `${icon("bag")} Add to Cart`}</button>`;

    return `<article class="product-card" data-product-id="${esc(product.id)}">
      <div class="product-card__media">
        <img src="${esc(product.image)}" alt="${esc(product.name)}, framed wall art" width="800" height="1000" loading="lazy" decoding="async">
        <a class="product-card__open" href="${url}" aria-label="View ${esc(product.name)}" tabindex="-1"></a>
        <div class="product-card__badges">${badges.join("")}</div>
        ${FrameX.templates.wishButton(product, "product-card__wish")}
      </div>
      <div class="product-card__body">
        <p class="product-card__cat">${esc(collectionName(d.collection))}</p>
        <h3 class="product-card__title"><a href="${url}">${esc(product.name)}</a></h3>
        ${rating}
        <p class="product-card__price"><strong>${formatPrice(finalPrice(product))}</strong>${off > 0 ? `<s>${formatPrice(product.price)}</s><em>${off}% off</em>` : ""}</p>
        <p class="product-card__meta">${esc(sizesLine(product))}</p>
      </div>
      <div class="product-card__actions">${primary}${add}</div>
    </article>`;
  }

  /** "Add to Cart" on a card: the product with its standard options (Medium, first frame colour, matte). */
  async function quickAdd(button) {
    if (button.dataset.adding) return;
    const product = await FrameX.api.getProduct(button.dataset.productId);
    if (!product) return;
    button.dataset.adding = "1";
    button.setAttribute("aria-busy", "true");
    const result = await FrameX.cart.add({ productId: product.id, name: product.name, selection: {} });
    delete button.dataset.adding;
    button.removeAttribute("aria-busy");
    const size = result.ok && result.item ? result.item.size : "";
    FrameX.cart.announce(result, `${product.name}${size ? ` (${size})` : ""} added to cart.`);
  }

  let wired = false;
  /** Card buttons work wherever a card is shown. */
  function wire() {
    if (wired) return;
    wired = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-decor-add]");
      if (button) quickAdd(button);
    });
  }

  FrameX.decorUI = { card, wire, studioUrl, collectionUrl, collectionName, PAGE, STUDIO };

  /* ---------------------------------------------------------------- Page */
  let all = []; // every wall-art product, in catalogue order
  const state = { c: "", q: "", panels: "", sort: "featured", shown: PER_PAGE };

  const byId = (id) => all.find((p) => p.id === id);
  const fill = (el, products, empty = "") => {
    if (!el) return;
    el.innerHTML = products.length ? products.map(card).join("") : empty;
    el.setAttribute("aria-busy", "false");
  };

  function matches(product, words) {
    if (!words.length) return true;
    const hay = [product.name, product.description, collectionName(product.decor.collection), ...(product.tags || [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  }

  function filtered() {
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    let items = all.filter((p) => (!state.c || p.decor.collections.includes(state.c)) && (!state.panels || String(p.decor.panelCount) === state.panels) && matches(p, words));
    if (state.sort === "price_asc") items = [...items].sort((a, b) => finalPrice(a) - finalPrice(b));
    if (state.sort === "price_desc") items = [...items].sort((a, b) => finalPrice(b) - finalPrice(a));
    if (state.sort === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  function writeUrl() {
    const q = new URLSearchParams();
    if (state.c) q.set("c", state.c);
    if (state.q) q.set("q", state.q);
    if (state.panels) q.set("panels", state.panels);
    if (state.sort !== "featured") q.set("sort", state.sort);
    const s = q.toString();
    history.replaceState(null, "", PAGE + (s ? "?" + s : "") + (s ? "#browse" : ""));
  }

  function renderBrowse() {
    const items = filtered();
    const grid = $("#hd-browse");
    fill(
      grid,
      items.slice(0, state.shown),
      `<div class="state-message"><strong>No wall art matches that</strong><span>Try another word, or clear the filters.</span><button class="btn btn--outline btn--sm" type="button" data-decor-clear>Clear filters</button></div>`,
    );
    const name = state.c ? collectionName(state.c) : "";
    $("#hd-count").textContent = `${items.length} ${items.length === 1 ? "piece" : "pieces"}${name ? ` in ${name}` : ""}${state.q ? ` for “${state.q}”` : ""}`;
    $("#browse-title").textContent = name || "All wall art";
    $("#hd-more").hidden = items.length <= state.shown;
    $$("#hd-browse-chips .chip, #hd-collection-chips .chip").forEach((chip) => chip.setAttribute("aria-pressed", String((chip.dataset.collection || "") === state.c)));
    const active = $(`#hd-browse-chips .chip[aria-pressed="true"]`);
    // Bring the chosen chip to the middle of its row. Only the row moves: scrollIntoView would also move the page.
    const row = active && active.closest("#hd-browse-chips");
    if (row) {
      const a = active.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      row.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
    }
    FrameX.reveal.observe(grid);
  }

  function setFilter(change, { scroll = false } = {}) {
    Object.assign(state, change, { shown: PER_PAGE });
    $("#hd-search").value = state.q;
    $("#hd-panel-filter").value = state.panels;
    $("#hd-sort").value = state.sort;
    renderBrowse();
    writeUrl();
    if (scroll) $("#browse").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function renderPanels(count = "") {
    const sets = all.filter((p) => p.decor.panelCount > 1 && !p.decor.customPhoto && (!count || String(p.decor.panelCount) === count));
    fill($("#hd-panels"), sets.slice(0, 8), `<div class="state-message"><strong>No sets with that many panels yet</strong></div>`);
    $("#hd-panels-more").hidden = sets.length <= 8;
    $$("#hd-panel-tabs .chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.panels === count)));
    $("#hd-panels-more").dataset.panels = count;
  }

  function renderStatic() {
    const d = decor();
    const multi = all.filter((p) => p.decor.panelCount > 1).length;
    $("#hd-facts").innerHTML = [
      [all.length, "framed designs"],
      [d.collections.length, "collections"],
      [multi, "multi-panel sets"],
    ]
      .map(([value, label]) => `<div><dt class="visually-hidden">${esc(label)}</dt><dd><strong>${value}</strong>${esc(label)}</dd></div>`)
      .join("");

    // Three pieces on the hero wall.
    const wall = ["hd-moonlit-wanderer", "hd-never-give-up", "hd-terracotta-arches"].map(byId).filter(Boolean);
    $("#hd-hero-wall").innerHTML = wall.map((p) => `<a class="page-hero__piece" href="${FrameX.qs.productUrl(p)}" aria-label="${esc(p.name)}"><img src="${esc(p.image)}" alt="" width="800" height="1000" decoding="async"></a>`).join("");

    const featured = d.featuredCollections.map((id) => d.collections.find((c) => c.id === id)).filter(Boolean);
    const box = $("#hd-featured");
    box.innerHTML = featured
      .map(
        (c) => `<a class="collection-card" href="${collectionUrl(c.id)}" data-collection="${esc(c.id)}">
        <img src="${esc(c.image)}" alt="" width="800" height="1000" loading="lazy" decoding="async">
        <span><span class="collection-card__name">${esc(c.name)}</span><span class="collection-card__blurb">${esc(c.blurb)}</span>
        <span class="collection-card__count">${c.count} pieces ${icon("arrow-right")}</span></span></a>`,
      )
      .join("");
    box.setAttribute("aria-busy", "false");

    const chip = (c) => `<button class="chip" type="button" data-collection="${esc(c.id)}" aria-pressed="false">${esc(c.name)} <small>${c.count}</small></button>`;
    const allChip = `<button class="chip" type="button" data-collection="" aria-pressed="true">All <small>${all.length}</small></button>`;
    $("#hd-collection-chips").innerHTML = d.collections.map(chip).join("");
    $("#hd-browse-chips").innerHTML = allChip + d.collections.map(chip).join("");

    fill($("#hd-trending"), d.trendingIds.map(byId).filter(Boolean).slice(0, 8));
    fill($("#hd-custom"), d.customIds.map(byId).filter(Boolean));
    fill($("#hd-premium"), d.premiumIds.map(byId).filter(Boolean).slice(0, 8));
    renderPanels();
  }

  function listen() {
    wire();
    // Any link or chip that names a collection filters the grid in place.
    document.addEventListener("click", (event) => {
      const pick = event.target.closest("[data-collection]");
      if (pick) {
        event.preventDefault();
        setFilter({ c: pick.dataset.collection, q: "", panels: "" }, { scroll: !pick.closest("#hd-browse-chips") });
        return;
      }
      const tab = event.target.closest("#hd-panel-tabs [data-panels]");
      if (tab) return renderPanels(tab.dataset.panels);
      if (event.target.closest("#hd-panels-more button")) return setFilter({ c: "multi-panel", q: "", panels: $("#hd-panels-more").dataset.panels || "" }, { scroll: true });
      if (event.target.closest("#hd-more button")) {
        state.shown += PER_PAGE;
        return renderBrowse();
      }
      if (event.target.closest("[data-decor-clear]")) setFilter({ c: "", q: "", panels: "", sort: "featured" });
    });
    $("#hd-search").addEventListener(
      "input",
      debounce((event) => setFilter({ q: event.target.value.trim() }), 200),
    );
    $("#hd-panel-filter").addEventListener("change", (event) => setFilter({ panels: event.target.value }));
    $("#hd-sort").addEventListener("change", (event) => setFilter({ sort: event.target.value }));
  }

  async function init() {
    const grid = $("#hd-browse");
    if (!grid) return;
    if (!decor()) {
      grid.innerHTML = `<div class="state-message"><strong>Wall art couldn't be loaded</strong><span>Please refresh the page.</span></div>`;
      return;
    }
    $$("main .product-grid").forEach((el) => (el.innerHTML = FrameX.templates.skeletons(4)));
    try {
      const { items } = await FrameX.api.getProducts({ category: decor().mainCategoryId, limit: 2000 });
      all = items.filter((p) => p.decor);
    } catch (error) {
      console.error("Wall art failed to load", error);
      $$("main .product-grid").forEach((el) => (el.innerHTML = ""));
      return FrameX.templates.showError(grid, "Wall art couldn't be loaded.", init);
    }
    const param = FrameX.qs.param;
    const known = decor().collections.some((c) => c.id === param("c"));
    Object.assign(state, {
      c: known ? param("c") : "",
      q: (param("q") || "").slice(0, 60),
      panels: ["1", "2", "3", "4", "5"].includes(param("panels")) ? param("panels") : "",
      sort: ["price_asc", "price_desc", "name"].includes(param("sort")) ? param("sort") : "featured",
    });
    renderStatic();
    listen();
    $("#hd-search").value = state.q;
    $("#hd-panel-filter").value = state.panels;
    $("#hd-sort").value = state.sort;
    renderBrowse();
    // A link like home-decor.html?c=gaming#browse lands on the grid once it has its cards.
    if (location.hash === "#browse" || state.c || state.q) requestAnimationFrame(() => $("#browse").scrollIntoView({ block: "start" }));
  }

  FrameX.decorPage = { init };
})((window.FrameX = window.FrameX || {}));
