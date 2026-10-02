/* ==========================================================================
   SEED DATA — frame colour palette.
   A shared set of finishes a shop can offer. Each product lists which of
   these IDs it supports in `colors: [...]`. Hex values approximate the
   finish for the on-screen swatch and frame-preview visualizer; they are a
   frontend stand-in, not a photographed sample, which the product page
   states next to the preview.
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.frameColors = [
    { id: "black", name: "Black", hex: "#1c1c1c", texture: "solid" },
    { id: "white", name: "White", hex: "#f3efe7", texture: "solid" },
    { id: "natural-wood", name: "Natural Wood", hex: "#c8a165", texture: "wood" },
    { id: "walnut", name: "Walnut", hex: "#5b3a29", texture: "wood" },
    { id: "dark-brown", name: "Dark Brown", hex: "#3b2412", texture: "wood" },
    { id: "gold", name: "Gold", hex: "#b8872b", texture: "metal" }
  ];
})((window.FrameX = window.FrameX || {}));
