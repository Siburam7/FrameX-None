/* ==========================================================================
   HTTP provider — the contract for the future backend.
   Same method names and response shapes as seed-provider.js.
   NOT yet exercised against a real server (none exists yet); see
   docs/ARCHITECTURE.md for the endpoint list and payload shapes.
   ========================================================================== */
(function (FrameX) {
  const { config } = FrameX;

  function buildUrl(path, params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && value !== false) query.set(key, String(value));
    });
    const qs = query.toString();
    return `${config.apiBaseUrl}${path}${qs ? "?" + qs : ""}`;
  }

  async function request(path, params) {
    const response = await fetch(buildUrl(path, params), { headers: { Accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`);
    return response.json();
  }

  FrameX.httpProvider = {
    buildUrl,
    getSite: () => request("/site"),
    getCategories: () => request("/categories"),
    getReviews: () => request("/reviews"),
    getCommunity: () => request("/community"),
    getFaq: () => request("/faq"),
    getGallery: () => request("/gallery"),
    getShops: (params) => request("/shops", params),
    getShop: (id) => request(`/shops/${encodeURIComponent(id)}`),
    getProducts: (params) => request("/products", params),
    getProduct: (id) => request(`/products/${encodeURIComponent(id)}`)
  };
})((window.FrameX = window.FrameX || {}));
