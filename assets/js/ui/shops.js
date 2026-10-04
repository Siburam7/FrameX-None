/* ==========================================================================
   Nearby shops ("Photo-frame shops near you" on Home and Shop).

   How it works
   - Nothing is asked until the visitor presses "Use my location"; a line
     under the button says why it's needed.
   - With permission, the FrameX backend returns the shops within the chosen
     distance, each with its real straight-line distance (GET /api/shops/nearby).
   - Denied / unavailable / timed out / unsupported: the page keeps working,
     says what happened, and offers "Try again" and "Enter location manually".
   - A typed place (city, area or PIN code) is looked up by the backend's
     place search and used as an approximate starting point (labelled so). If
     place search isn't available, shops are matched by address text instead,
     without distances.
   - Without a backend, shops come from the catalogue file and a distance is
     shown only for shops that have coordinates there.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { templates } = FrameX;

  // mode: "all" (every listed shop) | "nearby" (within radius of origin) | "search" (text match)
  const state = { mode: "all", origin: null, radiusKm: null, query: "", radiusOptions: [] };
  let els = {};
  let lastResult = { items: [] };

  const setStatus = (text) => (els.status.textContent = text);
  const shortLabel = (label) => String(label || "").split(",").slice(0, 2).join(",").trim();

  /* ---------------------------------------------------------------- Panel under the toolbar */
  function panelHtml(view, extra = {}) {
    const manualForm = `<form class="shops-nearby__form" data-manual novalidate>
        <label class="visually-hidden" for="shops-place">City, area or PIN code</label>
        <input class="input" id="shops-place" name="place" type="search" autocomplete="postal-code" placeholder="City, area or PIN code" value="${esc(state.query)}" maxlength="80">
        <button class="btn btn--dark btn--sm" type="submit">Find shops</button>
        <button class="btn btn--outline btn--sm" type="button" data-nearby="cancel-manual">Cancel</button>
      </form>`;
    if (view === "manual") return manualForm;
    if (view === "problem")
      return `<div class="shops-nearby__alert" role="alert">${icon("alert")}<div><strong>${esc(extra.title)}</strong><span>${esc(extra.text)}</span></div>
        <div class="shops-nearby__actions">${extra.retry ? `<button class="btn btn--dark btn--sm" type="button" data-nearby="retry">Try again</button>` : ""}
          <button class="btn btn--outline btn--sm" type="button" data-nearby="manual">Enter location manually</button></div></div>`;
    if (view === "origin") {
      const o = state.origin;
      const where = o.source === "device" ? "Near you" : `Near ${esc(shortLabel(o.label))} <em>(approximate)</em>`;
      return `<div class="shops-nearby__bar">${icon("pin")}<strong>${where}</strong>
        <label class="shops-nearby__radius"><span>Within</span>
          <select class="select" data-radius aria-label="Search distance">${state.radiusOptions.map((km) => `<option value="${km}"${km === state.radiusKm ? " selected" : ""}>${km} km</option>`).join("")}</select></label>
        <button class="shops-nearby__link" type="button" data-nearby="manual">Change location</button>
        <button class="shops-nearby__link" type="button" data-nearby="all">Show all shops</button></div>`;
    }
    if (view === "search")
      return `<div class="shops-nearby__bar">${icon("search")}<strong>Shops matching “${esc(state.query)}”</strong>
        <button class="shops-nearby__link" type="button" data-nearby="manual">Change</button>
        <button class="shops-nearby__link" type="button" data-nearby="all">Show all shops</button></div>`;
    // idle: say why location is asked for, before asking
    return `<p class="shops-nearby__why">${icon("pin")}<span>We use your location only to find framing shops near you. It isn't saved.</span>
      <button class="shops-nearby__link" type="button" data-nearby="manual">Enter a location instead</button></p>`;
  }

  function showPanel(view, extra) {
    els.panel.innerHTML = panelHtml(view, extra);
    els.panel.dataset.view = view;
    if (view === "manual") $("#shops-place", els.panel).focus();
  }

  function syncSortButtons() {
    const hasRatings = lastResult.items.some((s) => s.rating);
    $$("[data-shop-sort]", els.toolbar).forEach((btn) => {
      const sort = btn.dataset.shopSort;
      btn.disabled = sort === "rating" && !hasRatings;
      const active = sort === "nearest" ? state.mode === "nearby" : sort === "recommended" ? state.mode !== "nearby" : false;
      btn.setAttribute("aria-pressed", String(active));
    });
    els.locate.hidden = Boolean(state.origin && state.origin.source === "device");
    // The distance filter only exists when the backend measures distances.
    const radius = $(".shops-nearby__radius", els.panel);
    if (radius) radius.hidden = lastResult.source !== "backend";
  }

  const emptyHtml = () => {
    if (state.mode === "nearby")
      return `<div class="state-message"><strong>No shops within ${state.radiusKm} km</strong><span>Try a larger distance, or see every shop.</span>
        <button class="btn btn--outline btn--sm" type="button" data-nearby="all">Show all shops</button></div>`;
    if (state.mode === "search")
      return `<div class="state-message"><strong>No shops found for “${esc(state.query)}”</strong><span>Check the spelling, or see every shop.</span>
        <button class="btn btn--outline btn--sm" type="button" data-nearby="all">Show all shops</button></div>`;
    return `<div class="state-message"><strong>No shops available yet</strong><span>Check back soon.</span></div>`;
  };

  /* ---------------------------------------------------------------- Loading */
  async function load() {
    els.grid.setAttribute("aria-busy", "true");
    if (!lastResult.items.length) els.grid.innerHTML = templates.skeletons(3, "skeleton-card--shop");
    const o = state.origin;
    try {
      lastResult = await FrameX.api.getShops({
        sort: state.mode === "nearby" ? "nearest" : "recommended",
        q: state.mode === "search" ? state.query : "",
        lat: o ? o.latitude : null,
        lng: o ? o.longitude : null,
        radiusKm: state.radiusKm,
        limit: Number(els.grid.dataset.limit) || 50,
      });
      const shops = lastResult.items;
      els.grid.innerHTML = shops.length ? shops.map(templates.shopCard).join("") : emptyHtml();
      els.grid.removeAttribute("aria-busy");
      els.grid.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(els.grid);
      syncSortButtons();
      announce();
    } catch (error) {
      console.error("Shops failed to load", error);
      templates.showError(els.grid, "Shops couldn't be loaded.", load);
    }
  }

  function announce() {
    const n = lastResult.items.length;
    const fromBackend = lastResult.source === "backend";
    if (state.mode === "nearby") {
      const anyDistance = lastResult.items.some((s) => s.distanceKm != null);
      if (!fromBackend && !anyDistance) return setStatus("Location is on. Distances will appear once shops add their map coordinates.");
      const from = state.origin.source === "device" ? "you" : shortLabel(state.origin.label);
      const total = lastResult.total != null ? lastResult.total : n;
      return setStatus(
        fromBackend
          ? `${total} ${total === 1 ? "shop" : "shops"} within ${state.radiusKm} km of ${from}, nearest first. Distances are straight-line.`
          : "Showing shops nearest to you first.",
      );
    }
    if (state.mode === "search") return setStatus(n ? `${n} ${n === 1 ? "shop" : "shops"} found by address.` : "");
    setStatus("");
  }

  /* ---------------------------------------------------------------- Location flows */
  const PROBLEMS = {
    denied: { title: "Location access is disabled.", text: "To use it, allow location for this site in your browser's settings, then try again. You can also enter a location yourself.", retry: true },
    timeout: { title: "Finding your location took too long.", text: "Please try again, or enter a location yourself.", retry: true },
    unavailable: { title: "We couldn't find your location.", text: "Your device didn't share a position. Try again, or enter a location yourself.", retry: true },
    unsupported: { title: "This browser can't share your location.", text: "Enter a city, area or PIN code instead.", retry: false },
    insecure: { title: "Location only works on a secure (https) page.", text: "Enter a city, area or PIN code instead.", retry: false },
  };

  function setLabel(text) {
    $$("[data-location-label]").forEach((el) => (el.textContent = text));
  }

  async function showNearby() {
    state.mode = "nearby";
    showPanel("origin");
    await load();
  }

  /** Runs only from a click ("Use my location", the header chip, "Try again", "Nearest"). */
  async function useLocation() {
    if (state.origin && state.origin.source === "device") return showNearby();
    els.locate.disabled = true;
    setStatus("Finding your location…");
    try {
      state.origin = await FrameX.location.requestPosition();
      setLabel("Using your location");
      await showNearby();
    } catch (error) {
      setStatus("");
      showPanel("problem", PROBLEMS[error.code] || PROBLEMS.unavailable);
    } finally {
      els.locate.disabled = false;
    }
  }

  /** A typed place: place search first (approximate point), else match shop addresses by text. */
  async function useManual(text) {
    state.query = text;
    setStatus("Looking that up…");
    const places = FrameX.api.searchPlaces ? await FrameX.api.searchPlaces(text) : null;
    if (places && places.length) {
      state.origin = FrameX.location.setPlace(places[0]);
      setLabel("Near " + shortLabel(places[0].label));
      return showNearby();
    }
    state.mode = "search";
    showPanel("search");
    await load();
  }

  function showAll() {
    state.mode = "all";
    showPanel(state.origin ? "origin" : "idle");
    return load();
  }

  async function init() {
    els = {
      grid: $("#shop-grid"),
      toolbar: $("#shops-toolbar"),
      status: $("#shops-status"),
      locate: $("#shops-locate"),
    };
    if (!els.grid) return;

    // Search distances: the backend's settings when connected, else the site's own.
    const server = FrameX.http ? await FrameX.http.serverConfig() : null;
    const nearby = (server && server.nearby) || FrameX.config.nearby;
    state.radiusOptions = nearby.radiusOptionsKm;
    state.radiusKm = nearby.defaultRadiusKm;

    els.toolbar.insertAdjacentHTML("afterend", `<div class="shops-nearby" id="shops-nearby"></div>`);
    els.panel = $("#shops-nearby");
    showPanel("idle");

    els.locate.addEventListener("click", useLocation);
    els.toolbar.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-shop-sort]");
      if (!btn || btn.disabled) return;
      if (btn.dataset.shopSort === "nearest") return state.origin ? showNearby() : useLocation();
      showAll();
    });
    const onAction = (event) => {
      const btn = event.target.closest("[data-nearby]");
      if (!btn) return;
      const action = btn.dataset.nearby;
      if (action === "retry") useLocation();
      if (action === "manual") showPanel("manual");
      if (action === "cancel-manual") showPanel(state.mode === "search" ? "search" : state.origin ? "origin" : "idle");
      if (action === "all") showAll();
    };
    els.panel.addEventListener("click", onAction);
    els.grid.addEventListener("click", onAction);
    els.panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = (new FormData(event.target).get("place") || "").toString().trim();
      if (text.length < 2) return $("#shops-place", els.panel).focus();
      useManual(text);
    });
    els.panel.addEventListener("change", (event) => {
      if (!event.target.matches("[data-radius]")) return;
      state.radiusKm = Number(event.target.value);
      showNearby();
    });
    return load();
  }

  FrameX.shops = { init, useLocation };
})((window.FrameX = window.FrameX || {}));
