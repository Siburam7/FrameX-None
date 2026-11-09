/* ==========================================================================
   Auth store (FrameX.auth): the ONE place the website knows who is logged in.

     FrameX.auth.state   { loading, authenticated, user, role, available }
     FrameX.auth.ready   promise that resolves once the session has been checked
     "framex:auth-change" event on document whenever the state changes

   The state is a display copy of what the backend says (GET /api/auth/me).
   It grants nothing by itself: every protected API checks the session and the
   role on the server. No password or role is ever stored in the browser.
   ========================================================================== */
(function (FrameX) {
  const http = FrameX.http;
  const state = {
    loading: true,
    authenticated: false,
    user: null,
    role: null,
    available: http.enabled(), // false = no backend configured for this site
    reachable: true, // false = backend configured but not answering
  };

  function set(user) {
    state.loading = false;
    state.authenticated = Boolean(user);
    state.user = user || null;
    state.role = user ? user.role : null;
    document.dispatchEvent(new CustomEvent("framex:auth-change", { detail: state }));
  }

  /** Ask the backend who this browser is logged in as (once per page). */
  let ready = null;
  function init() {
    if (ready) return ready;
    // No backend, or a browser that holds no session token: nobody is logged in, and there is nothing to wait for.
    // (A visitor's first page no longer waits for a backend that may take a while to wake up.)
    ready = !state.available || (http.mayHaveSession && !http.mayHaveSession())
      ? Promise.resolve(set(null))
      : http
          .get("/auth/me")
          .then((r) => {
            // The backend no longer knows this session (logged out elsewhere, password changed, unused for too long):
            // the token this browser kept is of no use any more.
            if (!r.authenticated && http.setToken) http.setToken("");
            set(r.authenticated ? r.user : null);
          })
          .catch(() => {
            state.reachable = false;
            set(null);
          });
    ready = ready.then(() => state);
    return ready;
  }

  async function startSession(response) {
    if (response.token) http.setToken(response.token);
    set(response.user);
    return response.user;
  }

  const login = (identifier, password, accountType) =>
    http.post("/auth/login", { identifier, password, accountType }).then(startSession);

  const signup = (data) => http.post("/auth/signup", data).then(startSession);

  // "Continue with Google / Facebook": { credential } or { accessToken }, checked by the backend with Google / Facebook
  const socialLogin = (provider, proof) => http.post("/auth/" + provider, proof).then(startSession);

  // Log in / sign up with a code by email (owner, 2026-10-31). A correct code logs an existing customer in (-> the user);
  // a new address answers { newAccount, signupToken, masked } and becomes an account with codeSignup().
  const sendLoginCode = (email) => http.post("/auth/code/send", { email });
  const verifyLoginCode = (email, code) => http.post("/auth/code/verify", { email, code }).then((r) => (r.newAccount ? r : startSession(r)));
  // The same with a mobile number and a code by SMS (2026-11-01); a new number's email is optional in codeSignup.
  // The code goes on WhatsApp first when the server has that on (2026-11-07); via "sms" = the customer asked for an SMS.
  const sendPhoneCode = (phone, via) => http.post("/auth/code/send", { phone, via: via || undefined });
  const verifyPhoneCode = (phone, code) => http.post("/auth/code/verify", { phone, code }).then((r) => (r.newAccount ? r : startSession(r)));
  const codeSignup = (signupToken, name, phone, email) => http.post("/auth/code/signup", { signupToken, name, phone, email: email || undefined }).then(startSession);

  async function logout() {
    try {
      await http.post("/auth/logout");
    } finally {
      http.setToken("");
      set(null);
    }
  }

  async function refresh() {
    const r = await http.get("/auth/me");
    set(r.authenticated ? r.user : null);
    return state.user;
  }

  // Another tab of this browser logged in or out: this tab follows (its header, its cart, its pages that listen).
  if (http.onSessionChange)
    http.onSessionChange((loggedIn) => {
      if (!loggedIn) return set(null);
      refresh().catch(() => {});
    });

  /** Where each role lands after logging in. */
  const HOME = { CUSTOMER: "shop.html", SHOP: "shop-dashboard.html", ADMIN: "admin.html", ARTIST: "artist-dashboard.html", CARE: "admin.html#/live" };
  const homeFor = (role) => HOME[role] || "index.html";

  /** Only same-site page names are accepted as a "next" address (no open redirects). */
  function safeNext(value) {
    return /^[a-z0-9-]+\.html([?#][\w\-./?=&%#:+]*)?$/i.test(String(value || "")) ? value : "";
  }

  const loginUrl = (accountType) => {
    const here = window.location.pathname.split("/").pop() + window.location.search + window.location.hash;
    const q = new URLSearchParams();
    if (accountType === "shop") q.set("type", "shop");
    if (safeNext(here)) q.set("next", here);
    return "login.html" + (q.toString() ? "?" + q : "");
  };

  /**
   * Route protection for a page: resolves the user when they hold one of the
   * roles; otherwise sends them to the login page (not logged in) or shows
   * `onForbidden` (logged in with another role). The APIs enforce the same
   * rule on the server; this only keeps the page from rendering.
   */
  async function guard(roles, { accountType = "customer", onForbidden = null } = {}) {
    await init();
    if (!state.authenticated) {
      // The login box over this page (owner, 2026-10-31): logged in -> the page opens again; closed -> the home page
      if (FrameX.authGate) {
        const ok = await FrameX.authGate.require({ reason: "page", view: accountType === "shop" ? "shop" : "login" });
        if (ok) window.location.reload();
        else window.location.href = "index.html";
      } else window.location.replace(loginUrl(accountType));
      return null;
    }
    if (!roles.includes(state.role)) {
      if (onForbidden) onForbidden(state.user);
      else window.location.replace(homeFor(state.role));
      return null;
    }
    return state.user;
  }

  FrameX.auth = {
    state,
    init,
    get ready() {
      return init();
    },
    login,
    signup,
    socialLogin,
    sendLoginCode,
    verifyLoginCode,
    sendPhoneCode,
    verifyPhoneCode,
    codeSignup,
    logout,
    refresh,
    guard,
    homeFor,
    safeNext,
    loginUrl,
    // Forgot password: find the account -> send a code by email or SMS -> verify the code.
    startRecovery: (identifier) => http.post("/auth/recovery/start", { identifier }),
    sendRecoveryCode: (recoveryToken, channel) => http.post("/auth/recovery/send", { recoveryToken, channel }),
    verifyRecoveryCode: (recoveryToken, channel, code) => http.post("/auth/recovery/verify", { recoveryToken, channel, code }),
    tokenInfo: (token) => http.post("/auth/token-info", { token }),
    resetPassword: (token, password, confirmPassword) =>
      http.post("/auth/reset-password", { token, password, confirmPassword }),
    // A customer who came through Google / Facebook (no password yet) sets one
    setPassword: (newPassword, confirmPassword) => http.post("/auth/set-password", { newPassword, confirmPassword }),
    changePassword: (currentPassword, newPassword, confirmPassword) =>
      http.post("/auth/change-password", { currentPassword, newPassword, confirmPassword }),
    updateProfile: (data) => http.patch("/users/me", data).then((r) => (set(r.user), r.user)),
    // Cart reminder emails on / off for this account (owner, 2026-10-31)
    setCartReminders: (on) => http.put("/users/me/cart-reminders", { on }).then((r) => (set(r.user), r.user)),
    // Offers and cart reminders on WhatsApp (owner, 2026-11-09): yes needs a mobile number on the account or an address
    setWhatsAppOffers: (on) => http.put("/users/me/whatsapp-offers", { on }).then((r) => (set(r.user), r.user)),
  };
})((window.FrameX = window.FrameX || {}));
