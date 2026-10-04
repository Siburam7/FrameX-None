/* ==========================================================================
   Product collection: search, category chips, sort, in-stock filter and
   "load more". Everything goes through FrameX.api.getProducts, so it works
   with seed data now and a real API later.
   Two modes:
   - full    (Shop page): toolbar + URL params (?category= &q= &shop=)
   - compact (Shop Detail page): grid + load more for one fixed shop
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, debounce } = FrameX.dom;
  const { templates, config } = FrameX;

  // Attribute filters: the same parameter names the API accepts (see seed-provider getProducts).
  const ATTRS = [
    "material",
    "frameType",
    "finish",
    "size",
    "priceMax",
    "customizable",
  ];
  const state = {
    category: null,
    shopId: null,
    q: "",
    sort: "recommended",
    inStock: false,
    page: 1,
    material: "",
    frameType: "",
    finish: "",
    size: "",
    priceMax: "",
    customizable: false,
  };
  let requestId = 0;
  let els = {};
  let categoryNames = new Map();
  let active = false;

  const params = (page) => ({
    category: state.category,
    shopId: state.shopId,
    q: state.q,
    sort: state.sort,
    inStock: state.inStock,
    material: state.material,
    frameType: state.frameType,
    finish: state.finish,
    size: state.size,
    priceMax: state.priceMax,
    customizable: state.customizable,
    page,
    limit: config.productPageSize,
  });

  /** "More filters": only filters that real products can match are offered. */
  async function renderFilters() {
    const box = $("#collection-filters");
    if (!box || !FrameX.api.getProductFacets) return;
    let f;
    try {
      f = await FrameX.api.getProductFacets();
    } catch (error) {
      return; // filters are optional; the grid still works
    }
    const select = (key, label, options) =>
      options.length > 1
        ? `<label class="catalog-filters__field"><span>${label}</span><select class="select" data-attr="${key}"><option value="">Any</option>${options.map((o) => `<option value="${esc(o.id)}"${String(state[key]) === String(o.id) ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>`
        : "";
    const steps = [500, 750, 1000, 1500, 2000, 3000].filter(
      (n) => n > f.price.min && n < f.price.max,
    );
    const html = [
      select(
        "material",
        "Material",
        f.materials.map((m) => ({ id: m, name: m })),
      ),
      select("frameType", "Frame type", f.frameTypes),
      select(
        "finish",
        "Finish",
        f.finishes.map((m) => ({ id: m, name: m })),
      ),
      select(
        "size",
        "Size",
        f.sizes.map((m) => ({ id: m, name: m })),
      ),
      select(
        "priceMax",
        "Price",
        steps.map((n) => ({
          id: n,
          name: `Up to ${FrameX.pricing.formatPrice(n)}`,
        })),
      ),
      f.customizable
        ? `<label class="switch catalog-filters__switch"><input type="checkbox" data-attr="customizable"${state.customizable ? " checked" : ""}><span>Customizable in FrameX Studio</span></label>`
        : "",
    ].join("");
    if (!html.trim()) return;
    $("#collection-filter-fields").innerHTML =
      html +
      `<button class="btn btn--outline btn--sm" type="button" data-clear-attrs>Clear these filters</button>`;
    box.hidden = false;
    syncFilterCount();
  }

  function syncFilterCount() {
    const n = ATTRS.filter((k) => state[k]).length;
    const el = $("#collection-filter-count");
    if (el) el.textContent = n ? `(${n})` : "";
    const box = $("#collection-filters");
    if (box && n) box.open = true;
  }

  function renderChips(categories) {
    if (!els.chips) return;
    const chips = [{ id: null, name: "All frames" }].concat(
      categories.filter((c) => c.productCount > 0),
    );
    els.chips.innerHTML = chips
      .map(
        (c) =>
          `<button class="chip" type="button" data-chip-category="${esc(c.id || "")}" aria-pressed="false">${esc(c.name)}</button>`,
      )
      .join("");
  }

  function syncControls() {
    if (!els.chips) return;
    $$("[data-chip-category]", els.chips).forEach((chip) =>
      chip.setAttribute(
        "aria-pressed",
        String((chip.dataset.chipCategory || null) === state.category),
      ),
    );
    els.search.value = state.q;
    els.sort.value = state.sort;
    els.stock.checked = state.inStock;
  }

  async function syncShopBanner() {
    if (!els.shopFilter) return;
    if (!state.shopId) return void (els.shopFilter.hidden = true);
    const shop = await FrameX.api.getShop(state.shopId);
    if (!shop || !state.shopId) return;
    els.shopFilterName.textContent = shop.name;
    els.shopFilter.hidden = false;
  }

  function emptyState() {
    const where = state.category
      ? ` in ${esc(categoryNames.get(state.category) || "this category")}`
      : "";
    return `<div class="state-message"><strong>No frames found${where}</strong>
      <span>Try a different search or clear your filters.</span>
      <button class="btn btn--dark btn--sm" type="button" data-clear-filters>Clear filters</button></div>`;
  }

  async function load({ append = false } = {}) {
    const current = ++requestId;
    if (!append) {
      els.grid.setAttribute("aria-busy", "true");
      els.grid.innerHTML = templates.skeletons(config.productPageSize);
      els.more.hidden = true;
    }
    try {
      const result = await FrameX.api.getProducts(params(state.page));
      if (current !== requestId) return;
      const html = result.items.map(templates.productCard).join("");
      if (append) els.grid.insertAdjacentHTML("beforeend", html);
      else els.grid.innerHTML = html || emptyState();
      els.grid.removeAttribute("aria-busy");

      const shown = $$(".product-card", els.grid).length;
      if (els.count)
        els.count.textContent =
          result.total === 0
            ? ""
            : `Showing ${shown} of ${result.total} ${result.total === 1 ? "frame" : "frames"}`;
      els.more.hidden = shown >= result.total;
      els.grid.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(els.grid);
    } catch (error) {
      if (current !== requestId) return;
      console.error("Products failed to load", error);
      templates.showError(els.grid, "Frames couldn't be loaded.", () =>
        load({ append }),
      );
      if (els.count) els.count.textContent = "";
    }
  }

  function setFilters(partial, { scroll = false } = {}) {
    Object.assign(state, partial, { page: 1 });
    syncControls();
    syncShopBanner();
    load();
    if (scroll)
      $("#collection").scrollIntoView({
        behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth",
      });
  }

  const clearFilters = () => {
    setFilters({
      category: null,
      shopId: null,
      q: "",
      sort: "recommended",
      inStock: false,
      material: "",
      frameType: "",
      finish: "",
      size: "",
      priceMax: "",
      customizable: false,
    });
    renderFilters();
  };

  async function init(categories = [], options = {}) {
    els = {
      grid: $("#collection-grid"),
      count: $("#collection-count"),
      more: $("#collection-more"),
      search: $("#collection-search"),
      sort: $("#collection-sort"),
      stock: $("#collection-stock"),
      chips: $("#collection-chips"),
      shopFilter: $("#collection-shop-filter"),
      shopFilterName: $("#collection-shop-name"),
    };
    if (!els.grid) return;
    active = true;
    categoryNames = new Map(categories.map((c) => [c.id, c.name]));

    if (options.shopId) {
      state.shopId = options.shopId; // compact mode: fixed shop
    } else {
      state.category = FrameX.qs.param("category");
      state.q = FrameX.qs.param("q") || "";
      state.shopId = FrameX.qs.param("shop");
      ATTRS.forEach(
        (k) =>
          FrameX.qs.param(k) &&
          (state[k] = k === "customizable" ? true : FrameX.qs.param(k)),
      );
    }

    if (els.chips) {
      renderChips(categories);
      syncControls();
      els.chips.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-chip-category]");
        if (chip) setFilters({ category: chip.dataset.chipCategory || null });
      });
      els.search.addEventListener(
        "input",
        debounce(() => setFilters({ q: els.search.value.trim() }), 250),
      );
      els.sort.addEventListener("change", () =>
        setFilters({ sort: els.sort.value }),
      );
      els.stock.addEventListener("change", () =>
        setFilters({ inStock: els.stock.checked }),
      );
      const clearShop = $("#collection-clear-shop");
      if (clearShop)
        clearShop.addEventListener("click", () => setFilters({ shopId: null }));
      syncShopBanner();
      const filters = $("#collection-filters");
      if (filters) {
        filters.addEventListener("change", (e) => {
          const el = e.target.closest("[data-attr]");
          if (!el) return;
          setFilters({
            [el.dataset.attr]: el.type === "checkbox" ? el.checked : el.value,
          });
          syncFilterCount();
        });
        filters.addEventListener("click", (e) => {
          if (!e.target.closest("[data-clear-attrs]")) return;
          setFilters({
            material: "",
            frameType: "",
            finish: "",
            size: "",
            priceMax: "",
            customizable: false,
          });
          renderFilters();
        });
        renderFilters();
      }
    }

    els.more.querySelector("button").addEventListener("click", () => {
      state.page += 1;
      load({ append: true });
    });
    els.grid.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-filters]")) clearFilters();
    });
    await load();
  }

  FrameX.collection = {
    init,
    setFilters,
    clearFilters,
    isActive: () => active && Boolean(els.chips),
  };
})((window.FrameX = window.FrameX || {}));
