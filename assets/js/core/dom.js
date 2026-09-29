/* Small DOM + string helpers shared by every UI module. */
(function (FrameX) {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

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

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Focusable elements inside a container (used by the focus traps). */
  const focusable = (root) =>
    $$('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])', root)
      .filter((el) => el.offsetParent !== null || el === document.activeElement);

  FrameX.dom = { $, $$, escapeHtml, icon, debounce, prefersReducedMotion, focusable };
})((window.FrameX = window.FrameX || {}));
