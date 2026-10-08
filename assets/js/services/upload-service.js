/* ==========================================================================
   Upload service: the customer's own photos.

   Two different things are kept apart on purpose:

     the ORIGINAL   the file exactly as the customer chose it. It is never
                    opened for editing, resized, re-encoded or "improved" here.
                    It is what gets uploaded to FrameX (POST /api/uploads) and
                    what the order is printed from.
     the PREVIEW    a small copy made only so the page can show the photo
                    quickly (in a frame, in the cart). It is never uploaded
                    and never printed.

   Both wait in this browser (IndexedDB) until the photo is uploaded, so a
   design survives a reload or a detour through the login page. Uploading
   needs an account, because a photo belongs to the account that ordered it:
   a visitor can choose and preview photos first and log in when they order.

     prepare(file, onProgress)  check the file, keep the original, make the preview
                                -> { id, url, name, width, height, size, type }
     getUrl(id)                 the preview's address (or null)
     has(id)                    is this photo still usable (the original or its upload)?
     info(id)                   what is known about it: { name, width, height, size, type, uploadId }
     upload(id, onProgress)     send the ORIGINAL to FrameX once -> the server's record
     uploadAll({ slot: id }, onProgress)   -> { slot: uploadId }
     forOrder({ reason, itemName, photos, onProgress })
                                what "Add to cart" / "Buy Now" do first: log in if needed,
                                then upload -> { ok, uploadIds } | { ok: false, cancelled | message }
     thumbnail(id)              a small square picture for the cart line (from the preview copy)
     remove(id)
     facts(photo)               "IMG_2041.JPG · 3840 × 2160 px · 4.2 MB"

   "framex:upload" fires on document while a photo is being sent:
     detail = { id, state: "uploading" | "done" | "failed", percent, message }
   ========================================================================== */
