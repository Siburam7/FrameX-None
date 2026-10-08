/* ==========================================================================
   FrameX — decor.js
   The Home Decor & Wall Art catalogue: collections (sub-categories), every
   wall-art product and the multi-panel sets. Edit → save → refresh.

   CONTENTS
     1. COLLECTIONS   — the 20 sub-categories of Home Decor
     2. OPTIONS       — sizes, frame colours, print finishes, shared details
     3. DESIGNS       — ADD NEW WALL ART HERE (one line per product)
     4. SHOWCASE      — what the Home Decor page features
     5. (do not edit) — turns each design into a full product

   HOW A DESIGN BECOMES A PRODUCT
     Each design is one short entry. Section 5 expands it into the same product
     shape as js/edit.js (sizes with prices, frame colours, print finishes,
     photos, specifications), so the product page, cart and checkout treat wall
     art exactly like every other FrameX product. The backend reads this same
     file, so prices can only be changed here, never from a browser.

   PICTURES
     The product photos in assets/img/decor/ are drawn from the `art` recipe
     of each design by the tool in tools/decor/ (see its README). After adding
     or changing a design, run:   cd tools/decor && npm run build
     Artwork is original to FrameX, except the paintings marked with `credit`,
     which are public-domain works released CC0 by the museum named there.

   NOT REAL YET: prices, discounts, stock and material details are placeholders
   until the shop confirms them. No ratings or reviews are invented: a product
   shows stars only once real reviews exist (rating: { average, count }).
   ========================================================================== */
