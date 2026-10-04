/* ==========================================================================
   Saved designs ("Save Design" in FrameX Studio).
   A saved design is { id, kind: "studio", mode, templateId, productId, title,
   thumbnail, config, updatedAt } — config is the full Studio configuration
   (see services/studio-engine.js). Photos are referenced by id and live in
   services/upload-service.js. Stored in localStorage for now; with accounts,
   list / get / save / remove become API calls and nothing else changes.
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

  /* ---- Drafts + saved designs ------------------------------------------------ */
  const designs = {
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
    list: () => read(SAVED, []),
    get: (id) => read(SAVED, []).find((d) => d.id === id) || null,
    /** Save a snapshot; returns the saved design (with its id) or null if storage is full. */
    save(design) {
      const saved = Object.assign(clone(design), {
        id: design.id && design.id.startsWith("d-") ? design.id : newId(),
        updatedAt: new Date().toISOString(),
      });
      const list = read(SAVED, []).filter((d) => d.id !== saved.id);
      list.unshift(saved);
      return write(SAVED, list.slice(0, MAX_SAVED)) ? saved : null;
    },
    remove(id) {
      write(
        SAVED,
        read(SAVED, []).filter((d) => d.id !== id),
      );
    },
  };

  FrameX.designs = designs;
})((window.FrameX = window.FrameX || {}));
