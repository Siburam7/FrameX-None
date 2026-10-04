/* ==========================================================================
   Media service: product images, 360° frames and videos uploaded by shops.

   FRONTEND IMPLEMENTATION. Files are checked, resized and kept in this
   browser's IndexedDB ("framex-shop-media"); nothing is sent to a server.
   A product stores references like "media:<id>" (large image) and
   "media:<id>:thumb" (small copy), so the same product data works when a real
   storage API replaces this file: prepare() would upload the original and
   return https:// URLs instead, and resolve() would just return them.

     validate(file, kind)          -> friendly error message or ""
     prepare(file, kind, onProgress) -> { id, url, thumb, width, height, name, size, duration? }
     resolve(ref, { thumb })       -> displayable URL (object URL / normal URL)
     listingThumb(ref)             -> small JPEG data URL for cards and the cart
     remove(id)
   ========================================================================== */
(function (FrameX) {
  const DB = "framex-shop-media";
  const STORE = "files";
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const VIDEO_TYPES = ["video/mp4", "video/webm"];

  /** Per kind: accepted types, max size and the smallest sensible image. */
  const RULES = {
    view: {
      types: IMAGE_TYPES,
      maxMB: 12,
      minEdge: 600,
      large: 2000,
      thumb: 480,
    },
    frame360: {
      types: IMAGE_TYPES,
      maxMB: 6,
      minEdge: 400,
      large: 1400,
      thumb: 0,
    },
    material: {
      types: IMAGE_TYPES,
      maxMB: 8,
      minEdge: 300,
      large: 1200,
      thumb: 360,
    },
    thumbnail: {
      types: IMAGE_TYPES,
      maxMB: 8,
      minEdge: 300,
      large: 1200,
      thumb: 480,
    },
    video: { types: VIDEO_TYPES, maxMB: 60 },
  };

  class MediaError extends Error {}

  let dbPromise = null;
  function db() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    }
    return dbPromise;
  }

  async function tx(mode, run) {
    const conn = await db();
    if (!conn) return null;
    return new Promise((resolve) => {
      const t = conn.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : null);
      t.onerror = () => resolve(null);
    });
  }

  const memory = new Map(); // key -> Blob
  const urls = new Map(); // key -> object URL

  const label = (types) =>
    types
      .map((t) => t.split("/")[1].toUpperCase().replace("JPEG", "JPG"))
      .join(", ");

  /** Friendly message for a file that can't be used, or "" when it's fine. */
  function validate(file, kind = "view") {
    const rule = RULES[kind] || RULES.view;
    if (!file) return "No file was selected.";
    if (!rule.types.includes(file.type))
      return `“${file.name}” isn't a supported file. Please use ${label(rule.types)}.`;
    if (file.size > rule.maxMB * 1024 * 1024)
      return `“${file.name}” is larger than ${rule.maxMB} MB. Please use a smaller file.`;
    return "";
  }

  function decode(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(
          new MediaError(
            "That file doesn't look like a valid image. Please choose another photo.",
          ),
        );
      };
      image.src = url;
    });
  }

  function resize(image, edge, quality = 0.86) {
    const ratio = Math.min(
      1,
      edge / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a clean background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  }

  const newId = () =>
    "md-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function put(key, blob) {
    memory.set(key, blob);
    await tx("readwrite", (store) => store.put(blob, key));
  }

  function videoMeta(blob) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(blob);
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        resolve({
          duration: isFinite(v.duration) ? Math.round(v.duration) : null,
        });
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        resolve({ duration: null });
        URL.revokeObjectURL(url);
      };
      v.src = url;
    });
  }

  /** Validate, resize and store one file. Throws MediaError with a friendly message. */
  async function prepare(file, kind = "view", onProgress = () => {}) {
    const problem = validate(file, kind);
    if (problem) throw new MediaError(problem);
    const rule = RULES[kind] || RULES.view;
    const id = newId();
    onProgress(10);
    if (kind === "video") {
      await put(id, file);
      const meta = await videoMeta(file);
      onProgress(100);
      return {
        id,
        url: `media:${id}`,
        thumb: "",
        width: null,
        height: null,
        name: file.name,
        size: file.size,
        duration: meta.duration,
      };
    }
    const { image, url } = await decode(file);
    try {
      const shortest = Math.min(image.naturalWidth, image.naturalHeight);
      if (shortest < rule.minEdge) {
        throw new MediaError(
          `“${file.name}” is too small (${image.naturalWidth} × ${image.naturalHeight} px). Please use a photo at least ${rule.minEdge} px on its shortest side so it looks sharp.`,
        );
      }
      onProgress(40);
      const large = await resize(image, rule.large);
      if (!large)
        throw new MediaError(
          "That photo couldn't be prepared. Please try another one.",
        );
      await put(id, large);
      onProgress(75);
      if (rule.thumb) {
        const small = await resize(image, rule.thumb, 0.8);
        if (small) await put(`${id}:thumb`, small);
      }
      onProgress(100);
      return {
        id,
        url: `media:${id}`,
        thumb: rule.thumb ? `media:${id}:thumb` : "",
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name,
        size: file.size,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const keyOf = (ref) => String(ref || "").replace(/^media:/, "");
  const isMedia = (ref) => /^media:/.test(String(ref || ""));

  /** A URL the browser can display. Normal URLs pass straight through. */
  async function resolve(ref, { thumb = false } = {}) {
    if (!ref) return "";
    if (!isMedia(ref)) return ref;
    let key = keyOf(ref);
    if (thumb && !key.endsWith(":thumb")) key += ":thumb";
    if (urls.has(key)) return urls.get(key);
    if (!memory.has(key)) {
      const blob = await tx("readonly", (store) => store.get(key));
      if (blob) memory.set(key, blob);
    }
    let blob = memory.get(key);
    if (!blob && thumb) return resolve(ref, { thumb: false }); // no small copy: use the large one
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  }

  /** Small JPEG data URL (works on every page without IndexedDB). */
  async function listingThumb(ref, edge = 640) {
    if (!ref) return "";
    if (!isMedia(ref)) return ref;
    const src = await resolve(ref);
    if (!src) return "";
    try {
      const { image, url } = await decode(await (await fetch(src)).blob());
      URL.revokeObjectURL(url);
      const ratio = Math.min(
        1,
        edge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * ratio);
      canvas.height = Math.round(image.naturalHeight * ratio);
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.78);
    } catch (e) {
      return "";
    }
  }

  async function remove(id) {
    const base = keyOf(id).replace(/:thumb$/, "");
    for (const key of [base, `${base}:thumb`]) {
      if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
      urls.delete(key);
      memory.delete(key);
      await tx("readwrite", (store) => store.delete(key));
    }
  }

  /** Delete stored files no product refers to any more. */
  async function collectGarbage(referenced) {
    const keep = new Set(
      Array.from(referenced || []).map((r) => keyOf(r).replace(/:thumb$/, "")),
    );
    const keys = (await tx("readonly", (store) => store.getAllKeys())) || [];
    await Promise.all(
      keys
        .filter((k) => !keep.has(String(k).replace(/:thumb$/, "")))
        .map((k) => remove(k)),
    );
  }

  FrameX.mediaService = {
    RULES,
    validate,
    prepare,
    resolve,
    listingThumb,
    remove,
    collectGarbage,
    isMedia,
    MediaError,
  };
})((window.FrameX = window.FrameX || {}));
