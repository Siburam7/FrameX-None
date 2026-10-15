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

  /* ======================================================================
     Skeleton loading: placeholders with the shape of what is coming, shown
     while its data is on the way (components.css, "Skeleton loading").

     Cards (templates.skeletons(count, kind)), each the size of the real one:
       product   picture, shop line, name, price, details, two buttons
       shop      cover, round logo, name, address, two badges, count + button
       template  design, label, name, price, one button
       artist    round photo + name, place, stars, style tags, footer
       review    stars, three lines of text, the writer
       tile      a collection picture with its name
       photo     a gallery picture (the heights vary, as in the real gallery)
       chip      a filter chip
       row       a list line: picture, two lines, status and amount
       faq       a question bar
       piece     a framed picture of a page hero
     Pages and parts of pages (templates.skeletonPage(kind)):
       pdp (product, artwork, template), checkout, orders, order, account,
       dashboard (menu + main), dash (a dashboard's main part), studio,
       art, artist, shop-hero, gallery, faq, list, painting, form

     In a page: an empty element marked data-skeleton="<kind>" (and, for
     cards, data-skeleton-count, default 4) shows its placeholders as soon as
     this file runs; the script that loads the data replaces them. A script
     can also put them back itself while it loads again.
     ====================================================================== */
  // A grey bar of a given width and height
  const L = (w = "100%", h = 12) => `<span class="skeleton sk-l" style="--w:${w};--h:${h}px"></span>`;
  // A grey box (its shape from components.css), with an optional inline size
  const B = (cls, style = "") => `<span class="skeleton ${cls}"${style ? ` style="${style}"` : ""}></span>`;
  const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");
  const CHIP_W = [88, 112, 72, 120, 96, 80, 104, 92];
  const chipRow = (n, h = 34) => `<div class="sk-chips">${repeat(n, (i) => B("sk-chip", `width:${CHIP_W[i % CHIP_W.length]}px;height:${h}px`))}</div>`;
  const stack = (...parts) => `<div class="sk-stack">${parts.join("")}</div>`;
  const card = (inner, cls = "") => `<div class="sk-card sk-card--pad ${cls}">${inner}</div>`;
  const split = (left, right) => `<div class="sk-split">${left}${right}</div>`;
  const btn = (w = "100%", h = 44) => B("sk-btn", `width:${w};height:${h}px;flex:none`);
  const field = () => stack(L("34%", 10), B("sk-input"));

  const CARD = {
    product: () => `<div class="sk-card"><div class="skeleton sk-media"></div>
      <div class="sk-body">${L("42%", 10)}${L("82%", 15)}${L("38%", 17)}${L("60%", 10)}</div>
      <div class="sk-actions">${B("sk-btn")}${B("sk-btn")}</div></div>`,
    shop: () => `<div class="sk-card sk-card--shop"><div class="skeleton sk-media"></div>
      <div class="sk-body">${B("sk-logo")}${L("70%", 16)}${L("55%", 10)}
      <span class="sk-chips">${B("sk-chip", "width:76px;height:22px")}${B("sk-chip", "width:64px;height:22px")}</span>
      <span class="sk-split">${L("30%", 12)}${btn("110px", 34)}</span></div></div>`,
    template: () => `<div class="sk-card"><div class="skeleton sk-media"></div>
      <div class="sk-body">${L("50%", 10)}${L("75%", 15)}${L("34%", 17)}</div>
      <div class="sk-actions">${B("sk-btn")}</div></div>`,
    artist: () => card(`<div class="sk-who">${B("sk-round", "width:56px;height:56px")}${stack(L("70%", 15), L("44%", 10))}</div>
      ${L("60%", 10)}${L("38%", 12)}${chipRow(3, 22)}<div class="sk-rule"></div>${L("56%", 11)}`),
    review: () => card(`<div class="sk-stars">${repeat(5, () => B("sk-star"))}</div>
      ${stack(L("100%", 11), L("94%", 11), L("70%", 11))}
      <div class="sk-who">${B("sk-round", "width:44px;height:44px")}${stack(L("46%", 13), L("32%", 10))}</div>`, "sk-card--review"),
    tile: () => `<div class="skeleton sk-tile"><span class="sk-tile__text">${L("58%", 16)}${L("34%", 10)}</span></div>`,
    photo: (i) => B("sk-photo", `aspect-ratio:${["4 / 5", "1 / 1", "3 / 4", "4 / 3", "4 / 5", "5 / 4"][i % 6]}`),
    chip: (i) => B("sk-chip", `width:${CHIP_W[i % CHIP_W.length]}px;height:38px`),
    row: () => `<div class="sk-row">${B("sk-thumb")}${stack(L("62%", 14), L("40%", 10))}<span class="sk-row__end">${B("sk-chip", "width:84px;height:24px")}${L("64px", 14)}</span></div>`,
    faq: () => `<div class="sk-faq">${L("72%", 14)}${B("sk-round", "width:26px;height:26px;flex:none")}</div>`,
    piece: () => B("page-hero__piece sk-piece"),
    artwork: () => CARD.template(),
  };

  /** `count` placeholder cards of one kind (see above); "product" when the kind is not known. */
  const skeletons = (count, kind = "product") => {
    const k = kind === "skeleton-card--shop" ? "shop" : CARD[kind] ? kind : "product";
    return repeat(count, (i) => CARD[k](i).trim().replace(/^<(\w+)/,'<$1 aria-hidden="true"'));
  };

  // Pages and parts of pages
  const pdp = (media = "1 / 1") => `${L("220px", 11)}
    <div class="sk-2col">
      <div class="sk-stack">${B("sk-box", `aspect-ratio:${media}`)}<div class="sk-thumbs">${repeat(4, () => B("sk-box", "aspect-ratio:1"))}</div></div>
      <div class="sk-stack sk-stack--lg">
        ${stack(L("30%", 10), L("88%", 30), L("62%", 30))}
        ${L("40%", 14)}
        ${L("36%", 32)}
        <div class="sk-rule"></div>
        ${stack(L("22%", 11), chipRow(4, 40))}
        ${stack(L("26%", 11), chipRow(3, 40))}
        ${B("sk-drop")}
        <div class="sk-split">${btn("48%", 50)}${btn("48%", 50)}</div>
        ${stack(L("90%", 11), L("76%", 11), L("58%", 11))}
      </div>
    </div>`;
  const dashMain = () => `<div class="sk-stack sk-stack--lg">
      <div class="sk-split">${stack(L("240px", 26), L("320px", 12))}${btn("120px", 38)}</div>
      <div class="sk-stats">${repeat(4, () => card(stack(L("50%", 10), L("40%", 26), L("64%", 10))))}</div>
      ${card(`${L("30%", 16)}${repeat(5, () => CARD.row())}`)}
    </div>`;
  const PAGE = {
    pdp: () => pdp("1 / 1"),
    template: () => pdp("4 / 5"),
    checkout: () => `<div class="sk-split sk-head">${L("200px", 34)}${chipRow(4, 14)}</div>
      <div class="sk-side">
        <div class="sk-stack sk-stack--lg">
          ${card(`${L("40%", 18)}${B("sk-box", "height:110px")}${L("30%", 12)}`)}
          ${card(`${L("36%", 18)}${repeat(2, () => CARD.row())}`)}
          ${card(`${L("32%", 18)}<div class="sk-split">${B("sk-box", "height:68px;width:48%")}${B("sk-box", "height:68px;width:48%")}</div>`)}
          ${card(`${L("38%", 18)}${repeat(4, () => B("sk-box", "height:58px"))}`)}
        </div>
        <div class="sk-stack sk-stack--lg">
          ${card(`${L("50%", 16)}<div class="sk-split">${B("sk-input", "flex:1")}${btn("80px", 40)}</div>${B("sk-box", "height:62px")}`)}
          ${card(`${L("44%", 16)}${repeat(4, () => split(L("40%", 11), L("22%", 11)))}<div class="sk-rule"></div>${split(L("26%", 18), L("28%", 18))}${btn("100%", 50)}${L("80%", 10)}`)}
        </div>
      </div>`,
    orders: () => `${stack(L("180px", 32), L("300px", 12))}${chipRow(4, 34)}<div class="sk-stack">${repeat(5, () => card(CARD.row()))}</div>`,
    order: () => `<div class="sk-split sk-head">${stack(L("260px", 30), L("200px", 12))}${B("sk-chip", "width:110px;height:30px")}</div>
      ${card(`<div class="sk-track">${repeat(5, () => `<span class="sk-track__step">${B("sk-round", "width:30px;height:30px")}${L("70%", 10)}</span>`)}</div>`)}
      <div class="sk-side">
        ${card(`${L("30%", 18)}${repeat(3, () => CARD.row())}`)}
        ${card(`${L("44%", 16)}${repeat(5, () => split(L("40%", 11), L("22%", 11)))}<div class="sk-rule"></div>${split(L("26%", 18), L("28%", 18))}`)}
      </div>`,
    account: () => `<div class="sk-who sk-head">${B("sk-round", "width:76px;height:76px")}${stack(L("220px", 26), L("160px", 12), B("sk-chip", "width:90px;height:24px"))}</div>
      <div class="sk-grid3">${repeat(3, () => card(`${L("50%", 18)}${stack(L("90%", 11), L("80%", 11), L("60%", 11))}${btn("140px", 38)}`))}</div>
      ${card(`${L("30%", 18)}<div class="sk-fields">${repeat(4, field)}</div>`)}`,
    dash: dashMain,
    dashboard: () => `<div class="sk-dash">
        <div class="sk-card sk-card--pad sk-dash__side">
          <div class="sk-who">${B("sk-round", "width:44px;height:44px")}${stack(L("80%", 14), L("50%", 10))}</div>
          ${B("sk-chip", "width:90px;height:24px")}
          ${repeat(8, () => `<div class="sk-who">${B("sk-round", "width:20px;height:20px;border-radius:6px")}${L("70%", 12)}</div>`)}
          ${btn("100%", 36)}
        </div>
        <div class="sk-card sk-card--pad">${dashMain()}</div>
      </div>`,
    studio: () => `<div class="sk-2col sk-2col--studio">
        <div class="sk-stack">${B("sk-box", "aspect-ratio:4 / 3")}${chipRow(5, 36)}</div>
        <div class="sk-stack sk-stack--lg">
          ${stack(L("70%", 26), L("50%", 12))}
          ${repeat(4, (i) => stack(L("28%", 11), i % 2 ? chipRow(4, 40) : B("sk-input")))}
          <div class="sk-rule"></div>
          ${split(L("30%", 20), L("26%", 26))}
          ${btn("100%", 50)}
        </div>
      </div>`,
    art: () => `<div class="sk-split">${B("sk-input", "flex:1;height:46px")}${chipRow(2, 40)}</div>
      ${chipRow(8, 34)}${L("90px", 12)}
      <div class="artist-grid">${skeletons(6, "artist")}</div>`,
    artist: () => `<div class="sk-card sk-profile">
        ${B("sk-cover")}
        <div class="sk-profile__body">${B("sk-round sk-profile__photo", "width:96px;height:96px")}
          ${stack(L("240px", 28), L("160px", 12), L("70%", 11), L("55%", 11))}${chipRow(4, 26)}</div>
      </div>
      ${L("200px", 22)}
      <div class="product-grid">${skeletons(4, "artwork")}</div>`,
    "shop-hero": () => `<div class="sk-card sk-profile">
        ${B("sk-cover")}
        <div class="sk-profile__body">${B("sk-round sk-profile__photo", "width:84px;height:84px")}
          ${stack(L("280px", 30), L("62%", 12), L("44%", 12))}${chipRow(4, 26)}</div>
      </div>`,
    gallery: () => `${chipRow(6, 36)}<div class="sk-masonry">${skeletons(9, "photo")}</div>`,
    faq: () => repeat(2, () => `<div class="sk-stack">${L("200px", 20)}${repeat(4, () => CARD.faq())}</div>`),
    list: () => `<div class="sk-stack">${repeat(4, () => card(CARD.row()))}</div>`,
    painting: () => `<div class="sk-split sk-head">${stack(L("300px", 30), L("220px", 12))}${B("sk-chip", "width:120px;height:30px")}</div>
      ${B("sk-box", "height:84px")}
      <div class="sk-side">
        ${card(`${L("34%", 18)}${repeat(5, () => split(L("26%", 11), L("46%", 11)))}`)}
        ${card(`${L("44%", 16)}${repeat(3, () => split(L("40%", 11), L("22%", 11)))}${btn("100%", 46)}`)}
      </div>`,
    form: () => card(`${stack(L("40%", 24), L("70%", 12))}<div class="sk-fields">${repeat(6, field)}</div>${B("sk-box", "height:90px")}${btn("180px", 46)}`),
  };

  /** A placeholder for a whole page or a part of one (see above). */
  const skeletonPage = (kind) => `<div class="sk-page" aria-hidden="true">${(PAGE[kind] || PAGE.list)()}</div><span class="visually-hidden" role="status">Loading…</span>`;

  // Elements marked data-skeleton="<kind>" (and data-skeleton-count for cards) show their placeholders straight away.
  document.querySelectorAll("[data-skeleton]").forEach((el) => {
    if (el.children.length) return;
    const kind = el.dataset.skeleton;
    el.innerHTML = PAGE[kind] ? skeletonPage(kind) : skeletons(Number(el.dataset.skeletonCount) || 4, kind);
  });

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
    skeletonPage,
    showError,
    hasSizeChoice,
    stockLabel,
    colorSwatchRow,
    wishButton,
    needsPhoto,
  };
})((window.FrameX = window.FrameX || {}));
