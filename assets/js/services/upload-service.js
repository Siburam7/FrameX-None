/* ==========================================================================
   Upload service (frontend implementation).
   Prepares a customer photo for the template preview: checks type and size,
   reads it (with real read progress), scales it to a preview-friendly size and
   keeps it in this browser's IndexedDB so a draft survives a page reload.

   NOTHING is sent to a server. Every caller only uses this interface:
     prepare(file, onProgress) -> { id, url, name, width, height, size }
     getUrl(id)                -> object URL for a stored photo (or null)
     remove(id)
   so a real storage API can replace this file later: prepare() would upload
   the ORIGINAL file and return its remote id + URL instead.
   ========================================================================== */
(function (FrameX) {
  const TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_MB = 15;
  const PREVIEW_EDGE = 1800; // px, longest side of the stored preview copy
  const DB = "framex-media";
  const STORE = "photos";

  /** Customer-facing errors (never raw technical messages). */
  class UploadError extends Error {}

  let dbPromise = null;
  function db() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null); // private mode etc.: photos stay in memory only
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

  const memory = new Map(); // id -> Blob (fallback + cache)
  const urls = new Map(); // id -> object URL

  function readFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 70));
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new UploadError("That photo couldn't be read. Please try another one."));
      reader.readAsArrayBuffer(file);
    });
  }

  function decode(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new UploadError("That file doesn't look like a valid image. Please choose a JPG, PNG or WebP photo."));
      };
      image.src = url;
    });
  }

  function scale(image) {
    const ratio = Math.min(1, PREVIEW_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve({ blob: b, width: canvas.width, height: canvas.height }), "image/jpeg", 0.88));
  }

  /** Validate, read and store one photo. Throws UploadError with a friendly message. */
  async function prepare(file, onProgress = () => {}) {
    if (!file) throw new UploadError("No photo was selected.");
    if (!TYPES.includes(file.type)) throw new UploadError("Please choose a JPG, PNG or WebP photo.");
    if (file.size > MAX_MB * 1024 * 1024) throw new UploadError(`That photo is larger than ${MAX_MB} MB. Please choose a smaller one.`);
    onProgress(2);
    const buffer = await readFile(file, onProgress);
    const { image, url } = await decode(new Blob([buffer], { type: file.type }));
    onProgress(80);
    const out = await scale(image);
    URL.revokeObjectURL(url);
    if (!out.blob) throw new UploadError("That photo couldn't be prepared. Please try another one.");
    const id = "ph-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    memory.set(id, out.blob);
    await tx("readwrite", (store) => store.put(out.blob, id));
    onProgress(100);
    return { id, url: getUrlSync(id), name: file.name, width: image.naturalWidth, height: image.naturalHeight, size: file.size };
  }

  function getUrlSync(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = memory.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  }

  /** Object URL for a stored photo, loading it from IndexedDB if needed. */
  async function getUrl(id) {
    if (!id) return null;
    if (!memory.has(id)) {
      const blob = await tx("readonly", (store) => store.get(id));
      if (blob) memory.set(id, blob);
    }
    return getUrlSync(id);
  }

  async function remove(id) {
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
    memory.delete(id);
    await tx("readwrite", (store) => store.delete(id));
  }

  FrameX.uploadService = { prepare, getUrl, remove, UploadError, TYPES, MAX_MB, persistent: () => db().then(Boolean) };
})((window.FrameX = window.FrameX || {}));
