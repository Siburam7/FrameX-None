/* ==========================================================================
   Media service: the pictures a shop adds to its products.

   A picture is checked here (type, size, smallest sensible resolution), sized
   for the web and uploaded to the shop's own account on the FrameX backend
   (POST /api/shops/<Shop ID>/media). The backend looks at the file itself
   again, stores it, and answers with its id. A product stores references:
     "media:<id>"         the picture
     "media:<id>:thumb"   its small copy
   and the backend only accepts references to pictures that shop uploaded.
   Customers get them as normal addresses (/media/<id>).

   These are PRODUCT pictures, so making a web-sized copy is right. Customer
   photos are a different thing and are never resized: see upload-service.js.

     validate(file, kind)            -> friendly error message or ""
     prepare(file, kind, onProgress) -> { id, url, thumb, width, height, name, size }
     resolve(ref, { thumb })         -> an address the page can show
     listingThumb(ref)               -> the small picture's address
     legacy                          pictures an older version kept in this
                                     browser only (read, to move them across)
   ========================================================================== */
(function (FrameX) {
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const SERVER_REF = /^media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(:thumb)?$/;

  /** Per kind: accepted types, max size and the smallest sensible image. */
  const RULES = {
    view: { types: IMAGE_TYPES, maxMB: 12, minEdge: 600, large: 2000, thumb: 480 },
    frame360: { types: IMAGE_TYPES, maxMB: 6, minEdge: 400, large: 1400, thumb: 0 },
    material: { types: IMAGE_TYPES, maxMB: 8, minEdge: 300, large: 1200, thumb: 360 },
    thumbnail: { types: IMAGE_TYPES, maxMB: 8, minEdge: 300, large: 1200, thumb: 480 },
  };

  class MediaError extends Error {}

  const label = (types) => types.map((t) => t.split("/")[1].toUpperCase().replace("JPEG", "JPG")).join(", ");
  const isMedia = (ref) => /^media:/.test(String(ref || ""));
  const isLegacy = (ref) => isMedia(ref) && !SERVER_REF.test(String(ref));

  function shopCode() {
    const user = FrameX.auth && FrameX.auth.state.user;
    return user && user.shop ? user.shop.shopCode : "";
  }

  /** Friendly message for a file that can't be used, or "" when it's fine. */
  function validate(file, kind = "view") {
    const rule = RULES[kind];
    if (!rule) return "Video files can't be uploaded here. Paste a YouTube or Vimeo link instead.";
    if (!file) return "No file was selected.";
    if (!FrameX.dom.looksLikePhoto(file)) return `“${file.name}” is a ${file.type || "file"} file, which isn't supported. Please use ${label(rule.types)}.`;
    if (file.size > rule.maxMB * 1024 * 1024) return `“${file.name}” is larger than ${rule.maxMB} MB. Please use a smaller file.`;
    return "";
  }

  function decode(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new MediaError("That file doesn't look like a valid image. Please choose another photo."));
      };
      image.src = url;
    });
  }

  function resize(image, edge, quality = 0.86) {
    const ratio = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a clean background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  }

  /** The backend's words when it refuses a picture; otherwise a plain "try again". */
  const refused = (error) => new MediaError(error && error.status && !error.network && error.message ? error.message : "We couldn't upload that picture. Check your connection and try again.");

  /** Check one picture, size it for the web and upload it. Throws MediaError with a friendly message. */
  async function prepare(file, kind = "view", onProgress = () => {}) {
    const problem = validate(file, kind);
    if (problem) throw new MediaError(problem);
    const rule = RULES[kind];
    const code = shopCode();
    if (!code) throw new MediaError("Please log in to your shop account to add pictures.");
    onProgress(5);
    const { image, url } = await decode(file);
    try {
      const shortest = Math.min(image.naturalWidth, image.naturalHeight);
      if (shortest < rule.minEdge)
        throw new MediaError(`“${file.name}” is too small (${image.naturalWidth} × ${image.naturalHeight} px). Please use a photo at least ${rule.minEdge} px on its shortest side so it looks sharp.`);
      onProgress(15);
      const large = await resize(image, rule.large);
      if (!large) throw new MediaError("That photo couldn't be prepared. Please try another one.");
      let saved;
      try {
        saved = (await FrameX.http.upload(`/shops/${encodeURIComponent(code)}/media`, large, { name: file.name, onProgress: (p) => onProgress(15 + Math.round(p * 0.6)) })).media;
        if (rule.thumb) {
          const small = await resize(image, rule.thumb, 0.8);
          if (small) await FrameX.http.upload(`/shops/${encodeURIComponent(code)}/media/${saved.id}/thumb`, small, { name: file.name });
        }
      } catch (error) {
        throw error instanceof MediaError ? error : refused(error);
      }
      onProgress(100);
      return { id: saved.id, url: `media:${saved.id}`, thumb: rule.thumb ? `media:${saved.id}:thumb` : "", width: image.naturalWidth, height: image.naturalHeight, name: file.name, size: file.size };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ---------------------------------------------------------------- Pictures an older version kept in this browser
     Before shops had accounts on the backend, the dashboard kept its pictures
     in this browser's IndexedDB ("media:md-…"). They are only read now: to
     show an old draft and to move it into the shop's account. */
  const legacy = (() => {
    const DB = "framex-shop-media";
    const STORE = "files";
    let dbPromise = null;
    const urls = new Map();
    function db() {
      if (!("indexedDB" in window)) return Promise.resolve(null);
      dbPromise =
        dbPromise ||
        new Promise((resolve) => {
          let req;
          try {
            req = indexedDB.open(DB, 1);
          } catch (error) {
            return resolve(null);
          }
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
      return dbPromise;
    }
    async function tx(mode, run) {
      const conn = await db();
      if (!conn) return null;
      return new Promise((resolve) => {
        try {
          const t = conn.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          t.oncomplete = () => resolve(req ? req.result : null);
          t.onerror = () => resolve(null);
        } catch (error) {
          resolve(null);
        }
      });
    }
    const keyOf = (ref) => String(ref || "").replace(/^media:/, "");
    /** The stored file behind an old reference, or null. */
    const blob = (ref) => tx("readonly", (store) => store.get(keyOf(ref)));
    async function url(ref, { thumb = false } = {}) {
      let key = keyOf(ref);
      if (thumb && !key.endsWith(":thumb")) key += ":thumb";
      if (urls.has(key)) return urls.get(key);
      const file = (await blob("media:" + key)) || (thumb ? await blob(ref) : null);
      if (!file) return "";
      const address = URL.createObjectURL(file);
      urls.set(key, address);
      return address;
    }
    async function remove(ref) {
      const base = keyOf(ref).replace(/:thumb$/, "");
      await Promise.all([base, `${base}:thumb`].map((key) => tx("readwrite", (store) => store.delete(key))));
    }
    return { blob, url, remove };
  })();

  /** An address the browser can show. Normal addresses pass straight through. */
  async function resolve(ref, { thumb = false } = {}) {
    if (!ref) return "";
    const m = SERVER_REF.exec(String(ref));
    // The backend sends the large picture when a small copy was never made.
    if (m) return FrameX.http.asset(`/media/${m[1]}${thumb || m[2] ? "/thumb" : ""}`);
    if (!isMedia(ref)) return FrameX.http ? FrameX.http.asset(ref) : ref;
    return legacy.url(ref, { thumb });
  }

  /** The small picture for cards and the cart. (The backend sets a product's listing picture itself when it is saved.) */
  async function listingThumb(ref) {
    return ref ? resolve(ref, { thumb: true }) : "";
  }

  /**
   * Move one old browser-only picture into the shop's account.
   * -> its new reference ("media:<id>"), or "" when the old file is gone.
   */
  async function adopt(ref) {
    if (!isLegacy(ref)) return ref;
    const base = "media:" + String(ref).replace(/^media:/, "").replace(/:thumb$/, "");
    const file = await legacy.blob(base);
    if (!file) return "";
    const code = shopCode();
    const saved = (await FrameX.http.upload(`/shops/${encodeURIComponent(code)}/media`, file, { name: "picture.jpg" })).media;
    const small = await legacy.blob(base + ":thumb");
    if (small) await FrameX.http.upload(`/shops/${encodeURIComponent(code)}/media/${saved.id}/thumb`, small, { name: "picture.jpg" });
    return `media:${saved.id}`;
  }

  FrameX.mediaService = {
    RULES,
    validate,
    prepare,
    resolve,
    listingThumb,
    adopt,
    isMedia,
    isLegacy,
    legacy,
    // Pictures are kept by the backend with the shop's account: there is nothing to clean up in the browser.
    remove: async () => {},
    collectGarbage: async () => {},
    MediaError,
  };
})((window.FrameX = window.FrameX || {}));