(function (FrameX) {
  const SHOP_ID = "shop-001"; // the shop that makes and sells the wall art
  const MAIN = "home-decor"; // main category id
  const IMG = "assets/img/decor/";

  /* ========================================================================
     1. COLLECTIONS
     ------------------------------------------------------------------------
     id     short lowercase name. The category id is "hd-" + id.
     name   what visitors see
     blurb  one line shown on the collection card
     look   defaults for the product photos of this collection:
            wall (linen warm sage clay blush mist charcoal navy forest plum),
            frame (black white natural-wood walnut gold), room (sofa console bed desk)
     ======================================================================== */
  const collections = [
    { id: "motivational", name: "Motivational", blurb: "Bold words for desks, gyms and study walls.", look: { wall: "linen", frame: "black", room: "console" } },
    { id: "quotes", name: "Quotes", blurb: "Gentle lines worth reading every day.", look: { wall: "warm", frame: "natural-wood", room: "sofa" } },
    { id: "funny", name: "Funny / Comedy", blurb: "Honest signs for honest homes.", look: { wall: "linen", frame: "black", room: "console" } },
    { id: "emotional", name: "Emotional", blurb: "Soft reminders and words from the heart.", look: { wall: "blush", frame: "white", room: "bed" } },
    { id: "gaming", name: "Gaming", blurb: "Pixels, neon and controller art for the setup.", look: { wall: "charcoal", frame: "black", room: "desk" } },
    { id: "anime", name: "Anime", blurb: "Anime-inspired skies and Japanese print classics.", look: { wall: "linen", frame: "black", room: "desk" } },
    { id: "movies", name: "Movies & Films", blurb: "Cinema posters for movie-night corners.", look: { wall: "linen", frame: "black", room: "sofa" } },
    { id: "cars", name: "Cars & Bikes", blurb: "Silhouettes, blueprints and sunset drives.", look: { wall: "linen", frame: "black", room: "console" } },
    { id: "nature", name: "Nature", blurb: "Mountains, forests, sea and garden paintings.", look: { wall: "linen", frame: "natural-wood", room: "sofa" } },
    { id: "travel", name: "Travel", blurb: "Destination posters and wanderlust prints.", look: { wall: "linen", frame: "natural-wood", room: "sofa" } },
    { id: "sports", name: "Sports", blurb: "Courts, pitches and game-day lettering.", look: { wall: "linen", frame: "black", room: "console" } },
    { id: "music", name: "Music", blurb: "Vinyl, keys and sound waves.", look: { wall: "linen", frame: "black", room: "console" } },
    { id: "minimalist", name: "Minimalist", blurb: "Quiet lines and plenty of white space.", look: { wall: "linen", frame: "black", room: "sofa" } },
    { id: "abstract", name: "Abstract Art", blurb: "Shapes, strokes and warm earthy colour.", look: { wall: "linen", frame: "natural-wood", room: "sofa" } },
    { id: "couple", name: "Couple / Love", blurb: "For anniversaries, weddings and the two of you.", look: { wall: "linen", frame: "black", room: "bed" } },
    { id: "kids", name: "Kids", blurb: "Friendly animals and soft colours for little rooms.", look: { wall: "linen", frame: "white", room: "bed" } },
    { id: "luxury", name: "Luxury / Premium", blurb: "Marble, gold line work and museum masterpieces.", look: { wall: "charcoal", frame: "gold", room: "sofa" } },
    { id: "modern", name: "Modern Wall Art", blurb: "Mid-century geometry for today's living rooms.", look: { wall: "linen", frame: "black", room: "sofa" } },
    { id: "3d", name: "3D Wall Art", blurb: "Flat prints that look deep: cubes, tunnels, paper cuts.", look: { wall: "linen", frame: "black", room: "sofa" } },
    { id: "multi-panel", name: "Multi-Panel Frames", blurb: "One picture across 2, 3, 4 or 5 frames.", look: { wall: "linen", frame: "black", room: "sofa" } },
    // ADD NEW COLLECTION HERE
  ];

  /* ========================================================================
     2. OPTIONS
     ------------------------------------------------------------------------
     Sizes are in inches. `k` multiplies the design's price for that size
     (rounded to the nearest ₹10); the size with k = 1 is the listed price.
     ======================================================================== */
  const SIZES = {
    portrait: [
      { id: "s", label: "Small", w: 8, h: 10, k: 0.7 },
      { id: "m", label: "Medium", w: 12, h: 15, k: 1 },
      { id: "l", label: "Large", w: 16, h: 20, k: 1.5 },
      { id: "xl", label: "Extra Large", w: 24, h: 30, k: 2.3 },
    ],
    landscape: [
      { id: "s", label: "Small", w: 10, h: 8, k: 0.7 },
      { id: "m", label: "Medium", w: 15, h: 12, k: 1 },
      { id: "l", label: "Large", w: 20, h: 16, k: 1.5 },
      { id: "xl", label: "Extra Large", w: 30, h: 24, k: 2.3 },
    ],
    square: [
      { id: "s", label: "Small", w: 8, h: 8, k: 0.7 },
      { id: "m", label: "Medium", w: 12, h: 12, k: 1 },
      { id: "l", label: "Large", w: 16, h: 16, k: 1.5 },
      { id: "xl", label: "Extra Large", w: 24, h: 24, k: 2.3 },
    ],
    // Multi-panel sets: the size of ONE panel (the tallest one in a stepped set).
    panel: [
      { id: "s", label: "Small set", w: 8, h: 12, k: 0.75 },
      { id: "m", label: "Medium set", w: 12, h: 18, k: 1 },
      { id: "l", label: "Large set", w: 16, h: 24, k: 1.5 },
    ],
  };
  const PANEL_GAP_IN = 2; // suggested space between panels on the wall, used for the overall width

  // Frame colour ids come from js/edit.js (FRAME COLOURS). Gold is offered on premium pieces.
  const FRAME_COLORS = ["black", "white", "natural-wood", "walnut"];
  const PRINT_FINISHES = [
    { id: "matte", type: "matte-paper", name: "Matte", finish: "Matte", description: "Soft, glare-free surface.", priceModifier: 0 },
    { id: "glossy", type: "glossy-paper", name: "Glossy", finish: "Glossy", description: "Deeper blacks and brighter colour.", priceModifier: 0 },
  ];
  const BACK = { backing: "MDF backing board", hanging: "Wall hook fitted on the back", stand: false };
  const CARE = "Wipe with a dry cloth. Keep away from direct sunlight and damp walls.";

  /* The custom-photo customiser (wall-art-studio.html): the choices a customer
     may make. The backend checks an order against these same lists. */
  const CUSTOM = {
    layouts: [
      { id: "side", name: "Side by side", note: "A wide set, panels next to each other" },
      { id: "stacked", name: "Stacked", note: "A tall set, panels one above the other" },
    ],
    spacing: [
      { id: "close", name: "Close", gap: 0.02 },
      { id: "standard", name: "Standard", gap: 0.04 },
      { id: "wide", name: "Wide", gap: 0.07 },
    ],
    // width = the frame's width as a share of one panel's short side
    border: [
      { id: "thin", name: "Thin", width: 0.035 },
      { id: "medium", name: "Medium", width: 0.06 },
      { id: "thick", name: "Thick", width: 0.095 },
    ],
    zoom: { min: 1, max: 3 },
    thumbnailBytes: 48000, // largest preview picture kept with a cart line
  };

  /* ========================================================================
     3. DESIGNS  — ADD NEW WALL ART HERE
     ------------------------------------------------------------------------
     id      unique, lowercase-with-dashes; never change it once in use.
             The product id is "hd-" + id and its photos are hd-<id>*.webp
     name    product name
     in      collection id from section 1
     also    more collection ids it should also appear in (optional)
     price   rupees for the Medium size (placeholder)
     off     discount percent (optional, placeholder)
     about   one sentence for the product page
     art     the recipe the picture is drawn from (tools/decor/art/*.mjs)
     format  "portrait" (default), "landscape" or "square"
     panels  2 to 5 for a multi-panel set; `stagger: true` = stepped heights
     wall / frame / room / mat   product-photo look (defaults come from the collection)
     credit  only for public-domain paintings: artist, title, date and museum
     custom  true = the customer uploads their own photo (wall-art-studio.html)
     ======================================================================== */
  const designs = [
    // ---------------- Motivational ----------------
    { id: "never-give-up", name: "Never Give Up", in: "motivational", price: 449, off: 10, about: "Three heavy words in black and amber for the wall you face every morning.", art: { t: "stack", lines: ["NEVER", "*GIVE", "UP"], pal: "noir", sub: "keep going" } },
    { id: "dream-big", name: "Dream Big", in: "motivational", price: 449, about: "A bright mustard poster with a fine border and a short, loud message.", art: { t: "stack", lines: ["DREAM", "*BIG"], pal: "mustard", font: "bebas", top: "No. 01", frame: true, align: "center" }, wall: "charcoal", frame: "natural-wood" },
    { id: "hardest-climb", name: "The Hardest Climb", in: "motivational", also: ["quotes"], price: 499, off: 15, about: "An elegant serif reminder that the best view is earned.", art: { t: "serif", lines: ["The best view", "comes after", "*the hardest climb"], pal: "ivory", by: "notes to self" }, wall: "sage", frame: "natural-wood", mat: true },
    { id: "make-it-happen", name: "Make It Happen", in: "motivational", price: 449, about: "Navy and gold lettering that reads like a starting whistle.", art: { t: "stack", lines: ["MAKE IT", "*HAPPEN"], pal: "navy", font: "bebas", sub: "today" }, wall: "warm" },
    { id: "discipline-defined", name: "Discipline, Defined", in: "motivational", price: 479, about: "A dictionary-style print for anyone building a habit.", art: { t: "dict", word: "discipline", say: "/ˈdɪs·ə·plɪn/", defs: ["choosing what you want most over what you want now", "the bridge between a goal and a result"], see: "habit, patience", pal: "paper" }, wall: "clay" },
    { id: "daily-reminders", name: "Daily Reminders", in: "motivational", price: 479, off: 10, about: "A six-line checklist for the days that need one.", art: { t: "list", title: "DAILY REMINDERS", items: ["Show up", "Work hard", "Stay humble", "Be kind", "Rest well", "Repeat"], style: "check", done: [0, 1, 2], sub: "you've got this", pal: "ink" }, wall: "warm", frame: "natural-wood" },
    { id: "focus", name: "Focus", in: "motivational", also: ["minimalist"], price: 429, about: "One word, wide letter-spacing and nothing else to look at.", art: { t: "word", word: "FOCUS", sub: "one thing at a time", pal: "noir" } },
    { id: "rise-and-grind", name: "Rise & Grind", in: "motivational", price: 499, about: "A seventies sunburst with chunky shadowed letters.", art: { t: "retro", lines: ["RISE", "AND", "GRIND"], pal: "terracotta" }, frame: "walnut" },
    { id: "start-where-you-are", name: "Start Where You Are", in: "motivational", price: 449, about: "Deep green and gold, for the first day of anything.", art: { t: "stack", lines: ["START", "WHERE", "*YOU ARE"], pal: "forest", font: "bebas", sub: "use what you have" }, frame: "natural-wood" },
    { id: "small-steps", name: "Small Steps, Every Day", in: "motivational", price: 449, about: "Typewriter lines with one highlighted promise.", art: { t: "mono", lines: ["small steps.", "every day.", "[big results.]"], top: "// note to self", pal: "paper" }, wall: "navy" },

    // ---------------- Quotes ----------------
    { id: "this-too-shall-pass", name: "This Too Shall Pass", in: "quotes", also: ["emotional"], price: 479, about: "The old proverb set in soft blush and rose.", art: { t: "serif", lines: ["This too", "*shall pass"], pal: "blush", by: "old proverb" }, wall: "blush", frame: "white" },
    { id: "home-heart", name: "Home Is Where the Heart Is", in: "quotes", price: 499, off: 10, about: "A hand-lettered welcome for the entrance wall.", art: { t: "script", word: "Home", top: ["there is no place", "quite like"], bottom: ["where the heart is"], pal: "sand" } },
    { id: "collect-moments", name: "Collect Moments", in: "quotes", also: ["travel"], price: 479, about: "Navy and gold serif lettering for the family photo wall.", art: { t: "serif", lines: ["Collect moments,", "*not things"], pal: "navy" }, frame: "walnut" },
    { id: "adventure-begins", name: "And So the Adventure Begins", in: "quotes", also: ["travel", "couple"], price: 499, about: "A flowing script print for new homes, new jobs and newlyweds.", art: { t: "script", word: "Adventure", font: "dance", top: ["and so the"], bottom: ["begins"], pal: "ocean" }, wall: "mist", frame: "white" },
    { id: "bloom", name: "Bloom Where You Are Planted", in: "quotes", price: 499, about: "A sage-green proverb with a wide paper mount.", art: { t: "serif", lines: ["Bloom where", "you are", "*planted"], pal: "sage" }, wall: "sage", mat: true },
    { id: "little-things", name: "Enjoy the Little Things", in: "quotes", price: 449, about: "Round, friendly display type on warm ivory.", art: { t: "stack", lines: ["Enjoy the", "*little", "things."], font: "abril", pal: "ivory", align: "center" }, frame: "black" },
    { id: "good-things-take-time", name: "Good Things Take Time", in: "quotes", also: ["motivational"], price: 449, about: "Outlined capitals with one solid word that carries the point.", art: { t: "stack", lines: ["GOOD THINGS", "*TAKE", "TIME"], font: "bebas", outline: true, pal: "paper" }, wall: "linen", frame: "black" },
    { id: "reason-to-smile", name: "Be the Reason Someone Smiles", in: "quotes", price: 479, off: 10, about: "A kind sentence in italic serif for a hallway or a classroom.", art: { t: "serif", lines: ["Be the reason", "someone", "*smiles today"], pal: "ivory" }, wall: "blush", frame: "white" },
    { id: "gratitude-defined", name: "Gratitude, Defined", in: "quotes", price: 479, about: "A dictionary entry worth reading over breakfast.", art: { t: "dict", word: "gratitude", say: "/ˈɡrat·ɪ·tjuːd/", defs: ["noticing what is already here", "the quickest way to feel rich"], see: "contentment", pal: "ivory" }, wall: "sage" },

    // ---------------- Funny / Comedy ----------------
    { id: "energy-saving-mode", name: "Energy Saving Mode", in: "funny", price: 449, off: 10, about: "For the sofa corner that understands you.", art: { t: "mono", lines: ["I'm not lazy.", "I'm on", "[energy saving]", "mode."], top: "// status", pal: "paper" }, wall: "navy" },
    { id: "home-wifi", name: "Home, Defined", in: "funny", price: 479, about: "The only definition of home that mentions the wifi.", art: { t: "dict", word: "home", say: "/hōm/", defs: ["the place where the wifi connects automatically", "where you can look a mess and enjoy it"], see: "sweatpants, snacks", pal: "ink" }, wall: "clay" },
    { id: "but-first-coffee", name: "But First, Coffee", in: "funny", price: 449, about: "A kitchen classic in warm coffee tones.", art: { t: "script", word: "Coffee", top: ["but first,"], bottom: ["then the world"], pal: "sand" }, wall: "warm", frame: "walnut" },
    { id: "not-arguing", name: "I'm Not Arguing", in: "funny", price: 449, about: "A calm explanation, framed.", art: { t: "mono", lines: ["I'm not arguing.", "I'm explaining", "why I'm [right]."], pal: "noir" } },
    { id: "professional-overthinker", name: "Professional Overthinker", in: "funny", price: 449, about: "A job title most of us already hold.", art: { t: "stack", lines: ["PROFESSIONAL", "*OVER", "THINKER"], pal: "mustard", sub: "since forever" } },
    { id: "bathroom-rules", name: "Bathroom Rules", in: "funny", price: 479, off: 15, about: "A polite checklist for the smallest room in the house.", art: { t: "list", title: "BATHROOM RULES", items: ["Wash", "Brush", "Floss", "Flush", "Hang the towel", "Repeat"], style: "check", done: [0, 1, 3], sub: "thank you kindly", pal: "ocean" }, wall: "mist", frame: "white" },
    { id: "shoes-off", name: "Shoes Off, Good Vibes On", in: "funny", price: 449, about: "A doorway sign in terracotta and cream.", art: { t: "stack", lines: ["SHOES OFF", "*GOOD VIBES ON"], font: "bebas", pal: "terracotta", sub: "welcome" }, frame: "natural-wood" },
    { id: "kitchen-defined", name: "Kitchen, Defined", in: "funny", price: 479, about: "Where the snacks live and every party ends up.", art: { t: "dict", word: "kitchen", say: "/ˈkɪtʃ·ɪn/", defs: ["the room where the snacks live", "where everyone ends up at a party"], see: "midnight, fridge light", pal: "sand" }, wall: "warm", frame: "natural-wood" },
    { id: "wifi-password", name: "Wifi Password", in: "funny", price: 429, about: "House rules for guests, in two lines.", art: { t: "mono", lines: ["wifi password:", "[ask nicely]"], top: "// guests", sub: "// and bring snacks", pal: "slate" } },
    { id: "monday-defined", name: "Monday, Defined", in: "funny", price: 479, about: "Proof, in print, that weekends are too short.", art: { t: "dict", word: "monday", say: "/ˈmʌn·deɪ/", defs: ["proof that weekends are too short", "best handled with coffee"], see: "snooze button", pal: "blush" } },

    // ---------------- Emotional ----------------
    { id: "you-are-enough", name: "You Are Enough", in: "emotional", price: 479, about: "Three words in blush and rose for a bedside wall.", art: { t: "serif", lines: ["You are", "*enough"], pal: "blush", fit: 0.74 } },
    { id: "breathe", name: "Breathe", in: "emotional", also: ["minimalist"], price: 449, off: 10, about: "A single quiet word with a wide paper mount.", art: { t: "word", word: "BREATHE", sub: "inhale · exhale", pal: "paper" }, wall: "mist", frame: "natural-wood", mat: true },
    { id: "okay-to-rest", name: "It's Okay to Rest", in: "emotional", price: 479, about: "A gentle sage-green reminder for busy people.", art: { t: "serif", lines: ["It's okay", "*to rest"], pal: "sage", by: "a gentle reminder", fit: 0.76 }, wall: "sage" },
    { id: "maa", name: "Maa", in: "emotional", price: 499, about: "For the first home any of us ever knew.", art: { t: "script", word: "Maa", font: "dance", top: ["the first home"], bottom: ["I ever knew"], pal: "rose", fit: 0.6 }, wall: "linen", frame: "walnut" },
    { id: "family", name: "Family", in: "emotional", price: 499, off: 10, about: "A script print made for the middle of a family photo wall.", art: { t: "script", word: "Family", top: ["where life begins"], bottom: ["& love never ends"], pal: "ivory" }, wall: "warm", frame: "natural-wood" },
    { id: "forever-in-our-hearts", name: "Forever in Our Hearts", in: "emotional", price: 479, about: "A quiet navy print in memory of someone loved.", art: { t: "serif", lines: ["Some hearts", "stay with us", "*forever"], pal: "navy" }, wall: "linen", frame: "black" },
    { id: "papa-first-hero", name: "Papa, My First Hero", in: "emotional", price: 499, about: "A warm tribute in navy and gold.", art: { t: "stack", lines: ["Papa", "*my first", "hero"], font: "abril", pal: "navy", align: "center" }, wall: "linen", frame: "walnut" },
    { id: "one-day-at-a-time", name: "One Day at a Time", in: "emotional", also: ["quotes"], price: 449, about: "Sand and rust lettering for slow, steady days.", art: { t: "stack", lines: ["ONE DAY", "*AT A TIME"], font: "bebas", pal: "sand" }, wall: "linen", frame: "natural-wood" },

    // ---------------- Gaming ----------------
    { id: "retro-grid", name: "Retro Grid", in: "gaming", price: 549, off: 15, about: "A neon sun, wire mountains and a grid that runs to the horizon.", art: { t: "synth", title: "RETRO", sub: "press start" } },
    { id: "pixel-invaders", name: "Pixel Invaders", in: "gaming", price: 499, about: "Rows of 8-bit visitors and one very small ship.", art: { t: "pixel", kind: "invaders" } },
    { id: "extra-life", name: "+1 Life", in: "gaming", also: ["couple"], price: 499, about: "A pixel heart for player two.", art: { t: "pixel", kind: "heart" }, wall: "navy" },
    { id: "level-up", name: "Level Up", in: "gaming", also: ["motivational"], price: 499, off: 10, about: "A gold star and a nearly full XP bar.", art: { t: "pixel", kind: "levelup" } },
    { id: "game-over", name: "Game Over", in: "gaming", price: 499, about: "Falling blocks and the two words nobody wants to read.", art: { t: "pixel", kind: "gameover" } },
    { id: "monday-quest", name: "A Wild Monday Appears", in: "gaming", also: ["funny"], price: 499, about: "A role-playing battle screen for the start of the week.", art: { t: "pixel", kind: "quest" }, wall: "plum" },
    { id: "player-one", name: "Player One Ready", in: "gaming", price: 499, about: "A pixel trophy for the top of the monitor wall.", art: { t: "pixel", kind: "trophy" } },
    { id: "game-on-neon", name: "Game On", in: "gaming", price: 549, off: 10, about: "A glowing controller outline in pink neon.", art: { t: "pad", style: "neon", title: "GAME ON" } },
    { id: "eat-sleep-game", name: "Eat Sleep Game Repeat", in: "gaming", price: 479, about: "The daily schedule, on mustard yellow.", art: { t: "pad", style: "flat", title: "EAT · SLEEP · GAME", sub: "repeat" }, wall: "linen" },
    { id: "controller-blueprint", name: "Controller Blueprint", in: "gaming", price: 529, about: "A patent-style drawing on blueprint blue.", art: { t: "pad", style: "blueprint", title: "CONTROLLER", sub: "design study" }, wall: "linen", frame: "natural-wood" },
    { id: "wasd", name: "WASD", in: "gaming", price: 499, about: "Four keycaps every PC player knows by touch.", art: { t: "keys" } },
    { id: "no-lag-zone", name: "No Lag Zone", in: "gaming", price: 499, about: "A slanted esports poster for the door of the gaming room.", art: { t: "hud", lines: ["NO", "*LAG", "ZONE"], top: "// GAMING ROOM", sub: "DO NOT DISTURB" } },

    // ---------------- Anime (anime-inspired scenery and Japanese print classics) ----------------
    { id: "fuji-sunrise", name: "Fuji Sunrise", in: "anime", also: ["nature"], price: 529, off: 10, about: "A snow-capped peak and a red sun in the flat colours of a woodblock print.", art: { t: "japan", kind: "fuji" } },
    { id: "torii-sunset", name: "Torii at Sunset", in: "anime", price: 549, about: "A vermilion gate standing in still evening water.", art: { t: "japan", kind: "torii" }, wall: "warm" },
    { id: "sakura-moon", name: "Sakura Moon", in: "anime", also: ["nature"], price: 529, about: "Cherry branches crossing a pale spring moon.", art: { t: "japan", kind: "sakura" }, frame: "natural-wood" },
    { id: "seigaiha-sun", name: "Seigaiha Sun", in: "anime", also: ["modern"], price: 499, about: "The classic wave pattern in indigo with a rising sun.", art: { t: "japan", kind: "waves" } },
    { id: "after-school-sky", name: "After-School Sky", in: "anime", price: 549, off: 15, about: "Tall summer clouds, power lines and a quiet rooftop.", art: { t: "japan", kind: "sky" }, frame: "white" },
    { id: "moonlit-wanderer", name: "Moonlit Wanderer", in: "anime", price: 579, off: 10, about: "A lone swordsman on a cliff under a huge moon.", art: { t: "japan", kind: "wanderer" }, wall: "charcoal" },
    { id: "pagoda-dusk", name: "Pagoda at Dusk", in: "anime", also: ["travel"], price: 529, about: "A five-storey pagoda against a peach evening sky.", art: { t: "japan", kind: "pagoda" } },
    { id: "neon-alley", name: "Neon Alley", in: "anime", also: ["gaming"], price: 549, about: "A rain-dark city street lit by vertical signs.", art: { t: "japan", kind: "alley" }, wall: "charcoal" },
    { id: "great-wave", name: "The Great Wave", in: "anime", also: ["luxury", "nature"], price: 799, off: 10, format: "landscape", about: "Hokusai's famous woodblock print, with a paper border like the original.", art: { t: "photo", src: "great-wave.jpg", border: 4, pos: "50% 50%" }, credit: "Katsushika Hokusai, Under the Wave off Kanagawa (1830/33). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "sudden-shower", name: "Sudden Shower over the Bridge", in: "anime", also: ["luxury"], price: 799, about: "Hiroshige's rain-swept bridge from One Hundred Famous Views of Edo.", art: { t: "photo", src: "sudden-shower.jpg", border: 4 }, credit: "Utagawa Hiroshige, Sudden Shower over Shin-Ohashi Bridge and Atake (1857). Public domain; image from The Metropolitan Museum of Art (CC0)." },
    { id: "shower-below-summit", name: "Shower Below the Summit", in: "anime", also: ["nature"], price: 799, format: "landscape", about: "Hokusai's dark Fuji with lightning at its foot.", art: { t: "photo", src: "shower-below-summit.jpg", border: 4 }, credit: "Katsushika Hokusai, Shower Below the Summit (c. 1830/33). Public domain; image from the Art Institute of Chicago (CC0)." },

    // ---------------- Movies & Films ----------------
    { id: "last-reel", name: "The Last Reel", in: "movies", price: 529, off: 10, about: "A projector beam over a dark row of seats.", art: { t: "cinema", kind: "projector" }, wall: "charcoal" },
    { id: "and-action", name: "And… Action", in: "movies", price: 499, about: "A clapperboard for the home-theatre wall.", art: { t: "cinema", kind: "clapper" } },
    { id: "movie-night-marquee", name: "Now Showing: Movie Night", in: "movies", price: 529, about: "A theatre marquee with every bulb lit.", art: { t: "cinema", kind: "marquee", pal: "crimson" } },
    { id: "film-strip", name: "24 Frames", in: "movies", price: 499, about: "A tilted strip of film in sunset colours.", art: { t: "cinema", kind: "strip", pal: "sunset" } },
    { id: "admit-one", name: "Admit One", in: "movies", price: 499, off: 15, about: "A golden ticket, good for one movie night.", art: { t: "cinema", kind: "ticket", pal: "navy" }, frame: "natural-wood" },
    { id: "roll-camera", name: "Roll Camera", in: "movies", price: 499, about: "A film reel unwinding across black.", art: { t: "cinema", kind: "reel", pal: "gold" }, wall: "warm" },
    { id: "popcorn-night", name: "Popcorn Night", in: "movies", also: ["funny"], price: 499, about: "A striped tub, overfilled, on midnight blue.", art: { t: "cinema", kind: "popcorn", pal: "navy" } },
    { id: "midnight-train", name: "Midnight Train", in: "movies", price: 529, about: "A film-noir poster for a picture that was never made.", art: { t: "cinema", kind: "noir" } },

    // ---------------- Cars & Bikes ----------------
    { id: "driven", name: "Driven", in: "cars", price: 599, off: 10, format: "landscape", about: "A sports coupé in silhouette against a striped sunset.", art: { t: "car", kind: "sports", style: "sunset", title: "DRIVEN" }, wall: "charcoal" },
    { id: "midnight-run", name: "Midnight Run", in: "cars", also: ["gaming"], price: 599, format: "landscape", about: "A low supercar drawn in a single line of neon.", art: { t: "car", kind: "super", style: "neon", title: "MIDNIGHT RUN" }, wall: "charcoal" },
    { id: "touge", name: "Touge", in: "cars", price: 579, format: "landscape", about: "A winged tuner car and three racing stripes.", art: { t: "car", kind: "jdm", style: "stripes", title: "TOUGE" } },
    { id: "the-classic", name: "The Classic", in: "cars", price: 579, format: "landscape", about: "A rounded sixties saloon in plain black on cream.", art: { t: "car", kind: "classic", style: "minimal", title: "CLASSIC" }, frame: "natural-wood" },
    { id: "muscle-blueprint", name: "Muscle Blueprint", in: "cars", price: 599, off: 15, format: "landscape", about: "A long-bonnet coupé as a draughtsman's side elevation.", art: { t: "car", kind: "muscle", style: "blueprint", title: "MUSCLE" } },
    { id: "lights-out", name: "Lights Out", in: "cars", also: ["sports"], price: 599, format: "landscape", about: "An open-wheel racer on racing red.", art: { t: "car", kind: "f1", style: "stripes", pal: "crimson", title: "LIGHTS OUT" } },
    { id: "ride-free", name: "Ride Free", in: "cars", price: 599, off: 10, format: "landscape", about: "A motorbike parked in front of a setting sun.", art: { t: "car", kind: "bike", style: "sunset", title: "RIDE FREE" } },
    { id: "two-wheels", name: "Two Wheels", in: "cars", also: ["minimalist"], price: 549, about: "A café-racer outline with plenty of breathing room.", art: { t: "car", kind: "bike", style: "minimal", title: "TWO WHEELS", y: 0.62 } },
    { id: "supercar-blueprint", name: "Supercar Blueprint", in: "cars", price: 599, format: "landscape", about: "A wedge-shaped supercar on blueprint blue.", art: { t: "car", kind: "super", style: "blueprint", title: "SUPERCAR" }, frame: "natural-wood" },
    { id: "garage-rules", name: "Garage Rules", in: "cars", also: ["funny"], price: 479, about: "Five rules for anyone borrowing a spanner.", art: { t: "list", title: "GARAGE RULES", items: ["Tools go back", "Music stays loud", "No rushing", "Clean hands optional", "Chai first"], pal: "slate", sub: "drive safe" }, wall: "charcoal" },

    // ---------------- Nature ----------------
    { id: "mountain-dawn", name: "Mountain Dawn", in: "nature", price: 549, off: 10, about: "Layered ridges and a still lake at first light.", art: { t: "mountains", sky: "dawn", lake: true }, frame: "black" },
    { id: "night-peaks", name: "Night Peaks", in: "nature", price: 579, format: "landscape", about: "Sharp summits, pine trees and a full moon.", art: { t: "mountains", sky: "night", style: "sharp", moon: true, pines: true, near: "#0a0f1e" }, wall: "warm", frame: "black" },
    { id: "dusk-sail", name: "Dusk Sail", in: "nature", price: 549, about: "One small boat on a purple evening sea.", art: { t: "waves", sky: "dusk", boat: true }, wall: "mist", frame: "white" },
    { id: "misty-forest", name: "Misty Forest", in: "nature", price: 549, off: 15, about: "Rows of pines fading into morning fog.", art: { t: "forest", sky: "mist" }, wall: "sage" },
    { id: "palm-sunset", name: "Palm Sunset", in: "nature", also: ["travel"], price: 549, about: "Palm silhouettes in front of a striped tropical sun.", art: { t: "palms", sky: "ember" }, frame: "black" },
    { id: "alpine-morning", name: "Alpine Morning", in: "nature", price: 549, about: "Blue ridges, pine trees and a clear high sky.", art: { t: "mountains", sky: "alpine", pines: true, birds: true }, frame: "white" },
    { id: "botanical-lines", name: "Botanical Lines", in: "nature", also: ["minimalist"], price: 499, about: "Three stems drawn in a single fine line.", art: { t: "botanical", style: "line" }, mat: true },
    { id: "olive-branches", name: "Olive Branches", in: "nature", price: 499, about: "Soft olive leaves on warm paper.", art: { t: "botanical", style: "fill" }, wall: "sage", frame: "white" },
    { id: "water-lily-pond", name: "Water Lily Pond", in: "nature", also: ["luxury"], price: 849, off: 10, format: "square", about: "Monet's garden bridge at Giverny, thick with green.", art: { t: "photo", src: "water-lily-pond.jpg" }, frame: "gold", credit: "Claude Monet, Water Lily Pond (1900). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "irises", name: "Irises", in: "nature", also: ["luxury"], price: 849, format: "landscape", about: "Van Gogh's late bouquet of irises in a white vase.", art: { t: "photo", src: "irises.jpg" }, frame: "gold", credit: "Vincent van Gogh, Irises (1890). Public domain; image from The Metropolitan Museum of Art (CC0)." },
    { id: "wheat-field-cypresses", name: "Wheat Field with Cypresses", in: "nature", also: ["luxury"], price: 849, off: 15, format: "landscape", about: "Van Gogh's swirling summer sky over golden wheat.", art: { t: "photo", src: "wheat-field-cypresses.jpg", size: "114% auto" }, frame: "gold", credit: "Vincent van Gogh, Wheat Field with Cypresses (1889). Public domain; image from The Metropolitan Museum of Art (CC0)." },
    { id: "cliff-walk", name: "Cliff Walk at Pourville", in: "nature", also: ["travel"], price: 849, format: "landscape", about: "Monet's breezy clifftop above a bright green sea.", art: { t: "photo", src: "cliff-walk.jpg" }, frame: "gold", credit: "Claude Monet, Cliff Walk at Pourville (1882). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "wheat-stacks", name: "Stacks of Wheat", in: "nature", price: 849, format: "landscape", about: "Monet's haystacks glowing at the end of summer.", art: { t: "photo", src: "wheat-stacks.jpg" }, frame: "walnut", credit: "Claude Monet, Stacks of Wheat (End of Summer) (1890–91). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "poets-garden", name: "The Poet's Garden", in: "nature", price: 849, format: "landscape", about: "Van Gogh's sunlit park in Arles under a yellow sky.", art: { t: "photo", src: "poets-garden.jpg" }, frame: "walnut", credit: "Vincent van Gogh, The Poet's Garden (1888). Public domain; image from the Art Institute of Chicago (CC0)." },

    // ---------------- Travel ----------------
    { id: "wander-compass", name: "Wander Often", in: "travel", price: 499, about: "A compass rose for the wall by the front door.", art: { t: "travel", kind: "compass", title: "wander often, wonder always" } },
    { id: "boarding-pass", name: "Boarding Pass", in: "travel", price: 499, off: 10, about: "A one-way ticket from home to away.", art: { t: "travel", kind: "pass", pal: "navy" }, frame: "black" },
    { id: "passport-stamps", name: "Passport Stamps", in: "travel", price: 499, about: "Nine Indian destinations, stamped and slightly crooked.", art: { t: "travel", kind: "stamps", pal: "paper" } },
    { id: "window-seat", name: "Window Seat", in: "travel", price: 499, about: "The view from seat A, somewhere above the clouds.", art: { t: "travel", kind: "window" }, frame: "white" },
    { id: "world-is-waiting", name: "The World Is Waiting", in: "travel", price: 499, about: "A line-drawn globe with one dotted flight path.", art: { t: "travel", kind: "globe", pal: "sand" } },
    { id: "poster-manali", name: "Manali Travel Poster", in: "travel", also: ["nature"], price: 549, off: 10, about: "Pine forests and snow peaks in a vintage poster layout.", art: { t: "poster", of: { t: "mountains", sky: "alpine", pines: true }, title: "MANALI", sub: "Himachal Pradesh" } },
    { id: "poster-goa", name: "Goa Travel Poster", in: "travel", price: 549, about: "Palms, a red sun and three slow days by the sea.", art: { t: "poster", of: { t: "palms", sky: "ember" }, title: "GOA", sub: "sun · sand · sea", pal: "ink" }, frame: "black" },
    { id: "poster-ladakh", name: "Ladakh Travel Poster", in: "travel", price: 549, about: "Bare, sharp ridges under a warm high-desert sky.", art: { t: "poster", of: { t: "mountains", sky: "sand", style: "sharp" }, title: "LADAKH", sub: "land of high passes", pal: "sand" }, frame: "walnut" },
    { id: "poster-kerala", name: "Kerala Travel Poster", in: "travel", price: 549, off: 15, about: "Coconut palms over calm green backwaters.", art: { t: "poster", of: { t: "palms", sky: "teal" }, title: "KERALA", sub: "the backwaters", pal: "sage" } },
    { id: "poster-mumbai", name: "Mumbai Travel Poster", in: "travel", price: 549, about: "A city skyline at sunset, lights just coming on.", art: { t: "poster", of: { t: "skyline", style: "sunset" }, title: "MUMBAI", sub: "city of dreams", pal: "navy" }, frame: "black" },
    { id: "poster-rishikesh", name: "Rishikesh Travel Poster", in: "travel", price: 549, about: "Forest hills in morning mist.", art: { t: "poster", of: { t: "forest", sky: "mist" }, title: "RISHIKESH", sub: "foothills of the Himalaya", pal: "sage" } },
    { id: "houses-of-parliament", name: "Houses of Parliament, London", in: "travel", also: ["luxury"], price: 849, format: "square", about: "Monet's Westminster dissolving into violet fog.", art: { t: "photo", src: "houses-of-parliament.jpg" }, frame: "gold", credit: "Claude Monet, Houses of Parliament, London (1900–01). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "bay-of-marseille", name: "The Bay of Marseille", in: "travel", also: ["nature"], price: 849, format: "landscape", about: "Cézanne's red rooftops above a deep blue bay.", art: { t: "photo", src: "bay-of-marseille.jpg" }, frame: "walnut", credit: "Paul Cézanne, The Bay of Marseille, Seen from L'Estaque (c. 1885). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "mont-sainte-victoire", name: "Mont Sainte-Victoire", in: "travel", also: ["nature"], price: 849, format: "landscape", about: "Cézanne's mountain seen through a line of pines.", art: { t: "photo", src: "mont-sainte-victoire.jpg", size: "112% auto" }, frame: "walnut", credit: "Paul Cézanne, Mont Sainte-Victoire and the Viaduct of the Arc River Valley (1882–85). Public domain; image from The Metropolitan Museum of Art (CC0)." },

    // ---------------- Sports ----------------
    { id: "football-pitch", name: "The Beautiful Game", in: "sports", price: 499, off: 10, about: "A football pitch from above, chalk lines on striped grass.", art: { t: "court", kind: "football", label: "the beautiful game" } },
    { id: "basketball-court", name: "Home Court", in: "sports", price: 499, about: "A hardwood court drawn as a clean plan.", art: { t: "court", kind: "basketball", label: "home court" } },
    { id: "tennis-court", name: "Centre Court", in: "sports", price: 499, about: "A blue hard court with crisp white lines.", art: { t: "court", kind: "tennis", label: "centre court" }, frame: "white" },
    { id: "cricket-ground", name: "22 Yards", in: "sports", price: 499, off: 15, about: "A cricket oval with the pitch at its heart.", art: { t: "court", kind: "cricket", label: "22 yards" }, frame: "natural-wood" },
    { id: "badminton-court", name: "Baseline to Baseline", in: "sports", price: 499, about: "A badminton court in deep green.", art: { t: "court", kind: "badminton", label: "baseline to baseline" } },
    { id: "running-track", name: "Lane Four", in: "sports", price: 499, about: "Six lanes of red track, drawn from above.", art: { t: "court", kind: "track", label: "lane four" } },
    { id: "play-hard", name: "Play Hard", in: "sports", also: ["motivational"], price: 479, about: "A football at speed and two blunt words.", art: { t: "sport", kind: "ball", which: "football" } },
    { id: "ball-is-life", name: "Ball Is Life", in: "sports", price: 479, about: "A basketball on black, for the door of a hooper's room.", art: { t: "sport", kind: "ball", which: "basketball", pal: "noir", lines: ["BALL", "*IS LIFE"] } },
    { id: "howzat", name: "Howzat!", in: "sports", price: 479, off: 10, about: "A red cricket ball and the loudest appeal in the game.", art: { t: "sport", kind: "ball", which: "cricket", pal: "navy", lines: ["HOWZAT"] } },
    { id: "game-set-match", name: "Game, Set, Match", in: "sports", price: 479, about: "A tennis ball and the three words that end it.", art: { t: "sport", kind: "ball", which: "tennis", lines: ["GAME", "SET", "*MATCH"] } },
    { id: "smash", name: "Smash", in: "sports", price: 479, about: "A shuttlecock coming down hard, on soft sage.", art: { t: "sport", kind: "ball", which: "shuttle", pal: "sage", lines: ["SMASH"] } },
    { id: "captain-ten", name: "Captain 10", in: "sports", price: 499, about: "A striped number-ten shirt for the leader of the team.", art: { t: "sport", kind: "jersey", pal: "navy" } },
    { id: "earned-not-given", name: "Earned, Not Given", in: "sports", also: ["motivational"], price: 499, about: "A gold medal on black.", art: { t: "sport", kind: "medal", pal: "gold" } },

    // ---------------- Music ----------------
    { id: "play-it-loud", name: "Play It Loud", in: "music", price: 499, off: 10, about: "A record sliding out of an amber sleeve.", art: { t: "music", kind: "vinyl", title: "PLAY IT LOUD" } },
    { id: "feel-the-beat", name: "Feel the Beat", in: "music", price: 499, about: "A sound wave in pink and violet on deep purple.", art: { t: "music", kind: "wave", pal: "neon", title: "FEEL THE BEAT" }, wall: "charcoal" },
    { id: "keys-to-happiness", name: "Keys to Happiness", in: "music", price: 499, about: "One octave and a bit, with a single red key.", art: { t: "music", kind: "keys", pal: "ink", title: "KEYS TO HAPPINESS" } },
    { id: "mixtape", name: "Mixtape", in: "music", price: 499, off: 15, about: "A cassette on mustard yellow, side A.", art: { t: "music", kind: "cassette", pal: "mustard", title: "MIXTAPE" } },
    { id: "turn-it-up", name: "Turn It Up", in: "music", also: ["gaming"], price: 499, about: "An equaliser display with every band jumping.", art: { t: "music", kind: "eq", pal: "arcade", title: "TURN IT UP" }, wall: "charcoal" },
    { id: "strum", name: "Strum", in: "music", price: 499, about: "An acoustic guitar on warm terracotta.", art: { t: "music", kind: "guitar", pal: "terracotta", title: "STRUM" }, frame: "natural-wood" },
    { id: "life-is-a-song", name: "Life Is a Song", in: "music", also: ["quotes"], price: 479, about: "Four notes on a wandering stave.", art: { t: "music", kind: "notes", pal: "paper", title: "life is a song", font: "playi" } },
    { id: "music-on-world-off", name: "Music On, World Off", in: "music", price: 499, about: "Headphones and a waveform on slate grey.", art: { t: "music", kind: "headphones", pal: "slate", title: "MUSIC ON · WORLD OFF" } },

    // ---------------- Minimalist ----------------
    { id: "orbit", name: "Orbit", in: "minimalist", price: 449, about: "A fine ring with one solid dot inside it.", art: { t: "minimal", kind: "circle" } },
    { id: "arches", name: "Arches", in: "minimalist", price: 449, off: 10, about: "Five nested arcs in a single thin line.", art: { t: "minimal", kind: "arc" }, frame: "natural-wood" },
    { id: "horizon", name: "Horizon", in: "minimalist", price: 449, about: "A half sun resting on a quiet line.", art: { t: "minimal", kind: "horizon" }, wall: "mist", frame: "white" },
    { id: "vertical-lines", name: "Vertical Lines", in: "minimalist", price: 449, about: "A diamond made of nothing but upright strokes.", art: { t: "minimal", kind: "lines" } },
    { id: "dot-grid", name: "Dot Grid", in: "minimalist", price: 449, about: "Twenty circles, three of them filled.", art: { t: "minimal", kind: "grid" } },
    { id: "soft-waves", name: "Soft Waves", in: "minimalist", price: 449, off: 10, about: "Six gentle lines, like water seen from far away.", art: { t: "minimal", kind: "wave" } },
    { id: "balance", name: "Balance", in: "minimalist", price: 449, about: "A dot held inside a triangle.", art: { t: "minimal", kind: "triangle" } },
    { id: "corner-square", name: "Corner Square", in: "minimalist", price: 449, about: "An outline square and its solid shadow.", art: { t: "minimal", kind: "square" } },

    // ---------------- Abstract Art ----------------
    { id: "terracotta-arches", name: "Terracotta Arches", in: "abstract", price: 499, off: 10, about: "Layered arches, a sun and a leafy stem in clay tones.", art: { t: "boho", kind: "arches" } },
    { id: "desert-sun", name: "Desert Sun", in: "abstract", price: 499, about: "A rust-red sun over soft bands of sand.", art: { t: "boho", kind: "sun" }, wall: "warm" },
    { id: "soft-forms", name: "Soft Forms", in: "abstract", price: 499, about: "Rounded shapes that lean on each other.", art: { t: "boho", kind: "blobs" }, frame: "white" },
    { id: "crescent-dunes", name: "Crescent Dunes", in: "abstract", price: 499, about: "A terracotta crescent above rolling dunes.", art: { t: "boho", kind: "moon" }, wall: "sage", frame: "black" },
    { id: "contour", name: "Contour", in: "abstract", also: ["minimalist"], price: 499, off: 15, about: "Wobbly rings, like the map of a single hill.", art: { t: "flow", kind: "topo" }, frame: "black" },
    { id: "drift", name: "Drift", in: "abstract", also: ["minimalist"], price: 499, about: "Fine lines bending around one black dot.", art: { t: "flow", kind: "lines" }, wall: "mist", frame: "black" },
    { id: "mid-century", name: "Mid-Century Blocks", in: "abstract", also: ["modern"], price: 529, about: "Quarter circles, stripes and squares in a tidy grid.", art: { t: "bauhaus" }, frame: "black" },
    { id: "brush-and-gold", name: "Brush & Gold", in: "abstract", also: ["luxury"], price: 549, about: "Broad ink strokes with a fine gold ring.", art: { t: "brush" }, wall: "warm", frame: "gold" },
    { id: "improvisation-30", name: "Improvisation No. 30", in: "abstract", also: ["luxury"], price: 849, format: "square", about: "Kandinsky's storm of colour from 1913.", art: { t: "photo", src: "improvisation-30.jpg" }, frame: "black", credit: "Vasily Kandinsky, Improvisation No. 30 (Cannons) (1913). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "green-center", name: "Painting with Green Center", in: "abstract", also: ["luxury"], price: 849, off: 10, format: "square", about: "An early Kandinsky abstraction that turns around a patch of green.", art: { t: "photo", src: "green-center.jpg" }, frame: "black", credit: "Vasily Kandinsky, Painting with Green Center (1913). Public domain; image from the Art Institute of Chicago (CC0)." },

    // ---------------- Couple / Love ----------------
    { id: "grid-of-hearts", name: "The One", in: "couple", price: 479, about: "Thirty outlined hearts and one that is filled in.", art: { t: "love", kind: "hearts" } },
    { id: "night-we-met", name: "The Night We Met", in: "couple", price: 549, off: 10, about: "A star chart for the evening everything started.", art: { t: "love", kind: "starmap", pal: "paper" } },
    { id: "heartbeat", name: "Heartbeat", in: "couple", price: 479, about: "A pulse line that turns into a heart.", art: { t: "love", kind: "heartbeat" } },
    { id: "you-and-me", name: "You & Me", in: "couple", price: 549, off: 15, about: "Two figures holding hands in front of a rising moon.", art: { t: "love", kind: "couple", title: "you & me" } },
    { id: "better-together", name: "Better Together", in: "couple", price: 479, about: "A two-circle diagram with us in the middle.", art: { t: "love", kind: "venn" } },
    { id: "always-and-forever", name: "Always & Forever", in: "couple", price: 479, about: "An infinity loop tied with a small heart.", art: { t: "love", kind: "infinity", pal: "rose" } },
    { id: "mr-and-mrs", name: "Mr & Mrs", in: "couple", price: 499, off: 10, about: "A leafy wreath for newlyweds.", art: { t: "love", kind: "wreath", pal: "sage" }, frame: "natural-wood" },
    { id: "you-hold-the-key", name: "You Hold the Key", in: "couple", price: 479, about: "A heart-shaped lock and the only key that fits.", art: { t: "love", kind: "key" } },

    // ---------------- Kids ----------------
    { id: "my-sunshine", name: "You Are My Sunshine Rainbow", in: "kids", price: 449, off: 10, about: "A pastel rainbow resting on two clouds.", art: { t: "kids", kind: "rainbow", title: "you are my sunshine" }, wall: "blush" },
    { id: "little-bear", name: "Little Bear", in: "kids", price: 449, about: "A friendly bear with rosy cheeks.", art: { t: "kids", kind: "animal", who: "bear" }, frame: "natural-wood" },
    { id: "little-panda", name: "Little Panda", in: "kids", price: 449, about: "A round panda on a peach circle.", art: { t: "kids", kind: "animal", who: "panda" }, wall: "sage" },
    { id: "little-bunny", name: "Little Bunny", in: "kids", price: 449, off: 10, about: "A white bunny with tall pink ears.", art: { t: "kids", kind: "animal", who: "bunny" }, wall: "blush" },
    { id: "little-fox", name: "Little Fox", in: "kids", price: 449, about: "A clever orange fox on lilac.", art: { t: "kids", kind: "animal", who: "fox" }, frame: "natural-wood" },
    { id: "little-lion", name: "Little Lion", in: "kids", price: 449, about: "A lion with a fluffy two-tone mane.", art: { t: "kids", kind: "animal", who: "lion" }, frame: "natural-wood" },
    { id: "little-cat", name: "Little Cat", in: "kids", price: 449, about: "A grey kitten with long whiskers.", art: { t: "kids", kind: "animal", who: "cat" } },
    { id: "little-koala", name: "Little Koala", in: "kids", price: 449, about: "A sleepy koala with big soft ears.", art: { t: "kids", kind: "animal", who: "koala" } },
    { id: "my-abc", name: "My ABC", in: "kids", price: 479, off: 15, about: "All twenty-six letters in soft candy colours.", art: { t: "kids", kind: "alphabet" } },
    { id: "lets-count", name: "Let's Count", in: "kids", price: 479, about: "One to ten, big enough to point at.", art: { t: "kids", kind: "numbers" } },
    { id: "dream-big-little-one", name: "Dream Big, Little One", in: "kids", price: 479, off: 10, about: "A sleepy crescent moon in a sky full of stars.", art: { t: "kids", kind: "moon" } },
    { id: "up-and-away", name: "Up, Up & Away", in: "kids", price: 479, about: "A striped hot-air balloon among the clouds.", art: { t: "kids", kind: "balloon", title: "up, up & away" } },
    { id: "moon-and-back", name: "To the Moon & Back", in: "kids", also: ["couple"], price: 479, about: "A little rocket on its way past the planets.", art: { t: "kids", kind: "rocket" } },
    { id: "hello-little-one", name: "Hello, Little One", in: "kids", price: 449, about: "Three clouds and a sprinkle of coloured rain.", art: { t: "kids", kind: "clouds" } },

    // ---------------- Luxury / Premium ----------------
    { id: "marble-hex-gold", name: "Marble & Gold Hexagon", in: "luxury", price: 699, off: 10, about: "Fine gold lines and a hexagon over pale marble.", art: { t: "marble", tone: "white", shape: "hex" } },
    { id: "noir-ring", name: "Noir Ring", in: "luxury", price: 699, about: "A gold ring crossed by sweeping lines on charcoal stone.", art: { t: "marble", tone: "black", shape: "ring" }, wall: "linen" },
    { id: "emerald-gold", name: "Emerald & Gold", in: "luxury", price: 699, off: 15, about: "Deep green stone inside a hair-thin gold border.", art: { t: "marble", tone: "emerald", shape: "frame" }, wall: "warm" },
    { id: "rose-marble", name: "Rose Marble", in: "luxury", price: 699, about: "Blush stone with a gold hexagon.", art: { t: "marble", tone: "rose", shape: "hex" }, wall: "linen" },
    { id: "navy-gold", name: "Midnight & Gold", in: "luxury", price: 699, about: "Navy stone, a gold ring and long curved veins.", art: { t: "marble", tone: "navy", shape: "ring" }, wall: "linen" },
    { id: "golden-rings", name: "Golden Rings", in: "luxury", also: ["3d"], price: 729, off: 10, about: "Stacked gold hoops that read as a floating sphere.", art: { t: "iso", kind: "rings", pal: "gold" }, wall: "linen" },
    { id: "grande-jatte", name: "A Sunday on La Grande Jatte", in: "luxury", price: 999, off: 10, format: "landscape", about: "Seurat's riverside afternoon, painted dot by dot.", art: { t: "photo", src: "grande-jatte.jpg" }, credit: "Georges Seurat, A Sunday on La Grande Jatte — 1884 (1884–86). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "water-pitcher", name: "Young Woman with a Water Pitcher", in: "luxury", price: 949, about: "Vermeer's quiet morning light through a leaded window.", art: { t: "photo", src: "water-pitcher.jpg" }, credit: "Johannes Vermeer, Young Woman with a Water Pitcher (c. 1662). Public domain; image from The Metropolitan Museum of Art (CC0)." },
    { id: "dance-class", name: "The Dance Class", in: "luxury", price: 949, off: 15, about: "Degas's ballet dancers waiting for their turn.", art: { t: "photo", src: "dance-class.jpg", size: "auto 114%", pos: "50% 60%" }, credit: "Edgar Degas, The Dance Class (1874). Public domain; image from The Metropolitan Museum of Art (CC0)." },
    { id: "rainy-day", name: "Paris Street; Rainy Day", in: "luxury", also: ["travel"], price: 999, format: "landscape", about: "Caillebotte's wet cobblestones and grey umbrellas.", art: { t: "photo", src: "rainy-day.jpg" }, credit: "Gustave Caillebotte, Paris Street; Rainy Day (1877). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "basket-of-apples", name: "The Basket of Apples", in: "luxury", price: 949, format: "landscape", about: "Cézanne's tilted table and tumbling fruit.", art: { t: "photo", src: "basket-of-apples.jpg" }, credit: "Paul Cézanne, The Basket of Apples (c. 1893). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "water-lilies", name: "Water Lilies", in: "luxury", also: ["nature"], price: 999, off: 10, format: "square", about: "Monet's pond surface, all reflection and no horizon.", art: { t: "photo", src: "water-lilies.jpg" }, credit: "Claude Monet, Water Lilies (1906). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "the-bedroom", name: "The Bedroom", in: "luxury", price: 949, format: "landscape", about: "Van Gogh's own room in Arles, in blue and yellow.", art: { t: "photo", src: "bedroom.jpg" }, credit: "Vincent van Gogh, The Bedroom (1889). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "royal-procession", name: "Maharana in Procession", in: "luxury", price: 999, format: "landscape", about: "A Mewar court painting of a royal procession, about 1820.", art: { t: "photo", src: "royal-procession.jpg" }, credit: "Ghasi, Maharana Bhim Singh in Procession (c. 1820). Public domain; image from the Art Institute of Chicago (CC0)." },

    // ---------------- Modern Wall Art ----------------
    { id: "modern-mustard", name: "Modern Blocks in Mustard", in: "modern", price: 529, off: 10, about: "Geometric tiles in mustard, rust and black.", art: { t: "bauhaus", pal: "mustard", seed: "modern-mustard" } },
    { id: "modern-navy", name: "Modern Blocks in Navy", in: "modern", price: 529, about: "The same playful grid in navy and gold.", art: { t: "bauhaus", pal: "navy", seed: "modern-navy" } },
    { id: "modern-rainbow", name: "Clay Rainbow", in: "modern", also: ["abstract"], price: 499, about: "A tall terracotta rainbow with a small sun.", art: { t: "boho", kind: "rainbow" }, wall: "blush", frame: "white" },
    { id: "sage-forms", name: "Sage Forms", in: "modern", also: ["abstract"], price: 499, about: "Organic shapes in green and grey.", art: { t: "boho", kind: "blobs", pal: "sage", seed: "sage-forms" }, frame: "natural-wood" },
    { id: "midnight-drift", name: "Midnight Drift", in: "modern", price: 499, off: 15, about: "Gold-white lines flowing over deep navy.", art: { t: "flow", kind: "lines", pal: "navy" }, frame: "black" },
    { id: "ocean-sun", name: "Ocean Sun", in: "modern", price: 499, about: "A round sun over layered bands of sea blue.", art: { t: "boho", kind: "sun", pal: "ocean", seed: "ocean-sun" }, wall: "mist", frame: "white" },
    { id: "forest-leaves", name: "Forest Leaves", in: "modern", also: ["nature"], price: 499, about: "Pale stems on deep forest green.", art: { t: "botanical", style: "fill", pal: "forest" }, frame: "natural-wood" },
    { id: "lilac-topography", name: "Lilac Topography", in: "modern", price: 499, about: "Contour rings in violet on soft lilac.", art: { t: "flow", kind: "topo", pal: "lilac" }, frame: "white" },

    // ---------------- 3D Wall Art ----------------
    { id: "tumbling-cubes", name: "Tumbling Cubes", in: "3d", price: 549, off: 10, about: "A wall of cubes that flips direction while you look at it.", art: { t: "iso", kind: "cubes" } },
    { id: "impossible-triangle", name: "Impossible Triangle", in: "3d", price: 549, about: "Three beams that could never be built.", art: { t: "iso", kind: "penrose", pal: "noir" } },
    { id: "square-tunnel", name: "Square Tunnel", in: "3d", price: 549, about: "Turning squares that pull the eye inwards.", art: { t: "iso", kind: "tunnel", pal: "navy", twist: 4 } },
    { id: "round-tunnel", name: "Round Tunnel", in: "3d", price: 549, off: 15, about: "Off-centre rings that look like a long tube.", art: { t: "iso", kind: "tunnel", pal: "noir", round: true, drift: 1.2 } },
    { id: "floating-spheres", name: "Floating Spheres", in: "3d", price: 549, about: "Shaded balls and their soft shadows.", art: { t: "iso", kind: "spheres", pal: "ink" } },
    { id: "paper-mountains", name: "Paper Mountains", in: "3d", also: ["nature"], price: 579, off: 10, about: "Layers of cut paper, each casting a shadow on the next.", art: { t: "iso", kind: "papercut", pal: "teal" }, frame: "white" },
    { id: "think-big-3d", name: "Think Big", in: "3d", also: ["motivational"], price: 549, about: "Block letters with a deep orange side.", art: { t: "iso", kind: "extrude", pal: "noir", lines: ["THINK", "*BIG"] } },
    { id: "stairway", name: "Stairway", in: "3d", price: 549, about: "Clay-coloured steps climbing towards a sun.", art: { t: "iso", kind: "stairs", pal: "clay" } },
    { id: "block-city", name: "Block City", in: "3d", price: 549, about: "An isometric skyline of blue-grey towers.", art: { t: "iso", kind: "bars", pal: "navy" } },
    { id: "sunset-paper", name: "Paper Sunset", in: "3d", price: 579, about: "Cut-paper dunes in plum, coral and gold.", art: { t: "iso", kind: "papercut", pal: "sunset", from: "#ffc247", to: "#2a1a3e" }, frame: "black" },

    // ---------------- Multi-Panel Frames: ready-made sets ----------------
    { id: "mp-cherry-tree-3", name: "Cherry Blossom Tree — 3 Panels", in: "multi-panel", also: ["nature"], panels: 3, price: 1899, off: 10, about: "One spreading cherry tree carried across three frames.", art: { t: "tree", style: "cherry" } },
    { id: "mp-autumn-tree-5", name: "Autumn Tree — 5 Panels", in: "multi-panel", also: ["nature"], panels: 5, stagger: true, price: 3299, off: 15, about: "A copper-leafed tree in the classic stepped five-panel layout.", art: { t: "tree", style: "autumn", sunX: 0.7 }, wall: "warm" },
    { id: "mp-golden-tree-3", name: "Golden Tree at Night — 3 Panels", in: "multi-panel", also: ["luxury"], panels: 3, price: 2099, about: "A gold tree on midnight blue for a formal living room.", art: { t: "tree", style: "gold" }, wall: "charcoal", frame: "gold" },
    { id: "mp-mountain-dawn-3", name: "Mountain Dawn — 3 Panels", in: "multi-panel", also: ["nature"], panels: 3, price: 1899, off: 10, about: "A sunrise range and its lake, split into a triptych.", art: { t: "mountains", sky: "dawn", lake: true, sunX: 0.5 } },
    { id: "mp-ember-peaks-4", name: "Ember Peaks — 4 Panels", in: "multi-panel", also: ["nature"], panels: 4, price: 2599, about: "Sharp ridges under a burning sky, across four frames.", art: { t: "mountains", sky: "ember", style: "sharp", sunX: 0.37 }, wall: "warm" },
    { id: "mp-night-peaks-5", name: "Night Peaks — 5 Panels", in: "multi-panel", also: ["nature"], panels: 5, stagger: true, price: 3299, about: "Moonlit summits and pines in a stepped five-panel set.", art: { t: "mountains", sky: "night", style: "sharp", moon: true, pines: true, near: "#0a0f1e", sunX: 0.5 }, wall: "charcoal" },
    { id: "mp-supercar-sunset-3", name: "Supercar Sunset — 3 Panels", in: "multi-panel", also: ["cars"], panels: 3, price: 1999, off: 10, about: "A supercar silhouette stretched across a neon sunset.", art: { t: "car", kind: "super", style: "sunset" }, wall: "charcoal", room: "desk" },
    { id: "mp-bike-sunset-3", name: "Sunset Ride — 3 Panels", in: "multi-panel", also: ["cars"], panels: 3, price: 1999, about: "A parked motorbike and a wide evening sky.", art: { t: "car", kind: "bike", style: "sunset", scale: 0.5 }, wall: "charcoal", room: "console" },
    { id: "mp-night-skyline-5", name: "City Skyline at Night — 5 Panels", in: "multi-panel", also: ["travel"], panels: 5, stagger: true, price: 3299, off: 15, about: "A lit-up skyline under a full moon, stepped across five frames.", art: { t: "skyline", style: "night" }, wall: "charcoal", room: "console" },
    { id: "mp-sunset-skyline-3", name: "City Skyline at Sunset — 3 Panels", in: "multi-panel", also: ["travel"], panels: 3, price: 1899, about: "Towers in silhouette against an orange evening.", art: { t: "skyline", style: "sunset" } },
    { id: "mp-neon-skyline-4", name: "Neon Skyline — 4 Panels", in: "multi-panel", also: ["gaming"], panels: 4, price: 2599, about: "A glowing city outline for a gaming or media wall.", art: { t: "skyline", style: "neon" }, wall: "charcoal", room: "desk" },
    { id: "mp-moonlit-wanderer-3", name: "Moonlit Wanderer — 3 Panels", in: "multi-panel", also: ["anime"], panels: 3, price: 1999, off: 10, about: "The lone swordsman and his moon as a triptych.", art: { t: "japan", kind: "wanderer", moonX: 0.5, cliffX: 0.2 }, wall: "charcoal", room: "desk" },
    { id: "mp-summer-sky-4", name: "After-School Sky — 4 Panels", in: "multi-panel", also: ["anime"], panels: 4, price: 2599, about: "Anime-style summer clouds and power lines over four frames.", art: { t: "japan", kind: "sky", figureX: 0.58 }, room: "desk" },
    { id: "mp-retro-grid-4", name: "Retro Grid — 4 Panels", in: "multi-panel", also: ["gaming"], panels: 4, price: 2599, off: 10, about: "The synthwave sun and grid, wide enough for a whole setup wall.", art: { t: "synth", x: 0.372 }, wall: "charcoal", room: "desk" },
    { id: "mp-ocean-dawn-2", name: "Ocean Dawn — 2 Panels", in: "multi-panel", also: ["nature"], panels: 2, price: 1499, about: "A calm sea at sunrise, split in two.", art: { t: "waves", sky: "dawn", sunX: 0.3 }, wall: "mist", frame: "white", room: "bed" },
    { id: "mp-ocean-dusk-3", name: "Ocean at Dusk — 3 Panels", in: "multi-panel", also: ["nature"], panels: 3, price: 1899, off: 10, about: "Evening waves and one small sail over three frames.", art: { t: "waves", sky: "dusk", boat: true }, wall: "mist", frame: "white", room: "bed" },
    { id: "mp-palm-sunset-3", name: "Palm Sunset — 3 Panels", in: "multi-panel", also: ["travel"], panels: 3, price: 1899, about: "Tropical palms and a striped sun as a triptych.", art: { t: "palms", sky: "ember" } },
    { id: "mp-misty-forest-4", name: "Misty Forest — 4 Panels", in: "multi-panel", also: ["nature"], panels: 4, price: 2599, about: "Pine ridges fading into fog across four frames.", art: { t: "forest", sky: "mist" }, wall: "sage", frame: "natural-wood" },
    { id: "mp-flow-lines-3", name: "Flow Lines — 3 Panels", in: "multi-panel", also: ["abstract"], panels: 3, price: 1799, about: "Abstract lines that run unbroken from frame to frame.", art: { t: "flow", kind: "lines" } },
    { id: "mp-noir-gold-3", name: "Noir & Gold — 3 Panels", in: "multi-panel", also: ["abstract", "luxury"], panels: 3, price: 2099, off: 10, about: "Gold veins and a ring over dark stone, in three parts.", art: { t: "marble", tone: "black", shape: "ring" }, frame: "gold" },
    { id: "mp-paper-mountains-3", name: "Paper Mountains — 3 Panels", in: "multi-panel", also: ["3d", "abstract"], panels: 3, price: 1899, about: "Layered paper-cut hills with real-looking depth.", art: { t: "iso", kind: "papercut", pal: "teal", sunX: 0.5 }, frame: "white" },
    { id: "mp-you-and-me-3", name: "You & Me — 3 Panels", in: "multi-panel", also: ["couple"], panels: 3, price: 1999, off: 10, about: "A couple under the moon, made for the wall above the bed.", art: { t: "love", kind: "couple" }, room: "bed" },
    { id: "mp-dream-believe-achieve-3", name: "Dream · Believe · Achieve — 3 Panels", in: "multi-panel", also: ["motivational"], panels: 3, price: 1799, off: 15, about: "One word per frame, for an office or study wall.", art: { t: "panelwords", words: ["DREAM", "BELIEVE", "ACHIEVE"], subs: ["it", "in it", "it"], pal: "noir" }, room: "console" },
    { id: "mp-work-hard-4", name: "Work · Hard · Stay · Humble — 4 Panels", in: "multi-panel", also: ["motivational"], panels: 4, price: 2399, about: "Four frames, four words, navy and gold.", art: { t: "panelwords", words: ["WORK", "HARD", "STAY", "HUMBLE"], pal: "navy", hot: 3 }, room: "console" },
    { id: "mp-great-wave-3", name: "The Great Wave — 3 Panels", in: "multi-panel", also: ["anime", "luxury"], panels: 3, price: 2299, off: 10, about: "Hokusai's wave, breaking across three frames.", art: { t: "photo", src: "great-wave.jpg", pos: "50% 42%" }, credit: "Katsushika Hokusai, Under the Wave off Kanagawa (1830/33). Public domain; image from the Art Institute of Chicago (CC0)." },
    { id: "mp-grande-jatte-3", name: "La Grande Jatte — 3 Panels", in: "multi-panel", also: ["luxury"], panels: 3, price: 2299, about: "Seurat's riverside afternoon as a gallery-style triptych.", art: { t: "photo", src: "grande-jatte.jpg", pos: "50% 55%" }, frame: "gold", credit: "Georges Seurat, A Sunday on La Grande Jatte — 1884 (1884–86). Public domain; image from the Art Institute of Chicago (CC0)." },

    // ---------------- Multi-Panel Frames: your own photo ----------------
    { id: "custom-split-2", name: "Your Photo — 2 Panel Split", in: "multi-panel", panels: 2, custom: true, price: 1599, about: "Upload one photo and we print it across two frames.", art: { t: "sample", of: { t: "waves", sky: "dawn", sunX: 0.3 } }, wall: "mist", frame: "white", room: "bed" },
    { id: "custom-split-3", name: "Your Photo — 3 Panel Split", in: "multi-panel", panels: 3, custom: true, price: 1999, off: 10, about: "Upload one photo and we print it across three frames.", art: { t: "sample", of: { t: "mountains", sky: "dawn", lake: true, sunX: 0.5 } } },
    { id: "custom-split-4", name: "Your Photo — 4 Panel Split", in: "multi-panel", panels: 4, custom: true, price: 2699, about: "Upload one photo and we print it across four frames.", art: { t: "sample", of: { t: "forest", sky: "mist" } }, wall: "sage", frame: "natural-wood" },
    { id: "custom-split-5", name: "Your Photo — 5 Panel Split", in: "multi-panel", panels: 5, custom: true, price: 3399, off: 10, about: "Upload one photo and we print it across five frames.", art: { t: "sample", of: { t: "mountains", sky: "dusk", style: "sharp", sunX: 0.5 } }, wall: "warm" },
    // ADD NEW WALL ART HERE
  ];

  /* ========================================================================
     4. SHOWCASE  — what the Home Decor page puts in its rows
     ------------------------------------------------------------------------
     Design ids (without "hd-"), in the order they should appear.
     featuredCollections: collection ids for the big cards at the top.
     ======================================================================== */
  const showcase = {
    featuredCollections: ["multi-panel", "motivational", "nature", "gaming", "luxury", "kids"],
    trending: ["never-give-up", "moonlit-wanderer", "retro-grid", "mountain-dawn", "terracotta-arches", "driven", "great-wave", "you-and-me", "tumbling-cubes", "little-bear", "after-school-sky", "play-it-loud"],
    premium: ["grande-jatte", "water-lilies", "marble-hex-gold", "wheat-field-cypresses", "noir-ring", "dance-class", "emerald-gold", "water-pitcher"],
  };

  /* ========================================================================
     5. DO NOT EDIT BELOW THIS LINE
     ------------------------------------------------------------------------
     Checks the designs, builds the full products and adds them (and the
     collections, as categories) to the data the website and the backend read.
     ======================================================================== */
  const warn = (message) => console.warn("[decor.js] " + message);
  const slugify = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const round10 = (value) => Math.round(value / 10) * 10;
  const collectionById = new Map(collections.map((c) => [c.id, c]));
  const SCENE_FRAME = { black: "black", white: "white", "natural-wood": "oak", walnut: "walnut", gold: "gold" };
  const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1);

  const seen = new Set();
  designs.forEach((d) => {
    if (!d.id || seen.has(d.id)) warn(`Design id "${d.id}" is missing or used twice.`);
    seen.add(d.id);
    if (!collectionById.has(d.in)) warn(`Design "${d.id}" is in an unknown collection "${d.in}".`);
    (d.also || []).filter((id) => !collectionById.has(id)).forEach((id) => warn(`Design "${d.id}" also lists an unknown collection "${id}".`));
    if (typeof d.price !== "number") warn(`Design "${d.id}" needs a number for price.`);
    if (d.panels && (d.panels < 2 || d.panels > 5)) warn(`Design "${d.id}" must have 2 to 5 panels.`);
  });
  ["trending", "premium"].forEach((key) => showcase[key].filter((id) => !seen.has(id)).forEach((id) => warn(`SHOWCASE ${key} lists an unknown design "${id}".`)));

  /** Everything about how a design is photographed (also read by tools/decor/build.mjs). */
  function lookOf(d) {
    const base = collectionById.get(d.in).look;
    return { wall: d.wall || base.wall, frame: d.frame || base.frame, room: d.room || base.room, mat: Boolean(d.mat) };
  }

  function sizesOf(d) {
    const panels = d.panels || 1;
    const list = panels > 1 ? SIZES.panel : SIZES[d.format || "portrait"];
    return list.map((s) => {
      const overall = panels > 1 ? s.w * panels + PANEL_GAP_IN * (panels - 1) : s.w;
      return { id: s.id, label: s.label, dimensions: `${overall} × ${s.h} in`, priceDelta: s.k === 1 ? 0 : round10(d.price * (s.k - 1)), panel: panels > 1 ? `${s.w} × ${s.h} in` : null };
    });
  }

  function productOf(d) {
    const id = "hd-" + d.id;
    const look = lookOf(d);
    const panels = d.panels || 1;
    const format = panels > 1 ? "landscape" : d.format || "portrait";
    const collection = collectionById.get(d.in);
    const sizes = sizesOf(d);
    const colors = [look.frame].concat(FRAME_COLORS.filter((c) => c !== look.frame));
    if (d.in === "luxury" && !colors.includes("gold")) colors.push("gold");
    const sceneFrame = SCENE_FRAME[look.frame];
    const views = [
      { type: "FRONT", url: `${IMG}${id}.webp`, alt: `${d.name}, framed, on a wall` },
      { type: "WALL_PREVIEW", url: `${IMG}${id}-room.webp`, alt: `${d.name} in a room, for scale` },
    ];
    if (panels > 1) views.push({ type: "DETAIL", url: `${IMG}${id}-set.webp`, alt: `The ${panels} panels of ${d.name}, straight on` });
    views.push({ type: "CORNER", url: `${IMG}_corner-${sceneFrame}.webp`, alt: "Frame corner, close up" }, { type: "BACK", url: `${IMG}_back-${sceneFrame}.webp`, alt: "Back of the frame with the wall hook" });
    const specifications = [
      { label: "Panels", value: panels > 1 ? `${panels} separate framed panels${d.stagger ? ", stepped heights" : ""}` : "Single framed piece" },
      { label: "Orientation", value: titleCase(format) },
    ];
    if (panels > 1) specifications.push({ label: "Each panel", value: sizes.map((s) => `${s.label}: ${s.panel}`).join(" · ") + (d.stagger ? " (tallest panel)" : "") }, { label: "Sizes shown", value: `Overall width with about ${PANEL_GAP_IN} in between panels` });
    specifications.push(
      { label: "Artwork", value: d.custom ? "Your own photo, printed across the panels" : d.credit || "Original FrameX design" },
      { label: "Print", value: "Photo-quality print, matte or glossy" },
      { label: "Care", value: CARE },
    );
    const components = [
      { id: "frame", type: "frame", name: "Outer frame", material: "Engineered wood moulding", description: "Black, white or wood finish" + (colors.includes("gold") ? ", or gold" : "") },
      { id: "print", type: "print", name: "Print", material: "Photo paper", description: "Matte or glossy finish" },
      { id: "cover", type: "protection", name: "Front cover", material: "Clear acrylic sheet", description: "Lighter and safer than glass" },
      { id: "back", type: "backing", name: "Backing", material: BACK.backing, description: BACK.hanging },
    ];
    const lead = d.custom ? `${d.about} Choose the layout, spacing, frame and finish in the customiser, and see the split before you order.` : d.about;
    return {
      id,
      shopId: SHOP_ID,
      name: d.name,
      slug: slugify(d.name),
      image: `${IMG}${id}.webp`,
      images: views.map((v) => v.url),
      description: panels > 1 && !d.custom ? `${lead} The set arrives as ${panels} separate frames, ready to hang with a small gap between them.` : lead,
      categoryIds: [MAIN, "hd-" + d.in].concat((d.also || []).map((c) => "hd-" + c)),
      tags: [collection.name, panels > 1 ? `${panels} panel` : "single frame", panels > 1 ? "multi-panel split" : format, d.custom ? "custom photo" : "ready-made", d.credit ? "museum classic" : "FrameX original"].concat(d.tags || []),
      price: d.price,
      discountPercent: d.off || 0,
      currency: "INR",
      stock: 25,
      isAvailable: true,
      isVisible: true,
      isNew: false,
      isFeatured: false,
      featuredRank: null,
      isRecommended: false,
      recommendedRank: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      material: "Engineered wood frame",
      sizeOptions: sizes,
      sizes: sizes.map((s) => s.label),
      colors,
      orientations: [format],
      views,
      print: { materials: PRINT_FINISHES, quality: "" },
      back: BACK,
      components,
      specifications,
      customization: { photoUpload: false, crop: false, frameColor: true, border: false, mat: false, text: false, orientation: false },
      // Home Decor's own fields: the page, the cards and the customiser read these.
      section: "decor",
      decor: {
        collection: d.in,
        collections: [d.in].concat(d.also || []),
        panelCount: panels,
        stagger: Boolean(d.stagger),
        format,
        customPhoto: Boolean(d.custom),
        credit: d.credit || null,
        original: !d.credit && !d.custom,
      },
    };
  }

  const products = designs.map(productOf);
  const byDesign = new Map(designs.map((d, i) => [d.id, products[i]]));
  const cover = (collectionId) => {
    const first = designs.find((d) => d.in === collectionId && !d.custom && !d.panels) || designs.find((d) => d.in === collectionId);
    return first ? `${IMG}hd-${first.id}.webp` : "";
  };
  const count = (collectionId) => products.filter((p) => p.decor.collections.includes(collectionId)).length;

  FrameX.seed = FrameX.seed || {};
  FrameX.seed.products = (FrameX.seed.products || []).filter((p) => p.section !== "decor").concat(products);
  FrameX.seed.categories = (FrameX.seed.categories || [])
    .filter((c) => c.kind !== "decor")
    .concat(
      [{ id: MAIN, name: "Home Decor & Wall Art", image: cover("multi-panel"), isActive: true, kind: "decor", sortOrder: 5000 }],
      collections.map((c, i) => ({ id: "hd-" + c.id, name: c.name, image: cover(c.id), isActive: true, kind: "decor", parent: MAIN, sortOrder: 5001 + i })),
    );

  /** What the Home Decor pages read. */
  FrameX.seed.decor = {
    mainCategoryId: MAIN,
    collections: collections.map((c) => ({ id: c.id, categoryId: "hd-" + c.id, name: c.name, blurb: c.blurb, image: cover(c.id), count: count(c.id) })),
    featuredCollections: showcase.featuredCollections,
    trendingIds: showcase.trending.map((id) => "hd-" + id),
    premiumIds: showcase.premium.map((id) => "hd-" + id),
    customIds: designs.filter((d) => d.custom).map((d) => "hd-" + d.id),
    custom: CUSTOM,
    productCount: products.length,
  };

  /** What tools/decor/build.mjs draws: one entry per product photo set. */
  FrameX.seed.decorDesigns = designs.map((d) => {
    const look = lookOf(d);
    return { id: "hd-" + d.id, art: d.art, format: d.format || "portrait", panels: d.panels || 1, stagger: Boolean(d.stagger), frame: SCENE_FRAME[look.frame], wall: look.wall, room: look.room, mat: look.mat };
  });

  /* ---- Custom-photo rules, shared by the customiser and the backend ---------
     A custom multi-panel order carries, besides size / frame colour / finish:
       { layout, spacing, border, photo: { name, width, height, x, y, zoom } }
     x and y (0..1) say which part of the photo sits in the middle of the set;
     zoom (1..3) enlarges it. The photo itself stays on the customer's device
     until the shop asks for it, exactly like FrameX Studio designs. */
  const has = (list, id) => list.some((item) => item.id === id);
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  FrameX.decorRules = {
    CUSTOM,
    isCustomPhoto: (product) => Boolean(product && product.decor && product.decor.customPhoto),
    /**
     * Cleans a customisation sent by a browser: unknown choices are reported,
     * numbers are clamped, text is trimmed. Returns { value, problems }.
     */
    cleanCustomization(product, input) {
      const problems = [];
      const raw = input && typeof input === "object" ? input : {};
      const photo = raw.photo && typeof raw.photo === "object" ? raw.photo : null;
      const choice = (key, list, fallback, what) => {
        if (raw[key] === undefined || raw[key] === null || raw[key] === "") return fallback;
        if (has(list, raw[key])) return raw[key];
        problems.push(`That ${what} isn't offered.`);
        return fallback;
      };
      const name = photo ? String(photo.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120) : "";
      const width = photo ? Math.round(clamp(photo.width, 0, 30000, 0)) : 0;
      const height = photo ? Math.round(clamp(photo.height, 0, 30000, 0)) : 0;
      if (!photo || !name || width < 1 || height < 1) problems.push("Add your photo before ordering this product.");
      return {
        problems,
        value: {
          kind: "decor-photo",
          panels: product.decor.panelCount,
          layout: choice("layout", CUSTOM.layouts, "side", "layout"),
          spacing: choice("spacing", CUSTOM.spacing, "standard", "spacing"),
          border: choice("border", CUSTOM.border, "medium", "frame thickness"),
          photo: {
            name,
            width,
            height,
            x: Math.round(clamp(photo && photo.x, 0, 1, 0.5) * 1000) / 1000,
            y: Math.round(clamp(photo && photo.y, 0, 1, 0.5) * 1000) / 1000,
            zoom: Math.round(clamp(photo && photo.zoom, CUSTOM.zoom.min, CUSTOM.zoom.max, 1) * 100) / 100,
          },
        },
      };
    },
    /** Short readable lines for a cart or an order: ["3 panels, side by side", ...]. */
    describe(value) {
      if (!value || value.kind !== "decor-photo") return [];
      const nameOf = (list, id) => (list.find((item) => item.id === id) || { name: id }).name;
      return [
        `${value.panels} panels, ${nameOf(CUSTOM.layouts, value.layout).toLowerCase()}`,
        `Spacing: ${nameOf(CUSTOM.spacing, value.spacing)}`,
        `Frame thickness: ${nameOf(CUSTOM.border, value.border)}`,
        `Your photo: ${value.photo.name} (${value.photo.width} × ${value.photo.height} px)`,
        `Photo position: ${Math.round(value.photo.x * 100)}% across, ${Math.round(value.photo.y * 100)}% down, zoom ${value.photo.zoom}×`,
      ];
    },
  };
})((window.FrameX = window.FrameX || {}));
