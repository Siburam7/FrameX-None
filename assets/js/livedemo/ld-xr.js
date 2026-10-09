/* ==========================================================================
   Live Demo ("View on My Wall") — AR mode (WebXR).

   Used when the browser offers real augmented reality: today that is Chrome
   on Android phones with Google Play Services for AR (ARCore). There the
   phone itself:
     - tracks its own movement through the room (turning AND walking);
     - finds flat surfaces and tells this page where one is (hit test);
     - keeps a point of the room fixed while it learns more (anchor);
     - knows real distances, so the piece is shown at its true size.
   None of that is imitated here: if the phone reports no upright surface, the
   screen says so and offers "Place it yourself" (the wall is then assumed, and
   still follows the phone's tracking).

   The system shows the camera; this page never receives its pictures. That is
   also why there is no "Save" in this mode: the phone's own screenshot does it.

   iPhones have no WebXR in Safari or Chrome: they use camera mode (ld-camera.js).
   ========================================================================== */
(function (FrameX) {
  const M = () => FrameX.ldMath;
  const UP = [0, 1, 0]; // WebXR spaces are level: y is up
  const STEADY_FRAMES = 6; // a wall has to be seen this many frames in a row before it is announced

  /** Does this browser offer AR sessions at all? */
  async function supported() {
    try {
      return Boolean(navigator.xr && navigator.xr.isSessionSupported && (await navigator.xr.isSessionSupported("immersive-ar")));
    } catch (error) {
      return false;
    }
  }

  function create() {
    let session = null;
    let canvas, renderer, refSpace, viewerSpace, hitSource, lightProbe, root;
    let subject = null;
    let handlers = {};
    let state = "starting";
    let wall = null; // where the piece hangs (pose in the room)
    let anchor = null; // the room point the phone keeps fixed for us
    let anchorToWall = null;
    let candidate = null; // the wall being aimed at, before it is placed: { pose, hit }
    let floor = null; // a level surface being aimed at (pose)
    let steady = 0;
    let manual = false;
    let ended = false;
    let lastView = M().identity();
    let lastProjection = M().identity();
    let lastCamera = M().identity();
    let light = 1;
    let shadowDir = [0.24, -0.97];
    const placement = { u: 0, v: 0, scale: 1, roll: 0 };
    const features = { detection: true, realScale: true, save: false, distance: false, motion: false, nudge: false };

    function setState(next) {
      if (next === state) return;
      state = next;
      if (handlers.onState) handlers.onState(next);
    }

    const modelOn = (pose) => {
      const m = M();
      return m.multiply(m.multiply(pose, m.translation([placement.u, placement.v, 0])), m.multiply(m.rotationZ(placement.roll), m.scaling(placement.scale, placement.scale, placement.scale)));
    };

    /** What is the phone aiming at? An upright surface is a wall to hang on; a level one is shown as a ring. */
    function aim(frame) {
      const m = M();
      candidate = null;
      floor = null;
      let results = [];
      try {
        results = hitSource ? frame.getHitTestResults(hitSource) : [];
      } catch (error) {
        results = [];
      }
      if (results.length) {
        const pose = results[0].getPose(refSpace);
        if (pose) {
          const hit = pose.transform.matrix;
          const point = m.position(hit);
          let normal = m.axis(hit, 1); // a hit's y axis is the surface's normal
          if (m.vec.dot(normal, m.vec.sub(m.position(lastCamera), point)) < 0) normal = m.vec.scale(normal, -1);
          const upright = m.wallPose(point, normal, UP, 0.45);
          if (upright) candidate = { pose: upright, hit: results[0] };
          else floor = m.fromBasis(m.axis(hit, 0), m.vec.scale(m.axis(hit, 2), -1), m.axis(hit, 1), point);
        }
      }
      steady = candidate ? Math.min(steady + 1, 60) : 0;
      setState(candidate && steady >= STEADY_FRAMES ? "detected" : floor ? "floor" : "scanning");
    }

    /** The room's light, where the phone estimates it: a gentle brightness change and the way the shadow falls. */
    function updateLight(frame) {
      if (!lightProbe || !frame.getLightEstimate) return;
      try {
        const estimate = frame.getLightEstimate(lightProbe);
        if (!estimate) return;
        const sh = estimate.sphericalHarmonicsCoefficients;
        if (sh && sh.length >= 3) {
          const average = (0.2126 * sh[0] + 0.7152 * sh[1] + 0.0722 * sh[2]) * 0.2821;
          if (average > 0) light += (Math.min(1.08, Math.max(0.78, 0.78 + 0.32 * Math.min(1, average / 0.9))) - light) * 0.05;
        }
        const d = estimate.primaryLightDirection;
        const on = wall || (candidate && candidate.pose);
        if (d && on) {
          const m = M();
          const fall = [-(d.x * on[0] + d.y * on[1] + d.z * on[2]), -(d.x * on[4] + d.y * on[5] + d.z * on[6])];
          const length = Math.hypot(fall[0], fall[1]);
          if (length > 0.15) {
            const mixed = [0.24 * 0.55 + (fall[0] / length) * 0.45, -0.97 * 0.55 + (fall[1] / length) * 0.45];
            const l = Math.hypot(mixed[0], mixed[1]) || 1;
            shadowDir = [shadowDir[0] + (mixed[0] / l - shadowDir[0]) * 0.05, shadowDir[1] + (mixed[1] / l - shadowDir[1]) * 0.05];
          }
        }
      } catch (error) {
        /* no estimate this frame */
      }
    }

    function onFrame(time, frame) {
      if (!session || ended) return;
      session.requestAnimationFrame(onFrame);
      const layer = session.renderState.baseLayer;
      const pose = frame.getViewerPose(refSpace);
      if (!pose || !layer || !renderer) {
        if (wall) setState("lost");
        return;
      }
      const m = M();
      // Follow the anchor: the phone moves it as it understands the room better.
      if (wall && anchor) {
        try {
          const ap = frame.getPose(anchor.anchorSpace, refSpace);
          if (ap) {
            if (!anchorToWall) anchorToWall = m.multiply(m.invertRigid(ap.transform.matrix), wall);
            else wall = m.multiply(ap.transform.matrix, anchorToWall);
          }
        } catch (error) {
          anchor = null; // the anchor is gone: the piece stays where it was last seen
        }
      }
      pose.views.forEach((view, i) => {
        const port = layer.getViewport(view);
        // Copies: these are read again later (a drag), after the phone has reused its own arrays.
        lastView = new Float32Array(view.transform.inverse.matrix);
        lastProjection = new Float32Array(view.projectionMatrix);
        lastCamera = new Float32Array(view.transform.matrix);
        renderer.begin({ framebuffer: layer.framebuffer, viewport: [port.x, port.y, port.width, port.height], clear: i === 0 });
        if (i === 0) {
          updateLight(frame);
          if (!wall) aim(frame);
          else setState("placed");
        }
        if (wall) renderer.drawSubject({ model: modelOn(wall), view: lastView, projection: lastProjection, light, shadowDir });
        else if (state === "detected" && candidate) renderer.drawSubject({ model: modelOn(candidate.pose), view: lastView, projection: lastProjection, alpha: 0.7, light, shadowDir });
        else if (floor) renderer.drawRing({ pose: floor, view: lastView, projection: lastProjection });
      });
    }

    function cleanup() {
      ended = true;
      try {
        if (hitSource && hitSource.cancel) hitSource.cancel();
      } catch (error) {
        /* already cancelled with the session */
      }
      hitSource = null;
      if (renderer) renderer.dispose();
      renderer = null;
      session = null;
      anchor = null;
    }

    return {
      mode: "ar",
      features,
      placement,
      get state() {
        return state;
      },
      /**
       * Start an AR session with `host` as the screen layer over the camera.
       * Must be called from the customer's tap. handlers: onState(state), onEnd()
       *   state: "scanning" | "floor" | "detected" | "placed" | "lost"
       * Throws { code: "AR_REFUSED" | "AR_NO_OVERLAY" | "RENDER" } so the caller can fall back to camera mode.
       */
      async start(host, nextSubject, nextHandlers = {}) {
        root = host;
        subject = nextSubject;
        handlers = nextHandlers;
        let next;
        try {
          next = await navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "anchors", "light-estimation"], domOverlay: { root: host } });
        } catch (error) {
          throw Object.assign(new Error("AR session refused"), { code: "AR_REFUSED", cause: error });
        }
        session = next;
        ended = false;
        session.addEventListener("end", () => {
          const was = !ended;
          cleanup();
          if (was && handlers.onEnd) handlers.onEnd();
        });
        try {
          // Without a screen layer there would be no Close button and no instructions: use camera mode instead.
          if (!session.domOverlayState) throw Object.assign(new Error("no overlay"), { code: "AR_NO_OVERLAY" });
          canvas = document.createElement("canvas");
          renderer = FrameX.ldRender.create(canvas, { xr: true });
          if (!renderer) throw Object.assign(new Error("no renderer"), { code: "RENDER" });
          // The drawing surface was created for AR (xrCompatible). Asking again is only a safeguard for
          // browsers that ignore that option; if it can't be done the next step says so itself.
          try {
            const made = renderer.gl.getContextAttributes && renderer.gl.getContextAttributes();
            if (renderer.gl.makeXRCompatible && !(made && made.xrCompatible)) await renderer.gl.makeXRCompatible();
          } catch (error) {
            /* see above */
          }
          renderer.setSubject(subject);
          session.updateRenderState({ baseLayer: new XRWebGLLayer(session, renderer.gl) });
          refSpace = await session.requestReferenceSpace("local");
          viewerSpace = await session.requestReferenceSpace("viewer");
          hitSource = await session.requestHitTestSource({ space: viewerSpace });
          try {
            lightProbe = session.requestLightProbe ? await session.requestLightProbe() : null;
          } catch (error) {
            lightProbe = null;
          }
        } catch (error) {
          const code = typeof error.code === "string" ? error.code : "RENDER";
          ended = true;
          try {
            await session.end();
          } catch (e) {
            /* already ended */
          }
          cleanup();
          throw Object.assign(new Error("AR could not start"), { code });
        }
        setState("scanning");
        session.requestAnimationFrame(onFrame);
      },
      /** End the session: the system closes the camera. */
      async stop() {
        const s = session;
        ended = true;
        cleanup();
        if (s)
          try {
            await s.end();
          } catch (error) {
            /* already ended */
          }
      },
      pause() {},
      resume: async () => {},
      isLive: () => Boolean(session && !ended),
      setSubject(next) {
        subject = next;
        if (renderer) renderer.setSubject(next);
      },
      changed() {},
      /** Hang the piece on the wall being aimed at. false when no wall is in sight. */
      place() {
        if (!candidate || state !== "detected") return false;
        const hit = candidate.hit;
        wall = candidate.pose;
        manual = false;
        features.nudge = false;
        anchor = null;
        anchorToWall = null;
        if (hit && typeof hit.createAnchor === "function")
          hit
            .createAnchor()
            .then((made) => {
              if (session && wall && !manual) anchor = made;
              else if (made && made.delete) made.delete();
            })
            .catch(() => {});
        candidate = null;
        setState("placed");
        return true;
      },
      /**
       * No upright surface was found (plain, evenly lit walls are hard for a phone to see):
       * stand the wall straight ahead of the phone, `distance` metres away. If the phone is
       * aiming at the floor (where it meets the wall), the wall stands there instead.
       */
      placeManually(distance = 1.5) {
        const m = M();
        const from = m.position(lastCamera);
        const forward = m.vec.scale(m.axis(lastCamera, 2), -1);
        let level = [forward[0], 0, forward[2]];
        if (m.vec.length(level) < 0.2) {
          const top = m.axis(lastCamera, 1);
          level = forward[1] > 0 ? [-top[0], 0, -top[2]] : [top[0], 0, top[2]];
        }
        const ahead = m.vec.normalize(level);
        let d = distance;
        if (floor) {
          const along = m.vec.dot(m.vec.sub(m.position(floor), from), ahead);
          if (along > 0.3 && along < 8) d = along;
        }
        wall = m.wallPose([from[0] + ahead[0] * d, from[1], from[2] + ahead[2] * d], m.vec.scale(ahead, -1), UP);
        manual = true;
        features.nudge = true;
        anchor = null;
        anchorToWall = null;
        candidate = null;
        Object.assign(placement, { u: 0, v: 0 });
        setState("placed");
        return Boolean(wall);
      },
      get manual() {
        return manual;
      },
      /** Manual placement only: move the assumed wall away from the phone (+) or towards it (−), in metres. */
      nudge(metres) {
        if (!wall || !manual) return;
        const m = M();
        const n = m.axis(wall, 2);
        wall = m.multiply(m.translation(m.vec.scale(n, -metres)), wall);
      },
      /** Take the piece off the wall and aim again. Its size and turn are kept. */
      pickUp() {
        if (anchor && anchor.delete)
          try {
            anchor.delete();
          } catch (error) {
            /* gone already */
          }
        anchor = null;
        anchorToWall = null;
        wall = null;
        manual = false;
        features.nudge = false;
        steady = 0;
        Object.assign(placement, { u: 0, v: 0 });
        setState("scanning");
      },
      /** Where a point of the screen meets the wall the piece hangs on, in the wall's own metres. */
      screenToWall(x, y) {
        const on = wall || (candidate && candidate.pose);
        if (!on) return null;
        const m = M();
        const rect = root.getBoundingClientRect();
        const ray = m.screenRay(((x - rect.left) / (rect.width || 1)) * 2 - 1, 1 - ((y - rect.top) / (rect.height || 1)) * 2, lastView, lastProjection);
        if (!ray) return null;
        const hit = m.rayPlane(ray, m.position(on), m.axis(on, 2));
        if (!hit) return null;
        const local = m.transformPoint(m.invertRigid(on), hit);
        return [local[0], local[1]];
      },
      /** Back to where it was hung, real size, straight. */
      reset() {
        Object.assign(placement, { u: 0, v: 0, scale: 1, roll: 0 });
      },
      capture: () => Promise.resolve(null),
      /** For tests: where the piece is on screen now (fractions of the screen), or null. */
      screenBox() {
        const on = wall || (state === "detected" && candidate && candidate.pose);
        if (!on || !subject) return null;
        const m = M();
        const mvp = m.multiply(m.multiply(lastProjection, lastView), modelOn(on));
        const points = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => {
          const p = m.transformPoint(mvp, [x * subject.width, y * subject.height, subject.depth]);
          return { x: (p[0] + 1) / 2, y: (1 - p[1]) / 2, w: p[3] };
        });
        return { points, visible: points.every((p) => p.w > 0) };
      },
      /** For tests: the wall's pose and whether the phone's anchor is in use. */
      debug: () => ({ wall: wall ? Array.from(wall) : null, anchored: Boolean(anchor && anchorToWall), manual, light, shadowDir, steady }),
    };
  }

  FrameX.ldXR = { create, supported };
})((window.FrameX = window.FrameX || {}));
