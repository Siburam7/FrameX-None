/* ==========================================================================
   FrameX — templates.js
   ALL personalised-frame TEMPLATE data lives here: categories, print sizes
   and the templates themselves. The Templates pages, the home page
   "Trending Templates" row, the template detail page and the customizer all
   read from this file. Adding a template = adding one object to TEMPLATES.
   No page, card, preview or form needs to change.

   This is FRONTEND MOCK DATA (the same role as js/edit.js). When the backend
   exists, set dataMode: "api" in assets/js/config.js and serve the same
   shapes from GET /templates, /templates/:slug and /template-categories.

   ---------------------------------------------------------------------------
   TEMPLATE FIELDS
     id             unique, never change once in use (carts + saved designs use it)
     slug           URL name: template.html?t=<slug>
     title          shown everywhere
     category       one id from TEMPLATE_CATEGORIES
     occasion       one id from OCCASIONS (used by the "Occasion" filter)
     description    one or two sentences (also the page's meta description)
     tags           extra search words
     thumbnail      optional image for listing pages. Leave null to show the
                    live-rendered layout with samplePhotos instead.
     previewImage   optional larger image for the detail page (same rule)
     samplePhotos   example photos used to show the design before the customer
                    adds their own (one per photo slot, any order)
     photosRequired number of photo slots the customer must fill
     textFields     the text the customer can change:
                      { id, label, defaultValue, maxLength, required, placeholder,
                        type: "text" | "date" }
     layout         how the design is drawn (see LAYOUT below)
     orientation    "portrait" | "landscape" | "square" (taken from the layout)
     aspectRatio    "4:5", "5:4", "1:1"… (taken from the layout)
     sizes          print sizes offered (ids from TEMPLATE_SIZES)
     price          base price in rupees for the "m" size (placeholder until
                    confirmed). Each size adds its priceDelta.
     isTrending / isPopular / isNew   badges + filters
     studio         optional FrameX Studio rules — which options this design allows.
                    Anything left out is allowed. Example:
                    { text: false, textStyle: false, background: false, frame: true,
                      mat: true, border: true,
                      supportedFrameTypes: ["classic", "wood"], supportedSizes: ["m", "l"],
                      supportedFinishes: ["matte"], supportedMatOptions: ["none", "single"],
                      supportedOrientations: ["portrait"] }
                    (ids from js/studio.js)
     available      false hides the template everywhere
     createdAt      used for "Newest"

   LAYOUT — one coordinate system per template (width × height, any units):
     { width, height,
       background: { color, gradient?, pattern?: "dots" | "grid" | "hearts" | "confetti" | "stars" },
       elements: [
         { type: "image", slot: "photo1", x, y, width, height,
           shape?: "rect" | "rounded" | "circle" | "heart" | "arch",
           frame?: "polaroid", rotate?, border?: "#hex" },
         { type: "text", field: "<textFields id>", x, y, width, size,
           font?: "display" | "serif" | "script" | "sans", weight?, color?,
           align?: "left" | "center" | "right", uppercase?, italic?, spacing? },
         { type: "label", text: "fixed words", …same as text },
         { type: "shape", shape: "line" | "rect" | "circle" | "heart" | "star",
           x, y, width, height, color, opacity?, rotate?, outline? }
       ] }
     x / y / width / height / size are in the layout's own units, so a design
     scales to any screen and, later, to any print resolution.
   ========================================================================== */
