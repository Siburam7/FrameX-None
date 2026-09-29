/* SEED DATA — gallery / inspiration. Stand-in for GET /api/v1/gallery.
   These are frame-style and inspiration images, NOT customer submissions. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};
  const P = (n) => "assets/img/products/" + n + ".webp";
  const O = (n) => "assets/img/occasions/" + n + ".webp";
  const S = (n) => "assets/img/steps/" + n + ".webp";
  const t = (src, alt) => ({ src, alt });

  FrameX.seed.gallery = [
    { id: "family", title: "Family moments", items: [
      t(P("family-memory"), "Wooden photo frame with a smiling family portrait on a table"),
      t(O("1-3"), "Mother and daughter laughing together"),
      t(O("2-2"), "Grandparents with their family outdoors"),
      t(O("3-4"), "Hands holding a newborn baby")] },
    { id: "wedding", title: "Wedding memories", items: [
      t(O("1-2"), "Bride and groom in traditional wedding attire"),
      t(O("2-3"), "Groom in a cream sherwani at a decorated venue"),
      t(P("wedding-anniversary"), "Woman hanging framed photos on a wall"),
      t(P("grand-frame"), "Framed wedding photo above a bed")] },
    { id: "portrait", title: "Portrait frames", items: [
      t(P("ace-of-us"), "Red-matted couple portrait in a dark wooden frame"),
      t(P("signature-frame"), "Sunset portrait in a dark wood frame"),
      t(P("royal-arch"), "Portrait in an arched red mat frame"),
      t(P("midnight-luxe"), "Black and white portrait in a black frame")] },
    { id: "wall-art", title: "Wall art", items: [
      t(S("step-2"), "Gallery wall of framed family photos"),
      t(P("collage-set"), "Collage of family photos in one frame"),
      t(P("modern-wooden"), "Wooden wall frames arranged on a white wall"),
      t(P("luxury-hd"), "Table display of assorted framed photos")] },
    { id: "minimal", title: "Minimal frames", items: [
      t(P("classic-square"), "White-wash square frame with a family photo"),
      t(P("urban-black"), "Black minimalist frame on a console table"),
      t(P("nordic-oak"), "Oak frame above a sofa"),
      t(P("white-texture-set"), "Set of four white textured frames")] },
    { id: "custom", title: "Custom designs", items: [
      t(S("step-3"), "Craftsman assembling a custom frame in a workshop"),
      t(S("step-4"), "Framed print packed securely for shipping"),
      t(O("3-1"), "Abstract marble pattern"),
      t(O("3-3"), "Colourful artist palette")] },
    { id: "gifts", title: "Gift inspiration", items: [
      t(O("1-1"), "Father hugging his daughter"),
      t(O("1-4"), "Couple embracing in a city at dusk"),
      t(O("2-1"), "Woman holding a leafy plant"),
      t(O("3-2"), "Balloons at a celebration")] }
  ];
})((window.FrameX = window.FrameX || {}));
