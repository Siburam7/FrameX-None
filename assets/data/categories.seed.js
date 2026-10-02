/* SEED DATA — categories. Stand-in for GET /api/v1/categories.
   `id` is what products reference in `categoryIds`.
   `kind: "style"` categories are the frame-style collections shown as the
   large "Shop by category" gallery on the home page; their image is a real
   product photo from that collection. The rest are occasion/theme categories. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.categories = [
    { id: "classic", kind: "style", name: "Classic Frames", image: "assets/img/products/vintage-legacy.webp", sortOrder: 10 },
    { id: "modern", kind: "style", name: "Modern Frames", image: "assets/img/products/urban-black.webp", sortOrder: 11 },
    { id: "wooden", kind: "style", name: "Wooden Frames", image: "assets/img/products/nordic-oak.webp", sortOrder: 12 },
    { id: "luxury", kind: "style", name: "Luxury Frames", image: "assets/img/products/imperial-gold.webp", sortOrder: 13 },
    { id: "minimal", kind: "style", name: "Minimal Frames", image: "assets/img/products/signature-frame.webp", sortOrder: 14 },
    { id: "decorative", kind: "style", name: "Decorative Frames", image: "assets/img/products/royal-arch.webp", sortOrder: 15 },
    { id: "photo-frames", name: "All Photo Frames", image: "assets/img/categories/photo-frames.webp", sortOrder: 1 },
    { id: "family", name: "Family Memories", image: "assets/img/categories/family.webp", sortOrder: 2 },
    { id: "wedding", name: "Wedding", image: "assets/img/categories/wedding.webp", sortOrder: 3 },
    { id: "portraits", name: "Portraits", image: "assets/img/categories/portraits.webp", sortOrder: 4 },
    { id: "wall-art", name: "Wall Art", image: "assets/img/categories/wall-art.webp", sortOrder: 5 },
    { id: "gifts", name: "Gifts", image: "assets/img/categories/gifts.webp", sortOrder: 6 },
    { id: "new-arrivals", name: "New Arrivals", image: "assets/img/categories/new-arrivals.webp", sortOrder: 7 }
  ];
})((window.FrameX = window.FrameX || {}));
