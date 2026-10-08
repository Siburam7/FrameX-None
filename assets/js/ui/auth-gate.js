/* ==========================================================================
   Login / sign-up dialog (FrameX.authGate).

   Browsing never needs an account. When something does (adding to the cart,
   opening the cart), this opens the site's own login and sign-up forms in a
   dialog on top of the current page, so nothing the visitor chose is lost:

     const loggedIn = await FrameX.authGate.require({ reason: "add", itemName });

   Resolves true once the visitor has logged in or created an account, false
   if they close the dialog. The forms are the same ones the login and sign-up
   pages use (ui/auth-pages.js + ui/forms.js); they are loaded on first use.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;

  const NOTICE = {
    add: (name) =>
      `Log in or create an account to add ${name ? `<strong>${esc(name)}</strong>` : "this"} to your cart.`,
    cart: () => "Log in or create an account to see your cart.",
    buy: (name) =>
      `Log in or create an account to order ${name ? `<strong>${esc(name)}</strong>` : "this"}.`,
  };
  const PLAIN = {
    add: "Log in or create an account to add items to your cart.",
    cart: "Log in or create an account to see your cart.",
    buy: "Log in or create an account to place an order.",
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
          <p class="auth-gate__notice">${icon("bag")}<span></span></p>
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
    el.addEventListener("keydown", (event) =>
      FrameX.overlay.trapFocus(el, event),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active) finish(false);
    });
    // "Create an account" / "Log in" switch the form in place instead of leaving the page.
    el.addEventListener("click", (event) => {
      const link = event.target.closest("[data-auth-view]");
      if (!link) return;
      event.preventDefault();
      show(link.dataset.authView);
    });
  }

  function show(view) {
    const body = $(".auth-gate__body", el);
    const state = FrameX.auth.state;
    if (!state.available || !state.reachable)
      return FrameX.authPages.unavailable(body);
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
   * reason: "add" (adding `itemName` to the cart) | "cart" (opening the cart)
   */
  async function require({ reason = "cart", itemName = "" } = {}) {
    const state = await FrameX.auth.ready;
    if (state.authenticated) return true;
    if (active) return active.promise;

    // The login and sign-up pages already show the form: point at it.
    const page = document.body.dataset.page;
    if (page === "login" || page === "signup") {
      FrameX.toast.show(PLAIN[reason] || PLAIN.cart);
      const first = document.querySelector("#auth-root input");
      if (first) first.focus();
      return false;
    }

    const opener = document.activeElement;
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    active = { promise, resolve, opener };
    try {
      await loadForms();
    } catch (error) {
      // The dialog couldn't be loaded: use the full login page and come back here after.
      active = null;
      window.location.href = FrameX.auth.loginUrl();
      return new Promise(() => {});
    }
    if (!el) build();
    if (FrameX.cartDrawer) FrameX.cartDrawer.close();
    // No backend to log in to: say what the cart needs instead of asking for a login.
    $(".auth-gate__notice span", el).innerHTML =
      state.available && state.reachable
        ? (NOTICE[reason] || NOTICE.cart)(itemName)
        : "Your cart is kept in your FrameX account.";
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    FrameX.overlay.show(dismiss);
    show("login"); // after the dialog is visible, so the first field can take focus
    return promise;
  }

  FrameX.authGate = { require, isOpen: () => Boolean(active) };
})((window.FrameX = window.FrameX || {}));
