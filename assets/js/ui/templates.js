/* ==========================================================================
   HTML templates for repeated UI pieces. Every dynamic string is escaped.
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice, finalPrice, availability } = FrameX.pricing;
  const { FULFILMENT_METHODS } = FrameX.constants;
  const { formatAddress, isOpenNow } = FrameX.shopUtils;
  const { config } = FrameX;

  function stockLabel(product) {
    const status = availability(product);
    if (status === "out_of_stock") return { text: "Out of stock", className: "product-card__stock--out" };
    if (status === "low_stock") {
      const text = typeof product.stock === "number" ? `Only ${product.stock} left` : "Low stock";
      return { text, className: "product-card__stock--low" };
    }
    return { text: "In stock", className: "" };
  }

  const hasSizeChoice = (product) => Array.isArray(product.sizes) && product.sizes.length > 1;

  function priceBlock(product) {
    const now = finalPrice(product);
    const was = product.discountPercent > 0 ? `<s class="price__was">${formatPrice(product.price)}</s>` : "";
    return `<p class="price"><strong class="price__now">${formatPrice(now)}</strong>${was}</p>`;
  }

  function wishButton(product, extraClass = "") {
    const saved = FrameX.wishlist.has(product.id);
    return `<button class="icon-btn ${extraClass}" type="button" data-action="toggle-wishlist" data-product-id="${esc(product.id)}"
      aria-pressed="${saved}" aria-label="Save ${esc(product.name)} to wishlist">${icon("heart")}</button>`;
  }

  function productCard(product) {
    const status = availability(product);
    const stock = stockLabel(product);
    const unavailable = status === "out_of_stock";
    const badges = [];
    if (product.discountPercent > 0 && !unavailable) badges.push(`<span class="badge badge--discount">${product.discountPercent}% off</span>`);
    if (product.isNew && !unavailable) badges.push(`<span class="badge">New</span>`);

    return `<article class="product-card${unavailable ? " is-unavailable" : ""}" data-product-id="${esc(product.id)}">
      <div class="product-card__media">
        <img class="product-card__image" src="${esc(product.image)}" alt="${esc(product.name)}" width="720" height="720" loading="lazy" decoding="async">
        <a class="product-card__open" href="${FrameX.qs.productUrl(product.id)}" aria-label="View details for ${esc(product.name)}"></a>
        <div class="product-card__badges">${badges.join("")}</div>
        ${wishButton(product, "product-card__wish")}
      </div>
      <div class="product-card__body">
        <h3 class="product-card__title"><a href="${FrameX.qs.productUrl(product.id)}">${esc(product.name)}</a></h3>
        <p class="product-card__shop">${icon("store")} ${esc(product.shopName)}</p>
        ${priceBlock(product)}
      </div>
      <div class="product-card__foot">
        <span class="${stock.className}">${stock.text}</span>
        ${unavailable
          ? `<button class="btn btn--dark btn--sm product-card__add" type="button" disabled>Unavailable</button>`
          : hasSizeChoice(product)
            ? `<a class="btn btn--dark btn--sm product-card__add" href="${FrameX.qs.productUrl(product.id)}">Choose size</a>`
            : `<button class="btn btn--dark btn--sm product-card__add" type="button" data-action="add-to-cart" data-product-id="${esc(product.id)}">Add to cart</button>`}
      </div>
    </article>`;
  }

  function frameCard(product) {
    return `<article class="frame-card" data-product-id="${esc(product.id)}">
      <img class="frame-card__image" src="${esc(product.image)}" alt="${esc(product.name)}" width="520" height="640" loading="lazy" decoding="async">
      <a class="frame-card__open" href="${FrameX.qs.productUrl(product.id)}" aria-label="View details for ${esc(product.name)}"></a>
      <div class="frame-card__overlay">
        <div>
          <span class="frame-card__name">${esc(product.name)}</span>
          <span class="frame-card__from">From ${formatPrice(finalPrice(product))}</span>
        </div>
        <div class="frame-card__tools">${wishButton(product)}</div>
      </div>
    </article>`;
  }

  const monogram = (name) =>
    String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  function shopCard(shop) {
    const open = isOpenNow(shop);
    const methods = (shop.fulfilment || [])
      .filter((id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled)
      .map((id) => `<span class="badge badge--muted">${esc(FULFILMENT_METHODS[id].label)}</span>`)
      .join("");
    const rating = shop.rating
      ? `<span class="badge badge--muted">${icon("star", "icon--fill")} ${shop.rating.average.toFixed(1)} (${shop.rating.count})</span>`
      : `<span class="badge badge--muted">No ratings yet</span>`;
    const distance =
      shop.distanceKm != null
        ? `<span class="badge badge--muted">${icon("pin")} ${FrameX.location.formatDistance(shop.distanceKm)} away</span>`
        : "";
    const openBadge =
      open === null ? "" : `<span class="badge ${open ? "badge--open" : "badge--closed"}">${open ? "Open now" : "Closed now"}</span>`;
    const logo = shop.logo
      ? `<img src="${esc(shop.logo)}" alt="" width="56" height="56">`
      : `<span aria-hidden="true">${esc(monogram(shop.name))}</span>`;
    const count = shop.productCount === 1 ? "1 frame" : `${shop.productCount} frames`;

    return `<article class="shop-card" data-shop-id="${esc(shop.id)}">
      <div class="shop-card__cover">
        ${shop.coverImage ? `<img src="${esc(shop.coverImage)}" alt="" width="900" height="506" loading="lazy" decoding="async">` : ""}
        <div class="shop-card__top">
          <span>${shop.isSample ? `<span class="badge badge--sample">Sample shop</span>` : ""}</span>
          ${openBadge}
        </div>
      </div>
      <div class="shop-card__body">
        <div class="shop-card__logo">${logo}</div>
        <h3 class="shop-card__name">${esc(shop.name)}</h3>
        <p class="shop-card__address">${icon("pin")}<span>${esc(formatAddress(shop))}</span></p>
        <div class="shop-card__meta">${distance}${rating}${methods}</div>
        <div class="shop-card__actions">
          <span class="shop-card__count">${count}</span>
          <a class="btn btn--dark btn--sm" href="${FrameX.qs.shopUrl(shop.id)}">View shop ${icon("arrow-right", "icon--nudge")}</a>
        </div>
      </div>
    </article>`;
  }

  const skeletons = (count, className = "skeleton-card") =>
    Array.from({ length: count }, () => `<div class="skeleton ${className}" aria-hidden="true"></div>`).join("");

  /** Replace a container's content with an error + retry button. */
  function showError(container, message, retry) {
    container.innerHTML = `<div class="state-message" role="alert"><strong>${esc(message)}</strong>
      <span>Check your connection and try again.</span>
      <button class="btn btn--outline btn--sm" type="button" data-retry>Try again</button></div>`;
    const button = container.querySelector("[data-retry]");
    if (button) button.addEventListener("click", retry, { once: true });
  }

  FrameX.templates = { productCard, frameCard, shopCard, skeletons, showError, hasSizeChoice, stockLabel, priceBlock, wishButton };
})((window.FrameX = window.FrameX || {}));
