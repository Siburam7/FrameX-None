/* ==========================================================================
   Live Demo ("View on My Wall") — the screen.

   A full-screen layer over the page: the camera with the customer's piece on
   the wall, a few large controls, short instructions. It is the same screen
   for both modes; a mode is only asked what it can do (engine.features):

     AR mode      ld-xr.js      real wall detection and real size, where the phone has it
     camera mode  ld-camera.js  live camera + the customer places the piece, everywhere else

   FrameX.liveDemoView.open(spec, { returnFocus, context }) -> Promise (settles when it is closed)
     spec     what to show (ld-subject.js). It is read once: the page behind is untouched,
              so the customer's design, photo, size and options are exactly as they left them.

   Privacy: the camera is asked for only after the customer presses "Open camera",
   it is stopped on Close, on leaving the page and when the page goes to the
   background, and no picture is made unless they press "Save photo" (which
   saves on their own device). Nothing is sent to FrameX.

   Events for analytics (no pictures, no positions): FrameX.liveDemo.track(name, detail)
     live_demo_opened, camera_permission_granted, camera_permission_denied,
     surface_detected, frame_placed, frame_repositioned, live_demo_closed
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const track = (name, detail) => FrameX.liveDemo && FrameX.liveDemo.track && FrameX.liveDemo.track(name, detail);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const SCALE = { min: 0.3, max: 3 };
  const DETECT_SECONDS = 14; // how long to look for a wall before offering to place it by hand
  const isApple = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform || "") && navigator.maxTouchPoints > 1);

  /* The words on screen. Kept together so they can be read (and changed) in one place. */
  const TEXT = {
    ar: {
      starting: "Starting AR…",
      scanning: "Move your phone slowly to detect a wall.",
      floor: "That is a floor or a table. Point at a wall.",
      detected: "Wall detected. Tap to place your frame.",
      placed: "Drag to reposition.",
      placedManual: "Placed by you. Use Nearer and Farther until it sits on the wall.",
      lost: "Lost track of the room. Move your phone slowly.",
      failed: "Couldn't detect a suitable surface. Try moving your camera slowly toward a clear wall.",
    },
    camera: {
      starting: "Starting camera…",
      aim: "Point your camera at a clear wall.",
      placed: "Drag to reposition. Pinch to resize.",
      placedMouse: "Drag to move. Scroll to resize.",
    },
    errors: {
      DENIED: {
        title: "Camera access is required for Live Demo.",
        body: "FrameX needs your camera to show the frame on your wall. To allow it: tap the lock or camera icon next to the website address, open Permissions (or Site settings), set Camera to Allow, then try again. On an iPhone: Settings, then your browser (Safari or Chrome), then Camera, then Allow.",
        retry: true,
      },
      NO_CAMERA: { title: "No camera was found.", body: "Live Demo needs a camera. Try it on your phone.", retry: false },
      BUSY: { title: "The camera is in use.", body: "Another app or tab is using the camera. Close it, then try again.", retry: true },
      UNSUPPORTED: { title: "Live Demo can't open the camera in this browser.", body: "Try the latest Chrome or Safari on your phone.", retry: false },
      RENDER: { title: "This device can't draw the live preview.", body: "You can still see your design in the preview on the page.", retry: false },
      ASSET: { title: "We couldn't load this design for the wall.", body: "Check your internet connection, then try again.", retry: true },
      DATA: { title: "This design can't be shown on a wall yet.", body: "Choose a size first, then try again.", retry: false },
      INTERRUPTED: { title: "The camera stopped.", body: "Something else took the camera. You can start it again.", retry: true },
    },
  };

  let current = null; // only one Live Demo at a time

  function open(spec, { returnFocus = null, context = {} } = {}) {
    if (current) return current.done;
    const state = {
      root: null,
      engine: null,
      subject: null,
      mode: "intro",
      placed: false,
      arFailed: false,
      touched: false,
      openedAt: Date.now(),
      detectTimer: 0,
      lastMoveEvent: 0,
      closed: false,
      cleanups: [],
    };
    let finish;
    const done = new Promise((resolve) => (finish = resolve));
    current = { done, close: () => close() };

    const root = document.createElement("div");
    state.root = root;
    root.className = "ld";
    root.dataset.mode = "intro";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "ld-title");
    root.innerHTML = `
      <div class="ld__stage" data-stage tabindex="0" role="application" aria-label="Your frame on the wall. Drag to move it, pinch or scroll to resize it, turn it with two fingers. Arrow keys move it, plus and minus resize it."></div>
      <div class="ld__top">
        <button class="ld-pill ld-pill--close" type="button" data-close>${icon("close")}<span>Close</span></button>
        <p class="ld__status" role="status" aria-live="polite"><span class="ld__dot" aria-hidden="true"></span><span data-status></span></p>
      </div>
      <div class="ld__bottom">
        <p class="ld__size" data-size></p>
        <div class="ld__tools" data-tools></div>
      </div>
      <div class="ld__panel" data-panel></div>
      <p class="ld__toast" data-toast role="status" aria-live="polite" hidden></p>`;
    document.body.appendChild(root);
    document.documentElement.classList.add("ld-lock");
    const stage = $("[data-stage]", root);
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      state.cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    /* ---------------------------------------------------------------- words on screen */
    const setStatus = (text, tone = "") => {
      $("[data-status]", root).textContent = text;
      root.dataset.tone = tone;
    };
    let toastTimer = 0;
    function toast(text) {
      const el = $("[data-toast]", root);
      el.textContent = text;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), 3200);
    }

    function panel(html) {
      const el = $("[data-panel]", root);
      el.innerHTML = html ? `<div class="ld__card">${html}</div>` : "";
      el.hidden = !html;
      root.classList.toggle("has-panel", Boolean(html));
      const first = html && ($("[data-primary]", el) || $("button", el));
      if (first) first.focus();
    }

    function sizeLine() {
      const s = state.subject;
      const e = state.engine;
      const el = $("[data-size]", root);
      if (!s || !e) return (el.textContent = "");
      const pct = Math.round(e.placement.scale * 100);
      const resized = Math.abs(e.placement.scale - 1) > 0.01;
      if (resized) el.innerHTML = `<strong>Resized to ${pct}%</strong><span>Not the real size. Press Reset to go back.</span>`;
      else if (e.features.realScale) el.innerHTML = `<strong>${esc(s.sizeText)}</strong><span>${e.manual ? "Real size, on a wall you placed" : "Shown at its real size"}</span>`;
      else el.innerHTML = `<strong>${esc(s.sizeText)}</strong><span>Approximate size for a wall about ${e.distance} m away</span>`;
    }

    /* ---------------------------------------------------------------- the controls of a mode */
    const tool = (act, iconName, label, extra = "") => `<button class="ld-tool" type="button" data-act="${act}" ${extra}>${icon(iconName)}<span>${esc(label)}</span></button>`;
    function tools() {
      const e = state.engine;
      const el = $("[data-tools]", root);
      if (!e) return (el.innerHTML = "");
      const list = [];
      if (e.mode === "ar") {
        const st = e.state;
        if (!state.placed) {
          if (st === "detected") list.push(`<button class="ld-pill ld-pill--primary" type="button" data-act="place">${icon("check")}<span>Place frame here</span></button>`);
          if (state.arFailed) list.push(`<button class="ld-pill" type="button" data-act="manual">${icon("hand")}<span>Place it yourself</span></button>`);
        } else {
          list.push(tool("reset", "refresh", "Reset"));
          list.push(tool("move", "move", "Move"));
          if (e.features.nudge) list.push(tool("nearer", "minus", "Nearer"), tool("farther", "plus", "Farther"));
        }
      } else {
        list.push(tool("reset", "refresh", "Reset"));
        list.push(tool("distance", "ruler", `${e.distance} m away`, `aria-label="Distance to the wall: ${e.distance} metres. Press to change."`));
        if (e.features.motion) list.push(tool("motion", "pin", "Stick to wall", `aria-pressed="${e.motion ? "true" : "false"}"`));
        list.push(tool("save", "download", "Save photo"));
      }
      el.innerHTML = list.join("");
    }

    function refresh() {
      const e = state.engine;
      if (!e) return;
      if (e.mode === "ar") {
        const st = e.state;
        const words = TEXT.ar;
        setStatus(st === "placed" ? (e.manual ? words.placedManual : words.placed) : state.arFailed && st !== "detected" ? words.failed : words[st] || words.scanning, st === "detected" || st === "placed" ? "good" : state.arFailed ? "warn" : "");
      } else setStatus(state.touched ? (matchMedia("(pointer: fine)").matches ? TEXT.camera.placedMouse : TEXT.camera.placed) : TEXT.camera.aim, state.touched ? "good" : "");
      tools();
      sizeLine();
    }

    /* ---------------------------------------------------------------- moving the piece */
    const pointers = new Map();
    let gesture = null;
    const wallPoint = (x, y) => (state.engine && state.engine.screenToWall ? state.engine.screenToWall(x, y) : null);
    const canMove = () => state.engine && (state.engine.mode === "camera" || state.placed);

    function startGesture() {
      const e = state.engine;
      const pts = [...pointers.values()];
      if (!e || !pts.length) return (gesture = null);
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
      gesture = {
        count: pts.length,
        grab: wallPoint(mid.x, mid.y),
        u: e.placement.u,
        v: e.placement.v,
        scale: e.placement.scale,
        roll: e.placement.roll,
        spread: pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0,
        angle: pts.length > 1 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : 0,
        moved: false,
        at: Date.now(),
        from: mid,
      };
    }

    function moveGesture() {
      const e = state.engine;
      const pts = [...pointers.values()];
      if (!e || !gesture || !pts.length || !canMove()) return;
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
      if (Math.hypot(mid.x - gesture.from.x, mid.y - gesture.from.y) > 6) gesture.moved = true;
      if (pts.length > 1 && gesture.spread > 0) {
        const spread = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        e.placement.scale = clamp(gesture.scale * (spread / gesture.spread), SCALE.min, SCALE.max);
        // The screen's y runs down and the wall's y runs up: a clockwise twist on screen is a clockwise turn of the piece.
        e.placement.roll = gesture.roll - (angle - gesture.angle);
        gesture.moved = true;
      }
      // The point of the wall that was under the finger stays under it.
      e.placement.u = gesture.u;
      e.placement.v = gesture.v;
      const now = wallPoint(mid.x, mid.y);
      if (gesture.grab && now) {
        e.placement.u = gesture.u + (now[0] - gesture.grab[0]);
        e.placement.v = gesture.v + (now[1] - gesture.grab[1]);
      }
      e.changed();
      if (gesture.moved && !state.touched) {
        state.touched = true;
        refresh();
      } else sizeLine();
    }

    function endGesture(tap) {
      const e = state.engine;
      if (!e) return;
      if (gesture && gesture.moved) {
        // A piece turned almost straight is set exactly straight (or on its side).
        const quarter = Math.PI / 2;
        const nearest = Math.round(e.placement.roll / quarter) * quarter;
        if (Math.abs(e.placement.roll - nearest) < 0.05) e.placement.roll = nearest;
        e.changed();
        if (Date.now() - state.lastMoveEvent > 1500) {
          state.lastMoveEvent = Date.now();
          track("frame_repositioned", { mode: e.mode, scale: Math.round(e.placement.scale * 100) });
        }
        sizeLine();
      } else if (tap && e.mode === "ar" && !state.placed) placeNow();
    }

    on(stage, "pointerdown", (ev) => {
      if (!state.engine || root.classList.contains("has-panel")) return;
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      try {
        stage.setPointerCapture(ev.pointerId); // a finger that slides onto a button keeps moving the piece
      } catch (error) {
        /* not every pointer can be captured: the drag still works while it stays on the screen */
      }
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      startGesture();
      ev.preventDefault();
    });
    on(stage, "pointermove", (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      moveGesture();
    });
    const release = (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      const wasTap = gesture && !gesture.moved && Date.now() - gesture.at < 450 && pointers.size === 1 && ev.type === "pointerup";
      const finished = gesture;
      pointers.delete(ev.pointerId);
      if (pointers.size) {
        const moved = gesture && gesture.moved;
        startGesture(); // a finger lifted: carry on with the ones still down
        if (gesture) gesture.moved = Boolean(moved);
      } else {
        gesture = finished;
        endGesture(wasTap);
        gesture = null;
      }
    };
    on(stage, "pointerup", release);
    on(stage, "pointercancel", release);
    on(
      stage,
      "wheel",
      (ev) => {
        const e = state.engine;
        if (!e || !canMove()) return;
        ev.preventDefault();
        if (ev.shiftKey) e.placement.roll += (ev.deltaY || ev.deltaX) * 0.0015;
        else e.placement.scale = clamp(e.placement.scale * Math.exp(-ev.deltaY * 0.0012), SCALE.min, SCALE.max);
        e.changed();
        state.touched = true;
        refresh();
      },
      { passive: false },
    );
    on(stage, "keydown", (ev) => {
      const e = state.engine;
      if (!e) return;
      if ((ev.key === "Enter" || ev.key === " ") && e.mode === "ar" && !state.placed) {
        ev.preventDefault();
        return placeNow();
      }
      if (!canMove()) return;
      const step = ev.shiftKey ? 0.1 : 0.02;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[ev.key];
      if (moves) {
        e.placement.u += moves[0];
        e.placement.v += moves[1];
      } else if (ev.key === "+" || ev.key === "=") e.placement.scale = clamp(e.placement.scale * 1.05, SCALE.min, SCALE.max);
      else if (ev.key === "-" || ev.key === "_") e.placement.scale = clamp(e.placement.scale / 1.05, SCALE.min, SCALE.max);
      else if (ev.key === "[" || ev.key === ",") e.placement.roll += Math.PI / 90;
      else if (ev.key === "]" || ev.key === ".") e.placement.roll -= Math.PI / 90;
      else if (ev.key === "0" || ev.key.toLowerCase() === "r") e.reset();
      else return;
      ev.preventDefault();
      e.changed();
      state.touched = true;
      refresh();
    });

    /* ---------------------------------------------------------------- AR: placing */
    function placeNow() {
      const e = state.engine;
      if (!e || e.mode !== "ar" || !e.place()) return;
      state.placed = true;
      clearTimeout(state.detectTimer);
      track("frame_placed", { mode: "ar", manual: false });
      refresh();
    }
    function watchDetection() {
      clearTimeout(state.detectTimer);
      state.detectTimer = setTimeout(() => {
        if (state.closed || state.placed || !state.engine || state.engine.mode !== "ar") return;
        state.arFailed = true;
        refresh();
      }, DETECT_SECONDS * 1000);
    }

    /* ---------------------------------------------------------------- buttons */
    async function act(name) {
      const e = state.engine;
      if (!e) return;
      if (name === "place") return placeNow();
      if (name === "manual") {
        if (e.placeManually()) {
          state.placed = true;
          track("frame_placed", { mode: "ar", manual: true });
        }
      } else if (name === "reset") {
        e.reset();
        e.changed();
      } else if (name === "move") {
        e.pickUp();
        state.placed = false;
        state.arFailed = false;
        watchDetection();
      } else if (name === "nearer") e.nudge(-0.1);
      else if (name === "farther") e.nudge(0.1);
      else if (name === "distance") {
        const list = e.DISTANCES;
        e.setDistance(list[(list.indexOf(e.distance) + 1) % list.length]);
      } else if (name === "motion") {
        const now = e.setMotion(!e.motion);
        toast(now ? "The frame now stays on the wall when you turn your phone." : "The frame now stays where it is on the screen.");
      } else if (name === "save") return save();
      refresh();
    }

    async function save() {
      const e = state.engine;
      const blob = await e.capture();
      if (!blob) return toast("The picture couldn't be made. Please try again.");
      const name = `framex-on-my-wall-${new Date().toISOString().slice(0, 10)}.jpg`;
      try {
        const file = new File([blob], name, { type: "image/jpeg" });
        // An iPhone saves to Photos from its share sheet; elsewhere the picture is downloaded.
        if (isApple() && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "FrameX on my wall" });
          return;
        }
      } catch (error) {
        if (error && error.name === "AbortError") return; // the customer closed the share sheet
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      root.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Saved to your device. It was not sent anywhere.");
    }

    on(root, "click", (ev) => {
      if (ev.target.closest("[data-close]")) return close();
      const button = ev.target.closest("[data-act]");
      if (button) return act(button.dataset.act);
      const go = ev.target.closest("[data-go]");
      if (go) return go.dataset.go === "prepare" ? prepare() : start(go.dataset.go);
      if (ev.target.closest("[data-resume]")) return resume();
    });
    // Someone using a keyboard gets a visible outline on the picture while it has focus; touch and mouse don't.
    on(root, "keydown", (ev) => ev.key !== "Escape" && root.classList.add("ld--keys"), true);
    on(root, "pointerdown", () => root.classList.remove("ld--keys"), true);
    on(root, "keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        return close();
      }
      if (FrameX.overlay) FrameX.overlay.trapFocus(root, ev);
    });

    /* ---------------------------------------------------------------- start: AR where the phone has it, else the camera */
    function intro(arAvailable) {
      const s = state.subject;
      const missing = s && s.missingPhotos ? `<p class="ld__note">${icon("image")}<span>${s.missingPhotos === 1 ? "Your photo isn't added yet, so its place is shown empty." : "Some photos aren't added yet, so their places are shown empty."}</span></p>` : "";
      panel(`
        <span class="ld__badge">${icon("camera")}</span>
        <h2 id="ld-title">View on My Wall</h2>
        <p class="ld__what">${esc(s.title)}<br><strong>${esc(s.sizeText)}</strong></p>
        <p>${
          arAvailable
            ? "Your phone can find your wall and show this at its real size. Point the camera at a wall and move the phone slowly."
            : "Your camera opens and this is shown on top of it. You put it on your wall yourself, so its size is an estimate."
        }</p>
        ${missing}
        <p class="ld__private">${icon("lock")}<span>The camera is used only on this screen. Nothing is recorded or sent to FrameX.</span></p>
        <div class="ld__actions">
          <button class="btn btn--primary" type="button" data-go="${arAvailable ? "ar" : "camera"}" data-primary>${icon("camera")} Open camera</button>
          ${arAvailable ? `<button class="btn btn--light" type="button" data-go="camera">Use the simple camera view</button>` : ""}
          <button class="btn btn--light" type="button" data-close>Not now</button>
        </div>`);
    }

    /** Says what went wrong, in plain words. again: what "Try again" does ("camera", "ar" or "prepare"). */
    function problem(code, { again = "camera" } = {}) {
      const p = TEXT.errors[code] || TEXT.errors.UNSUPPORTED;
      root.dataset.mode = "intro";
      panel(`
        <span class="ld__badge ld__badge--warn">${icon("alert")}</span>
        <h2 id="ld-title">${esc(p.title)}</h2>
        <p>${esc(p.body)}</p>
        <div class="ld__actions">
          ${p.retry ? `<button class="btn btn--primary" type="button" data-go="${again}" data-primary>Try again</button>` : ""}
          <button class="btn btn--light" type="button" data-close${p.retry ? "" : " data-primary"}>Close</button>
        </div>`);
    }

    async function start(wanted) {
      if (state.busy) return;
      state.busy = true;
      // The motion sensor has to be asked for straight from this tap (iPhone), before anything else waits.
      const camera = FrameX.ldCamera.create();
      const motion = camera.askMotion();
      panel(`<span class="ld__badge">${icon("camera")}</span><h2 id="ld-title">${wanted === "ar" ? "Starting AR…" : "Starting camera…"}</h2><p>If your browser asks, allow the camera.</p>`);
      if (state.engine) {
        await state.engine.stop();
        state.engine = null;
      }
      state.placed = false;
      state.arFailed = false;
      state.touched = false;
      try {
        if (wanted === "ar") {
          const ar = FrameX.ldXR.create();
          try {
            await ar.start(root, state.subject, {
              onState(next) {
                if (next === "detected") track("surface_detected", { mode: "ar" });
                refresh();
              },
              onEnd: () => close({ fromEngine: true }), // the phone ended AR (Back button, another app)
            });
            state.engine = ar;
            state.mode = "ar";
            root.dataset.mode = "ar";
            track("camera_permission_granted", { mode: "ar" });
            panel("");
            watchDetection();
            refresh();
            stage.focus({ preventScroll: true });
            state.busy = false;
            return;
          } catch (error) {
            // AR didn't start (not installed, refused, no screen layer): the camera view works everywhere.
          }
        }
        await motion;
        await camera.start(root, state.subject, {
          onInterrupted() {
            if (state.closed || state.paused) return;
            problem("INTERRUPTED");
          },
          onMotion: () => refresh(),
        });
        state.engine = camera;
        state.mode = "camera";
        state.placed = true; // nothing is detected in this mode: the piece is simply shown, for the customer to put in place
        root.dataset.mode = "camera";
        track("camera_permission_granted", { mode: "camera" });
        track("frame_placed", { mode: "camera", manual: true });
        panel("");
        refresh();
        stage.focus({ preventScroll: true });
      } catch (error) {
        const code = (error && error.code) || "UNSUPPORTED";
        if (code === "DENIED") track("camera_permission_denied", { mode: "camera" });
        else if (!TEXT.errors[code]) console.error("Live Demo could not start", error);
        problem(code);
      }
      state.busy = false;
    }

    /* The page went to the background: the camera is let go at once and asked for again only when the customer says so. */
    on(document, "visibilitychange", () => {
      const e = state.engine;
      if (!e || e.mode !== "camera" || state.closed) return;
      if (document.hidden) {
        state.paused = true;
        e.pause();
      } else if (state.paused) {
        panel(`<span class="ld__badge">${icon("camera")}</span><h2 id="ld-title">Camera paused</h2><p>The camera was turned off while you were away.</p>
          <div class="ld__actions"><button class="btn btn--primary" type="button" data-resume data-primary>${icon("camera")} Turn the camera on again</button><button class="btn btn--light" type="button" data-close>Close</button></div>`);
      }
    });
    async function resume() {
      const e = state.engine;
      if (!e) return;
      try {
        await e.resume();
        state.paused = false;
        panel("");
        refresh();
      } catch (error) {
        problem((error && error.code) || "UNSUPPORTED");
      }
    }
    on(window, "pagehide", () => close());

    /* ---------------------------------------------------------------- close: the camera stops, the page is as it was */
    async function close({ fromEngine = false } = {}) {
      if (state.closed) return;
      state.closed = true;
      clearTimeout(state.detectTimer);
      clearTimeout(toastTimer);
      const e = state.engine;
      state.engine = null;
      if (e && !fromEngine) {
        try {
          await e.stop();
        } catch (error) {
          /* it is stopped either way */
        }
      } else if (e) e.stop();
      state.cleanups.splice(0).forEach((fn) => fn());
      root.remove();
      document.documentElement.classList.remove("ld-lock");
      current = null;
      track("live_demo_closed", { mode: state.mode, placed: state.placed, seconds: Math.round((Date.now() - state.openedAt) / 1000) });
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      finish({ mode: state.mode, placed: state.placed });
    }
    current.close = close;

    /* ---------------------------------------------------------------- prepare, then ask */
    function prepare() {
      panel(`<span class="ld__badge">${icon("camera")}</span><h2 id="ld-title">View on My Wall</h2><p>Getting your design ready…</p>`);
      return Promise.all([FrameX.ldSubject.build(spec), FrameX.ldXR.supported()])
        .then(([subject, ar]) => {
          if (state.closed) return;
          state.subject = subject;
          state.arAvailable = ar;
          intro(ar);
        })
        .catch((error) => {
          if (state.closed) return;
          if (!(error && error.code)) console.error("Live Demo could not prepare the design", error);
          problem(error && error.code === "ASSET" ? "ASSET" : "DATA", { again: "prepare" });
        });
    }
    track("live_demo_opened", Object.assign({ kind: spec && spec.kind }, context));
    prepare();

    // For tests and for support: what the Live Demo is doing right now.
    current.inspect = () => ({ mode: state.mode, placed: state.placed, arFailed: state.arFailed, engine: state.engine, subject: state.subject, root });
    return done;
  }

  FrameX.liveDemoView = {
    open,
    close: () => (current ? current.close() : Promise.resolve()),
    isOpen: () => Boolean(current),
    inspect: () => (current && current.inspect ? current.inspect() : null),
  };
})((window.FrameX = window.FrameX || {}));
