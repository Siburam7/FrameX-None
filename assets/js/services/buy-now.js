/* ==========================================================================
   "Buy Now" (FrameX.buyNow): order one item directly, without the cart.

     FrameX.buyNow.start({ name, item })
       item = what the backend accepts for one item, the same shape the cart uses:
         { productId, quantity, selection: { sizeId, colorId, printMaterialId, protection }, note }
         { kind: "studio", quantity, design: { id, config, thumbnail } }

   The visitor logs in if needed (ui/auth-gate.js), then the checkout page
   opens for this item only (checkout.html?buy=1). The cart is not changed.

   The chosen item travels to the checkout page in sessionStorage (this tab
   only, for an hour). It is only a note of what the visitor asked for: the
   backend checks the product, the options, the stock and the price itself,
   and nothing here contains a price.
   ========================================================================== */
(function (FrameX) {
  const KEY = "framex.buyNow.v1";
  const MINUTES = 60;

  /** What the visitor chose to buy now: { name, item } or null. */
  function read() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      return saved && Date.now() - saved.at < MINUTES * 60000 ? { name: saved.name, item: saved.item } : null;
    } catch (error) {
      return null;
    }
  }

  function clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch (error) {
      /* nothing stored */
    }
  }

  /** Log in if needed, then open checkout for this one item. Resolves false if the login was dismissed. */
  async function start({ name = "", item }) {
    const loggedIn = await FrameX.authGate.require({ reason: "buy", itemName: name });
    if (!loggedIn) return false;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), name, item }));
    } catch (error) {
      FrameX.toast.show("This browser is blocking storage, so Buy Now can't continue. Please use Add to cart.", { duration: 6000 });
      return false;
    }
    window.location.href = "checkout.html?buy=1";
    return true;
  }

  FrameX.buyNow = { start, read, clear };
})((window.FrameX = window.FrameX || {}));