(function (FrameX) {
  /* ---------------------------------------------------------------- Categories */
  // ADD NEW TEMPLATE CATEGORY HERE. `icon` is a name from assets/js/ui/icons.js.
  const TEMPLATE_CATEGORIES = [
    { id: "birthday", name: "Birthday", icon: "gift" },
    { id: "anniversary", name: "Anniversary", icon: "heart" },
    { id: "wedding", name: "Wedding", icon: "heart" },
    { id: "couple", name: "Couple", icon: "heart" },
    { id: "family", name: "Family", icon: "users" },
    { id: "baby", name: "Baby", icon: "star" },
    { id: "kids", name: "Kids", icon: "star" },
    { id: "mother", name: "Mother", icon: "heart" },
    { id: "father", name: "Father", icon: "users" },
    { id: "friends", name: "Friends", icon: "users" },
    { id: "love", name: "Love", icon: "heart" },
    { id: "travel", name: "Travel", icon: "pin" },
    { id: "memories", name: "Memories", icon: "image" },
    { id: "graduation", name: "Graduation", icon: "badge-check" },
    { id: "achievement", name: "Achievement", icon: "star" },
    { id: "festival", name: "Festival", icon: "gift" },
    { id: "pets", name: "Pets", icon: "heart" },
  ];

  // Occasions are a second, broader filter ("what is it for?").
  const OCCASIONS = [
    { id: "birthday", name: "Birthday" },
    { id: "anniversary", name: "Anniversary" },
    { id: "wedding", name: "Wedding" },
    { id: "mothers-day", name: "Mother's Day" },
    { id: "fathers-day", name: "Father's Day" },
    { id: "friendship", name: "Friendship" },
    { id: "new-baby", name: "New baby" },
    { id: "graduation", name: "Graduation" },
    { id: "festival", name: "Festival" },
    { id: "just-because", name: "Just because" },
  ];

  /* ---------------------------------------------------------------- Print sizes */
  // The same Small / Medium / Large / Extra Large sizes the frame products use
  // (js/edit.js → SIZES.standard). Prices are placeholders until confirmed.
  // Future sizes (10 × 12, 12 × 18, 18 × 24, custom) are added here, then
  // listed in a template's `sizes`.
  const TEMPLATE_SIZES = [
    { id: "s", label: "Small", dimensions: "8 × 10 in", priceDelta: -150 },
    { id: "m", label: "Medium", dimensions: "12 × 16 in", priceDelta: 0 },
    { id: "l", label: "Large", dimensions: "16 × 20 in", priceDelta: 250 },
    {
      id: "xl",
      label: "Extra Large",
      dimensions: "20 × 24 in",
      priceDelta: 450,
    },
  ];
  const ALL_SIZES = ["s", "m", "l", "xl"];

  /* ---------------------------------------------------------------- Layout helpers
     Shorthands for the element objects described above; they only fill in
     the `type`, so every template below is still plain data. */
  const img = (slot, x, y, width, height, opts) =>
    Object.assign({ type: "image", slot, x, y, width, height }, opts);
  const text = (field, x, y, width, size, opts) =>
    Object.assign({ type: "text", field, x, y, width, size }, opts);
  const label = (words, x, y, width, size, opts) =>
    Object.assign({ type: "label", text: words, x, y, width, size }, opts);
  const shape = (kind, x, y, width, height, opts) =>
    Object.assign({ type: "shape", shape: kind, x, y, width, height }, opts);

  // Sample photos (FrameX's own images) used to show each design.
  const P = (name) => "assets/img/occasions/" + name + ".webp";
  const S = {
    dadDaughter: P("1-1"),
    weddingCouple: P("1-2"),
    momDaughter: P("1-3"),
    duskCouple: P("1-4"),
    smile: P("2-1"),
    bigFamily: P("2-2"),
    groom: P("2-3"),
    newborn: P("3-4"),
    balloons: P("3-2"),
    marble: P("3-1"),
    palette: P("3-3"),
  };

  // Brand-aligned palette for designs
  const C = {
    ivory: "#faf6ee",
    cream: "#f3e9d8",
    champagne: "#ecdcbd",
    gold: "#b8872b",
    brown: "#704529",
    ink: "#1f1a16",
    blush: "#f4dcd6",
    rose: "#c7576f",
    sage: "#dfe5d6",
    sky: "#dce8ef",
    night: "#1d2433",
  };

  /* ---------------------------------------------------------------- Templates
     ADD NEW TEMPLATE HERE — copy any block below, give it a new id + slug,
     and change the text, photos and layout. */
  const TEMPLATES = [
    {
      id: "tpl-001",
      slug: "birthday-memories",
      title: "Birthday Memories",
      category: "birthday",
      occasion: "birthday",
      description:
        "One big moment and two favourites, with a warm birthday headline and their name in script.",
      tags: ["happy birthday", "collage", "celebration", "party"],
      samplePhotos: [S.dadDaughter, S.balloons, S.momDaughter],
      photosRequired: 3,
      textFields: [
        {
          id: "headline",
          label: "Birthday message",
          defaultValue: "HAPPY BIRTHDAY",
          maxLength: 24,
          required: true,
        },
        {
          id: "name",
          label: "Name",
          defaultValue: "Aanya",
          maxLength: 20,
          placeholder: "Their name",
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.cream, pattern: "confetti" },
        elements: [
          text("headline", 60, 70, 680, 64, {
            font: "display",
            weight: 700,
            color: C.brown,
            align: "center",
            uppercase: true,
            spacing: 4,
          }),
          img("photo1", 80, 190, 640, 430, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo2", 80, 650, 305, 230, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo3", 415, 650, 305, 230, {
            shape: "rounded",
            border: "#ffffff",
          }),
          text("name", 60, 900, 680, 62, {
            font: "script",
            color: C.rose,
            align: "center",
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 899,
      isTrending: true,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-07-02",
    },
    {
      id: "tpl-002",
      slug: "birthday-collage",
      title: "Birthday Collage",
      category: "birthday",
      occasion: "birthday",
      description:
        "Four photos in a clean grid around a round centre badge with your birthday wishes.",
      tags: ["happy birthday", "grid", "four photos"],
      samplePhotos: [S.dadDaughter, S.balloons, S.smile, S.momDaughter],
      photosRequired: 4,
      textFields: [
        {
          id: "headline",
          label: "Badge text",
          defaultValue: "Happy Birthday",
          maxLength: 18,
          required: true,
        },
        { id: "name", label: "Name", defaultValue: "Rahul", maxLength: 16 },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: "#ffffff" },
        elements: [
          img("photo1", 30, 30, 460, 460),
          img("photo2", 510, 30, 460, 460),
          img("photo3", 30, 510, 460, 460),
          img("photo4", 510, 510, 460, 460),
          shape("circle", 330, 330, 340, 340, { color: C.ivory }),
          shape("circle", 345, 345, 310, 310, {
            color: "transparent",
            outline: C.gold,
          }),
          text("headline", 360, 420, 280, 46, {
            font: "script",
            color: C.brown,
            align: "center",
          }),
          text("name", 360, 520, 280, 36, {
            font: "display",
            weight: 700,
            color: C.ink,
            align: "center",
            uppercase: true,
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 999,
      isTrending: true,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-07-10",
    },
    {
      id: "tpl-003",
      slug: "happy-birthday-classic",
      title: "Happy Birthday Classic",
      category: "birthday",
      occasion: "birthday",
      description:
        "A single portrait with a bold, classic birthday title and the date underneath.",
      tags: ["one photo", "portrait", "simple"],
      samplePhotos: [S.smile],
      photosRequired: 1,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Happy Birthday",
          maxLength: 22,
          required: true,
        },
        { id: "name", label: "Name", defaultValue: "Meera", maxLength: 20 },
        { id: "date", label: "Date", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.ink },
        elements: [
          img("photo1", 60, 60, 680, 620, { shape: "rect" }),
          text("headline", 60, 720, 680, 74, {
            font: "serif",
            weight: 700,
            color: C.champagne,
            align: "center",
            italic: true,
          }),
          text("name", 60, 830, 680, 40, {
            font: "sans",
            weight: 600,
            color: "#ffffff",
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
          text("date", 60, 900, 680, 26, {
            font: "sans",
            color: C.gold,
            align: "center",
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 749,
      isTrending: false,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-06-12",
    },
    {
      id: "tpl-004",
      slug: "birthday-photo-strip",
      title: "Birthday Photo Strip",
      category: "birthday",
      occasion: "birthday",
      description:
        "Three photos stacked like a photo-booth strip, finished with your message.",
      tags: ["photo booth", "strip", "three photos", "party"],
      samplePhotos: [S.balloons, S.dadDaughter, S.smile],
      photosRequired: 3,
      textFields: [
        {
          id: "headline",
          label: "Message",
          defaultValue: "Best day ever",
          maxLength: 20,
          required: true,
        },
        { id: "date", label: "Date", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 600,
        height: 1200,
        background: { color: "#ffffff" },
        elements: [
          img("photo1", 50, 50, 500, 330),
          img("photo2", 50, 400, 500, 330),
          img("photo3", 50, 750, 500, 330),
          text("headline", 40, 1100, 520, 44, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
          text("date", 40, 1158, 520, 20, {
            font: "sans",
            color: "#7a6a58",
            align: "center",
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 699,
      isTrending: false,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-20",
    },
    {
      id: "tpl-005",
      slug: "happy-anniversary",
      title: "Happy Anniversary",
      category: "anniversary",
      occasion: "anniversary",
      description:
        "Then and now: two photos side by side with your anniversary and the years together.",
      tags: ["then and now", "two photos", "years together"],
      samplePhotos: [S.weddingCouple, S.duskCouple],
      photosRequired: 2,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Happy Anniversary",
          maxLength: 24,
          required: true,
        },
        {
          id: "years",
          label: "Years together",
          defaultValue: "10 Years Together",
          maxLength: 24,
        },
        {
          id: "names",
          label: "Names",
          defaultValue: "Arjun & Priya",
          maxLength: 28,
        },
      ],
      layout: {
        width: 1000,
        height: 800,
        background: { color: C.ivory, pattern: "hearts" },
        elements: [
          text("headline", 60, 50, 880, 62, {
            font: "serif",
            weight: 700,
            color: C.brown,
            align: "center",
            italic: true,
          }),
          img("photo1", 70, 160, 410, 450, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo2", 520, 160, 410, 450, {
            shape: "rounded",
            border: "#ffffff",
          }),
          shape("heart", 470, 360, 60, 54, { color: C.rose }),
          text("years", 60, 640, 880, 34, {
            font: "sans",
            weight: 700,
            color: C.ink,
            align: "center",
            uppercase: true,
            spacing: 5,
          }),
          text("names", 60, 700, 880, 46, {
            font: "script",
            color: C.rose,
            align: "center",
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 949,
      isTrending: true,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-07-18",
    },
    {
      id: "tpl-006",
      slug: "our-love-story",
      title: "Our Love Story",
      category: "love",
      occasion: "anniversary",
      description:
        "Your favourite photo of the two of you in a heart, with your names and the day it all began.",
      tags: ["heart", "romantic", "couple", "valentine"],
      samplePhotos: [S.duskCouple],
      photosRequired: 1,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Our Love Story",
          maxLength: 22,
          required: true,
        },
        {
          id: "names",
          label: "Names",
          defaultValue: "Kabir & Ira",
          maxLength: 28,
          required: true,
        },
        { id: "date", label: "Since", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.blush, pattern: "hearts" },
        elements: [
          text("headline", 60, 70, 680, 70, {
            font: "script",
            color: C.rose,
            align: "center",
          }),
          img("photo1", 130, 190, 540, 500, { shape: "heart" }),
          text("names", 60, 740, 680, 52, {
            font: "serif",
            weight: 700,
            color: C.ink,
            align: "center",
          }),
          shape("line", 330, 820, 140, 3, { color: C.rose }),
          text("date", 60, 850, 680, 26, {
            font: "sans",
            color: C.brown,
            align: "center",
            uppercase: true,
            spacing: 4,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 799,
      isTrending: true,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-06-28",
    },
    {
      id: "tpl-007",
      slug: "forever-together",
      title: "Forever Together",
      category: "couple",
      occasion: "anniversary",
      description:
        "Two arched portraits side by side, a quiet script title and a date to remember.",
      tags: ["arch", "two photos", "elegant", "minimal"],
      samplePhotos: [S.weddingCouple, S.duskCouple],
      photosRequired: 2,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Forever Together",
          maxLength: 22,
          required: true,
        },
        { id: "date", label: "Date", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: C.sage },
        elements: [
          img("photo1", 110, 120, 360, 560, { shape: "arch" }),
          img("photo2", 530, 120, 360, 560, { shape: "arch" }),
          text("headline", 60, 740, 880, 84, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
          text("date", 60, 870, 880, 28, {
            font: "sans",
            color: "#4f4336",
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 899,
      isTrending: false,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-12",
    },
    {
      id: "tpl-008",
      slug: "wedding-memories",
      title: "Wedding Memories",
      category: "wedding",
      occasion: "wedding",
      description:
        "A large wedding portrait with two details beside it, your names and the wedding date.",
      tags: ["shaadi", "bride", "groom", "three photos"],
      samplePhotos: [S.weddingCouple, S.groom, S.duskCouple],
      photosRequired: 3,
      textFields: [
        {
          id: "names",
          label: "Names",
          defaultValue: "Rohan & Ananya",
          maxLength: 28,
          required: true,
        },
        { id: "date", label: "Wedding date", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 1000,
        height: 800,
        background: { color: "#ffffff" },
        elements: [
          img("photo1", 50, 50, 560, 700),
          img("photo2", 640, 50, 310, 250),
          img("photo3", 640, 320, 310, 250),
          label("Wedding Memories", 640, 600, 310, 26, {
            font: "sans",
            weight: 700,
            color: C.gold,
            align: "center",
            uppercase: true,
            spacing: 4,
          }),
          text("names", 630, 640, 330, 40, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
          text("date", 640, 712, 310, 20, {
            font: "sans",
            color: "#7a6a58",
            align: "center",
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 1099,
      isTrending: false,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-06-05",
    },
    {
      id: "tpl-009",
      slug: "family-moments",
      title: "Family Moments",
      category: "family",
      occasion: "just-because",
      description:
        "Six family photos in a gallery-style collage with your family name across the middle.",
      tags: ["collage", "six photos", "home", "gallery wall"],
      samplePhotos: [
        S.bigFamily,
        S.dadDaughter,
        S.momDaughter,
        S.newborn,
        S.smile,
        S.balloons,
      ],
      photosRequired: 6,
      textFields: [
        {
          id: "headline",
          label: "Family name",
          defaultValue: "The Sharma Family",
          maxLength: 26,
          required: true,
        },
        {
          id: "tagline",
          label: "Line underneath",
          defaultValue: "Our favourite moments",
          maxLength: 32,
        },
      ],
      layout: {
        width: 1000,
        height: 800,
        background: { color: C.cream },
        elements: [
          img("photo1", 40, 40, 300, 260),
          img("photo2", 350, 40, 300, 260),
          img("photo3", 660, 40, 300, 260),
          shape("rect", 40, 320, 920, 160, { color: "#ffffff" }),
          text("headline", 60, 345, 880, 58, {
            font: "serif",
            weight: 700,
            color: C.ink,
            align: "center",
          }),
          text("tagline", 60, 425, 880, 26, {
            font: "sans",
            color: C.brown,
            align: "center",
            uppercase: true,
            spacing: 4,
          }),
          img("photo4", 40, 500, 300, 260),
          img("photo5", 350, 500, 300, 260),
          img("photo6", 660, 500, 300, 260),
        ],
      },
      sizes: ALL_SIZES,
      price: 1199,
      isTrending: true,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-07-22",
    },
    {
      id: "tpl-010",
      slug: "best-friends",
      title: "Best Friends",
      category: "friends",
      occasion: "friendship",
      description:
        "Three tilted polaroids, like photos pinned to a board, with a note for your favourite people.",
      tags: ["polaroid", "friendship", "bff", "three photos"],
      samplePhotos: [S.smile, S.balloons, S.duskCouple],
      photosRequired: 3,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Best Friends",
          maxLength: 20,
          required: true,
        },
        {
          id: "note",
          label: "Note",
          defaultValue: "Forever and always",
          maxLength: 30,
        },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: C.sky, pattern: "dots" },
        elements: [
          text("headline", 60, 60, 880, 96, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
          img("photo1", 70, 260, 300, 340, { frame: "polaroid", rotate: -7 }),
          img("photo2", 350, 230, 300, 340, { frame: "polaroid", rotate: 3 }),
          img("photo3", 630, 270, 300, 340, { frame: "polaroid", rotate: 8 }),
          text("note", 60, 790, 880, 40, {
            font: "sans",
            weight: 700,
            color: C.night,
            align: "center",
            uppercase: true,
            spacing: 5,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 849,
      isTrending: true,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-08-03",
    },
    {
      id: "tpl-011",
      slug: "best-mom-ever",
      title: "Best Mom Ever",
      category: "mother",
      occasion: "mothers-day",
      description:
        "A round portrait framed by soft colour, a big thank-you title and your own message to Mum.",
      tags: ["mother's day", "mum", "maa", "one photo"],
      samplePhotos: [S.momDaughter],
      photosRequired: 1,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Best Mom Ever",
          maxLength: 20,
          required: true,
        },
        {
          id: "message",
          label: "Your message",
          defaultValue: "Thank you for everything",
          maxLength: 40,
        },
        {
          id: "from",
          label: "From",
          defaultValue: "Love, Riya",
          maxLength: 24,
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.blush },
        elements: [
          shape("circle", 140, 80, 520, 520, { color: "#ffffff" }),
          img("photo1", 165, 105, 470, 470, { shape: "circle" }),
          text("headline", 40, 640, 720, 80, {
            font: "serif",
            weight: 700,
            color: C.rose,
            align: "center",
            italic: true,
          }),
          text("message", 60, 755, 680, 32, {
            font: "sans",
            color: C.ink,
            align: "center",
          }),
          text("from", 60, 830, 680, 46, {
            font: "script",
            color: C.brown,
            align: "center",
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 749,
      isTrending: false,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-05-01",
    },
    {
      id: "tpl-012",
      slug: "best-dad-ever",
      studio: { background: false },
      title: "Best Dad Ever",
      category: "father",
      occasion: "fathers-day",
      description:
        "A strong, modern design in deep navy: one photo, a bold title and a line just for Dad.",
      tags: ["father's day", "papa", "dad", "one photo"],
      samplePhotos: [S.dadDaughter],
      photosRequired: 1,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "BEST DAD EVER",
          maxLength: 18,
          required: true,
        },
        {
          id: "message",
          label: "Line underneath",
          defaultValue: "My first hero",
          maxLength: 30,
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.night },
        elements: [
          img("photo1", 60, 60, 680, 640, { border: C.gold }),
          text("headline", 40, 740, 720, 76, {
            font: "display",
            weight: 700,
            color: "#ffffff",
            align: "center",
            uppercase: true,
            spacing: 3,
          }),
          shape("line", 330, 845, 140, 4, { color: C.gold }),
          text("message", 60, 880, 680, 36, {
            font: "serif",
            color: C.champagne,
            align: "center",
            italic: true,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 749,
      isTrending: false,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-06-01",
    },
    {
      id: "tpl-013",
      slug: "baby-memories",
      title: "Baby Memories",
      category: "baby",
      occasion: "new-baby",
      description:
        "Four photos of your little one with their name, birth date and a gentle starry background.",
      tags: ["newborn", "baby", "four photos", "nursery"],
      samplePhotos: [S.newborn, S.dadDaughter, S.momDaughter, S.balloons],
      photosRequired: 4,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Our Little One",
          maxLength: 22,
          required: true,
        },
        {
          id: "name",
          label: "Baby's name",
          defaultValue: "Vihaan",
          maxLength: 18,
        },
        { id: "date", label: "Born on", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: C.sky, pattern: "stars" },
        elements: [
          text("headline", 60, 50, 880, 76, {
            font: "script",
            color: C.night,
            align: "center",
          }),
          img("photo1", 90, 170, 400, 330, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo2", 510, 170, 400, 330, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo3", 90, 520, 400, 330, {
            shape: "rounded",
            border: "#ffffff",
          }),
          img("photo4", 510, 520, 400, 330, {
            shape: "rounded",
            border: "#ffffff",
          }),
          text("name", 60, 870, 880, 48, {
            font: "display",
            weight: 700,
            color: C.night,
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
          text("date", 60, 938, 880, 22, {
            font: "sans",
            color: "#4f5b6b",
            align: "center",
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 999,
      isTrending: false,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-02",
    },
    {
      id: "tpl-014",
      slug: "first-birthday",
      title: "First Birthday",
      category: "kids",
      occasion: "birthday",
      description:
        "A big golden “1”, a round photo and their name, for a first birthday worth keeping.",
      tags: ["1st birthday", "baby", "kids", "one photo"],
      samplePhotos: [S.dadDaughter],
      photosRequired: 1,
      textFields: [
        {
          id: "name",
          label: "Name",
          defaultValue: "Myra",
          maxLength: 16,
          required: true,
        },
        {
          id: "headline",
          label: "Message",
          defaultValue: "is one!",
          maxLength: 16,
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: C.cream, pattern: "confetti" },
        elements: [
          label("1", 60, 40, 680, 300, {
            font: "serif",
            weight: 700,
            color: C.gold,
            align: "center",
          }),
          img("photo1", 180, 360, 440, 440, {
            shape: "circle",
            border: "#ffffff",
          }),
          text("name", 60, 830, 680, 66, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
          text("headline", 60, 915, 680, 30, {
            font: "sans",
            weight: 700,
            color: C.brown,
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 799,
      isTrending: true,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-25",
    },
    {
      id: "tpl-015",
      slug: "travel-memories",
      studio: { background: false },
      title: "Travel Memories",
      category: "travel",
      occasion: "just-because",
      description:
        "Four trip photos in a film-strip row, with the place and year in clean travel-poster type.",
      tags: ["trip", "holiday", "film strip", "four photos"],
      samplePhotos: [S.duskCouple, S.smile, S.balloons, S.bigFamily],
      photosRequired: 4,
      textFields: [
        {
          id: "place",
          label: "Place",
          defaultValue: "GOA",
          maxLength: 18,
          required: true,
        },
        {
          id: "year",
          label: "Year or dates",
          defaultValue: "Summer 2026",
          maxLength: 20,
        },
      ],
      layout: {
        width: 1000,
        height: 800,
        background: { color: C.ink },
        elements: [
          text("place", 60, 60, 880, 120, {
            font: "display",
            weight: 700,
            color: "#ffffff",
            align: "center",
            uppercase: true,
            spacing: 14,
          }),
          text("year", 60, 200, 880, 30, {
            font: "sans",
            color: C.champagne,
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
          shape("rect", 0, 300, 1000, 330, { color: "#000000" }),
          img("photo1", 30, 330, 225, 270),
          img("photo2", 270, 330, 225, 270),
          img("photo3", 510, 330, 225, 270),
          img("photo4", 750, 330, 220, 270),
          label("TRAVEL MEMORIES", 60, 690, 880, 22, {
            font: "sans",
            weight: 700,
            color: C.gold,
            align: "center",
            spacing: 8,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 999,
      isTrending: false,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-08-10",
    },
    {
      id: "tpl-016",
      slug: "graduation",
      title: "Graduation",
      category: "graduation",
      occasion: "graduation",
      description:
        "A proud portrait with “Class of” year, the graduate's name and their degree or school.",
      tags: ["class of", "convocation", "college", "one photo"],
      samplePhotos: [S.smile],
      photosRequired: 1,
      textFields: [
        {
          id: "classOf",
          label: "Class of",
          defaultValue: "Class of 2026",
          maxLength: 18,
          required: true,
        },
        {
          id: "name",
          label: "Graduate's name",
          defaultValue: "Sneha Patel",
          maxLength: 26,
          required: true,
        },
        {
          id: "degree",
          label: "Degree or school",
          defaultValue: "B.Sc. Computer Science",
          maxLength: 36,
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: "#ffffff" },
        elements: [
          shape("rect", 0, 0, 800, 120, { color: C.night }),
          text("classOf", 40, 30, 720, 52, {
            font: "display",
            weight: 700,
            color: C.champagne,
            align: "center",
            uppercase: true,
            spacing: 4,
          }),
          img("photo1", 100, 170, 600, 560, { border: C.gold }),
          text("name", 40, 770, 720, 60, {
            font: "serif",
            weight: 700,
            color: C.ink,
            align: "center",
          }),
          text("degree", 40, 860, 720, 28, {
            font: "sans",
            color: "#4f4336",
            align: "center",
            uppercase: true,
            spacing: 3,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 799,
      isTrending: false,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-05-20",
    },
    {
      id: "tpl-017",
      slug: "congratulations",
      title: "Congratulations",
      category: "achievement",
      occasion: "just-because",
      description:
        "Celebrate a win: a wide photo, a big golden congratulations and what they achieved.",
      tags: ["achievement", "promotion", "award", "proud"],
      samplePhotos: [S.balloons],
      photosRequired: 1,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Congratulations",
          maxLength: 20,
          required: true,
        },
        { id: "name", label: "Name", defaultValue: "Aditya", maxLength: 20 },
        {
          id: "achievement",
          label: "What they achieved",
          defaultValue: "On your new job",
          maxLength: 34,
        },
      ],
      layout: {
        width: 1000,
        height: 800,
        background: { color: C.ivory, pattern: "stars" },
        elements: [
          img("photo1", 50, 50, 520, 700, { shape: "rounded" }),
          text("headline", 600, 220, 360, 64, {
            font: "script",
            color: C.gold,
            align: "left",
          }),
          text("name", 600, 330, 360, 54, {
            font: "display",
            weight: 700,
            color: C.ink,
            align: "left",
            uppercase: true,
            spacing: 2,
          }),
          shape("line", 600, 420, 120, 4, { color: C.gold }),
          text("achievement", 600, 450, 360, 30, {
            font: "sans",
            color: "#4f4336",
            align: "left",
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 849,
      isTrending: false,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-06-18",
    },
    {
      id: "tpl-018",
      slug: "pet-memories",
      title: "Pet Memories",
      category: "pets",
      occasion: "just-because",
      description:
        "A round portrait of your pet with their name in big friendly letters and a little line about them.",
      tags: ["dog", "cat", "pet", "one photo"],
      samplePhotos: [],
      photosRequired: 1,
      textFields: [
        {
          id: "name",
          label: "Pet's name",
          defaultValue: "BRUNO",
          maxLength: 14,
          required: true,
        },
        {
          id: "line",
          label: "About them",
          defaultValue: "Good boy since 2020",
          maxLength: 30,
        },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: C.champagne, pattern: "dots" },
        elements: [
          shape("circle", 230, 90, 540, 540, { color: "#ffffff" }),
          img("photo1", 255, 115, 490, 490, { shape: "circle" }),
          text("name", 60, 680, 880, 110, {
            font: "display",
            weight: 700,
            color: C.brown,
            align: "center",
            uppercase: true,
            spacing: 6,
          }),
          text("line", 60, 830, 880, 40, {
            font: "script",
            color: C.ink,
            align: "center",
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 749,
      isTrending: false,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-15",
    },
    {
      id: "tpl-019",
      slug: "our-memories",
      title: "Our Memories",
      category: "memories",
      occasion: "just-because",
      description:
        "Six favourite photos in a tidy grid with a short title, for any group of moments.",
      tags: ["collage", "grid", "six photos", "minimal"],
      samplePhotos: [
        S.bigFamily,
        S.duskCouple,
        S.balloons,
        S.momDaughter,
        S.dadDaughter,
        S.smile,
      ],
      photosRequired: 6,
      textFields: [
        {
          id: "headline",
          label: "Title",
          defaultValue: "Our Memories",
          maxLength: 22,
          required: true,
        },
      ],
      layout: {
        width: 1000,
        height: 1000,
        background: { color: "#ffffff" },
        elements: [
          img("photo1", 40, 40, 300, 360),
          img("photo2", 350, 40, 300, 360),
          img("photo3", 660, 40, 300, 360),
          img("photo4", 40, 410, 300, 360),
          img("photo5", 350, 410, 300, 360),
          img("photo6", 660, 410, 300, 360),
          text("headline", 40, 830, 920, 76, {
            font: "serif",
            color: C.ink,
            align: "center",
            italic: true,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 1099,
      isTrending: false,
      isPopular: true,
      isNew: false,
      available: true,
      createdAt: "2026-07-05",
    },
    {
      id: "tpl-020",
      slug: "minimal-memories",
      studio: { supportedMatOptions: ["none", "single"], textStyle: false },
      title: "Minimal Memories",
      category: "memories",
      occasion: "just-because",
      description:
        "One photo, lots of white space and a single line of quiet type. Lets the moment speak.",
      tags: ["minimal", "one photo", "simple", "modern"],
      samplePhotos: [S.bigFamily],
      photosRequired: 1,
      textFields: [
        {
          id: "caption",
          label: "Caption",
          defaultValue: "a moment worth keeping",
          maxLength: 36,
          required: true,
        },
        { id: "date", label: "Date", type: "date", defaultValue: "" },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: "#ffffff" },
        elements: [
          img("photo1", 120, 120, 560, 640),
          text("caption", 60, 810, 680, 30, {
            font: "sans",
            color: C.ink,
            align: "center",
            spacing: 3,
          }),
          text("date", 60, 860, 680, 20, {
            font: "sans",
            color: "#7a6a58",
            align: "center",
            uppercase: true,
            spacing: 5,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 699,
      isTrending: false,
      isPopular: false,
      isNew: false,
      available: true,
      createdAt: "2026-05-28",
    },
    {
      id: "tpl-021",
      slug: "festival-of-lights",
      studio: {
        supportedFrameTypes: ["classic", "premium", "wood", "gallery"],
      },
      title: "Festival of Lights",
      category: "festival",
      occasion: "festival",
      description:
        "Two festive photos on a deep, warm background with golden lettering and your family's wishes.",
      tags: ["diwali", "deepavali", "festival", "two photos"],
      samplePhotos: [S.bigFamily, S.momDaughter],
      photosRequired: 2,
      textFields: [
        {
          id: "headline",
          label: "Greeting",
          defaultValue: "Happy Diwali",
          maxLength: 22,
          required: true,
        },
        {
          id: "from",
          label: "From",
          defaultValue: "With love, the Iyers",
          maxLength: 30,
        },
      ],
      layout: {
        width: 800,
        height: 1000,
        background: { color: "#3a1d14", pattern: "stars" },
        elements: [
          text("headline", 40, 60, 720, 84, {
            font: "script",
            color: "#f0c869",
            align: "center",
          }),
          img("photo1", 80, 200, 640, 330, { border: "#f0c869" }),
          img("photo2", 80, 560, 640, 260, { border: "#f0c869" }),
          text("from", 40, 870, 720, 34, {
            font: "serif",
            color: C.champagne,
            align: "center",
            italic: true,
          }),
        ],
      },
      sizes: ALL_SIZES,
      price: 899,
      isTrending: true,
      isPopular: false,
      isNew: true,
      available: true,
      createdAt: "2026-09-28",
    },
  ];

  /* ---------------------------------------------------------------- Do not edit below
     Fills in the fields the site derives from the layout and checks for
     common mistakes (reported in the browser console as [templates.js]). */
  const warn = (m) => console.warn("[templates.js] " + m);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const categoryIds = new Set(TEMPLATE_CATEGORIES.map((c) => c.id));
  const seen = new Set();

  const templates = TEMPLATES.map((t) => {
    if (seen.has(t.id) || seen.has(t.slug))
      warn(`Duplicate id or slug "${t.id}" / "${t.slug}".`);
    seen.add(t.id);
    seen.add(t.slug);
    if (!categoryIds.has(t.category))
      warn(`Template "${t.id}" uses unknown category "${t.category}".`);
    const slots = ((t.layout && t.layout.elements) || []).filter(
      (e) => e.type === "image",
    ).length;
    if (slots !== t.photosRequired)
      warn(
        `Template "${t.id}" has ${slots} photo slots but photosRequired is ${t.photosRequired}.`,
      );
    const { width = 1, height = 1 } = t.layout || {};
    const d = gcd(width, height);
    return Object.assign(
      {
        orientation:
          width === height
            ? "square"
            : width > height
              ? "landscape"
              : "portrait",
        aspectRatio: `${width / d}:${height / d}`,
        thumbnail: null,
        previewImage: null,
        samplePhotos: [],
        tags: [],
        available: true,
      },
      t,
    );
  });

  FrameX.seed = FrameX.seed || {};
  FrameX.seed.templates = templates;
  FrameX.seed.templateCategories = TEMPLATE_CATEGORIES;
  FrameX.seed.templateOccasions = OCCASIONS;
  FrameX.seed.templateSizes = TEMPLATE_SIZES;
})((window.FrameX = window.FrameX || {}));
