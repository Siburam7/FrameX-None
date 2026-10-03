/* Shop Detail page (shop-detail.html?id=<shopId>): shop profile + its frames.
   Only fields present in the shop record are shown. */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { FULFILMENT_METHODS } = FrameX.constants;
  const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
  const todayKey = () => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

  function hoursHtml(shop) {
    if (!shop.openingHours) return `<p class="shop-hours__note">Opening hours will be listed soon. Message us to check before visiting.</p>`;
    const today = todayKey();
    return `<dl class="shop-hero__hours">${DAYS.map(([k, label]) => {
      const h = shop.openingHours[k];
      return `<dt>${label}</dt><dd${k === today ? ' class="is-today"' : ""}>${h ? `${h[0]} – ${h[1]}` : "Closed"}</dd>`;
    }).join("")}</dl>`;
  }

  function notFound(root, message) {
    document.title = "Shop not found — FrameX";
    root.innerHTML = `<div class="not-found">${icon("store")}<h1 class="section-title">Shop not found</h1><p class="section-lead">${esc(message)}</p>
      <a class="btn btn--dark" href="shop.html#shops">See all shops</a></div>`;
    $("#shop-products").hidden = true;
  }

  async function init() {
    const root = $("#shop-hero-root");
    if (!root) return;
    const id = FrameX.qs.param("id");
    if (!id) return notFound(root, "No shop was selected.");
    let shop;
    try {
      shop = await FrameX.api.getShop(id);
    } catch (error) {
      console.error("Shop failed to load", error);
      $("#shop-products").hidden = true;
      return FrameX.templates.showError(root, "This shop couldn't be loaded.", init);
    }
    if (!shop) return notFound(root, "That shop doesn't exist or is no longer listed.");

    document.title = `${shop.name} — FrameX`;
    $("#shop-crumb-name").textContent = shop.name;
    const open = FrameX.shopUtils.isOpenNow(shop);
    const methods = (shop.fulfilment || []).filter((m) => FULFILMENT_METHODS[m] && FULFILMENT_METHODS[m].enabled);
    const badges = [
      shop.isSample ? `<span class="badge badge--sample">Sample shop</span>` : "",
      open === null ? "" : `<span class="badge ${open ? "badge--open" : "badge--closed"}">${open ? "Open now" : "Closed now"}</span>`,
      shop.rating ? `<span class="badge badge--muted">${icon("star", "icon--fill")} ${shop.rating.average.toFixed(1)} (${shop.rating.count})</span>` : `<span class="badge badge--muted">No ratings yet</span>`
    ].join("");
    const monogram = shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

    root.innerHTML = `<div class="shop-hero">
      ${shop.coverImage ? `<div class="shop-hero__cover"><img src="${esc(shop.coverImage)}" alt="${esc(shop.name)}" width="1200" height="514" fetchpriority="high"></div>` : ""}
      <div class="shop-hero__body">
        <div>
          <div class="shop-hero__top">
            <span class="shop-hero__logo">${shop.logo ? `<img src="${esc(shop.logo)}" alt="">` : esc(monogram)}</span>
            <div><h1 class="shop-hero__name">${esc(shop.name)}</h1><div class="shop-hero__badges">${badges}</div></div>
          </div>
          ${shop.description ? `<p class="section-lead">${esc(shop.description)}</p>` : ""}
          <ul class="shop-hero__meta" style="margin-top:16px">
            <li>${icon("pin")}<span>${esc(FrameX.shopUtils.formatAddress(shop))}</span></li>
            ${shop.phone ? `<li>${icon("phone")}<a href="tel:${esc(shop.phone.replace(/[^\d+]/g, ""))}">${esc(shop.phone)}</a></li>` : ""}
            <li>${icon("truck")}<span>${methods.length ? esc(methods.map((m) => FULFILMENT_METHODS[m].label).join(" · ")) : "Pickup and delivery options not added yet"}</span></li>
            <li>${icon("frame")}<span>${shop.productCount} ${shop.productCount === 1 ? "frame" : "frames"} listed</span></li>
          </ul>
          <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
            <a class="btn btn--primary" href="#collection">Browse frames</a>
            <a class="btn btn--outline" href="shop.html#shops">All shops</a>
          </div>
        </div>
        <div><h2 class="pdp-option__label" style="margin-bottom:10px">Opening hours</h2>${hoursHtml(shop)}</div>
      </div></div>`;

    $("#shop-title").textContent = `Frames from ${shop.name}`;
    const categories = await FrameX.api.getCategories();
    FrameX.collection.init(categories, { shopId: shop.id });
  }

  FrameX.shopDetailPage = { init };
})((window.FrameX = window.FrameX || {}));
