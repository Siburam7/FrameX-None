/* ==========================================================================
   Cart store (FrameX.cart)

   The cart lives in the FrameX backend and belongs to the logged-in account
   (/api/cart). This file keeps a display copy of the server's last answer and
   nothing else: no cart is stored in the browser, and a visitor who isn't
   logged in has no cart at all.

   - Visitors can browse everything. The first "Add to cart" asks them to log
     in or create an account (ui/auth-gate.js) and then carries on by itself.
   - The website sends WHAT was chosen: a product id, option ids and a
     quantity, or a FrameX Studio design. Names, option labels, availability
     and prices come back from the server.
   - A product made from the customer's own photos also sends the ids of the
     uploaded originals (services/upload-service.js). The server only accepts
     ids of photos this account uploaded, and refuses the item without them.
   - While someone is logging in, the item they chose waits in sessionStorage
     ("pending"), so it survives a detour through the full login page. It is
     not a cart: it is never shown or counted, and it is deleted as soon as it
     has been added, the login is dismissed, or 30 minutes have passed.

   "framex:cart-change" fires on document after every change:
     detail = { type, count, status, message? }
     type: load | add | update | remove | clear   the server's cart was applied
           reset    nobody is logged in any more
           busy     a request has started
           error    the cart couldn't be loaded
           failed   a change was refused (detail.message says why)
   ========================================================================== */
