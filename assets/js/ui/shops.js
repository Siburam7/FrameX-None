/* ==========================================================================
   Nearby shops.
   Distances come only from real data: the visitor's location (browser
   permission) + a shop's stored coordinates. Shops without coordinates show
   no distance.
   ========================================================================== */
(function (FrameX) {
  const { $, $$ } = FrameX.dom;
  const { templates } = FrameX;

  const state = { sort: "recommended", position: null };
  let els = {};
  let lastShops = [];

  const setStatus = (text) => (els.status.textContent = text);

  function syncSortButtons() {
    const hasDistance = lastShops.some((s) => s.distanceKm != null);
    const hasRatings = lastShops.some((s) => s.rating);
    $$("[data-shop-sort]", els.toolbar).forEach((btn) => {
      const sort = btn.dataset.shopSort;
      btn.disabled = (sort === "nearest" && !hasDistance) || (sort === "rating" && !hasRatings);
      btn.setAttribute("aria-pressed", String(sort === state.sort));
    });
  }

  async function load() {
    els.grid.setAttribute("aria-busy", "true");
    if (!lastShops.length) els.grid.innerHTML = templates.skeletons(3, "skeleton-card--shop");
    try {
      const result = await FrameX.api.getShops({
        sort: state.sort,
        lat: state.position ? state.position.latitude : null,
        lng: state.position ? state.position.longitude : null,
        limit: Number(els.grid.dataset.limit) || 50
      });
      lastShops = result.items;
      els.grid.innerHTML = lastShops.length
        ? lastShops.map(templates.shopCard).join("")
        : `<div class="state-message"><strong>No shops available yet</strong><span>Check back soon.</span></div>`;
      els.grid.removeAttribute("aria-busy");
      els.grid.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(els.grid);
      syncSortButtons();
    } catch (error) {
      console.error("Shops failed to load", error);
      templates.showError(els.grid, "Shops couldn't be loaded.", load);
    }
  }

  async function useLocation() {
    if (state.position) return;
    els.locate.disabled = true;
    setStatus("Finding your location…");
    try {
      state.position = await FrameX.location.requestPosition();
      state.sort = "recommended";
      await load();
      const anyDistance = lastShops.some((s) => s.distanceKm != null);
      if (anyDistance) {
        state.sort = "nearest";
        await load();
        setStatus("Showing shops nearest to you first.");
      } else {
        setStatus("Location is on. Distances will appear once shops add their map coordinates.");
      }
      $$("[data-location-label]").forEach((el) => (el.textContent = "Using your location"));
      els.locate.hidden = true;
    } catch (error) {
      const messages = {
        denied: "Location access is blocked. Allow it in your browser settings to see distances.",
        unsupported: "Your browser doesn't support location.",
        timeout: "Finding your location took too long. Please try again.",
        unavailable: "We couldn't find your location. Please try again."
      };
      setStatus(messages[error.code] || messages.unavailable);
      els.locate.disabled = false;
    }
  }

  function init() {
    els = { grid: $("#shop-grid"), toolbar: $("#shops-toolbar"), status: $("#shops-status"), locate: $("#shops-locate") };
    if (!els.grid) return Promise.resolve();

    els.locate.addEventListener("click", useLocation);
    els.toolbar.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-shop-sort]");
      if (!btn || btn.disabled) return;
      state.sort = btn.dataset.shopSort;
      load();
    });
    return load();
  }

  FrameX.shops = { init, useLocation };
})((window.FrameX = window.FrameX || {}));
