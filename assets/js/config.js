/* ==========================================================================
   FrameX — runtime configuration
   dataMode "seed" : read from assets/data/*.seed.js (no server needed)
   dataMode "api"  : call apiBaseUrl (see docs/ARCHITECTURE.md for the contract)
   Switching modes is the only change the frontend needs once a backend exists.
   ========================================================================== */
(function (FrameX) {
  FrameX.config = {
    dataMode: "seed",
    apiBaseUrl: "/api/v1",
    currency: "INR",
    locale: "en-IN",
    productPageSize: 10,
    lowStockThreshold: 5,
    storageKeys: { cart: "framex.cart.v1", wishlist: "framex.wishlist.v1" }
  };
})((window.FrameX = window.FrameX || {}));
