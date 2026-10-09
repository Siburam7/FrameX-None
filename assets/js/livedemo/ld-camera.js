/* ==========================================================================
   Live Demo ("View on My Wall") — camera mode.

   For every phone and browser that has a camera but no AR (WebXR) support:
   iPhones, older Android phones, laptops with a webcam.

   What it really does, and what it does not:
     - shows the live camera (never a still photo) with the customer's piece drawn over it in 3D;
     - uses the phone's MOTION SENSOR, when there is one, so the piece keeps its place and its
       perspective while the phone is turned (it follows turning, not walking);
     - can NOT see the wall. Nothing is "detected": the customer puts the piece where the wall is.
       Its size on screen is worked out from the real size, the distance the customer says they
       stand from the wall, and a typical phone-camera angle of view, so it is an estimate.
   The Live Demo says so on screen ("approximate size"). Real wall detection is ld-xr.js.

   The camera opens only when start() is called, stops in stop(), and its pictures never
   leave the page: nothing is recorded or uploaded. capture() makes one picture on the
   customer's own device, only when they press Save.
   ========================================================================== */
(function (FrameX) {
  const M = () => FrameX.ldMath;
  const FOV_LONG_DEG = 60; // assumed angle of view along the long side of a phone camera's video picture
  const DISTANCES = [1, 1.5, 2, 3, 4]; // metres between the customer and the wall

  /** What went wrong, in a form the screen can explain. */
  function cameraProblem(error) {
    const name = (error && error.name) || "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "DENIED";
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "NO_CAMERA";
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "BUSY";
    return "UNSUPPORTED";
  }

  /* ---------------------------------------------------------------- The motion sensor
     iPhones ask the customer once ("motion and orientation access"); it has to be asked from a tap. */
  function askMotionPermission() {
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return Promise.resolve(false);
      if (typeof D.requestPermission === "function")
        return D.requestPermission()
          .then((answer) => answer === "granted")
          .catch(() => false);
      return Promise.resolve(true);
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function create() {
    let root, video, canvas, renderer, stream, subject;
    let handlers = {};
    let running = false;
    let raf = 0;
    let dirty = true;
    let useMotion = false; // the customer's choice ("Stick to wall")
    let motionAllowed = false;
    let quat = null; // the camera's rotation from the sensor, smoothed
    let aim = null; // the sensor's latest reading, which quat follows a little every frame
    let distance = 2;
    let wall = null; // pose of the wall: x right, y up, z towards the camera
    let view = M().identity();
    let projection = M().identity();
    let pixelRatio = 1;
    const placement = { u: 0, v: 0, scale: 1, roll: 0 };
    // motion becomes true only when the sensor has really spoken: a laptop has the API but no sensor behind it.
    const features = { detection: false, realScale: false, save: true, distance: true, motion: false, nudge: false };
    const cleanups = [];
    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    // Once the sensor has spoken its last reading stays in use: a phone lying still sends nothing new.
    const hasSensor = () => Boolean(useMotion && motionAllowed && quat);
    const worldUp = () => (hasSensor() ? [0, 0, 1] : [0, 1, 0]);

    /** The camera: where it looks (from the sensor, or straight ahead) and how wide it sees. */
    function updateCamera() {
      const m = M();
      if (hasSensor()) {
        const [x, y, z] = m.quatAxes(quat);
        view = m.invertRigid(m.fromBasis(x, y, z, [0, 0, 0]));
      } else view = m.identity();
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const vw = video.videoWidth || cw;
      const vh = video.videoHeight || ch;
      const cover = Math.max(cw / vw, ch / vh); // the video fills the screen (object-fit: cover)
      const focal = (Math.max(vw, vh) / 2 / Math.tan((FOV_LONG_DEG * Math.PI) / 360)) * cover; // in screen pixels
      projection = m.perspective(2 * Math.atan(ch / 2 / focal), cw / ch, 0.05, 50);
    }

    /** Put the wall straight ahead of the camera, upright, `distance` metres away. */
    function placeWall({ keepOffset = false } = {}) {
      const m = M();
      const before = distanceOnWall();
      updateCamera();
      if (hasSensor()) {
        const up = worldUp();
        const forward = m.vec.scale(m.quatAxes(quat)[2], -1);
        let level = m.vec.sub(forward, m.vec.scale(up, m.vec.dot(forward, up)));
        // Pointing at the floor or the ceiling: take the direction the top of the phone leans towards instead.
        if (m.vec.length(level) < 0.25) {
          const top = m.quatAxes(quat)[1];
          level = m.vec.sub(top, m.vec.scale(up, m.vec.dot(top, up)));
          if (m.vec.dot(forward, up) > 0) level = m.vec.scale(level, -1);
        }
        const ahead = m.vec.normalize(level);
        wall = m.wallPose(m.vec.scale(ahead, distance), m.vec.scale(ahead, -1), up) || m.fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -distance]);
      } else wall = m.fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -distance]);
      if (keepOffset && before) {
        // Same spot on the screen, at the new distance.
        placement.u *= distance / before;
        placement.v *= distance / before;
      } else {
        const centre = screenToWall(canvas.clientWidth / 2, canvas.clientHeight / 2, true);
        placement.u = centre ? centre[0] : 0;
        placement.v = centre ? centre[1] : 0;
      }
      dirty = true;
    }
    const distanceOnWall = () => (wall ? M().vec.length(M().position(wall)) : 0);

    /** The distance to start from: 2 m, or farther when a wide or tall set would not fit on the screen from there. */
    function startDistance() {
      updateCamera();
      const across = 2 / projection[0]; // metres of wall the screen shows from side to side, 1 m away
      const down = 2 / projection[5];
      // The top bar and the buttons take part of the height.
      const fits = (d) => subject.width <= across * d * 0.86 && subject.height <= down * d * 0.56;
      return DISTANCES.find((d) => d >= 2 && fits(d)) || DISTANCES[DISTANCES.length - 1];
    }

    function modelMatrix() {
      const m = M();
      return m.multiply(m.multiply(wall, m.translation([placement.u, placement.v, 0])), m.multiply(m.rotationZ(placement.roll), m.scaling(placement.scale, placement.scale, placement.scale)));
    }

    /** Where a point of the screen (CSS pixels inside the camera view) meets the wall, in the wall's own metres. */
    function screenToWall(x, y, inCanvas = false) {
      if (!wall) return null;
      const m = M();
      const rect = canvas.getBoundingClientRect();
      const px = inCanvas ? x : x - rect.left;
      const py = inCanvas ? y : y - rect.top;
      const ray = m.screenRay((px / (rect.width || 1)) * 2 - 1, 1 - (py / (rect.height || 1)) * 2, view, projection);
      if (!ray) return null;
      const hit = m.rayPlane(ray, m.position(wall), m.axis(wall, 2));
      if (!hit) return null;
      const local = m.transformPoint(m.invertRigid(wall), hit);
      return [local[0], local[1]];
    }

    function resize() {
      if (!canvas) return;
      pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const h = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      dirty = true;
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!running || !renderer || !subject || !wall) return;
      // Ease towards the sensor's latest reading: smooth against its jitter, and it always arrives, also when
      // the phone comes to rest and the sensor stops reporting.
      if (useMotion && quat && aim && Math.abs(quat[0] * aim[0] + quat[1] * aim[1] + quat[2] * aim[2] + quat[3] * aim[3]) < 0.9999999) {
        quat = M().quatSlerp(quat, aim, 0.3);
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      updateCamera();
      renderer.begin({ viewport: [0, 0, canvas.width, canvas.height] });
      renderer.drawSubject({ model: modelMatrix(), view, projection });
    }

    function onOrientation(e) {
      if (e.alpha == null && e.beta == null && e.gamma == null) return;
      const angle = (screen.orientation && typeof screen.orientation.angle === "number" ? screen.orientation.angle : Number(window.orientation)) || 0;
      aim = M().cameraQuatFromOrientation(e.alpha, e.beta, e.gamma, angle);
      const first = !quat;
      if (first) quat = aim;
      if (first && useMotion) {
        features.motion = true;
        placeWall(); // the first reading tells which way is up: stand the wall upright
        if (handlers.onMotion) handlers.onMotion(true);
      }
    }

    async function openCamera() {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw Object.assign(new Error("no camera API"), { code: "UNSUPPORTED" });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch (error) {
        throw Object.assign(new Error("camera refused"), { code: cameraProblem(error) });
      }
      const track = stream.getVideoTracks()[0];
      if (track)
        track.addEventListener("ended", () => {
          if (running && handlers.onInterrupted) handlers.onInterrupted();
        });
      video.srcObject = stream;
      try {
        await video.play();
      } catch (error) {
        /* autoplay refused: the video still plays after the tap that opened the Live Demo on most browsers */
      }
      if (!video.videoWidth)
        await new Promise((resolve) => {
          const done = () => resolve();
          video.addEventListener("loadedmetadata", done, { once: true });
          setTimeout(done, 3000);
        });
    }

    function closeCamera() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video) {
        try {
          video.pause();
        } catch (error) {
          /* already stopped */
        }
        video.srcObject = null;
      }
    }

    return {
      mode: "camera",
      features,
      DISTANCES,
      placement,
      /** To be called straight from the customer's tap, before anything that waits. */
      askMotion() {
        return askMotionPermission().then((ok) => (motionAllowed = ok));
      },
      /**
       * Open the camera inside `host` and show `subject`.
       * handlers: onInterrupted()  the camera stopped by itself;  onMotion(on)  the motion sensor started working
       * Throws { code: "DENIED" | "NO_CAMERA" | "BUSY" | "UNSUPPORTED" | "RENDER" }.
       */
      async start(host, nextSubject, nextHandlers = {}) {
        root = host;
        handlers = nextHandlers;
        subject = nextSubject;
        video = document.createElement("video");
        video.className = "ld__video";
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.muted = true;
        video.autoplay = true;
        video.setAttribute("aria-hidden", "true");
        canvas = document.createElement("canvas");
        canvas.className = "ld__canvas";
        canvas.setAttribute("aria-hidden", "true");
        root.prepend(canvas);
        root.prepend(video);
        try {
          await openCamera();
        } catch (error) {
          this.stop();
          throw error;
        }
        renderer = FrameX.ldRender.create(canvas) || FrameX.ldRender.flat(canvas);
        if (!renderer) {
          this.stop();
          throw Object.assign(new Error("no renderer"), { code: "RENDER" });
        }
        renderer.setSubject(subject);
        useMotion = motionAllowed && renderer.kind === "webgl";
        running = true;
        resize();
        distance = startDistance();
        placeWall();
        listen(window, "resize", () => {
          resize();
          updateCamera();
        });
        listen(window, "orientationchange", () => setTimeout(resize, 250));
        if (motionAllowed) listen(window, "deviceorientation", onOrientation);
        raf = requestAnimationFrame(frame);
      },
      /** Stops the camera (the light on the device goes off) and removes everything this mode added. */
      stop() {
        running = false;
        cancelAnimationFrame(raf);
        cleanups.splice(0).forEach((fn) => fn());
        closeCamera();
        if (renderer) renderer.dispose();
        renderer = null;
        if (video) video.remove();
        if (canvas) canvas.remove();
        video = canvas = null;
        quat = aim = null;
      },
      /** The page went to the background: let go of the camera. resume() takes it again. */
      pause() {
        running = false;
        closeCamera();
      },
      async resume() {
        await openCamera();
        running = true;
        dirty = true;
      },
      isLive: () => Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === "live")),
      setSubject(next) {
        subject = next;
        if (renderer) renderer.setSubject(next);
        dirty = true;
      },
      changed() {
        dirty = true;
      },
      screenToWall,
      /** Back to the middle of the screen, real proportions, straight. */
      reset() {
        Object.assign(placement, { scale: 1, roll: 0 });
        placeWall();
      },
      get distance() {
        return distance;
      },
      setDistance(metres) {
        distance = Math.min(8, Math.max(0.5, Number(metres) || 2));
        placeWall({ keepOffset: true });
      },
      get motion() {
        return hasSensor();
      },
      /** "Stick to wall" on or off. Off: the piece stays where it is on the screen. */
      setMotion(on) {
        useMotion = Boolean(on && motionAllowed && renderer && renderer.kind === "webgl");
        placeWall(); // the wall is stood up again straight ahead, with the piece in the middle of the screen
        return useMotion;
      },
      /**
       * One picture of what is on screen now (camera + piece), made on this device.
       * Returns a Blob (JPEG) or null. Nothing is sent anywhere.
       */
      capture() {
        if (!video || !canvas || !video.videoWidth) return Promise.resolve(null);
        updateCamera();
        if (renderer && subject && wall) {
          renderer.begin({ viewport: [0, 0, canvas.width, canvas.height] });
          renderer.drawSubject({ model: modelMatrix(), view, projection });
        }
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height;
        const c = out.getContext("2d");
        const cover = Math.max(out.width / video.videoWidth, out.height / video.videoHeight);
        const sw = out.width / cover;
        const sh = out.height / cover;
        c.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, out.width, out.height);
        c.drawImage(canvas, 0, 0);
        return new Promise((resolve) => out.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
      },
      /** For tests and for the screen reader text: where the piece is on screen now. */
      screenBox() {
        if (!wall || !subject) return null;
        const m = M();
        const mvp = m.multiply(m.multiply(projection, view), modelMatrix());
        const rect = canvas.getBoundingClientRect();
        const pts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => {
          const p = m.transformPoint(mvp, [x * subject.width, y * subject.height, subject.depth]);
          return { x: ((p[0] + 1) / 2) * rect.width, y: ((1 - p[1]) / 2) * rect.height, w: p[3] };
        });
        return { points: pts, visible: pts.every((p) => p.w > 0) };
      },
    };
  }

  FrameX.ldCamera = { create, cameraProblem, FOV_LONG_DEG };
})((window.FrameX = window.FrameX || {}));
