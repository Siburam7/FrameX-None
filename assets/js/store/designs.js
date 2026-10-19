/* ==========================================================================
   Saved designs ("Save Design" in FrameX Studio).
   A saved design is { id, kind: "studio", mode, templateId, productId, title,
   thumbnail, config, updatedAt, where } — config is the full Studio configuration
   (see services/studio-engine.js). Photos are referenced by their id on this
   device (services/upload-service.js).

   Where a design is kept:
     logged in   in the ACCOUNT (/api/designs), with the account's uploads of its
                 photos, so it opens on any device (where: "account");
     not logged  in this browser only, as before (where: "device"). Saving such a
     in          design again while logged in moves it into the account.

   list / get / save / remove return promises. Drafts (the Studio's work in
   progress) stay in this browser.
   ========================================================================== */
(function (FrameX) {
  const DRAFTS = "framex.templateDrafts.v1";
  const SAVED = "framex.designs.v1";
  const MAX_SAVED = 30;

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false; // storage full or blocked: the session still works
    }
  };
  const newId = () =>
    "d-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** An account design's id (a uuid); a design kept in this browser has a "d-…" id. */
  const isAccountId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
  const local = () => read(SAVED, []).map((d) => Object.assign({}, d, { where: "device" }));

  /** Logged in, with the backend switched on? Then designs go to the account. */
  async function signedIn() {
    if (!FrameX.http || !FrameX.http.enabled() || !FrameX.auth) return false;
    try {
      const state = await FrameX.auth.ready;
      return Boolean(state && state.authenticated);
    } catch (error) {
      return false;
    }
  }

  // The account's design ids this page has seen (for designIsHere in the cart drawer)
  const accountIds = new Set();
  const fromAccount = (d) => {
    accountIds.add(d.id);
    return Object.assign({ kind: "studio" }, d, { where: "account" });
  };

  const designs = {
    /* ---- Drafts: this browser only --------------------------------------- */
    getDraft: (templateId) => read(DRAFTS, {})[templateId] || null,
    setDraft(design) {
      const all = read(DRAFTS, {});
      all[design.templateId] = Object.assign({}, design, {
        updatedAt: new Date().toISOString(),
      });
      return write(DRAFTS, all);
    },
    clearDraft(templateId) {
      const all = read(DRAFTS, {});
      delete all[templateId];
      write(DRAFTS, all);
    },

    signedIn,
    isAccountId,

    /** The account's designs (when logged in) and this browser's, newest first. */
    async list() {
      const mine = local();
      if (!(await signedIn())) return mine;
      try {
        const r = await FrameX.http.get("/designs");
        return [...r.items.map(fromAccount), ...mine].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      } catch (error) {
        return mine; // the backend is not answering: this browser's designs still show
      }
    },

    /** One design with its configuration, or null. */
    async get(id) {
      if (!id) return null;
      if (isAccountId(id)) {
        if (!(await signedIn())) return null;
        try {
          return fromAccount((await FrameX.http.get("/designs/" + encodeURIComponent(id))).design);
        } catch (error) {
          return null;
        }
      }
      return local().find((d) => d.id === id) || null;
    },

    /**
     * Save a snapshot. Logged in: in the account; `photos` = { slot: uploadId } of the account's uploads.
     * Not logged in, or device: true: in this browser. -> the saved design (with its id and `where`). Throws with a message
     * the customer can read when the account refuses (e.g. 30 designs already); null when this browser
     * can't store it.
     */
    async save(design, { photos = {}, device = false } = {}) {
      if (!device && (await signedIn())) {
        const body = { title: design.title, mode: design.mode, templateId: design.templateId || null, productId: design.productId || null, config: design.config, photos, thumbnail: design.thumbnail || null };
        const r = isAccountId(design.id)
          ? await FrameX.http.put("/designs/" + encodeURIComponent(design.id), body)
          : await FrameX.http.post("/designs", body);
        // A design that was kept in this browser has moved into the account
        if (design.id && !isAccountId(design.id)) write(SAVED, read(SAVED, []).filter((d) => d.id !== design.id));
        return fromAccount(r.design);
      }
      const saved = Object.assign(clone(design), {
        id: design.id && design.id.startsWith("d-") ? design.id : newId(),
        updatedAt: new Date().toISOString(),
      });
      const list = read(SAVED, []).filter((d) => d.id !== saved.id);
      list.unshift(saved);
      return write(SAVED, list.slice(0, MAX_SAVED)) ? Object.assign({}, saved, { where: "device" }) : null;
    },

    async remove(id) {
      if (isAccountId(id)) {
        await FrameX.http.delete("/designs/" + encodeURIComponent(id));
        accountIds.delete(id);
        return;
      }
      write(SAVED, read(SAVED, []).filter((d) => d.id !== id));
    },

    /** Can the Studio reopen this design here (no network): kept in this browser, or an account design seen on this page. */
    isKnown: (id) => Boolean(id) && (accountIds.has(id) || read(SAVED, []).some((d) => d.id === id)),
  };

  FrameX.designs = designs;
})((window.FrameX = window.FrameX || {}));
