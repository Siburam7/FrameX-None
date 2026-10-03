/* ==========================================================================
   FrameX — runtime configuration
   dataMode "seed" : read shops/products/categories from js/edit.js and the
                     rest from assets/data/*.seed.js (no server needed)
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
    // true = a shop's "Publish" becomes "Submit for review" (status pending_review)
    // until FrameX approves it. Needs the backend moderation queue.
    productModeration: false,
    storageKeys: {
      cart: "framex.cart.v1",
      wishlist: "framex.wishlist.v1",
      shopProducts: "framex.shopProducts.v1", // products created / edited in the shop dashboard (this device)
      shopEditor: "framex.shopEditor.v1", // unsaved edits to published products
      shopSession: "framex.shopSession.v1" // which shop this device manages
    }
  };
})((window.FrameX = window.FrameX || {}));
