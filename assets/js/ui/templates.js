/* ==========================================================================
   HTML templates for repeated UI pieces. Every dynamic string is escaped.
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice, finalPrice, startingPrice, availability, hasSizeChoice } = FrameX.pricing;
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

  function priceBlock(product, { from = false } = {}) {
    const now = from ? startingPrice(product) : finalPrice(product);
    const was = !from && product.discountPercent > 0 ? `<s class="price__was">${formatPrice(product.price)}</s>` : "";
    const prefix = from && hasSizeChoice(product) ? `<span class="price__from">From</span> ` : "";
    return `<p class="price">${prefix}<strong class="price__now">${formatPrice(now)}</strong>${was}</p>`;
  }

  /** Small coloured dots showing which finishes a product offers. Text labels
      are used alongside them (title attribute + visually-hidden summary) so
      colour is never the only way to tell the options apart. */
  function colorSwatchRow(product) {
    if (!Array.isArray(product.colors) || !product.colors.length) return "";
    const palette = (FrameX.seed.frameColors || []).reduce((map, c) => ((map[c.id] = c), map), {});
    const dots = product.colors
      .map((id) => palette[id])
      .filter(Boolean)
      .map((c) => `<span class="swatch-dot" style="--swatch:${c.hex}" title="${esc(c.name)}"></span>`)
      .join("");
    const names = product.colors.map((id) => (palette[id] || {}).name).filter(Boolean).join(", ");
    return `<p class="product-card__colors"><span class="swatch-dot-row">${dots}</span><span class="visually-hidden">Colours: ${esc(names)}</span></p>`;
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
    const needsChoice = hasSizeChoice(product) || (product.colors || []).length > 1;
    const sizeCount = FrameX.pricing.sizeOptions(product).length;
    const sizeNote = sizeCount > 1 ? `<span class="product-card__size-note">${sizeCount} sizes</span>` : "";
    const url = FrameX.qs.productUrl(product);
    // Products that open in FrameX Studio (see productModel.studioSupport); older data falls back to its frame design.
    const customizable = product.customizable != null ? product.customizable : Boolean(product.frame && product.frame.shape !== "arch");

    return `<article class="product-card${unavailable ? " is-unavailable" : ""}" data-product-id="${esc(product.id)}">
      <div class="product-card__media">
        <img class="product-card__image" src="${esc(product.listingImage || product.image)}" alt="${esc(product.name)}" width="720" height="720" loading="lazy" decoding="async">
        <a class="product-card__open" href="${url}" aria-label="View details for ${esc(product.name)}"></a>
        <div class="product-card__badges">${badges.join("")}</div>
        ${wishButton(product, "product-card__wish")}
      </div>
      <div class="product-card__body">
        <h3 class="product-card__title"><a href="${url}">${esc(product.name)}</a></h3>
        <p class="product-card__shop">${icon("store")} ${esc(product.shopName)}</p>
        ${product.description ? `<p class="product-card__desc">${esc(product.description)}</p>` : ""}
        ${colorSwatchRow(product)}
        ${priceBlock(product, { from: true })}
        ${sizeNote}
      </div>
      <div class="product-card__foot">
        <span class="${stock.className}">${stock.text}</span>
        <a class="btn btn--dark btn--sm product-card__add" href="${url}">View Product</a>
      </div>
      ${customizable && !unavailable
        ? `<a class="product-card__extra" href="studio.html?product=${encodeURIComponent(product.id)}">${icon("upload")} Try With Your Own Image</a>`
        : !unavailable && !needsChoice
          ? `<button class="product-card__extra" type="button" data-action="add-to-cart" data-product-id="${esc(product.id)}">${icon("bag")} Add to cart</button>`
          : ""}
    </article>`;
  }

  function frameCard(product) {
    const price = hasSizeChoice(product) ? `From ${formatPrice(startingPrice(product))}` : formatPrice(finalPrice(product));
    return `<article class="frame-card" data-product-id="${esc(product.id)}">
      <div class="frame-card__media">
        <img class="frame-card__image" src="${esc(product.image)}" alt="${esc(product.name)}" width="520" height="650" loading="lazy" decoding="async" draggable="false">
        ${wishButton(product, "frame-card__wish")}
      </div>
      <div class="frame-card__caption">
        <a class="frame-card__open" href="${FrameX.qs.productUrl(product)}"><span class="frame-card__name">${esc(product.name)}</span></a>
        ${product.description ? `<span class="frame-card__desc">${esc(product.description)}</span>` : ""}
        <span class="frame-card__from">${price}</span>
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

  FrameX.templates = { productCard, frameCard, shopCard, skeletons, showError, hasSizeChoice, stockLabel, priceBlock, colorSwatchRow, wishButton };
})((window.FrameX = window.FrameX || {}));
