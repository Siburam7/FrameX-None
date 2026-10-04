/* ==========================================================================
   HTTP client for the FrameX backend (FrameX.http).
   One place builds every request: base URL, session (httpOnly cookie, or a
   bearer token when configured), the X-FrameX-Client header the API requires
   for state-changing requests, and friendly error messages.

     await FrameX.http.get("/shops/nearby", { lat, lng, radius })
     await FrameX.http.post("/auth/login", { identifier, password })
   Failures throw FrameX.http.ApiError { status, code, message, fields, network }.
   ========================================================================== */
(function (FrameX) {
  const cfg = (FrameX.config && FrameX.config.backend) || {};
  const TOKEN_KEY = "framex.session.v1";

  class ApiError extends Error {
    constructor(message, { status = 0, code = "", fields = null, network = false, retryAfterSeconds = 0 } = {}) {
      super(message);
      this.status = status;
      this.code = code;
      this.fields = fields;
      this.network = network;
      this.retryAfterSeconds = retryAfterSeconds; // set on "too many requests" answers
    }
  }

  const FALLBACK = {
    400: "That didn't work. Please check and try again.",
    401: "Please log in to continue.",
    403: "You don't have permission to do that.",
    404: "We couldn't find that.",
    409: "That already exists.",
    422: "Please check the highlighted fields.",
    429: "Too many attempts. Please wait a little and try again.",
  };

  const enabled = () => Boolean(cfg.url);
  const bearer = () => cfg.session === "bearer";

  function getToken() {
    if (!bearer()) return "";
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  /** Bearer mode only: keep (or forget) the session token for this browser tab. */
  function setToken(token) {
    if (!bearer()) return;
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* storage blocked: the session lasts for this page only */
    }
  }

  async function request(method, path, body, params) {
    if (!enabled())
      throw new ApiError("FrameX accounts aren't available here yet.", {
        code: "BACKEND_NOT_CONFIGURED",
        network: true,
      });
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.set(k, String(v));
    });
    const url = cfg.url + path + (query.toString() ? "?" + query : "");
    const token = getToken();
    let response;
    try {
      response = await fetch(url, {
        method,
        // Cookie mode sends the httpOnly session cookie; bearer mode never touches cookies.
        credentials: bearer() ? "omit" : "include",
        headers: Object.assign(
          { Accept: "application/json", "X-FrameX-Client": "web" },
          body !== undefined ? { "Content-Type": "application/json" } : {},
          token ? { Authorization: "Bearer " + token } : {},
        ),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError(
        "We can't reach FrameX right now. Check your connection and try again.",
        { code: "NETWORK", network: true },
      );
    }
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      /* empty or non-JSON body */
    }
    if (!response.ok) {
      const err = (data && data.error) || {};
      throw new ApiError(
        err.message ||
          FALLBACK[response.status] ||
          "Something went wrong on our side. Please try again.",
        { status: response.status, code: err.code || "", fields: err.fields || null, retryAfterSeconds: err.retryAfterSeconds || 0 },
      );
    }
    return data;
  }

  // Public settings from the backend (radius options, features), asked once.
  let configPromise = null;
  function serverConfig() {
    if (!enabled()) return Promise.resolve(null);
    configPromise = configPromise || request("GET", "/config").catch(() => null);
    return configPromise;
  }

  FrameX.http = {
    enabled,
    ApiError,
    setToken,
    serverConfig,
    get: (path, params) => request("GET", path, undefined, params),
    post: (path, body) => request("POST", path, body || {}),
    patch: (path, body) => request("PATCH", path, body || {}),
  };
})((window.FrameX = window.FrameX || {}));
