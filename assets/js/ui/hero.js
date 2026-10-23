/* ==========================================================================
   Home page hero: one slide per part of the catalogue, shown in turn.

   The slides are the list `heroSlides` in assets/data/site.seed.js. The first
   one is written in index.html (so it is there before any script runs); this
   file builds the others, the tabs under them, and moves between them.

   It moves on by itself every few seconds, and waits while the pointer is
   on one of its buttons or pictures (a link never changes under the cursor),
   while something inside it has keyboard focus, while the tab is in the
   background, when the visitor presses Pause, and for visitors who asked
   their device for reduced motion (they change slides themselves).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, prefersReducedMotion } = FrameX.dom;

  const INTERVAL = 6000;
  const SWIPE = 44; // px a finger must travel sideways to change the slide

  /** Two-line headline: the second line carries the gradient. */
  const title = (lines) => `${esc(lines[0])}${lines[1] ? ` <span>${esc(lines[1])}</span>` : ""}`;

  /** One picture of the gallery wall (layout-hero.css): artwork and designs hang in a frame, photos as prints. */
  function piece(p) {
    const label = esc(p.alt || "");
    // A personalised design is drawn by the template engine, like on the Templates page.
    if (p.template) {
      // Its sample photos wait with the slide's other pictures (see loadImages).
      const html = p.templateData ? FrameX.templateEngine.render(p.templateData, { mode: "sample", label: p.alt || p.templateData.title }).replace(/<img src="/g, '<img data-src="') : "";
      return `<a class="page-hero__piece page-hero__piece--design page-hero__piece--framed" href="${esc(p.href)}" aria-label="${label}"><span class="page-hero__mat">${html}</span></a>`;
    }
    // The artwork alone, in a frame drawn by the page (the product photo already shows one).
    if (p.art) {
      return `<a class="page-hero__piece page-hero__piece--framed" href="${esc(p.href)}" aria-label="${label}"><span class="page-hero__mat"><img data-src="${esc(p.art)}" alt="" width="800" height="1000" decoding="async"></span></a>`;
    }
    return `<a class="page-hero__piece" href="${esc(p.href)}" aria-label="${label}"><img data-src="${esc(p.image)}" alt="" width="800" height="1000" decoding="async"></a>`;
  }

  /** A light that moves from one picture of the wall to the next (layout-hero.css: .is-lit). */
  function spotlight(hero) {
    if (prefersReducedMotion()) return;
    let at = -1;
    setInterval(() => {
      if (document.hidden) return;
      const pieces = $$(".home-hero__slide.is-active .page-hero__piece", hero);
      if (!pieces.length) return;
      at = (at + 1) % pieces.length;
      $$(".page-hero__piece.is-lit", hero).forEach((el) => el.classList.remove("is-lit"));
      pieces[at].classList.add("is-lit");
    }, 1600);
  }

  /*
   * Scrolling stirs the air: the pictures on the wall swing on their nails.
   *
   * Each picture is a small damped pendulum (its angle is the CSS `rotate` property, turning around the nail:
   * transform-origin in layout-hero.css). The scroll speed is the wind: the faster the page moves, the harder it
   * pushes, so a quick flick swings them far and a slow scroll only rocks them. Every picture has its own weight
   * (how fast it swings back and forth), its own friction (how soon it settles) and its own gusts (the wind on it
   * rises and falls on its own rhythm), so the three never move together. When the scrolling stops they swing
   * back and come to rest. Nothing runs while the hero is off screen or after they are still; visitors who asked
   * for less motion get still pictures.
   *
   * On a phone that follows its tilt (tilt(), below) "straight" is where the real ground is: the pictures keep
   * hanging straight down like on a real wall, so on the screen they turn the other way from the phone, as far as
   * it turns: a phone turned upside down shows them upside down over the words, a full turn turns them right
   * round. A turning phone drags them a little on their nails, then they swing back. A shaken phone moves the
   * nails with it; the pictures, slower to follow, swing the other way (as hard as a real picture of that swing
   * would; a hard enough shake throws one right over its nail). There each is a real pendulum, with no limit;
   * everywhere else the swing is softened toward MAX_ANGLE as before. `angle` is how far a picture is from
   * hanging straight; what is drawn is the phone's tilt plus that.
   */
  const SWING = [
    // hz: how fast it swings; damping: how soon it settles (part of the critical); push: how much the wind moves it
    { hz: 1.05, damping: 0.09, push: 1.0 }, // the large upright picture: slow, heavy
    { hz: 0.85, damping: 0.07, push: 0.8 }, // the wide one: slowest, swings longest
    { hz: 1.45, damping: 0.12, push: 1.25 }, // the small square: quick and light
  ];
  const MAX_ANGLE = 14; // degrees; bigger pushes are softened toward this (not while the phone's tilt is followed)
  const DRAG = 0.35; // how much of a turn of the phone the nails pass on to the pictures
  const RAD = Math.PI / 180;

  function swing(hero) {
    if (prefersReducedMotion()) return null;
    const wall = () => $$(".home-hero__slide.is-active .page-hero__wall > .page-hero__piece", hero);
    const state = new WeakMap(); // picture -> { angle, speed, phase, gust }
    let lastY = window.scrollY;
    let lastT = performance.now();
    let wind = 0; // the scroll speed, smoothed (px per second; + = scrolling down)
    let running = false;
    let onScreen = true;
    let target = 0; // the angle on the screen at which the pictures hang straight down (0 unless the phone is tilted)
    let leaning = 0; // target, smoothed
    let heading = 0; // the last way down the phone gave (-180° to 180°); target counts on from it, so it never jumps
    let tilting = false;
    let jolt = 0; // the phone being shaken: how hard it is pushed sideways on the screen (m/s²)
    let joltAt = 0;

    const stateOf = (el, i) => {
      let s = state.get(el);
      if (!s) {
        const k = SWING[i % SWING.length];
        const w = 2 * Math.PI * k.hz;
        s = { angle: 0, speed: 0, k: w * w, c: 2 * k.damping * w, push: k.push, phase: Math.random() * 100, gust: 0.6 + Math.random() * 0.9 };
        state.set(el, s);
      }
      return s;
    };

    const step = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
      lastT = now;
      const y = window.scrollY;
      const raw = (y - lastY) / dt;
      lastY = y;
      wind += (raw - wind) * Math.min(1, dt * 9);
      // The phone's tilt, smoothed (a hand is never quite still), and how far it turned since the last frame
      const before = leaning;
      leaning += (target - leaning) * Math.min(1, dt * 10);
      if (Math.abs(target - leaning) < 0.05) leaning = target;
      const turned = leaning - before;
      if (now - joltAt > 120) jolt = 0; // the shaking stopped (or its sensor went quiet)
      let moving = Math.abs(wind) > 4 || leaning !== target || jolt !== 0;
      wall().forEach((el, i) => {
        const s = stateOf(el, i);
        // The wind on this picture: the scroll speed, with gusts of its own that rise and fall
        const t = now / 1000;
        const gusts = 1 + 0.45 * Math.sin(t * s.gust * 2.3 + s.phase) + 0.25 * Math.sin(t * s.gust * 5.1 + s.phase * 1.7);
        // (a power below 1: a slow scroll still rocks them visibly, a fast one doesn't throw them about)
        const force = Math.sign(wind) * 340 * Math.pow(Math.abs(wind) / 1000, 0.6) * s.push * gusts;
        // A picture under the mouse is held still, so it can be clicked
        const held = el.matches(":hover") ? 6 : 1;
        // A turning phone carries the picture round a little on its nail
        s.angle -= turned * DRAG;
        // A shaken phone: the nail is pushed sideways and the picture swings the other way, as hard as a real
        // pendulum of this picture's swing would (its length is g / k; the push, in degrees, is k / g per m/s²)
        const shaken = ((jolt * s.k) / 9.81) / RAD;
        // Friction, and the drag of the air (stronger the faster it swings)
        const slowing = s.c * held * s.speed + 0.004 * s.speed * Math.abs(s.speed);
        // Springing back to hang straight. Following the phone: a real pendulum, pulled back by the sine of how far
        // it is from hanging straight, and a push along the screen turns it by the cosine of its angle there. The
        // scrolling's wind stays a breeze (at most what would hold a picture 25° out), so a jump down the page
        // never throws one over its nail; the phone's own turns and shakes have no such limit.
        const breeze = (s.k * 0.42) / RAD;
        const accel = tilting
          ? (Math.max(-breeze, Math.min(breeze, force)) + shaken) * Math.cos((leaning + s.angle) * RAD) - (s.k * Math.sin(s.angle * RAD)) / RAD - slowing
          : force + shaken - s.k * s.angle - slowing;
        s.speed += accel * dt;
        s.angle += s.speed * dt;
        // Thrown right over its nail and round: hanging straight again is the same as before the turn
        if (Math.abs(s.angle) > 180) s.angle -= 360 * Math.sign(s.angle);
        const shown = tilting ? leaning + s.angle : MAX_ANGLE * Math.tanh(s.angle / MAX_ANGLE);
        if (Math.abs(s.angle) < 0.01 && Math.abs(s.speed) < 0.02 && Math.abs(wind) <= 4 && jolt === 0) {
          s.angle = 0;
          s.speed = 0;
          if (leaning === 0) el.style.removeProperty("rotate");
          else el.style.rotate = `${shown.toFixed(2)}deg`;
        } else {
          el.style.rotate = `${shown.toFixed(2)}deg`;
          moving = true;
        }
      });
      if (moving && onScreen) requestAnimationFrame(step);
      else running = false;
    };

    const start = () => {
      if (running || !onScreen) return;
      running = true;
      lastT = performance.now();
      requestAnimationFrame(step);
    };
    window.addEventListener("scroll", start, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) {
          lastY = window.scrollY;
          start();
        }
      }).observe(hero);
    }

    return {
      /** The phone's tilt (degrees on the screen at which the pictures hang straight down, -180° to 180°). */
      tiltTo(deg) {
        if (!tilting) {
          tilting = true;
          // The pictures may now turn over the words and buttons and out of the hero (layout-hero.css)
          hero.classList.add("is-tilting");
        }
        // Turned the short way from the last one (179° to -179° is 2° on, not 358° back)
        const turn = ((deg - heading + 540) % 360) - 180;
        if (Math.abs(turn) < 0.3) return; // the small shake of a hand is not a turn
        heading = deg;
        target += turn;
        start();
      },
      /** The phone is shaken: pushed sideways on the screen this hard (m/s²; 0 when it is still). */
      shake(push) {
        jolt = push;
        joltAt = performance.now();
        if (push) start();
      },
      /**
       * A new slide came in. Following the phone, its pictures start again hanging straight down at the phone's
       * tilt (they kept the angle they had when their slide went, maybe upside down, and would show it again).
       */
      wake() {
        if (tilting)
          wall().forEach((el) => {
            state.delete(el);
            if (leaning) el.style.rotate = `${leaning.toFixed(2)}deg`;
            else el.style.removeProperty("rotate");
          });
        start();
      },
      get onScreen() {
        return onScreen;
      },
    };
  }

  /*
   * The phone's tilt and shaking move the pictures (swing(), above). Android phones send them without asking;
   * iPhone and iPad send nothing until the visitor allows it, and Safari only asks after a tap: when no tilt has
   * arrived a moment after the page opened, a small button on the hero ("Tilt your phone") asks for both. Laptops
   * have no such sensors, so nothing changes there. Visitors who asked for less motion get still pictures.
   */
  function tilt(hero, pictures) {
    if (!pictures || !("DeviceOrientationEvent" in window)) return;
    const stage = $("[data-hero-stage]", hero);
    const screenTurn = () => (screen.orientation && typeof screen.orientation.angle === "number" ? screen.orientation.angle : Number(window.orientation) || 0);
    const rad = Math.PI / 180;
    let felt = false; // a real tilt has arrived
    const feltWithin = (ms) =>
      new Promise((done) => {
        const until = performance.now() + ms;
        const look = () => (felt || performance.now() > until ? done(felt) : setTimeout(look, 100));
        look();
      });
    const onTurn = (e) => {
      if (e.beta == null || e.gamma == null) return;
      felt = true;
      if (!pictures.onScreen) return;
      // Which way is down on the screen: the earth's "down" seen from the phone (beta: tipped forward or back,
      // gamma: tipped to a side), then turned with the screen when it is shown sideways
      const b = e.beta * rad;
      const g = e.gamma * rad;
      const x = Math.sin(g) * Math.cos(b);
      const y = -Math.sin(b);
      // A phone lying flat has no "down" on its screen: the pictures stay as they are
      if (Math.hypot(x, y) < 0.35) return;
      let down = Math.atan2(x, -y) / rad + screenTurn();
      down = ((down + 540) % 360) - 180;
      pictures.tiltTo(-down);
    };
    const HAND = 0.5; // m/s²: a hand is never quite still, and walking sways a phone; below this nothing moves
    const onShake = (e) => {
      const m = e.acceleration; // without gravity (null on phones that can't tell them apart)
      if (!m || m.x == null || !pictures.onScreen) return;
      // Sideways on the screen, also when the screen is shown sideways
      const turn = screenTurn() * rad;
      const side = m.x * Math.cos(turn) - (m.y || 0) * Math.sin(turn);
      pictures.shake(Math.abs(side) > HAND ? side - Math.sign(side) * HAND : 0);
    };
    window.addEventListener("deviceorientation", onTurn);
    window.addEventListener("devicemotion", onShake);
    const ask = DeviceOrientationEvent.requestPermission;
    if (typeof ask !== "function" || !(navigator.maxTouchPoints > 0)) return;
    feltWithin(1200).then((already) => {
      if (already) return;
      stage.insertAdjacentHTML("beforeend", `<button class="home-hero__tilt" type="button" data-hero-tilt>${icon("tilt")}<span>Tilt your phone</span></button>`);
      const button = $("[data-hero-tilt]", stage);
      button.addEventListener("click", async () => {
        // Tilt and shaking are asked for together, both straight from the tap (Safari asks only then)
        const asks = [DeviceOrientationEvent, window.DeviceMotionEvent]
          .filter((sensor) => sensor && typeof sensor.requestPermission === "function")
          .map((sensor) => sensor.requestPermission().catch(() => "denied"));
        const answers = await Promise.all(asks);
        button.hidden = true;
        if (!answers.includes("granted")) return FrameX.toast.show("Motion access wasn't allowed, so the frames stay as they are.");
        FrameX.toast.show((await feltWithin(1500)) ? "Tilt or shake your phone: the frames move like on a real wall." : "This device doesn't share its tilt, so the frames stay as they are.");
      });
    });
  }

  /* The label's square dot (the "F." of the logo) runs right over the old words, wiping them away, then comes
     back left over the new ones, uncovering them (owner, 2026-10-23). Only the words to the right of the dot are
     shown (CSS: .eyebrow.is-wiping). One dot at a time: first the old slide's label (its slide stays up, its
     other words fade out on their own: .is-leaving), then the new slide's label (hidden until then:
     .is-waiting). The two labels can sit at different heights, so they never show together. */
  const GAP = 9; // dot 8px + 9px gap = where the words start
  function labelWipe() {
    let raf = 0;
    let busy = [];
    let leaving = null;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const words = (eb) => {
      if (!eb.dataset.words) {
        eb.dataset.words = eb.textContent.trim();
        eb.innerHTML = `<span class="eyebrow__text">${esc(eb.dataset.words)}</span>`;
      }
      return $(".eyebrow__text", eb);
    };
    const at = (eb, x) => {
      eb.style.setProperty("--dot-x", `${x}px`);
      eb.style.setProperty("--dot-turn", `${Math.round(x * 2.5)}deg`); // it rolls as it goes
    };
    const done = (eb) => {
      eb.classList.remove("is-wiping", "is-waiting");
      eb.style.removeProperty("--dot-x");
      eb.style.removeProperty("--dot-turn");
    };
    const letGo = () => {
      if (leaving) leaving.classList.remove("is-leaving");
      leaving = null;
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      busy.forEach(done);
      busy = [];
      letGo();
    };
    return (from, to) => {
      stop();
      if (!from || !to || prefersReducedMotion()) return;
      const outWidth = words(from).getBoundingClientRect().width;
      words(to);
      busy = [from, to];
      leaving = from.closest(".home-hero__slide");
      leaving.classList.add("is-leaving");
      from.classList.add("is-wiping");
      at(from, 0);
      to.classList.add("is-wiping", "is-waiting");
      const OUT = 420;
      const IN = 560;
      let inWidth = 0;
      const start = performance.now();
      const step = (now) => {
        const t = now - start;
        if (t < OUT) {
          at(from, ease(t / OUT) * (outWidth + GAP));
        } else {
          if (!inWidth) {
            // the old label is gone: its slide may leave now; the new label's dot starts at the end of its words
            done(from);
            letGo();
            inWidth = words(to).getBoundingClientRect().width;
            at(to, inWidth + GAP);
            to.classList.remove("is-waiting");
          }
          const k = Math.min(1, (t - OUT) / IN);
          at(to, (1 - ease(k)) * (inWidth + GAP));
          if (k >= 1) return stop();
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
  }

  // Phones: how it works, in three small boxes under the frames slide's buttons (hidden on wider screens)
  const STEPS = `<ol class="hero-steps" aria-label="How it works"><li><b>1</b>Choose a frame</li><li><b>2</b>Add your photo</li><li><b>3</b>We deliver it</li></ol>`;

  const slideHtml = (s, i, total) => `<div class="home-hero__slide page-hero__grid" role="group" aria-roledescription="slide" aria-label="${esc(s.label)}, ${i + 1} of ${total}" data-slide="${esc(s.id)}">
      <div class="home-hero__copy">
        <p class="eyebrow">${esc(s.eyebrow)}</p>
        <h2 class="page-hero__title">${title(s.title)}</h2>
        <p class="page-hero__lead">${esc(s.lead)}</p>
        <div class="page-hero__actions">${s.actions
          .map((a, n) => `<a class="btn ${n === 0 ? "btn--primary" : "btn--light"}" href="${esc(a.href)}">${esc(a.label)}${n === 0 ? " " + icon("arrow-right", "icon--nudge") : ""}</a>`)
          .join("")}</div>
        ${s.id === "frames" ? STEPS : ""}
      </div>
      <div class="page-hero__wall">${s.pieces.map(piece).join("")}</div>
    </div>`;

  /** Slides that show personalised designs need those designs first. */
  async function withTemplates(slides) {
    const wanted = slides.flatMap((s) => s.pieces).filter((p) => p.template);
    if (!wanted.length || !FrameX.templateEngine) return slides.filter((s) => !s.pieces.some((p) => p.template));
    await Promise.all(
      wanted.map(async (p) => {
        try {
          p.templateData = await FrameX.api.getTemplate(p.template);
        } catch {
          p.templateData = null;
        }
      }),
    );
    // A slide whose designs can't be drawn is left out rather than shown with gaps.
    return slides.filter((s) => s.pieces.every((p) => !p.template || p.templateData));
  }

  /** Laptops: the wall of pictures leans a little toward the pointer (layout-hero.css reads --tilt-x / --tilt-y). */
  function lean(hero) {
    if (prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let waiting = 0;
    hero.addEventListener("pointermove", (e) => {
      if (waiting) return;
      waiting = requestAnimationFrame(() => {
        waiting = 0;
        const r = hero.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        hero.style.setProperty("--tilt-x", `${(x * 10).toFixed(2)}deg`);
        hero.style.setProperty("--tilt-y", `${(-y * 7).toFixed(2)}deg`);
      });
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--tilt-x", "0deg");
      hero.style.setProperty("--tilt-y", "0deg");
    });
  }

  async function init() {
    const hero = $("[data-hero]");
    const stage = hero && $("[data-hero-stage]", hero);
    const all = (FrameX.seed.site && FrameX.seed.site.heroSlides) || [];
    let pictures = null;
    if (stage) {
      lean(hero);
      spotlight(hero);
      pictures = swing(hero);
      tilt(hero, pictures);
    }
    if (!stage || all.length < 2) return;
    const slides = await withTemplates(all.map((s) => ({ ...s, pieces: s.pieces.map((p) => ({ ...p })) })));
    if (slides.length < 2) return;

    // The first slide is already in the page; add the rest after it.
    const first = $(".home-hero__slide", stage);
    first.setAttribute("aria-label", `${slides[0].label}, 1 of ${slides.length}`);
    first.insertAdjacentHTML("afterend", slides.slice(1).map((s, i) => slideHtml(s, i + 1, slides.length)).join(""));
    const els = $$(".home-hero__slide", stage);

    // Laptop / tablet: the words are centred (beside or above the pictures) and each slide has more or fewer
    // lines. All the word blocks get the height of the tallest, so every slide's label (and heading) starts on
    // the same line and the label changes in place (owner, 2026-10-23). Phones: already lined up at the top.
    const copies = els.map((el) => $(".home-hero__copy", el));
    const sideBySide = window.matchMedia("(min-width: 640px)");
    const evenCopy = () => {
      copies.forEach((c) => (c.style.minHeight = ""));
      if (!sideBySide.matches) return;
      const tallest = Math.max(...copies.map((c) => c.offsetHeight));
      copies.forEach((c) => (c.style.minHeight = `${tallest}px`));
    };
    evenCopy();
    let evenLater = 0;
    window.addEventListener("resize", () => (cancelAnimationFrame(evenLater), (evenLater = requestAnimationFrame(evenCopy))));
    if (document.fonts) document.fonts.ready.then(evenCopy);

    const tabs = $("[data-hero-tabs]", hero);
    tabs.innerHTML = slides.map((s, i) => `<button class="home-hero__tab" type="button" data-hero-tab="${i}" aria-current="${i === 0}">${esc(s.label)}</button>`).join("");
    const tabEls = $$("[data-hero-tab]", tabs);
    const toggle = $("[data-hero-toggle]", hero);
    $("[data-hero-bar]", hero).hidden = false;
    hero.style.setProperty("--hero-interval", INTERVAL + "ms");

    let index = 0;
    let timer = null;
    const wipe = labelWipe();
    let userPaused = prefersReducedMotion();
    const held = new Set(); // reasons the rotation is on hold right now: "hover", "focus", "hidden"

    /** Pictures are fetched one slide ahead, not all at once. */
    const loadImages = (i) => $$("img[data-src]", els[(i + els.length) % els.length]).forEach((img) => ((img.src = img.dataset.src), img.removeAttribute("data-src")));

    function show(next) {
      next = (next + els.length) % els.length;
      if (next === index) return;
      loadImages(next);
      wipe($(".eyebrow", els[index]), $(".eyebrow", els[next]));
      els.forEach((el, i) => {
        el.classList.toggle("is-active", i === next);
        el.inert = i !== next;
      });
      tabEls.forEach((t, i) => t.setAttribute("aria-current", String(i === next)));
      const glow = slides[next].glow;
      if (glow) hero.style.setProperty("--hero-glow", `rgba(${glow}, 0.2)`);
      else hero.style.removeProperty("--hero-glow");
      const tint = slides[next].tint;
      if (tint) hero.style.setProperty("--hero-tint", tint);
      else hero.style.removeProperty("--hero-tint");
      index = next;
      loadImages(next + 1);
      if (pictures) pictures.wake();
      // Keep the current tab in view without moving the page.
      const row = tabs;
      const tab = tabEls[next];
      const left = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
      row.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      schedule();
    }

    const playing = () => !userPaused && held.size === 0;

    function schedule() {
      clearTimeout(timer);
      hero.classList.toggle("is-playing", !userPaused);
      hero.classList.toggle("is-held", held.size > 0);
      // Restart the progress line on the current tab.
      if (!userPaused) {
        hero.classList.remove("is-playing");
        void hero.offsetWidth;
        hero.classList.add("is-playing");
      }
      if (playing()) timer = setTimeout(() => show(index + 1), INTERVAL);
    }

    function hold(reason, on) {
      const before = held.size;
      if (on) held.add(reason);
      else held.delete(reason);
      if (before === held.size) return;
      // Coming back from a hold starts the wait again, so a slide is never cut short.
      schedule();
    }

    function syncToggle() {
      toggle.setAttribute("aria-pressed", String(userPaused));
      toggle.setAttribute("aria-label", userPaused ? "Play slides" : "Pause slides");
      toggle.innerHTML = icon(userPaused ? "play" : "pause");
    }

    els.forEach((el, i) => (el.inert = i !== 0));
    loadImages(1);
    syncToggle();

    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-hero-tab]");
      if (tab) show(Number(tab.dataset.heroTab));
    });
    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      show(index + (event.key === "ArrowRight" ? 1 : -1));
      tabEls[index].focus({ preventScroll: true });
    });
    $("[data-hero-prev]", hero).addEventListener("click", () => show(index - 1));
    $("[data-hero-next]", hero).addEventListener("click", () => show(index + 1));
    toggle.addEventListener("click", () => {
      userPaused = !userPaused;
      syncToggle();
      schedule();
    });

    hero.addEventListener("pointerover", (e) => e.pointerType === "mouse" && hold("hover", Boolean(e.target.closest("a, button"))));
    hero.addEventListener("pointerleave", () => hold("hover", false));
    // Keyboard focus only: a mouse click on a tab or an arrow must not leave the hero waiting.
    hero.addEventListener("focusin", (e) => hold("focus", e.target.matches(":focus-visible")));
    hero.addEventListener("focusout", (e) => !hero.contains(e.relatedTarget) && hold("focus", false));
    document.addEventListener("visibilitychange", () => hold("hidden", document.hidden));

    // Swipe on touch screens.
    let start = null;
    stage.addEventListener("pointerdown", (e) => {
      start = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener("pointerup", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener("pointercancel", () => (start = null));

    schedule();
  }

  FrameX.homeHero = { init };
})((window.FrameX = window.FrameX || {}));
