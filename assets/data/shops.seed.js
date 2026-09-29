/* ==========================================================================
   SEED DATA — shops. Stand-in for GET /api/v1/shops.

   IMPORTANT
   - Only "FrameX Studio" uses information from the original site (its
     address). Everything else about it is unknown and left null.
   - "Photo Frame Shop B / C" are PLACEHOLDERS (isSample: true) so the
     multi-shop UI can be seen. The UI labels them "Sample shop".
   - latitude/longitude are null on purpose. Distances are only ever computed
     from real coordinates + the visitor's real location, never typed in.
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  const weekdayHours = ["10:00", "20:00"];

  FrameX.seed.shops = [
    {
      id: "shop-001",
      name: "FrameX Studio",
      slug: "framex-studio",
      logo: null,
      coverImage: "assets/img/shops/cover-a.webp",
      description: null,
      address: {
        line1: null,
        area: "Mathakarogola",
        city: "Dhenkanal",
        state: "Odisha",
        postalCode: "759024",
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: null, // null = not published yet
      fulfilment: ["pickup"],
      rating: null, // { average: 4.6, count: 128 } once real reviews exist
      isActive: true,
      isSample: false,
    },
    {
      id: "shop-002",
      name: "Photo Frame Shop B",
      slug: "photo-frame-shop-b",
      logo: null,
      coverImage: "assets/img/shops/cover-b.webp",
      description: null,
      address: {
        line1: null,
        area: "Address to be added",
        city: null,
        state: null,
        postalCode: null,
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: {
        mon: weekdayHours,
        tue: weekdayHours,
        wed: weekdayHours,
        thu: weekdayHours,
        fri: weekdayHours,
        sat: weekdayHours,
        sun: null,
      },
      fulfilment: ["pickup", "shop_delivery"],
      rating: null,
      isActive: true,
      isSample: true,
    },
    {
      id: "shop-003",
      name: "Photo Frame Shop C",
      slug: "photo-frame-shop-c",
      logo: null,
      coverImage: "assets/img/shops/cover-c.webp",
      description: null,
      address: {
        line1: null,
        area: "Address to be added",
        city: null,
        state: null,
        postalCode: null,
      },
      location: { latitude: null, longitude: null },
      phone: null,
      openingHours: {
        mon: weekdayHours,
        tue: weekdayHours,
        wed: weekdayHours,
        thu: weekdayHours,
        fri: weekdayHours,
        sat: weekdayHours,
        sun: weekdayHours,
      },
      fulfilment: ["pickup", "delivery_partner"],
      rating: null,
      isActive: true,
      isSample: true,
    },
    {
      id: "shop-004",
      name: "Priya Internet House",
      slug: "framex-studio",
      logo: null,
      coverImage: "assets/img/shops/cover-a.webp",
      description: null,
      address: {
        line1: null,
        area: "Mathakarogola",
        city: "Dhenkanal",
        state: "Odisha",
        postalCode: "759024",
      },
      location: { latitude: null, longitude: null },
      phone: "9556338348",
      openingHours: null, // null = not published yet
      fulfilment: ["pickup"],
      rating: null, // { average: 4.6, count: 128 } once real reviews exist
      isActive: true,
      isSample: false,
    },
  ];
})((window.FrameX = window.FrameX || {}));
