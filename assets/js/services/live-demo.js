/* ==========================================================================
   Live Demo ("View on My Wall") — the small part every page loads.

   It answers "can this device show it?", draws the button, and loads the
   feature itself (assets/js/livedemo/) only when the customer presses it, so
   a normal product page pays nothing for it.

     FrameX.liveDemo.available()            -> Promise<boolean>  a camera can be opened here
     FrameX.liveDemo.supports(product)      -> boolean           the product's own capability (productModel.liveDemoSupport)
     FrameX.liveDemo.mount(host, { getSpec, context, label })    adds the button to `host`; it stays hidden
                                                                 until the device is known to have a camera
     FrameX.liveDemo.open(getSpec, opts)    opens it directly

   getSpec() returns what to show, read at that moment from the page's own
   state (see assets/js/livedemo/ld-subject.js for the shapes). The Live Demo
   only reads it: closing it leaves the page, the customer's design and the
   cart exactly as they were. Ordering stays where it is, on the page.

   Where it works: a camera needs a secure page (https, or localhost while
   developing) and a browser that offers it. On other pages the button is not shown.

   Analytics. No analytics service is wired in. track() only announces what
   happened, without pictures or positions, as a "framex:analytics" event on
   document and, if a page has one, in window.dataLayer:
     live_demo_opened, camera_permission_granted, camera_permission_denied,
     surface_detected, frame_placed, frame_repositioned, live_demo_closed,
     live_demo_add_to_cart
   ========================================================================== */
(function (FrameX) {
  const FOLDER = "assets/js/livedemo/";
  const FILES = ["ld-math.js", "ld-paint.js", "ld-subject.js", "ld-render.js", "ld-camera.js", "ld-xr.js", "ld-view.js"];
  let loading = null;
  let known = null;
  let usedHere = null; // the last Live Demo opened on this page: { productId, kind }

  function track(name, detail = {}) {
    const data = Object.assign({ event: name }, detail);
    try {
      document.dispatchEvent(new CustomEvent("framex:analytics", { detail: data }));
      if (Array.isArray(window.dataLayer)) window.dataLayer.push(data);
    } catch (error) {
      /* announcing must never break the page */
    }
  }

  /** Is there a camera this page may open? Found out without asking for permission. */
  function available() {
    if (known) return known;
    const api = Boolean(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (!api) return (known = Promise.resolve(false));
    const touch = navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
    known = (navigator.mediaDevices.enumerateDevices ? navigator.mediaDevices.enumerateDevices() : Promise.resolve([]))
      // Some phones list nothing until the camera has been allowed once: on a touch device, offer it anyway.
      .then((list) => (list && list.length ? list.some((d) => d.kind === "videoinput") : touch))
      .catch(() => touch);
    return known;
  }

  const supports = (product) => Boolean(product && FrameX.productModel && FrameX.productModel.liveDemoSupport && FrameX.productModel.liveDemoSupport(product).ok);

  function script(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = false; // keep the order they are added in
      el.onload = resolve;
      el.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(el);
    });
  }

  /** The feature's own scripts (and the two drawing engines, on pages that don't have them yet). Loaded once. */
  function load() {
    if (loading) return loading;
    const list = [];
    if (!FrameX.templateEngine) list.push("assets/js/services/template-engine.js");
    if (!FrameX.studioEngine) list.push("assets/js/services/studio-engine.js");
    FILES.forEach((f) => list.push(FOLDER + f));
    loading = Promise.all(list.map(script)).catch((error) => {
      loading = null; // a later press may try again
      throw error;
    });
    return loading;
  }

  let opening = false;
  async function open(getSpec, { button = null, context = {} } = {}) {
    if (opening || (FrameX.liveDemoView && FrameX.liveDemoView.isOpen())) return null;
    opening = true;
    if (button) button.setAttribute("aria-busy", "true");
    try {
      await load();
      const spec = await getSpec();
      usedHere = { productId: context.productId || null, kind: spec && spec.kind };
      return await FrameX.liveDemoView.open(spec, { returnFocus: button, context });
    } catch (error) {
      console.error("Live Demo could not open", error);
      if (FrameX.toast) FrameX.toast.show("Live Demo couldn't be loaded. Check your internet connection and try again.", { duration: 5000 });
      return null;
    } finally {
      opening = false;
      if (button) button.removeAttribute("aria-busy");
    }
  }

  /**
   * The button. It is added hidden and shown once the device is known to have a camera.
   *   getSpec   () => what to show now (may be async)
   *   context   { productId, page } for analytics
   *   variant   "overlay" (a pill over a picture) | "inline"
   * -> { el, destroy(), setVisible(on) }  setVisible lets the page hide it when the current choice can't be shown
   */
  function mount(host, { getSpec, context = {}, label = "View on My Wall", variant = "overlay" } = {}) {
    const icon = FrameX.dom.icon;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `ld-cta ld-cta--${variant}`;
    el.hidden = true;
    el.dataset.liveDemo = "";
    el.innerHTML = `${icon("camera")}<span>${FrameX.dom.escapeHtml(label)}</span>`;
    el.setAttribute("aria-label", `${label}: see it on your wall with your camera`);
    let wanted = true;
    let ready = false;
    const paint = () => (el.hidden = !(wanted && ready));
    available().then((ok) => {
      ready = ok;
      paint();
    });
    // The picture behind the button may have its own taps and swipes (zoom, gallery): this press is only the button's.
    ["pointerdown", "pointerup", "mousedown", "touchstart"].forEach((type) => el.addEventListener(type, (e) => e.stopPropagation(), { passive: true }));
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open(getSpec, { button: el, context });
    });
    host.appendChild(el);
    return {
      el,
      setVisible(on) {
        wanted = Boolean(on);
        paint();
      },
      destroy: () => el.remove(),
    };
  }

  // "Add to cart" after looking at it on the wall: announced once per look.
  document.addEventListener("framex:cart-change", (e) => {
    if (!usedHere || !e.detail || e.detail.type !== "add") return;
    track("live_demo_add_to_cart", { productId: usedHere.productId, kind: usedHere.kind });
    usedHere = null;
  });

  FrameX.liveDemo = { available, supports, mount, open, load, track };
})((window.FrameX = window.FrameX || {}));
