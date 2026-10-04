/* Public data API used by every UI module. Picks the provider from config. */
(function (FrameX) {
  FrameX.api =
    FrameX.config.dataMode === "api"
      ? FrameX.httpProvider
      : FrameX.seedProvider;
})((window.FrameX = window.FrameX || {}));
