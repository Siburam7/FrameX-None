/* SEED DATA — "From Our Community" tiles. Stand-in for GET /api/v1/community.
   The original page used another company's testimonial videos; those are NOT
   reused here. Until real customer photos/videos are collected, tiles show
   product photos. Add `video: "assets/video/....mp4"` to any tile to enable
   hover-to-play with a mute button. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.community = [
    { id: "c-001", productId: "p-012", image: "assets/img/products/wedding-anniversary.webp", video: null, isDemo: true, title: "Wedding anniversary frame", caption: "Custom premium photo frame" },
    { id: "c-002", productId: "p-013", image: "assets/img/products/collage-set.webp", video: null, isDemo: true, title: "Collage wall display", caption: "Multi-photo frame set" },
    { id: "c-003", productId: "p-011", image: "assets/img/products/family-memory.webp", video: null, isDemo: true, title: "Family memory frame", caption: "Personalized wooden frame" },
    { id: "c-004", productId: "p-014", image: "assets/img/products/luxury-hd.webp", video: null, isDemo: true, title: "Luxury HD print", caption: "Personalized picture frame" }
  ];
})((window.FrameX = window.FrameX || {}));
