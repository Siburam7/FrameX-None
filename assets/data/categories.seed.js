/* SEED DATA — categories. Stand-in for GET /api/v1/categories.
   `id` is what products reference in `categoryIds`. */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.categories = [
    { id: "photo-frames", name: "All Photo Frames", image: "assets/img/categories/photo-frames.webp", sortOrder: 1 },
    { id: "family", name: "Family Memories", image: "assets/img/categories/family.webp", sortOrder: 2 },
    { id: "wedding", name: "Wedding", image: "assets/img/categories/wedding.webp", sortOrder: 3 },
    { id: "portraits", name: "Portraits", image: "assets/img/categories/portraits.webp", sortOrder: 4 },
    { id: "wall-art", name: "Wall Art", image: "assets/img/categories/wall-art.webp", sortOrder: 5 },
    { id: "gifts", name: "Gifts", image: "assets/img/categories/gifts.webp", sortOrder: 6 },
    { id: "new-arrivals", name: "New Arrivals", image: "assets/img/categories/new-arrivals.webp", sortOrder: 7 }
  ];
})((window.FrameX = window.FrameX || {}));
