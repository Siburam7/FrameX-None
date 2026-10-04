/* Wishlist store: product ids saved on this device. */
(function (FrameX) {
  const KEY = FrameX.config.storageKeys.wishlist;
  let ids = load();

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return new Set();
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...ids]));
    } catch (error) {
      /* ignore */
    }
  }

  function toggle(productId) {
    const nowSaved = !ids.has(productId);
    nowSaved ? ids.add(productId) : ids.delete(productId);
    persist();
    document.dispatchEvent(
      new CustomEvent("framex:wishlist-change", {
        detail: { productId, saved: nowSaved },
      }),
    );
    return nowSaved;
  }

  FrameX.wishlist = { has: (id) => ids.has(id), toggle, count: () => ids.size };
})((window.FrameX = window.FrameX || {}));
