/* Small DOM + string helpers shared by every UI module. */
(function (FrameX) {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const ENTITIES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

  /** Inline SVG icon from the sprite in index.html. */
  const icon = (name, extraClass = "") =>
    `<svg class="icon ${extraClass}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

  const debounce = (fn, wait = 150) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Focusable elements inside a container (used by the focus traps). */
  const focusable = (root) =>
    $$(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      root,
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

  /**
   * Could this chosen file be a JPG, PNG or WebP picture?
   * A browser tells a file's type from its name, and phones and apps word it in several ways for the same
   * picture ("image/jpeg", "image/jpg", "image/pjpeg") or give no type at all. So a file is only turned away
   * here when the browser positively says it is something else (a HEIC photo, a GIF, a PDF, a video).
   * Everything else is sent, and the server reads the file's own bytes and decides for real.
   */
  const PHOTO_TYPE = /^image\/(jpe?g|pjpeg|png|x-png|webp)$/i;
  const UNKNOWN_TYPE = /^(|application\/octet-stream|binary\/octet-stream)$/i;
  const looksLikePhoto = (file) => {
    const type = String((file && file.type) || "").trim();
    return PHOTO_TYPE.test(type) || UNKNOWN_TYPE.test(type);
  };

  FrameX.dom = {
    $,
    $$,
    looksLikePhoto,
    escapeHtml,
    icon,
    debounce,
    prefersReducedMotion,
    focusable,
  };
})((window.FrameX = window.FrameX || {}));
