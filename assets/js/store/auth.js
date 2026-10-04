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
    ready = !state.available
      ? Promise.resolve(set(null))
      : http
          .get("/auth/me")
          .then((r) => set(r.authenticated ? r.user : null))
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

  /** Where each role lands after logging in. */
  const HOME = { CUSTOMER: "shop.html", SHOP: "shop-dashboard.html", ADMIN: "admin.html" };
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
      window.location.replace(loginUrl(accountType));
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
    changePassword: (currentPassword, newPassword, confirmPassword) =>
      http.post("/auth/change-password", { currentPassword, newPassword, confirmPassword }),
    updateProfile: (data) => http.patch("/users/me", data).then((r) => (set(r.user), r.user)),
  };
})((window.FrameX = window.FrameX || {}));