(function (FrameX) {
  const TYPES = ["image/jpeg", "image/png", "image/webp"];
  const DEFAULT_MAX_MB = 50;
  const PREVIEW_EDGE = 1800; // px, longest side of the on-screen copy
  const DB = "framex-media";
  const PREVIEWS = "photos";
  const ORIGINALS = "originals";
  const META = "meta";
  const KEEP_DAYS = 30; // a photo nothing refers to any more is removed from this browser after a day; any photo after this long

  /* The words customers read. product-model.js holds the same text for pages that load it. */
  const TEXT = () =>
    (FrameX.productModel && FrameX.productModel.PHOTO_TEXT) || {
      quality:
        "Your uploaded image will be printed in the same original quality you provide. We do not artificially enhance or improve the image quality. For the best print result, please upload a high-quality image.",
      unsupported: "Please upload a supported image format.",
      failed: "We couldn't upload your image. Please try again.",
    };

  /** Customer-facing errors (never raw technical messages). */
  class UploadError extends Error {
    constructor(message, code = "") {
      super(message);
      this.code = code;
    }
  }

  let maxBytes = DEFAULT_MAX_MB * 1024 * 1024;
  let limitsAsked = null;
  /** The server's own limit, asked once (GET /api/config). */
  function limits() {
    limitsAsked =
      limitsAsked ||
      Promise.resolve(FrameX.http && FrameX.http.serverConfig ? FrameX.http.serverConfig() : null)
        .then((c) => {
          if (c && c.uploads && c.uploads.maxBytes) maxBytes = c.uploads.maxBytes;
        })
        .catch(() => {});
    return limitsAsked;
  }
  const maxMb = () => Math.round(maxBytes / (1024 * 1024));

  /* ---------------------------------------------------------------- This browser's storage */
  let dbPromise = null;
  function db() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        let req;
        try {
          req = indexedDB.open(DB, 2);
        } catch (error) {
          return resolve(null);
        }
        req.onupgradeneeded = () => {
          [PREVIEWS, ORIGINALS, META].forEach((name) => {
            if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
          });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null); // private mode etc.: photos stay in memory only
        req.onblocked = () => resolve(null);
      });
    }
    return dbPromise;
  }

  /** One request against one store. Resolves to its result, or null when storage isn't available. */
  async function tx(store, mode, run) {
    const conn = await db();
    if (!conn) return null;
    return new Promise((resolve) => {
      let req;
      try {
        const t = conn.transaction(store, mode);
        req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : null);
        t.onerror = t.onabort = () => resolve(null);
      } catch (error) {
        resolve(null);
      }
    });
  }

  // What this page has seen (also the fallback when the browser has no storage).
  const previews = new Map(); // id -> Blob
  const originals = new Map(); // id -> Blob (the file as chosen)
  const metas = new Map(); // id -> { name, type, size, width, height, at, uploadId, userId, server }
  const urls = new Map(); // id -> object URL of the preview

  async function loadMeta(id) {
    if (metas.has(id)) return metas.get(id);
    const saved = await tx(META, "readonly", (s) => s.get(id));
    if (saved) metas.set(id, saved);
    return saved || null;
  }
  async function saveMeta(id, meta) {
    metas.set(id, meta);
    await tx(META, "readwrite", (s) => s.put(meta, id));
  }
  async function loadOriginal(id) {
    if (originals.has(id)) return originals.get(id);
    const blob = await tx(ORIGINALS, "readonly", (s) => s.get(id));
    if (blob) originals.set(id, blob);
    return blob || null;
  }

  /* ---------------------------------------------------------------- Reading a file for the preview */
  function decode(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new UploadError(`${TEXT().unsupported} That file couldn't be opened as a JPG, PNG or WebP photo.`, "UNSUPPORTED"));
      };
      image.src = url;
    });
  }

  /** The small on-screen copy. The original is not touched: this draws from it and nothing else. */
  function makePreview(image) {
    const ratio = Math.min(1, PREVIEW_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // a see-through PNG gets a clean background in the preview
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88));
  }

  const newId = () => "ph-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /**
   * Check one photo, keep its original and make its preview.
   * Throws UploadError with a message a customer can act on.
   */
  async function prepare(file, onProgress = () => {}) {
    if (!file) throw new UploadError("No photo was selected.", "EMPTY");
    await limits();
    // Phones sometimes give no type at all: the name's ending is then the only hint. The server decides for real.
    const named = /\.(jpe?g|png|webp)$/i.test(file.name || "");
    if (file.type ? !TYPES.includes(file.type) : !named) throw new UploadError(`${TEXT().unsupported} Use a JPG, PNG or WebP photo.`, "UNSUPPORTED");
    if (!file.size) throw new UploadError("That file is empty. Please choose another photo.", "EMPTY");
    if (file.size > maxBytes) throw new UploadError(`That photo is larger than ${maxMb()} MB. Please choose a smaller file.`, "TOO_LARGE");
    onProgress(5);
    const { image, url } = await decode(file);
    let preview;
    try {
      onProgress(40);
      preview = await makePreview(image);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (!preview) throw new UploadError("That photo couldn't be prepared. Please try another one.", "PREVIEW");
    onProgress(70);
    const id = newId();
    const meta = { name: file.name || "photo", type: file.type || "", size: file.size, width: image.naturalWidth, height: image.naturalHeight, at: Date.now(), uploadId: null, userId: null, server: null };
    previews.set(id, preview);
    originals.set(id, file);
    await Promise.all([tx(PREVIEWS, "readwrite", (s) => s.put(preview, id)), tx(ORIGINALS, "readwrite", (s) => s.put(file, id)), saveMeta(id, meta)]);
    onProgress(100);
    // Someone who is already logged in: the original starts on its way now, so ordering doesn't have to wait for it.
    sendInBackground(id);
    return { id, url: getUrlSync(id), name: meta.name, width: meta.width, height: meta.height, size: meta.size, type: meta.type };
  }

  function getUrlSync(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = previews.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  }

  /** The preview's address, loading it from this browser's storage if needed. */
  async function getUrl(id) {
    if (!id) return null;
    if (!previews.has(id)) {
      const blob = await tx(PREVIEWS, "readonly", (s) => s.get(id));
      if (blob) previews.set(id, blob);
    }
    return getUrlSync(id);
  }

  /** What is known about a photo, or null when this browser no longer has it. */
  async function info(id) {
    if (!id) return null;
    const meta = await loadMeta(id);
    if (!meta) return null;
    return { id, name: meta.name, type: meta.type, size: meta.size, width: meta.width, height: meta.height, uploadId: meta.uploadId || null };
  }

  /** Can this photo still be ordered: is its original here, or already with FrameX? */
  async function has(id) {
    if (!id) return false;
    const meta = await loadMeta(id);
    if (!meta) return false;
    return Boolean(meta.uploadId) || Boolean(await loadOriginal(id));
  }

  /* ---------------------------------------------------------------- Sending the original */
  const inflight = new Map(); // id -> Promise
  const checked = new Set(); // upload ids this page has confirmed with the server
  const announce = (id, state, extra = {}) => document.dispatchEvent(new CustomEvent("framex:upload", { detail: Object.assign({ id, state, percent: state === "done" ? 100 : 0, message: "" }, extra) }));

  const friendly = (error) => {
    if (error instanceof UploadError) return error;
    // The server's own words for a refused file ("larger than…", "supported image format…"); otherwise the general message.
    if (error && error.status && error.status !== 401 && error.message && !error.network) return new UploadError(error.message, error.code || "REFUSED");
    if (error && error.status === 401) return new UploadError("Please log in to upload your photo.", "LOGIN");
    return new UploadError(TEXT().failed, "FAILED");
  };

  async function send(id, onProgress) {
    const state = await FrameX.auth.ready;
    const user = FrameX.auth.state.user || (state && state.user);
    if (!user) throw new UploadError("Please log in to upload your photo.", "LOGIN");
    const meta = await loadMeta(id);
    if (!meta) throw new UploadError("This photo is no longer on this device. Please add it again.", "MISSING");

    // Already with FrameX, for this account: make sure it is still there (once per page).
    if (meta.uploadId && meta.userId === user.id) {
      if (checked.has(meta.uploadId)) return meta.server;
      try {
        const r = await FrameX.http.get("/uploads/" + encodeURIComponent(meta.uploadId));
        checked.add(meta.uploadId);
        meta.server = r.upload;
        await saveMeta(id, meta);
        return r.upload;
      } catch (error) {
        if (error.status !== 404) throw friendly(error);
        // Removed on the server (or it was another account's): send it again below.
      }
    }
    const original = await loadOriginal(id);
    if (!original) throw new UploadError("This photo is no longer on this device. Please add it again.", "MISSING");
    announce(id, "uploading", { percent: 0 });
    try {
      const r = await FrameX.http.upload("/uploads", original, {
        name: meta.name,
        onProgress(percent) {
          announce(id, "uploading", { percent });
          if (onProgress) onProgress(percent);
        },
      });
      Object.assign(meta, { uploadId: r.upload.id, userId: user.id, server: r.upload });
      checked.add(r.upload.id);
      await saveMeta(id, meta);
      announce(id, "done");
      return r.upload;
    } catch (error) {
      const shown = friendly(error);
      announce(id, "failed", { message: shown.message });
      throw shown;
    }
  }

  /**
   * Send a photo's ORIGINAL file to FrameX, once. Resolves to the server's
   * record { id, name, format, width, height, bytes, ... }: its format and
   * pixel size are read by the server from the file itself.
   */
  function upload(id, onProgress = null) {
    if (inflight.has(id)) return inflight.get(id);
    const run = send(id, onProgress).finally(() => inflight.delete(id));
    inflight.set(id, run);
    return run;
  }

  /** { slot: photoId } -> { slot: uploadId }. onProgress gets one number for all of them together. */
  async function uploadAll(photos, onProgress = null) {
    const entries = Object.entries(photos || {}).filter(([, id]) => id);
    const done = entries.map(() => 0);
    const out = {};
    for (let i = 0; i < entries.length; i++) {
      const [slot, id] = entries[i];
      const record = await upload(id, (percent) => {
        done[i] = percent;
        if (onProgress) onProgress(Math.round(done.reduce((a, b) => a + b, 0) / entries.length));
      });
      done[i] = 100;
      if (onProgress) onProgress(Math.round(done.reduce((a, b) => a + b, 0) / entries.length));
      out[slot] = record.id;
    }
    return out;
  }

  /**
   * What "Add to cart" and "Buy Now" do for a product made from the customer's
   * photos: the visitor logs in if needed (ui/auth-gate.js), then the ORIGINAL
   * files are uploaded.
   *   photos: { slot: photoId }
   * -> { ok: true, uploadIds: { slot: uploadId } }
   *  | { ok: false, cancelled: true }             the login was dismissed
   *  | { ok: false, message, code }               a message the customer can act on
   */
  async function forOrder({ reason = "add", itemName = "", photos, onProgress = null }) {
    const loggedIn = await FrameX.authGate.require({ reason, itemName });
    if (!loggedIn) return { ok: false, cancelled: true };
    try {
      return { ok: true, uploadIds: await uploadAll(photos, onProgress) };
    } catch (error) {
      const shown = friendly(error);
      return { ok: false, message: shown.message, code: shown.code };
    }
  }

  /**
   * A small square picture of a photo, for the cart line and the order
   * (drawn from the preview copy; never used for printing).
   */
  async function thumbnail(id, { size = 200, limit = 40000 } = {}) {
    const url = await getUrl(id);
    if (!url) return "";
    let image;
    try {
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } catch (error) {
      return "";
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= limit) return data;
    }
    return "";
  }

  /** After a photo is chosen: if someone is logged in, start sending it. Problems are reported when they order. */
  function sendInBackground(id) {
    if (!FrameX.auth || !FrameX.http || !FrameX.http.enabled()) return;
    FrameX.auth.ready
      .then((state) => (state.authenticated ? upload(id) : null))
      .catch(() => {});
  }

  /* ---------------------------------------------------------------- Removing */
  async function forget(id) {
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
    previews.delete(id);
    originals.delete(id);
    metas.delete(id);
    await Promise.all([PREVIEWS, ORIGINALS, META].map((store) => tx(store, "readwrite", (s) => s.delete(id))));
  }

  /** Remove a photo from this browser, and from FrameX if it was uploaded and nothing uses it. */
  async function remove(id) {
    if (!id) return;
    const meta = await loadMeta(id);
    await forget(id);
    if (meta && meta.uploadId && FrameX.http && FrameX.http.enabled()) {
      // A photo that is in a cart line or an order is kept by the server (it answers "in use"): that is fine.
      FrameX.http.delete("/uploads/" + encodeURIComponent(meta.uploadId)).catch(() => {});
    }
  }

  /* Photos nothing refers to any more (a replaced photo, an abandoned design) are
     cleared from this browser. What still refers to a photo: Studio drafts and
     saved designs, the wall-art customiser and product pages (their saved state
     names the photo's id). */
  const HOLDERS = ["framex.studioDrafts.v1", "framex.designs.v1", "framex.templateDrafts.v1", "framex.wallArt.v1", "framex.productPhotos.v1"];
  async function tidy() {
    const keys = (await tx(META, "readonly", (s) => s.getAllKeys())) || [];
    if (!keys.length) return;
    let text = "";
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (const key of HOLDERS) {
        try {
          text += store.getItem(key) || "";
        } catch (error) {
          return; // storage blocked: can't tell what is in use, so nothing is removed
        }
      }
    }
    const inUse = new Set(text.match(/ph-[a-z0-9]+/g) || []);
    const now = Date.now();
    for (const id of keys) {
      const meta = await loadMeta(id);
      const age = now - ((meta && meta.at) || 0);
      const stale = age > KEEP_DAYS * 86400000 || (!inUse.has(id) && age > 86400000);
      if (stale && !inflight.has(id)) await forget(id);
    }
  }
  // Old-style previews (before originals were kept) have no record: they are simply left out by has().
  if ("requestIdleCallback" in window) requestIdleCallback(() => tidy().catch(() => {}), { timeout: 8000 });
  else setTimeout(() => tidy().catch(() => {}), 4000);

  /* ---------------------------------------------------------------- Words */
  function sizeText(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }
  /** "IMG_2041.JPG · 3840 × 2160 px · 4.2 MB": plain facts about the file, no judgement. */
  function facts(photo) {
    if (!photo) return "";
    return [photo.name, photo.width && photo.height ? `${photo.width} × ${photo.height} px` : "", photo.size || photo.bytes ? sizeText(photo.size || photo.bytes) : ""].filter(Boolean).join(" · ");
  }

  FrameX.uploadService = {
    prepare,
    getUrl,
    has,
    info,
    upload,
    uploadAll,
    forOrder,
    thumbnail,
    remove,
    facts,
    sizeText,
    UploadError,
    TYPES,
    ACCEPT: TYPES.join(","),
    get MAX_MB() {
      return maxMb();
    },
    get qualityText() {
      return TEXT().quality;
    },
    limits,
    persistent: () => db().then(Boolean),
  };
})((window.FrameX = window.FrameX || {}));
