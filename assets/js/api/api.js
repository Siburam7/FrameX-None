/* Public data API used by every UI module. Picks the provider from config.
   Shops (and nearby search) come from the FrameX backend when one is
   configured (see api/shop-directory.js); everything else is unchanged. */
(function (FrameX) {
  const base =
    FrameX.config.dataMode === "api"
      ? FrameX.httpProvider
      : FrameX.seedProvider;
  FrameX.api = FrameX.shopDirectory ? FrameX.shopDirectory.wrap(base) : base;
})((window.FrameX = window.FrameX || {}));
