/* ==========================================================================
   Templates page (templates.html): search, filters, sort, grid, load more,
   and the visitor's saved designs. Filter state lives in the URL
   (?q=&category=&occasion=&photos=&trending=1&popular=1&new=1&sort=) so any
   filtered view can be shared or bookmarked.
   Also exports trendingRow() for the home page "Trending Templates" section.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, debounce } = FrameX.dom;
  const { templateUI } = FrameX;
  const PAGE_SIZE = 12;
  const FLAGS = ["trending", "popular", "new"];

  const state = { q: "", category: "", occasion: "", photos: "", trending: false, popular: false, new: false, sort: "trending", page: 1 };
  let els = {};
  let categoryNames = new Map();

  function readUrl() {
    const p = new URLSearchParams(location.search);
    ["q", "category", "occasion", "photos", "sort"].forEach((k) => p.get(k) && (state[k] = p.get(k)));
    FLAGS.forEach((k) => (state[k] = p.get(k) === "1"));
  }

  function writeUrl() {
    const p = new URLSearchParams();
    ["q", "category", "occasion", "photos"].forEach((k) => state[k] && p.set(k, state[k]));
    FLAGS.forEach((k) => state[k] && p.set(k, "1"));
    if (state.sort !== "trending") p.set("sort", state.sort);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  const activeFilterCount = () => ["category", "occasion", "photos"].filter((k) => state[k]).length + FLAGS.filter((k) => state[k]).length;

  function syncControls() {
    els.search.value = state.q;
    els.sort.value = state.sort;
    els.photos.value = state.photos;
    els.occasion.value = state.occasion;
    $$("[data-tpl-category]", els.categories).forEach((chip) => chip.setAttribute("aria-pressed", String((chip.dataset.tplCategory || "") === state.category)));
    $$("[data-tpl-flag]", els.flags).forEach((chip) => chip.setAttribute("aria-pressed", String(state[chip.dataset.tplFlag])));
    const n = activeFilterCount();
    els.toggleCount.textContent = n ? String(n) : "";
    els.toggleCount.hidden = !n;
  }

  async function load({ append = false } = {}) {
    if (!append) state.page = 1;
    els.grid.setAttribute("aria-busy", "true");
    try {
      const result = await FrameX.api.getTemplates({
        q: state.q, category: state.category, occasion: state.occasion, photos: state.photos,
        trending: state.trending, popular: state.popular, new: state.new, sort: state.sort,
        page: state.page, limit: PAGE_SIZE
      });
      const cards = result.items.map((t) => templateUI.card(t, { categoryName: categoryNames.get(t.category) })).join("");
      if (append) els.grid.insertAdjacentHTML("beforeend", cards);
      else els.grid.innerHTML = cards;

      const shown = Math.min(result.page * result.limit, result.total);
      els.count.textContent = result.total ? `${result.total} ${result.total === 1 ? "template" : "templates"}` : "";
      els.more.hidden = shown >= result.total;
      if (!result.total) {
        const filtered = state.q || activeFilterCount();
        els.grid.innerHTML = `<div class="state-message tpl-empty">
          ${icon("search")}
          <strong>${filtered ? "No templates match" : "No templates yet"}</strong>
          <span>${state.q ? `Nothing found for “${esc(state.q)}”. Try another word, like birthday, wedding or family.` : filtered ? "Try removing a filter to see more designs." : "New designs are on their way."}</span>
          ${filtered ? `<button class="btn btn--outline btn--sm" type="button" data-tpl-clear>Clear search and filters</button>` : ""}
        </div>`;
      }
    } catch (error) {
      console.error("Templates failed to load", error);
      FrameX.templates.showError(els.grid, "Templates couldn't be loaded.", () => load());
    } finally {
      els.grid.removeAttribute("aria-busy");
    }
  }

  function update(changes) {
    Object.assign(state, changes);
    writeUrl();
    syncControls();
    load();
  }

  function clearAll() {
    update({ q: "", category: "", occasion: "", photos: "", trending: false, popular: false, new: false });
  }

  /** "Your saved designs": continue editing a design saved on this device. */
  async function renderSaved() {
    const saved = FrameX.designs.list();
    if (!els.saved || !saved.length) return;
    const rows = await Promise.all(
      saved.slice(0, 8).map(async (d) => {
        const href = `studio.html?design=${encodeURIComponent(d.id)}`;
        let media = d.thumbnail ? `<img src="${esc(d.thumbnail)}" alt="">` : "";
        let name = d.title || "Your design";
        if (d.kind !== "studio" && d.templateId) {
          // Older template-only designs: draw them from their template.
          const t = await FrameX.api.getTemplate(d.templateId);
          if (!t) return "";
          const photos = {};
          await Promise.all(Object.entries(d.photos || {}).map(async ([slot, id]) => (photos[slot] = await FrameX.uploadService.getUrl(id))));
          media = FrameX.templateEngine.render(t, { photos, text: d.text, mode: "sample", label: `Your ${t.title} design` });
          name = t.title;
        }
        return `<li class="saved-design">
          <a class="saved-design__link" href="${href}">
            <span class="saved-design__media">${media || icon("frame")}</span>
            <span class="saved-design__name">${esc(name)}</span>
            <span class="saved-design__date">Saved ${new Date(d.updatedAt).toLocaleDateString(FrameX.config.locale, { day: "numeric", month: "short" })}</span>
          </a>
        </li>`;
      })
    );
    els.saved.querySelector("ul").innerHTML = rows.join("");
    els.saved.hidden = !rows.join("");
  }

  async function init() {
    els = {
      grid: $("#tpl-grid"), search: $("#tpl-search"), sort: $("#tpl-sort"), categories: $("#tpl-categories"),
      flags: $("#tpl-flags"), photos: $("#tpl-photos"), occasion: $("#tpl-occasion"), count: $("#tpl-count"),
      more: $("#tpl-more"), saved: $("#tpl-saved"), toggle: $("#tpl-filter-toggle"), panel: $("#tpl-filter-panel"),
      toggleCount: $("#tpl-filter-count")
    };
    if (!els.grid) return;
    readUrl();

    try {
      const [categories, options] = await Promise.all([FrameX.api.getTemplateCategories(), FrameX.api.getTemplateOptions()]);
      categoryNames = new Map(categories.map((c) => [c.id, c.name]));
      els.categories.innerHTML = [{ id: "", name: "All", templateCount: null }]
        .concat(categories.filter((c) => c.templateCount > 0))
        .map((c) => `<button class="chip" type="button" data-tpl-category="${esc(c.id)}" aria-pressed="false">${esc(c.name)}${c.templateCount != null ? ` <span class="chip__count">${c.templateCount}</span>` : ""}</button>`)
        .join("");
      els.occasion.insertAdjacentHTML("beforeend", options.occasions.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(""));
    } catch (error) {
      console.error("Template filters failed to load", error);
    }
    syncControls();

    els.search.addEventListener("input", debounce(() => update({ q: els.search.value.trim() }), 250));
    els.sort.addEventListener("change", () => update({ sort: els.sort.value }));
    els.photos.addEventListener("change", () => update({ photos: els.photos.value }));
    els.occasion.addEventListener("change", () => update({ occasion: els.occasion.value }));
    els.categories.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tpl-category]");
      if (chip) update({ category: chip.dataset.tplCategory });
    });
    els.flags.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tpl-flag]");
      if (chip) update({ [chip.dataset.tplFlag]: !state[chip.dataset.tplFlag] });
    });
    els.toggle.addEventListener("click", () => {
      const open = els.toggle.getAttribute("aria-expanded") !== "true";
      els.toggle.setAttribute("aria-expanded", String(open));
      els.panel.classList.toggle("is-open", open);
    });
    els.more.addEventListener("click", () => {
      state.page += 1;
      load({ append: true });
    });
    document.addEventListener("click", (e) => e.target.closest("[data-tpl-clear]") && clearAll());

    await load();
    renderSaved();
  }

  /** Home page row: the first `limit` trending templates. */
  async function trendingRow() {
    const grid = $("#home-templates");
    if (!grid) return;
    try {
      const [result, categories] = await Promise.all([FrameX.api.getTemplates({ trending: true, sort: "trending", limit: Number(grid.dataset.limit) || 4 }), FrameX.api.getTemplateCategories()]);
      const names = new Map(categories.map((c) => [c.id, c.name]));
      if (!result.items.length) {
        grid.closest("section").hidden = true;
        return;
      }
      grid.innerHTML = result.items.map((t) => templateUI.card(t, { categoryName: names.get(t.category) })).join("");
      grid.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(grid);
      if (FrameX.railNav) FrameX.railNav.attach(grid);
    } catch (error) {
      console.error("Trending templates failed to load", error);
      grid.closest("section").hidden = true;
    }
  }

  FrameX.templatesPage = { init };
  FrameX.trendingTemplates = { init: trendingRow };
})((window.FrameX = window.FrameX || {}));
