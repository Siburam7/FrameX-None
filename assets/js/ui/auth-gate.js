/* ==========================================================================
   The login box (FrameX.authGate).

   There is no login or sign-up page (owner, 2026-10-31): logging in happens in a
   box on top of the current page, so nothing the visitor chose is lost. Logging in
   also signs up (a new email gives its name and becomes an account).

     const loggedIn = await FrameX.authGate.require({ reason: "add", itemName });

   Resolves true once the visitor is logged in, false if they close the box.
   It opens by itself for:
     - every link to login.html / signup.html (header "Log in", the phone's
       Account tab, the footer's "Shop Login"), while nobody is logged in;
     - a page opened with ?login=1 (login.html and signup.html send old links,
       emails and bookmarks to the home page that way, with ?next= and ?type=shop).
   The box's content comes from ui/auth-pages.js + ui/forms.js, loaded on first use.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;

  // What the box says above the form, when it opened for a reason ("login": nothing)
  const NOTICE = {
    add: (name) => `Log in to add ${name ? `<strong>${esc(name)}</strong>` : "this"} to your cart.`,
    cart: () => "Log in to see your cart.",
    buy: (name) => `Log in to order ${name ? `<strong>${esc(name)}</strong>` : "this"}.`,
    page: () => "Log in to open this page.",
  };

  let el = null;
  let active = null; // { promise, resolve, opener }

  /* ---- The forms' code and styles, fetched the first time they are needed ---- */
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load " + src));
      document.head.appendChild(s);
    });
  const loadCss = (href) =>
    new Promise((resolve) => {
      if (document.querySelector(`link[href$="${href}"]`)) return resolve();
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = l.onerror = resolve; // unstyled forms still work
      document.head.appendChild(l);
    });
  let deps = null;
  function loadForms() {
    deps =
      deps ||
      Promise.all([
        loadCss("assets/css/auth.css"),
        (async () => {
          if (!FrameX.forms) await loadScript("assets/js/ui/forms.js");
          if (!FrameX.authPages) await loadScript("assets/js/ui/auth-pages.js");
        })(),
      ]).catch((error) => {
        deps = null;
        throw error;
      });
    return deps;
  }

  function build() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="auth-gate" id="auth-gate" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title" aria-hidden="true">
        <div class="auth-gate__panel">
          <button class="auth-gate__close" type="button" aria-label="Close">${icon("close")}</button>
          <p class="auth-gate__notice" hidden>${icon("bag")}<span></span></p>
          <div class="auth-gate__body" data-embedded="true"></div>
        </div>
      </div>`,
    );
    el = $("#auth-gate");
    $(".auth-gate__close", el).addEventListener("click", () => finish(false));
    // The backdrop is behind the dialog's own full-screen layer.
    el.addEventListener("mousedown", (event) => {
      if (event.target === el) finish(false);
    });
    el.addEventListener("keydown", (event) => FrameX.overlay.trapFocus(el, event));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active) finish(false);
    });
  }

  function show(view) {
    const body = $(".auth-gate__body", el);
    const state = FrameX.auth.state;
    if (!state.available || !state.reachable) return FrameX.authPages.unavailable(body);
    FrameX.authPages.mount(body, view, { onSuccess: () => finish(true) });
    $(".auth-gate__panel", el).scrollTop = 0;
  }

  const dismiss = () => finish(false);

  function finish(loggedIn) {
    if (!active) return;
    const done = active;
    active = null;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    $(".auth-gate__body", el).innerHTML = ""; // no typed password stays in the page
    FrameX.overlay.hide(dismiss);
    if (done.opener && done.opener.focus) done.opener.focus();
    done.resolve(loggedIn);
  }

  /**
   * Make sure the visitor is logged in.
   * reason: "login" (asked for it) | "add" (adding `itemName` to the cart) | "cart" | "buy" | "page" (a page needs it)
   * view:   "login" (email code, Google) | "shop" (the password form on its shop tab)
   */
  async function require({ reason = "login", itemName = "", view = "login" } = {}) {
    const state = await FrameX.auth.ready;
    if (state.authenticated) return true;
    if (active) return active.promise;

    const opener = document.activeElement;
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    active = { promise, resolve, opener };
    try {
      await loadForms();
    } catch (error) {
      // The box couldn't be loaded: nothing can be done here but say so
      active = null;
      FrameX.toast.show("The login couldn't be opened. Check your connection and try again.");
      resolve(false);
      return false;
    }
    if (!el) build();
    if (FrameX.cartDrawer) FrameX.cartDrawer.close();
    const notice = $(".auth-gate__notice", el);
    // No backend to log in to: say what the cart needs instead of asking for a login.
    const text = !(state.available && state.reachable) ? "Your cart is kept in your FrameX account." : NOTICE[reason] ? NOTICE[reason](itemName) : "";
    $("span", notice).innerHTML = text;
    notice.hidden = !text;
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    FrameX.overlay.show(dismiss);
    show(view); // after the box is visible, so the first field can take focus
    return promise;
  }

  /* ---- Opening by itself: links to the old login pages, and ?login=1 ---- */

  /**
   * After a login the box opened for by itself: a customer stays on the page they were on, unless a "next" page was
   * asked for (it is in the address as ?next=); a shop, artist or staff login goes to its dashboard.
   */
  function afterLogin(next) {
    const user = FrameX.auth.state.user;
    if (user && (next || user.role !== "CUSTOMER")) FrameX.authPages.welcome(user); // goes to destination(user), which reads ?next
  }

  async function openFor(view, next) {
    if (await require({ reason: "login", view })) afterLogin(next);
  }

  // A link to login.html / signup.html opens the box instead of a page (while nobody is logged in)
  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !/\/(login|signup)\.html$/.test(url.pathname)) return;
    if (FrameX.auth.state.authenticated) return;
    event.preventDefault();
    const next = FrameX.auth.safeNext(url.searchParams.get("next"));
    if (next) history.replaceState(history.state, "", withParams({ next }));
    openFor(url.searchParams.get("type") === "shop" ? "shop" : "login", next);
  });

  /** The current address with some query values set (a value of "" takes it away). */
  function withParams(values) {
    const u = new URL(window.location.href);
    Object.entries(values).forEach(([name, value]) => (value ? u.searchParams.set(name, value) : u.searchParams.delete(name)));
    return u.pathname + u.search + u.hash;
  }

  // ?login=1 (from login.html / signup.html): open the box once the page is ready, then take ?login and ?type away
  async function fromAddress() {
    const q = new URLSearchParams(window.location.search);
    if (q.get("login") !== "1") return;
    const view = q.get("type") === "shop" ? "shop" : "login";
    const next = FrameX.auth.safeNext(q.get("next"));
    history.replaceState(history.state, "", withParams({ login: "", type: "" }));
    const state = await FrameX.auth.ready;
    if (state.authenticated) {
      if (next) window.location.replace(next);
      return;
    }
    openFor(view, next);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromAddress);
  else fromAddress();

  FrameX.authGate = { require, isOpen: () => Boolean(active) };
})((window.FrameX = window.FrameX || {}));
