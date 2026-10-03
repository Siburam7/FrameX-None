/* ==========================================================================
   FrameX — studio.js
   The FRAME X STUDIO catalogue: every option the Studio can offer, and what
   each one costs. The Studio UI, the live preview and the price breakdown are
   all generated from this file. Nothing about frames or prices is written
   into the page code.

   PLACEHOLDER DATA: these frame types, finishes and prices are demo values
   for the frontend until FrameX's framing partners confirm what they make
   and charge. Set `available: false` to hide anything that isn't offered.
   With a backend, the same shapes come from GET /studio/catalog and prices
   are recalculated by the server at checkout.

   UNITS: thicknesses (frame moulding, mat, border) are in "preview units":
   the artwork's width is always 1000 units, so a 40-unit mat is 4% of the
   artwork width at any screen size or print size. A production renderer will
   map units to millimetres per size.

   Prices are whole rupees. A design's price = sum of the lines in
   assets/js/services/studio-engine.js → price().
   ========================================================================== */
(function (FrameX) {
  /* ---------------------------------------------------------------- Base prices */
  const BASE = {
    photoPrint: 349 // printing + mounting one photo (simple photo mode); templates use their own `price`
  };

  /* ---------------------------------------------------------------- Frame colours
     texture: "solid" | "wood" | "metal" — drives the material look in the preview. */
  const COLORS = [
    { id: "black", name: "Black", hex: "#1c1c1c", texture: "solid", priceModifier: 0 },
    { id: "white", name: "White", hex: "#f3efe7", texture: "solid", priceModifier: 0 },
    { id: "natural-wood", name: "Natural Wood", hex: "#c8a165", texture: "wood", priceModifier: 50 },
    { id: "walnut", name: "Walnut", hex: "#5b3a29", texture: "wood", priceModifier: 80 },
    { id: "dark-brown", name: "Dark Brown", hex: "#3b2412", texture: "wood", priceModifier: 50 },
    { id: "gold", name: "Gold", hex: "#b8872b", texture: "metal", priceModifier: 150 },
    { id: "silver", name: "Silver", hex: "#a9adb3", texture: "metal", priceModifier: 120 }
  ];

  /* ---------------------------------------------------------------- Finishes */
  const FINISHES = [
    { id: "matte", name: "Matte", description: "Soft, no shine", priceModifier: 0, available: true },
    { id: "gloss", name: "Gloss", description: "Smooth shine", priceModifier: 60, available: true },
    { id: "wood-grain", name: "Wood finish", description: "Visible grain", priceModifier: 80, available: true },
    { id: "metallic", name: "Metallic", description: "Brushed metal sheen", priceModifier: 100, available: true },
    { id: "textured", name: "Textured", description: "Fine textured surface", priceModifier: 80, available: true }
  ];

  /* ---------------------------------------------------------------- Frame types
     width   moulding width in preview units (how wide the frame looks)
     profile "flat" | "bevel" | "ornate" | "float" — edge shape in the preview
     colors / finishes / sizes  what this frame can be ordered in */
  const FRAME_TYPES = [
    { id: "classic", name: "Classic", material: "Wood", description: "Timeless bevelled moulding", width: 60, profile: "bevel", priceModifier: 0, colors: ["black", "white", "walnut", "dark-brown", "natural-wood", "gold"], finishes: ["matte", "gloss", "wood-grain"], available: true },
    { id: "modern", name: "Modern", material: "Wood", description: "Slim, flat and clean", width: 40, profile: "flat", priceModifier: 0, colors: ["black", "white", "natural-wood", "walnut"], finishes: ["matte", "gloss"], available: true },
    { id: "minimal", name: "Minimal", material: "Wood", description: "The thinnest profile", width: 24, profile: "flat", priceModifier: -50, colors: ["black", "white", "natural-wood"], finishes: ["matte"], available: true },
    { id: "premium", name: "Premium", material: "Carved wood", description: "Rich ornate moulding", width: 90, profile: "ornate", priceModifier: 350, colors: ["gold", "walnut", "dark-brown", "black"], finishes: ["gloss", "metallic", "wood-grain"], available: true },
    { id: "wood", name: "Solid Wood", material: "Solid wood", description: "Natural grain you can see", width: 70, profile: "bevel", priceModifier: 200, colors: ["natural-wood", "walnut", "dark-brown"], finishes: ["matte", "wood-grain", "textured"], available: true },
    { id: "metal", name: "Metal", material: "Aluminium", description: "Fine metal edge", width: 22, profile: "flat", priceModifier: 150, colors: ["black", "silver", "gold"], finishes: ["matte", "metallic"], available: true },
    { id: "gallery", name: "Gallery", material: "Wood", description: "Wide flat moulding, made for a mat", width: 75, profile: "flat", priceModifier: 120, colors: ["black", "white", "walnut"], finishes: ["matte", "textured"], available: true },
    { id: "floating", name: "Floating", material: "Wood", description: "Artwork floats inside a deep edge", width: 34, profile: "float", priceModifier: 250, colors: ["black", "white", "natural-wood", "walnut"], finishes: ["matte", "gloss"], available: true }
  ];

  /* ---------------------------------------------------------------- Border (printed space around the photo) */
  const BORDER = {
    presets: [
      { id: "none", name: "None", width: 0 },
      { id: "thin", name: "Thin", width: 10 },
      { id: "medium", name: "Medium", width: 20 },
      { id: "thick", name: "Thick", width: 30 },
      { id: "extra", name: "Extra thick", width: 40 }
    ],
    min: 0,
    max: 40,
    priceModifier: 0, // printing the border costs nothing extra
    colors: [
      { id: "white", name: "White", hex: "#ffffff" },
      { id: "cream", name: "Cream", hex: "#f3ead8" },
      { id: "beige", name: "Beige", hex: "#e6d6bc" },
      { id: "black", name: "Black", hex: "#141414" },
      { id: "brown", name: "Brown", hex: "#6b4a33" },
      { id: "gold", name: "Gold", hex: "#c9a14f" },
      { id: "silver", name: "Silver", hex: "#c4c7cc" }
    ],
    customColor: false // future: free colour picker
  };

  /* ---------------------------------------------------------------- Mat (card mount between frame and print) */
  const MAT = {
    types: [
      { id: "none", name: "No mat", layers: 0, priceModifier: 0 },
      { id: "single", name: "Single mat", layers: 1, priceModifier: 120 },
      { id: "double", name: "Double mat", layers: 2, priceModifier: 200 }
    ],
    widths: [
      { id: "slim", name: "Slim", width: 50 },
      { id: "classic", name: "Classic", width: 90 },
      { id: "wide", name: "Wide", width: 140 }
    ],
    innerWidth: 14, // the second (inner) mat of a double mat
    colors: [
      { id: "white", name: "White", hex: "#fbfaf7" },
      { id: "cream", name: "Cream", hex: "#f1e6cf" },
      { id: "beige", name: "Beige", hex: "#ddc9a8" },
      { id: "grey", name: "Grey", hex: "#b9b8b4" },
      { id: "black", name: "Black", hex: "#1d1d1d" }
    ]
  };

  /* ---------------------------------------------------------------- Sizes
     The sizes FrameX products are listed in today (js/edit.js → SIZES.standard).
     w × h are inches in portrait; landscape swaps them. Other sizes (4 × 6, 5 × 7,
     12 × 18, 18 × 24 …) are added here once a partner shop offers them. */
  const SIZES = [
    { id: "s", label: "Small", w: 8, h: 10, priceModifier: -150, available: true },
    { id: "m", label: "Medium", w: 12, h: 16, priceModifier: 0, available: true },
    { id: "l", label: "Large", w: 16, h: 20, priceModifier: 250, available: true },
    { id: "xl", label: "Extra Large", w: 20, h: 24, priceModifier: 450, available: true }
  ];
  const CUSTOM_SIZE = { available: false, units: ["in", "cm"], min: 4, max: 40 }; // coming soon

  const ORIENTATIONS = [
    { id: "portrait", name: "Portrait" },
    { id: "landscape", name: "Landscape" },
    { id: "square", name: "Square" } // only offered when a square size exists
  ];

  /* ---------------------------------------------------------------- Front protection */
  const PROTECTION = [
    { id: "none", name: "No cover", description: "Open front", priceModifier: 0, available: true },
    { id: "acrylic", name: "Acrylic", description: "Light, shatter-resistant", priceModifier: 150, available: true },
    { id: "glass", name: "Glass", description: "Classic clear glass", priceModifier: 200, available: false }
  ];

  /* ---------------------------------------------------------------- Text styles (template mode)
     Fonts already loaded by the site (Sora, Plus Jakarta Sans, Playfair Display, Great Vibes). */
  const FONTS = [
    { id: "classic", name: "Classic", font: "serif", weight: 700, italic: false },
    { id: "modern", name: "Modern", font: "display", weight: 600, italic: false },
    { id: "elegant", name: "Elegant", font: "serif", weight: 500, italic: true },
    { id: "handwritten", name: "Handwritten", font: "script", weight: 400, italic: false },
    { id: "bold", name: "Bold", font: "display", weight: 700, italic: false, uppercase: true },
    { id: "minimal", name: "Minimal", font: "sans", weight: 400, italic: false }
  ];
  const TEXT_COLORS = [
    { id: "ink", name: "Black", hex: "#1f1a16" },
    { id: "white", name: "White", hex: "#ffffff" },
    { id: "gold", name: "Gold", hex: "#b8872b" },
    { id: "grey", name: "Grey", hex: "#6f6152" },
    { id: "accent", name: "Rose", hex: "#c7576f" },
    { id: "brown", name: "Brown", hex: "#704529" }
  ];
  const TEXT_SIZES = [
    { id: "s", name: "Small", scale: 0.85 },
    { id: "m", name: "Medium", scale: 1 },
    { id: "l", name: "Large", scale: 1.18 }
  ];

  /* ---------------------------------------------------------------- Template backgrounds */
  const BACKGROUNDS = {
    colors: [
      { id: "white", name: "White", hex: "#ffffff" },
      { id: "cream", name: "Cream", hex: "#f3e9d8" },
      { id: "blush", name: "Blush", hex: "#f4dcd6" },
      { id: "sage", name: "Sage", hex: "#dfe5d6" },
      { id: "sky", name: "Sky", hex: "#dce8ef" },
      { id: "black", name: "Black", hex: "#1f1a16" },
      { id: "navy", name: "Navy", hex: "#1d2433" }
    ],
    patterns: [
      { id: "", name: "Plain" },
      { id: "dots", name: "Dots" },
      { id: "hearts", name: "Hearts" },
      { id: "stars", name: "Stars" },
      { id: "confetti", name: "Confetti" },
      { id: "grid", name: "Grid" }
    ]
  };

  /* ---------------------------------------------------------------- Defaults per mode */
  const DEFAULTS = {
    photo: { frame: { typeId: "classic", colorId: "black", finishId: "matte" }, border: { width: 20, colorId: "white" }, mat: { type: "single", colorId: "cream", color2Id: "white", widthId: "classic" }, sizeId: "m", orientation: "portrait", protection: "acrylic" },
    template: { frame: { typeId: "modern", colorId: "black", finishId: "matte" }, border: { width: 0, colorId: "white" }, mat: { type: "none", colorId: "white", color2Id: "cream", widthId: "classic" }, sizeId: "m", orientation: "portrait", protection: "acrylic" }
  };

  FrameX.seed = FrameX.seed || {};
  FrameX.seed.studio = { BASE, COLORS, FINISHES, FRAME_TYPES, BORDER, MAT, SIZES, CUSTOM_SIZE, ORIENTATIONS, PROTECTION, FONTS, TEXT_COLORS, TEXT_SIZES, BACKGROUNDS, DEFAULTS };
})((window.FrameX = window.FrameX || {}));
