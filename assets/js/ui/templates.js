/* ==========================================================================
   HTML templates for repeated UI pieces. Every dynamic string is escaped.
   ========================================================================== */
(function (FrameX) {
  const { escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice, finalPrice, startingPrice, startingListPrice, availability, hasSizeChoice } = FrameX.pricing;
  const { FULFILMENT_METHODS } = FrameX.constants;
  const { formatAddress, isOpenNow } = FrameX.shopUtils;
  const { config } = FrameX;

  function stockLabel(product) {
    const status = availability(product);
    if (status === "out_of_stock") return { text: "Out of stock", low: false };
    if (status === "low_stock") return { text: typeof product.stock === "number" ? `Only ${product.stock} left` : "Low stock", low: true };
    return { text: "In stock", low: false };
  }

  /** Small coloured dots showing which finishes a product offers. The colour
      names are read out (title + visually-hidden text), so colour is never the
      only way to tell the options apart. */
  function colorSwatchRow(product) {
    if (!Array.isArray(product.colors) || !product.colors.length) return "";
    const palette = (FrameX.seed.frameColors || []).reduce((map, c) => ((map[c.id] = c), map), {});
    const colors = product.colors.map((id) => palette[id]).filter(Boolean);
    if (!colors.length) return "";
    const dots = colors.map((c) => `<span class="swatch-dot" style="--swatch:${c.hex}" title="${esc(c.name)}"></span>`).join("");
    return `<span class="swatch-dot-row">${dots}<span class="visually-hidden">Colours: ${esc(colors.map((c) => c.name).join(", "))}</span></span>`;
  }

  /**
   * Is this product made from the customer's own photo? The product model says
   * so (photosRequired) on pages that load it; elsewhere the catalogue entry
   * itself does: everything is a photo frame unless it is Home Decor or says
   * it is ready-made.
   */
  function needsPhoto(product) {
    if (product.photosRequired != null) return Number(product.photosRequired) > 0;
    if (product.decor) return Boolean(product.decor.customPhoto);
    return !["other", "home-decor", "wall-art"].includes(product.productType) && product.photos !== 0;
  }
  /** The product page, opened at "Your photo". */
  const photoUrl = (product) => `${FrameX.qs.productUrl(product)}#your-photo`;

  function wishButton(product, extraClass = "") {
    const saved = FrameX.wishlist.has(product.id);
    return `<button class="icon-btn ${extraClass}" type="button" data-action="toggle-wishlist" data-product-id="${esc(product.id)}"
      aria-pressed="${saved}" aria-label="Save ${esc(product.name)} to wishlist">${icon("heart")}</button>`;
  }

  /**
   * One photo frame. Same card as wall art (decorUI.card): picture, a small
   * label (the shop that sells it), name, price, one quiet line of facts
   * (colours, sizes, low stock) and the actions.
   */
  function productCard(product) {
    const status = availability(product);
    const stock = stockLabel(product);
    const unavailable = status === "out_of_stock";
    const off = Number(product.discountPercent) || 0;
    const badges = [];
    if (off > 0 && !unavailable) badges.push(`<span class="badge badge--discount">${off}% off</span>`);
    if (product.isNew && !unavailable) badges.push(`<span class="badge">New</span>`);
    const choice = hasSizeChoice(product);
    const needsChoice = choice || (product.colors || []).length > 1;
    const sizes = FrameX.pricing.sizeOptions(product);
    const url = FrameX.qs.productUrl(product);
    // Products that open in FrameX Studio (see productModel.studioSupport); older data falls back to its frame design.
    const customizable = product.customizable != null ? product.customizable : Boolean(product.frame && product.frame.shape !== "arch");
    const photo = needsPhoto(product);

    const meta = [colorSwatchRow(product)];
    if (sizes.length > 1) meta.push(`<span>${sizes.length} sizes</span>`);
    else if (sizes.length === 1 && (sizes[0].dimensions || sizes[0].label)) meta.push(`<span>${esc(sizes[0].dimensions || sizes[0].label)}</span>`);
    if (stock.low) meta.push(`<b>${esc(stock.text)}</b>`);

    const second = unavailable
      ? `<button class="btn btn--outline btn--sm" type="button" disabled>Out of stock</button>`
      : customizable
        ? `<a class="btn btn--outline btn--sm" href="studio.html?product=${encodeURIComponent(product.id)}" aria-label="Try ${esc(product.name)} with your own image">${icon("upload")} Try Your Photo</a>`
        : photo
          ? // Made from the customer's photo: it is added on the product page, where the photo is.
            `<a class="btn btn--outline btn--sm" href="${photoUrl(product)}" aria-label="Add your photo to ${esc(product.name)}">${icon("upload")} Add Your Photo</a>`
          : !needsChoice
          ? `<button class="btn btn--outline btn--sm" type="button" data-action="add-to-cart" data-product-id="${esc(product.id)}">${icon("bag")} Add to Cart</button>`
          : "";

    return `<article class="product-card${unavailable ? " is-unavailable" : ""}" data-product-id="${esc(product.id)}">
      <div class="product-card__media">
        <img src="${esc(product.listingImage || product.image)}" alt="${esc(product.name)}" width="800" height="1000" loading="lazy" decoding="async">
        <a class="product-card__open" href="${url}" aria-label="View ${esc(product.name)}" tabindex="-1"></a>
        <div class="product-card__badges">${badges.join("")}</div>
        ${wishButton(product, "product-card__wish")}
      </div>
      <div class="product-card__body">
        <p class="product-card__cat">${esc(product.shopName || "")}</p>
        <h3 class="product-card__title"><a href="${url}">${esc(product.name)}</a></h3>
        <p class="product-card__price">${choice ? "<span>From</span>" : ""}<strong>${formatPrice(choice ? startingPrice(product) : finalPrice(product))}</strong>${
          off > 0 ? `<s>${formatPrice(choice ? startingListPrice(product) : product.price)}</s><em>${off}% off</em>` : ""
        }</p>
        <p class="product-card__meta">${meta.filter(Boolean).join("")}</p>
      </div>
      <div class="product-card__actions"><a class="btn btn--dark btn--sm" href="${url}">View Product</a>${second}</div>
    </article>`;
  }

  function frameCard(product) {
    const price = hasSizeChoice(product)
      ? `From ${formatPrice(startingPrice(product))}`
      : formatPrice(finalPrice(product));
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
    String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");

  function shopCard(shop) {
    const open = isOpenNow(shop);
    const methods = (shop.fulfilment || [])
      .filter((id) => FULFILMENT_METHODS[id] && FULFILMENT_METHODS[id].enabled)
      .map(
        (id) =>
          `<span class="badge badge--muted">${esc(FULFILMENT_METHODS[id].label)}</span>`,
      )
      .join("");
    const rating = shop.rating
      ? `<span class="badge badge--muted">${icon("star", "icon--fill")} ${shop.rating.average.toFixed(1)} (${shop.rating.count})</span>`
      : `<span class="badge badge--muted">No ratings yet</span>`;
    const distance =
      shop.distanceKm != null
        ? `<span class="badge badge--muted">${icon("pin")} ${FrameX.location.formatDistance(shop.distanceKm)} away</span>`
        : "";
    const openBadge =
      open === null
        ? ""
        : `<span class="badge ${open ? "badge--open" : "badge--closed"}">${open ? "Open now" : "Closed now"}</span>`;
    const logo = shop.logo
      ? `<img src="${esc(shop.logo)}" alt="" width="56" height="56">`
      : `<span aria-hidden="true">${esc(monogram(shop.name))}</span>`;
    const count =
      shop.productCount === 1 ? "1 frame" : `${shop.productCount} frames`;

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
    Array.from(
      { length: count },
      () => `<div class="skeleton ${className}" aria-hidden="true"></div>`,
    ).join("");

  /** Replace a container's content with an error + retry button. */
  function showError(container, message, retry) {
    container.innerHTML = `<div class="state-message" role="alert"><strong>${esc(message)}</strong>
      <span>Check your connection and try again.</span>
      <button class="btn btn--outline btn--sm" type="button" data-retry>Try again</button></div>`;
    const button = container.querySelector("[data-retry]");
    if (button) button.addEventListener("click", retry, { once: true });
  }

  FrameX.templates = {
    productCard,
    frameCard,
    shopCard,
    skeletons,
    showError,
    hasSizeChoice,
    stockLabel,
    colorSwatchRow,
    wishButton,
    needsPhoto,
  };
})((window.FrameX = window.FrameX || {}));
