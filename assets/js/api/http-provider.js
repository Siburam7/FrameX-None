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
      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== false
      )
        query.set(key, String(value));
    });
    const qs = query.toString();
    return `${config.apiBaseUrl}${path}${qs ? "?" + qs : ""}`;
  }

  async function request(path, params) {
    const response = await fetch(buildUrl(path, params), {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Request failed (${response.status}) for ${path}`);
    return response.json();
  }

  /** Authenticated writes for the shop dashboard (the session cookie identifies the shop). */
  async function send(method, path, body) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        `Request failed (${response.status}) for ${method} ${path}`,
      );
    return response.status === 204 ? true : response.json();
  }

  FrameX.httpProvider = {
    buildUrl,
    // Products: GET /products accepts material, frameType, finish, size, priceMin,
    // priceMax, customizable as well as the older filters.
    getProductFacets: () => request("/products/facets"),
    getShopProducts: (shopId) =>
      request(`/shops/${encodeURIComponent(shopId)}/products`, {
        include: "all",
      }),
    getShopProduct: (id) => request(`/shop/products/${encodeURIComponent(id)}`),
    saveShopProduct: (product) =>
      send("PUT", `/shop/products/${encodeURIComponent(product.id)}`, product),
    deleteShopProduct: (id) =>
      send("DELETE", `/shop/products/${encodeURIComponent(id)}`),
    getProductSlugs: () => request("/products/slugs"),
    getSite: () => request("/site"),
    getCategories: () => request("/categories"),
    getReviews: () => request("/reviews"),
    getCommunity: () => request("/community"),
    getFaq: () => request("/faq"),
    getGallery: () => request("/gallery"),
    getShops: (params) => request("/shops", params),
    getShop: (id) => request(`/shops/${encodeURIComponent(id)}`),
    getProducts: (params) => request("/products", params),
    getProduct: (id) => request(`/products/${encodeURIComponent(id)}`),
    getTemplates: (params) => request("/templates", params),
    getTemplate: (slug) => request(`/templates/${encodeURIComponent(slug)}`),
    getTemplateCategories: () => request("/template-categories"),
    getTemplateOptions: () => request("/template-options"),
    getStudioCatalog: () => request("/studio/catalog"),
  };
})((window.FrameX = window.FrameX || {}));
