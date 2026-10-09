/* ==========================================================================
   FrameX — runtime configuration
   dataMode "seed" : read shops/products/categories from js/edit.js and the
                     rest from assets/data/*.seed.js (no server needed)
   dataMode "api"  : call apiBaseUrl (see docs/ARCHITECTURE.md for the contract)
   Switching modes is the only change the frontend needs once a backend exists.
   ========================================================================== */
(function (FrameX) {
  /* ---- FrameX backend (accounts, shops, nearby search) -------------------
     The website stays a static site; the backend is a separate service
     (see backend/README.md).

     PRODUCTION_API_URL  the deployed backend's address + "/api", for example
                         "https://framex-api.onrender.com/api".
                         Leave "" until the backend is deployed: the site then
                         works exactly as before, without accounts.
     Local development   pages opened from localhost / 127.0.0.1 use the
                         backend on port 4000 of the same machine.            */
  const PRODUCTION_API_URL = "https://framex-api.onrender.com/api";
  const LOCAL_API_PORT = "4000";
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const backendUrl = isLocal
    ? window.location.port === LOCAL_API_PORT
      ? "/api"
      : `http://${host}:${LOCAL_API_PORT}/api`
    : PRODUCTION_API_URL;

  FrameX.config = {
    backend: {
      url: backendUrl,
      // "cookie" (recommended): the session lives in an httpOnly cookie that
      //   JavaScript can't read. Needs the website and the API on the same site
      //   (localhost, or example.com + api.example.com).
      // "bearer": the session token is kept in sessionStorage and sent as a
      //   header. Only for a website and API on different sites (e.g.
      //   *.github.io + *.onrender.com); the backend needs AUTH_ALLOW_BEARER=true.
      // On this computer (localhost) the cookie is used. The live site (shopframex.in) and its
      // backend (onrender.com) are different sites, so there the token travels in a header.
      session: isLocal ? "cookie" : "bearer",
    },
    // Used only if the backend can't be asked (GET /api/config is the source of truth).
    nearby: { radiusOptionsKm: [5, 10, 25, 50], defaultRadiusKm: 25 },
    // Google Analytics 4 (optional). With the backend running, set GA4_MEASUREMENT_ID in backend/.env
    // instead: that value wins. This one is only for a site that runs without the backend. A Measurement
    // ID looks like "G-AB12CD34EF"; it is public, not a secret. Google is loaded only after a visitor
    // presses "Allow analytics" (assets/js/services/analytics.js).
    analytics: { ga4MeasurementId: "" },
    dataMode: "seed",
    apiBaseUrl: "/api/v1",
    currency: "INR",
    locale: "en-IN",
    productPageSize: 12,
    lowStockThreshold: 5,
    // true = a shop's "Publish" becomes "Submit for review" (status pending_review)
    // until FrameX approves it. Needs the backend moderation queue.
    productModeration: false,
    storageKeys: {
      // The cart is NOT kept in the browser: it lives in the backend, tied to the
      // logged-in account (store/cart.js). This is only the name of the old
      // on-device cart, so it can be deleted from browsers that still have one.
      legacyCart: "framex.cart.v1",
      wishlist: "framex.wishlist.v1",
      shopProducts: "framex.shopProducts.v1", // products created / edited in the shop dashboard (this device)
      shopEditor: "framex.shopEditor.v1", // unsaved edits to published products
    },
  };
})((window.FrameX = window.FrameX || {}));