(function (FrameX) {
  const { config } = FrameX;
  const http = FrameX.http;
  const PENDING_KEY = "framex.cartPending.v1";
  const PENDING_MINUTES = 30;
  const MAX_QTY = 20; // per line; the server may allow fewer (stock)

  const EMPTY = Object.freeze({
    id: null,
    items: [],
    groups: [],
    count: 0,
    subtotal: 0,
    currency: "INR",
    hasIssues: false,
  });

  let cart = EMPTY;
  let status = "idle"; // idle (not logged in) | loading | ready | error
  let userId = null;
  let working = 0;
  let loadedAt = 0;

  // The on-device cart of earlier versions is gone for good.
  try {
    localStorage.removeItem(config.storageKeys.legacyCart);
  } catch (error) {
    /* storage blocked: nothing to remove */
  }

  function emit(type, detail) {
    document.dispatchEvent(
      new CustomEvent("framex:cart-change", {
        detail: Object.assign({ type, count: cart.count, status }, detail),
      }),
    );
  }

  /** The server's answer replaces the display copy. */
  function apply(next, type, detail) {
    cart = next || EMPTY;
    status = "ready";
    loadedAt = Date.now();
    emit(type, detail);
  }

  /* ---- Requests run one at a time, so answers arrive in the order they were asked ---- */
  let chain = Promise.resolve();
  function enqueue(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  /** Run one cart request; `working` lets the drawer hold its buttons meanwhile. */
  async function call(task) {
    working += 1;
    emit("busy");
    try {
      return await enqueue(task);
    } finally {
      working -= 1;
    }
  }

  /* ---- The item waiting for a login ---- */
  function savePending(action) {
    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ at: Date.now(), action }),
      );
    } catch (error) {
      /* storage blocked: the item still waits in memory while the dialog is open */
    }
  }
  function takePending() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      sessionStorage.removeItem(PENDING_KEY);
      return saved && Date.now() - saved.at < PENDING_MINUTES * 60000
        ? saved.action
        : null;
    } catch (error) {
      return null;
    }
  }
  function clearPending() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (error) {
      /* nothing stored */
    }
  }
  function hasPending() {
    try {
      return Boolean(sessionStorage.getItem(PENDING_KEY));
    } catch (error) {
      return false;
    }
  }

  /* ---- Reading ---- */
  async function refresh() {
    status = "loading";
    emit("busy");
    try {
      const r = await enqueue(() => http.get("/cart"));
      apply(r.cart, "load");
    } catch (error) {
      if (error.status === 401) return signedOut();
      cart = EMPTY;
      status = "error";
      emit("error", { message: error.message });
    }
    return cart;
  }

  function reset() {
    cart = EMPTY;
    status = "idle";
    emit("reset");
  }

  /** The server says the session has ended: update who is logged in. */
  async function signedOut() {
    try {
      await FrameX.auth.refresh();
    } catch (error) {
      reset();
    }
  }

  /* ---- Adding ---- */
  async function post(action) {
    const r = await call(() => http.post("/cart/items", action.body));
    apply(r.cart, "add", { itemId: r.itemId });
    return {
      ok: true,
      item: r.cart.items.find((i) => i.id === r.itemId) || null,
      cart: r.cart,
    };
  }

  /** Ask for a login (keeping the chosen item), then add it. */
  async function throughLogin(action) {
    savePending(action);
    const loggedIn = await FrameX.authGate.require({
      reason: "add",
      itemName: action.label,
    });
    clearPending();
    if (!loggedIn) return { ok: false, cancelled: true };
    return post(action);
  }

  async function submit(action) {
    try {
      const state = await FrameX.auth.ready;
      if (!state.authenticated) return await throughLogin(action);
      try {
        return await post(action);
      } catch (error) {
        if (error.status !== 401) throw error;
        // The session ended in the meantime: log in again and carry on.
        await signedOut();
        return await throughLogin(action);
      }
    } catch (error) {
      emit("failed"); // callers show the reason (see announce)
      return { ok: false, message: error.message, code: error.code || "" };
    }
  }

  /**
   * Add a listed product.
   *   add({ productId, name, quantity, selection: { sizeId, colorId, printMaterialId, protection }, note })
   * A product made from the customer's photos also sends `photos`:
   *   { photo1: { uploadId, placement: { x, y, zoom } | null }, ... }
   * and a small `thumbnail` of the first one for the cart line.
   * A Home Decor custom-photo set also sends `customization` and `thumbnail`
   * (ui/decor-studio.js); the server checks and rebuilds both.
   * `name` is only used in messages. Resolves to
   *   { ok: true, item, cart } | { ok: false, cancelled: true } | { ok: false, message, code }
   */
  function add({ productId, name = "", quantity = 1, selection = {}, note = "", customization = null, thumbnail = "", photos = null }) {
    const chosen = {};
    Object.entries(selection || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "")
        chosen[key] = String(value);
    });
    return submit({
      label: name,
      body: Object.assign({ productId, quantity, selection: chosen, note }, customization ? { customization } : {}, customization || photos ? { thumbnail } : {}, photos ? { photos } : {}),
    });
  }

  /**
   * Add a FrameX Studio design (the complete configuration; the server prices it).
   *   addStudio({ design: { id, config, thumbnail }, photos: { slot: uploadId }, name, quantity })
   * `photos` are the uploaded originals for the design's photo spaces.
   */
  function addStudio({ design, name = "", quantity = 1, photos = null }) {
    return submit({
      label: name,
      body: Object.assign(
        {
          kind: "studio",
          quantity,
          design: {
            id: design.id,
            config: design.config,
            thumbnail: design.thumbnail || "",
          },
        },
        photos ? { photos } : {},
      ),
    });
  }

  /** The usual message after add(): a toast with "View cart", or the reason it failed. */
  function announce(result, message) {
    if (!result || result.cancelled) return;
    if (!result.ok) {
      FrameX.toast.show(
        result.message || "That couldn't be added to your cart.",
        { duration: 5000 },
      );
      return;
    }
    FrameX.toast.show(message, {
      action: { label: "View cart", onClick: () => FrameX.cartDrawer.open() },
    });
  }

  /* ---- Changing ---- */
  async function change(type, task) {
    try {
      const r = await call(task);
      apply(r.cart, type);
      return { ok: true, cart: r.cart };
    } catch (error) {
      if (error.status === 401) await signedOut();
      // "Not in your cart" usually means it was removed on another device: show the real cart.
      else if (error.status === 404) await refresh();
      else emit("failed", { message: error.message });
      return { ok: false, message: error.message, code: error.code || "" };
    }
  }

  const setQty = (id, quantity) =>
    quantity <= 0
      ? remove(id)
      : change("update", () =>
          http.patch("/cart/items/" + encodeURIComponent(id), { quantity }),
        );
  const remove = (id) =>
    change("remove", () =>
      http.delete("/cart/items/" + encodeURIComponent(id)),
    );
  const clear = () => change("clear", () => http.delete("/cart"));

  /** The server's check before checkout: availability, quantities, today's prices. */
  async function validate() {
    try {
      const r = await call(() => http.post("/cart/validate"));
      apply(r.cart, "load");
      return { ok: r.ok, issues: r.issues };
    } catch (error) {
      if (error.status === 401) await signedOut();
      return {
        ok: false,
        issues: [{ code: "ERROR", message: error.message }],
      };
    }
  }

  /** Shops with their lines: [{ shopId, shopName, items, subtotal }] */
  function groups() {
    const byId = new Map(cart.items.map((i) => [i.id, i]));
    return cart.groups.map((g) => ({
      shopId: g.shopId,
      shopName: g.shopName,
      subtotal: g.subtotal,
      items: g.itemIds.map((id) => byId.get(id)).filter(Boolean),
    }));
  }

  /** Called once per page, after FrameX.auth.init(). */
  function init() {
    document.addEventListener("framex:auth-change", (event) => {
      const next = event.detail.user ? event.detail.user.id : null;
      if (next === userId) return; // same person (e.g. a profile update)
      userId = next;
      if (userId) refresh();
      else reset();
    });

    // Coming back to this tab: pick up changes made on another device or tab.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && userId && Date.now() - loadedAt > 30000) refresh();
    });

    // Back from the full login page with an item still waiting: add it now.
    FrameX.auth.ready.then(async (state) => {
      if (!state.authenticated || !hasPending()) return;
      const action = takePending();
      if (!action) return;
      let result;
      try {
        result = await post(action);
      } catch (error) {
        result = { ok: false, message: error.message };
      }
      announce(
        result,
        `${action.label || "Your item"} added to your cart.`,
      );
    });
  }

  FrameX.cart = {
    init,
    add,
    addStudio,
    announce,
    setQty,
    remove,
    clear,
    refresh,
    validate,
    groups,
    items: () => cart.items.slice(),
    count: () => cart.count,
    subtotal: () => cart.subtotal,
    hasIssues: () => cart.hasIssues,
    status: () => status,
    busy: () => working > 0,
    MAX_QTY,
  };
})((window.FrameX = window.FrameX || {}));
