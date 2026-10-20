/* ==========================================================================
   Shops on Home (three) and on the Shop page (the full list).
   Owner's design, 2026-10-21:

   - No location yet: "recommended" shops — featured shops first (FrameX's
     choice, e.g. a paid promotion, labelled "Featured"), then shops with
     something on sale, in an order that changes once a day.
   - With a location: the shops nearest to it. Home shows the nearest three
     (wherever they are); the Shop page shows every shop within the chosen
     distance, or the nearest three when none is that close.
   - One search box: a shop's name, an area, a city or a PIN code. When no
     shop's details match, the text is looked up as a place and the shops
     near it are shown (approximate, labelled so).
   - Home: "View more shops near you" / "View all shops" under the three.
   - The location is asked for only when the visitor presses "Use my
     location" — or used at once when they allowed it on an earlier visit —
     and it is kept for this browser tab only, so the Shop page doesn't ask
     again (services/location.js).
   - Without a backend, shops come from the catalogue file and a distance is
     shown only for shops that have coordinates there.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { templates } = FrameX;

  // mode: "recommended" | "nearby" | "search"
  const state = { mode: "recommended", origin: null, radiusKm: null, query: "", radiusOptions: [] };
  let els = {};
  let lastResult = { items: [] };
  let nearestOnly = false; // the Shop page's nearby list found nothing within the distance: these are the nearest

  const compact = () => (Number(els.grid.dataset.limit) || 50) <= 6; // Home: three shops
  const setStatus = (text) => (els.status.textContent = text);
  const shortLabel = (label) => String(label || "").split(",").slice(0, 2).join(",").trim();
  const from = () => (state.origin.source === "device" ? "you" : shortLabel(state.origin.label));

  /* ---------------------------------------------------------------- Panel under the toolbar */
  function panelHtml(view, extra = {}) {
    if (view === "problem")
      return `<div class="shops-nearby__alert" role="alert">${icon("alert")}<div><strong>${esc(extra.title)}</strong><span>${esc(extra.text)}</span></div>
        <div class="shops-nearby__actions">${extra.retry ? `<button class="btn btn--dark btn--sm" type="button" data-nearby="retry">Try again</button>` : ""}
          <button class="btn btn--outline btn--sm" type="button" data-nearby="type">Type a place instead</button></div></div>`;
    if (view === "origin") {
      const o = state.origin;
      const where = o.source === "device" ? "Near you" : `Near ${esc(shortLabel(o.label))} <em>(approximate)</em>`;
      const radius = compact()
        ? ""
        : `<label class="shops-nearby__radius"><span>Within</span>
          <select class="select" data-radius aria-label="Search distance">${state.radiusOptions.map((km) => `<option value="${km}"${km === state.radiusKm ? " selected" : ""}>${km} km</option>`).join("")}</select></label>`;
      return `<div class="shops-nearby__bar">${icon("pin")}<strong>${where}</strong>${radius}
        <button class="shops-nearby__link" type="button" data-nearby="type">Change location</button>
        <button class="shops-nearby__link" type="button" data-nearby="clear">Clear location</button></div>`;
    }
    if (view === "search")
      return `<div class="shops-nearby__bar">${icon("search")}<strong>Shops matching “${esc(state.query)}”</strong>
        <button class="shops-nearby__link" type="button" data-nearby="clear-search">Clear search</button></div>`;
    // idle: say why location is asked for, before asking
    return `<p class="shops-nearby__why">${icon("pin")}<span>Press “Use my location” to see the shops nearest you. Your location is used only for this and is forgotten when you close this tab.</span></p>`;
  }

  function showPanel(view, extra) {
    els.panel.innerHTML = panelHtml(view, extra);
    els.panel.dataset.view = view;
  }
  const panelForMode = () => showPanel(state.mode === "search" ? "search" : state.origin ? "origin" : "idle");

  function syncControls() {
    els.locate.hidden = Boolean(state.origin && state.origin.source === "device");
    // The distance filter only exists when the backend measures distances.
    const radius = $(".shops-nearby__radius", els.panel);
    if (radius) radius.hidden = lastResult.source !== "backend" || state.mode !== "nearby";
    if (els.more) {
      els.more.hidden = !lastResult.items.length;
      const link = $("[data-shops-more]", els.more);
      if (link) link.textContent = state.origin ? "View more shops near you" : "View all shops";
    }
  }

  const emptyHtml = () => {
    if (state.mode === "search")
      return `<div class="state-message"><strong>No shops found for “${esc(state.query)}”</strong><span>Check the spelling, or try a nearby town or PIN code.</span>
        <button class="btn btn--outline btn--sm" type="button" data-nearby="clear-search">Show recommended shops</button></div>`;
    return `<div class="state-message"><strong>No shops available yet</strong><span>Check back soon.</span></div>`;
  };

  /* ---------------------------------------------------------------- Loading */
  async function fetchShops() {
    const o = state.origin;
    const limit = Number(els.grid.dataset.limit) || 50;
    const point = o ? { lat: o.latitude, lng: o.longitude } : {};
    nearestOnly = false;
    if (state.mode === "search") return FrameX.api.getShops({ q: state.query, ...point, limit });
    if (state.mode === "nearby" && o) {
      // Home: the nearest three, wherever they are. The Shop page: everything within the distance...
      if (compact()) return FrameX.api.getShops({ sort: "distance", ...point, limit });
      const within = await FrameX.api.getShops({ sort: "nearest", ...point, radiusKm: state.radiusKm, limit });
      if (within.items.length || within.source !== "backend") return within;
      // ...or, when nothing is that close, the nearest three.
      nearestOnly = true;
      return FrameX.api.getShops({ sort: "distance", ...point, limit: 3 });
    }
    return FrameX.api.getShops({ sort: "recommended", limit });
  }

  async function load() {
    els.grid.setAttribute("aria-busy", "true");
    if (!lastResult.items.length) els.grid.innerHTML = templates.skeletons(3, "shop");
    try {
      lastResult = await fetchShops();
      const shops = lastResult.items;
      els.grid.innerHTML = shops.length ? shops.map(templates.shopCard).join("") : emptyHtml();
      els.grid.removeAttribute("aria-busy");
      els.grid.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(els.grid);
      syncControls();
      announce();
    } catch (error) {
      console.error("Shops failed to load", error);
      templates.showError(els.grid, "Shops couldn't be loaded.", load);
    }
  }

  function announce() {
    const items = lastResult.items;
    const n = items.length;
    if (state.mode === "search") return setStatus(n ? `${n} ${n === 1 ? "shop" : "shops"} found.` : "");
    if (state.mode !== "nearby" || !state.origin) return setStatus("");
    if (lastResult.source !== "backend" && !items.some((s) => s.distanceKm != null))
      return setStatus("Location is on. Distances will appear once shops add their map coordinates.");
    const first = items[0] && items[0].distanceKm;
    if (nearestOnly || (compact() && first != null && first > state.radiusKm))
      return setStatus(`No shop within ${state.radiusKm} km of ${from()} yet. These are the nearest. Distances are straight-line.`);
    if (compact()) return setStatus(`The ${n === 1 ? "shop" : `${n} shops`} nearest to ${from()}. Distances are straight-line.`);
    const total = lastResult.total != null ? lastResult.total : n;
    setStatus(`${total} ${total === 1 ? "shop" : "shops"} within ${state.radiusKm} km of ${from()}, nearest first. Distances are straight-line.`);
  }

  /* ---------------------------------------------------------------- Location and search */
  const PROBLEMS = {
    denied: { title: "Location access is disabled.", text: "To use it, allow location for this site in your browser's settings, then try again. You can also type a city, area or PIN code in the search box.", retry: true },
    timeout: { title: "Finding your location took too long.", text: "Please try again, or type a city, area or PIN code in the search box.", retry: true },
    unavailable: { title: "We couldn't find your location.", text: "Your device didn't share a position. Try again, or type a city, area or PIN code in the search box.", retry: true },
    unsupported: { title: "This browser can't share your location.", text: "Type a city, area or PIN code in the search box instead.", retry: false },
    insecure: { title: "Location only works on a secure (https) page.", text: "Type a city, area or PIN code in the search box instead.", retry: false },
  };

  function setLabel(text) {
    document.querySelectorAll("[data-location-label]").forEach((el) => (el.textContent = text));
  }
  const labelFor = (o) => (o.source === "device" ? "Using your location" : "Near " + shortLabel(o.label));

  async function showNearby() {
    state.mode = "nearby";
    showPanel("origin");
    await load();
  }

  /** From a click ("Use my location", the header chip, "Try again"), or at once when the visitor allowed it before. */
  async function useLocation({ quiet = false } = {}) {
    if (state.origin && state.origin.source === "device") return showNearby();
    els.locate.disabled = true;
    if (!quiet) setStatus("Finding your location…");
    try {
      state.origin = await FrameX.location.requestPosition();
      setLabel(labelFor(state.origin));
      await showNearby();
    } catch (error) {
      setStatus("");
      // Nothing was asked of the visitor on the quiet path: a failure there just leaves the recommended shops.
      if (!quiet) showPanel("problem", PROBLEMS[error.code] || PROBLEMS.unavailable);
    } finally {
      els.locate.disabled = false;
    }
  }

  /** The search box: a shop's name, area, city or PIN code; otherwise a place, and the shops near it. */
  async function search(text) {
    state.query = text;
    setStatus("Searching…");
    state.mode = "search";
    const found = await FrameX.api.getShops({ q: text, ...(state.origin ? { lat: state.origin.latitude, lng: state.origin.longitude } : {}), limit: Number(els.grid.dataset.limit) || 50 }).catch(() => null);
    if (found && found.items.length) {
      showPanel("search");
      return load();
    }
    const places = FrameX.api.searchPlaces ? await FrameX.api.searchPlaces(text) : null;
    if (places && places.length) {
      state.origin = FrameX.location.setPlace(places[0]);
      setLabel(labelFor(state.origin));
      return showNearby();
    }
    showPanel("search");
    return load();
  }

  function clearLocation() {
    state.origin = null;
    FrameX.location.clear();
    setLabel("Set your location");
    state.mode = "recommended";
    showPanel("idle");
    return load();
  }

  function clearSearch() {
    state.query = "";
    els.input.value = "";
    state.mode = state.origin ? "nearby" : "recommended";
    panelForMode();
    return load();
  }

  function typePlace() {
    els.input.focus();
    setStatus("Type a city, area or PIN code, then press Search.");
  }

  async function init() {
    els = {
      grid: $("#shop-grid"),
      toolbar: $("#shops-toolbar"),
      status: $("#shops-status"),
      locate: $("#shops-locate"),
      form: $("#shops-search"),
      input: $("#shops-q"),
      more: $("#shops-more"),
    };
    if (!els.grid) return;

    // Search distances: the backend's settings when connected, else the site's own.
    const server = FrameX.http ? await FrameX.http.serverConfig() : null;
    const nearby = (server && server.nearby) || FrameX.config.nearby;
    state.radiusOptions = nearby.radiusOptionsKm;
    state.radiusKm = nearby.defaultRadiusKm;

    els.toolbar.insertAdjacentHTML("afterend", `<div class="shops-nearby" id="shops-nearby"></div>`);
    els.panel = $("#shops-nearby");

    els.locate.addEventListener("click", () => useLocation());
    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = els.input.value.trim();
      if (text.length < 2) return els.input.focus();
      search(text);
    });
    const onAction = (event) => {
      const btn = event.target.closest("[data-nearby]");
      if (!btn) return;
      const action = btn.dataset.nearby;
      if (action === "retry") useLocation();
      if (action === "type") typePlace();
      if (action === "clear") clearLocation();
      if (action === "clear-search") clearSearch();
    };
    els.panel.addEventListener("click", onAction);
    els.grid.addEventListener("click", onAction);
    els.panel.addEventListener("change", (event) => {
      if (!event.target.matches("[data-radius]")) return;
      state.radiusKm = Number(event.target.value);
      showNearby();
    });

    // A location this tab already has (e.g. from Home), or one the visitor allowed on an earlier visit.
    const kept = FrameX.location.restore();
    if (kept) {
      state.origin = kept;
      setLabel(labelFor(kept));
      return showNearby();
    }
    showPanel("idle");
    const loaded = load();
    if (!FrameX.location.cleared() && (await FrameX.location.permission()) === "granted") {
      await loaded;
      return useLocation({ quiet: true });
    }
    return loaded;
  }

  FrameX.shops = { init, useLocation };
})((window.FrameX = window.FrameX || {}));
