/* ==========================================================================
   Delegated click handling for data-action attributes (works for cards that
   are rendered later, and for marquee clones).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, prefersReducedMotion } = FrameX.dom;

  const handlers = {
    "toggle-wishlist": (el) => {
      const saved = FrameX.wishlist.toggle(el.dataset.productId);
      FrameX.toast.show(saved ? "Saved to your wishlist." : "Removed from your wishlist.");
    },

    "add-to-cart": async (el) => {
      const product = await FrameX.api.getProduct(el.dataset.productId);
      if (!product) return;
      const only = FrameX.pricing.sizeOptions(product)[0];
      FrameX.cart.add(product, { sizeId: only ? only.id : null, size: only ? only.label : null });
      FrameX.toast.show(`${product.name} added to cart.`, { action: { label: "View cart", onClick: () => FrameX.cartDrawer.open() } });
    },

    // On the Shop page filter in place; everywhere else go to the Shop page.
    "filter-category": (el) => {
      if (FrameX.collection && FrameX.collection.isActive()) {
        FrameX.collection.setFilters({ category: el.dataset.categoryId, q: "" }, { scroll: true });
      } else {
        window.location.href = FrameX.qs.shopListUrl({ category: el.dataset.categoryId }) + "#collection";
      }
    },

    "open-cart": (el) => FrameX.cartDrawer.open(el),

    "use-location": () => {
      if ($("#shop-grid")) {
        $("#shops").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
        FrameX.shops.useLocation();
      } else {
        window.location.href = "shop.html?locate=1#shops";
      }
    },

    "coming-soon": (el) => FrameX.toast.soon(el.dataset.feature || "This feature")
  };

  function init() {
    document.addEventListener("click", (event) => {
      const el = event.target.closest("[data-action]");
      if (!el || !handlers[el.dataset.action]) return;
      if (el.tagName === "A") event.preventDefault();
      handlers[el.dataset.action](el);
    });

    // Keep every heart for a product in sync (rail clones, grids, product page).
    document.addEventListener("framex:wishlist-change", (event) => {
      const { productId, saved } = event.detail;
      $$(`[data-action="toggle-wishlist"][data-product-id="${CSS.escape(productId)}"]`).forEach((btn) =>
        btn.setAttribute("aria-pressed", String(saved))
      );
    });
  }

  FrameX.actions = { init };
})((window.FrameX = window.FrameX || {}));
