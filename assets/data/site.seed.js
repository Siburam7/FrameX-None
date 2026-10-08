/* ==========================================================================
   SEED DATA — site content
   Stand-in for GET /api/v1/site. Edit here until the Admin Panel exists.
   Empty contact/social values are intentional: the UI shows a "coming soon"
   notice instead of linking to something that does not exist.
   ========================================================================== */
(function (FrameX) {
  FrameX.seed = FrameX.seed || {};

  FrameX.seed.site = {
    brand: { name: "FrameX" },
    contact: {
      phone: "",       // e.g. "+91 98765 43210"  -> enables tel: link
      whatsapp: "919337169824", // country code + number, digits only -> WhatsApp link
      email: "support.framex@gmail.com"
    },
    social: {
      facebook: "",
      instagram: "",
      linkedin: ""
    },
    // Hero figures (e.g. { value: 500, label: "Happy Customers", suffix: "+", icon: "users" }).
    // Removed at the owner's request — add only figures you can back up.
    stats: [],

    /* HOME PAGE HERO — the slides shown in turn at the top of the home page.
       Add, remove or reorder them here; the hero and its tabs follow.

       id       short name, never shown
       label    the tab under the hero
       eyebrow  small line above the headline
       title    two short lines (about 16 letters each at most); the second is the highlighted one
       lead     one or two sentences under the headline
       actions  one or two buttons: { label, href }. The first is the main one.
       pieces   exactly three framed pictures: { image, alt, href }
                or, for a personalised design, { template: "<template slug>", alt, href }
       glow     the colour of the light behind the slide, as "red, green, blue"

       The FIRST slide is also written in index.html (it is on screen before
       this file loads): change it in both places. */
    heroSlides: [
      {
        id: "frames",
        label: "Photo Frames",
        eyebrow: "Photo frames from local shops",
        title: ["Frames made for", "your photos."],
        lead: "Choose a frame from a local framing shop, see your own photo inside it, then collect it or have it delivered.",
        actions: [
          { label: "Shop Frames", href: "shop.html" },
          { label: "Create Your Frame", href: "studio.html?mode=photo" }
        ],
        pieces: [
          { image: "assets/img/products/signature-frame.webp", alt: "Signature Frame", href: "product.html?id=p-004" },
          { image: "assets/img/products/ace-of-us.webp", alt: "Ace of Us", href: "product.html?id=p-001" },
          { image: "assets/img/products/classic-square.webp", alt: "Classic Square", href: "product.html?id=p-002" }
        ],
        glow: "234, 120, 14",
        tint: "#e2ecfb"
      },
      {
        id: "decor",
        label: "Home Decor",
        eyebrow: "Home Decor & Wall Art",
        title: ["Wall art for", "every room."],
        lead: "Framed quotes, calm landscapes, museum classics and modern art, ready to hang.",
        actions: [
          { label: "Explore wall art", href: "home-decor.html" },
          { label: "Browse collections", href: "home-decor.html#collections" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-mountain-dawn.webp", alt: "Mountain Dawn", href: "product.html?id=hd-mountain-dawn" },
          { image: "assets/img/decor/hd-terracotta-arches.webp", alt: "Terracotta Arches", href: "product.html?id=hd-terracotta-arches" },
          { image: "assets/img/decor/hd-great-wave.webp", alt: "The Great Wave", href: "product.html?id=hd-great-wave" }
        ],
        glow: "216, 161, 93",
        tint: "#dff3ea"
      },
      {
        id: "multi-panel",
        label: "Multi-Panel",
        eyebrow: "Multi-panel frames",
        title: ["One picture,", "several frames."],
        lead: "Sets of two to five frames that carry a single picture across the wall. Or split one of your own photos.",
        actions: [
          { label: "See multi-panel sets", href: "home-decor.html?c=multi-panel#browse" },
          { label: "Use your own photo", href: "wall-art-studio.html?product=hd-custom-split-3" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-mp-golden-tree-3.webp", alt: "Golden Tree at Night, 3 panels", href: "product.html?id=hd-mp-golden-tree-3" },
          { image: "assets/img/decor/hd-mp-cherry-tree-3.webp", alt: "Cherry Blossom Tree, 3 panels", href: "product.html?id=hd-mp-cherry-tree-3" },
          { image: "assets/img/decor/hd-mp-night-skyline-5.webp", alt: "City Skyline at Night, 5 panels", href: "product.html?id=hd-mp-night-skyline-5" }
        ],
        glow: "236, 96, 150",
        tint: "#ebe5fb"
      },
      {
        id: "motivational",
        label: "Motivational",
        eyebrow: "Motivational",
        title: ["Words that", "keep you going."],
        lead: "Bold quotes for desks, gyms and study corners.",
        actions: [
          { label: "Shop motivational", href: "home-decor.html?c=motivational#browse" },
          { label: "All wall art", href: "home-decor.html" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-dream-big.webp", alt: "Dream Big", href: "product.html?id=hd-dream-big" },
          { image: "assets/img/decor/hd-never-give-up.webp", alt: "Never Give Up", href: "product.html?id=hd-never-give-up" },
          { image: "assets/img/decor/hd-hardest-climb.webp", alt: "The Hardest Climb", href: "product.html?id=hd-hardest-climb" }
        ],
        glow: "234, 120, 14",
        tint: "#fdebd8"
      },
      {
        id: "gaming",
        label: "Gaming",
        eyebrow: "Gaming",
        title: ["Level up", "your setup."],
        lead: "Pixel art, neon grids and controller prints for the gaming corner.",
        actions: [
          { label: "Shop gaming art", href: "home-decor.html?c=gaming#browse" },
          { label: "All wall art", href: "home-decor.html" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-pixel-invaders.webp", alt: "Pixel Invaders", href: "product.html?id=hd-pixel-invaders" },
          { image: "assets/img/decor/hd-retro-grid.webp", alt: "Retro Grid", href: "product.html?id=hd-retro-grid" },
          { image: "assets/img/decor/hd-level-up.webp", alt: "Level Up", href: "product.html?id=hd-level-up" }
        ],
        glow: "124, 92, 255",
        tint: "#e1e6fd"
      },
      {
        id: "anime",
        label: "Anime",
        eyebrow: "Anime",
        title: ["Anime-style art", "for your wall."],
        lead: "Moonlit wanderers, cherry blossom and Japanese landscapes, in original FrameX artwork.",
        actions: [
          { label: "Shop anime art", href: "home-decor.html?c=anime#browse" },
          { label: "All wall art", href: "home-decor.html" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-sakura-moon.webp", alt: "Sakura Moon", href: "product.html?id=hd-sakura-moon" },
          { image: "assets/img/decor/hd-moonlit-wanderer.webp", alt: "Moonlit Wanderer", href: "product.html?id=hd-moonlit-wanderer" },
          { image: "assets/img/decor/hd-fuji-sunrise.webp", alt: "Fuji Sunrise", href: "product.html?id=hd-fuji-sunrise" }
        ],
        glow: "236, 96, 150",
        tint: "#fce4ec"
      },
      {
        id: "cars",
        label: "Cars & Bikes",
        eyebrow: "Cars & Bikes",
        title: ["Made for", "the garage wall."],
        lead: "Sports cars, classics and bikes in sunset, neon and blueprint styles.",
        actions: [
          { label: "Shop cars & bikes", href: "home-decor.html?c=cars#browse" },
          { label: "All wall art", href: "home-decor.html" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-midnight-run.webp", alt: "Midnight Run", href: "product.html?id=hd-midnight-run" },
          { image: "assets/img/decor/hd-driven.webp", alt: "Driven", href: "product.html?id=hd-driven" },
          { image: "assets/img/decor/hd-ride-free.webp", alt: "Ride Free", href: "product.html?id=hd-ride-free" }
        ],
        glow: "255, 94, 58",
        tint: "#dcf1f7"
      },
      {
        id: "movies",
        label: "Movies",
        eyebrow: "Movies & Films",
        title: ["For the love", "of cinema."],
        lead: "Projectors, clapperboards and marquee lights for the home theatre.",
        actions: [
          { label: "Shop movie art", href: "home-decor.html?c=movies#browse" },
          { label: "All wall art", href: "home-decor.html" }
        ],
        pieces: [
          { image: "assets/img/decor/hd-and-action.webp", alt: "And… Action", href: "product.html?id=hd-and-action" },
          { image: "assets/img/decor/hd-last-reel.webp", alt: "The Last Reel", href: "product.html?id=hd-last-reel" },
          { image: "assets/img/decor/hd-movie-night-marquee.webp", alt: "Now Showing: Movie Night", href: "product.html?id=hd-movie-night-marquee" }
        ],
        glow: "216, 161, 93",
        tint: "#f8efd4"
      },
      {
        id: "personalised",
        label: "Personalised",
        eyebrow: "Personalised designs",
        title: ["Your memories,", "your design."],
        lead: "Pick a birthday, anniversary or family design, add your photos and names, and we frame the result.",
        actions: [
          { label: "Browse templates", href: "templates.html" },
          { label: "Open FrameX Studio", href: "studio.html?mode=photo" }
        ],
        pieces: [
          { template: "birthday-memories", alt: "Birthday Memories design", href: "template.html?t=birthday-memories" },
          { template: "family-moments", alt: "Family Moments design", href: "template.html?t=family-moments" },
          { template: "happy-anniversary", alt: "Happy Anniversary design", href: "template.html?t=happy-anniversary" }
        ],
        glow: "234, 120, 14",
        tint: "#fbe6e1"
      },
      {
        id: "art",
        label: "Art & Artists",
        eyebrow: "Art & Artists",
        title: ["Discover original art.", "Meet the artists."],
        lead: "Paintings, drawings and handmade artwork from artists you can get to know. Buy a finished piece, or ask for a custom painting from your photo.",
        actions: [
          { label: "Explore Art & Artists", href: "art.html" },
          { label: "Request a custom painting", href: "art.html#browse" }
        ],
        pieces: [
          { image: "assets/img/art/hero-artist.webp", alt: "An artist painting flowers on a canvas", href: "art.html" },
          { image: "assets/img/art/hero-canvas.webp", alt: "A finished painting on an easel", href: "art.html?view=artworks" },
          { image: "assets/img/art/hero-brushes.webp", alt: "Brushes on a palette of oil paint", href: "art.html#join" }
        ],
        glow: "124, 92, 255",
        tint: "#ece8fb"
      }
    ]
  };
})((window.FrameX = window.FrameX || {}));
