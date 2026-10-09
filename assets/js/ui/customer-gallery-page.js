/* ==========================================================================
   Customer gallery & reviews page.

   Shows the published reviews of the whole site, the ones with a photo first:
   GET /api/reviews/gallery. A review can only be written by a customer whose
   order (or custom painting) was delivered, from that order's own page, where
   they can also add one photo. So this page has no free form: it tells a
   customer where to write theirs, and lists their delivered orders when they
   are logged in.

   Without the backend, the reviews of assets/data/reviews.seed.js are shown.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;

  let items = [];
  let total = 0;
  let page = 1;

  const stars = (n) =>
    `<div class="review-card__stars" role="img" aria-label="${n} out of 5 stars">${Array.from({ length: 5 }, (_, i) => icon("star", i < n ? "icon--fill" : "")).join("")}</div>`;

  const card = (r) => `<article class="cg-card${r.photo ? "" : " cg-card--text"}">
      ${r.photo ? `<div class="cg-card__media"><img src="${esc(r.photo)}" alt="Photo shared by ${esc(r.name)}" width="800" height="1000" loading="lazy" decoding="async"></div>` : ""}
      <div class="cg-card__body">
        ${stars(r.rating)}
        ${r.text ? `<p class="cg-card__text">${esc(r.text)}</p>` : ""}
        <p class="cg-card__who"><strong>${esc(r.name)}</strong>${r.productName ? `<span>${esc(r.productName)}</span>` : ""}</p>
        <p class="cg-card__meta">
          ${r.isVerified ? `<span class="review-card__verified">${icon("badge-check")} Verified buyer</span>` : ""}
          <span>${esc(r.dateLabel || "")}</span>
        </p>
      </div>
    </article>`;

  /** A review as the backend gives it -> what a card shows. */
  const fromApi = (r) => ({
    name: r.author,
    rating: r.rating,
    text: r.body,
    productName: r.targetName || "",
    photo: r.photo ? FrameX.http.asset(r.photo) : "",
    isVerified: true,
    dateLabel: new Date(r.createdAt).toLocaleDateString(FrameX.config.locale, { day: "numeric", month: "short", year: "numeric" }),
  });

  function render() {
    const grid = $("#cg-grid");
    grid.classList.toggle("cg-grid--empty", !items.length);
    grid.innerHTML = items.length
      ? items.map(card).join("")
      : `<div class="state-message"><strong>No customer photos yet</strong>
          <span>Photos and reviews from people who have framed their memories with FrameX will appear here.</span>
          <a class="btn btn--dark btn--sm" href="#share">How to share yours</a></div>`;
    let more = $("#cg-more");
    if (items.length < total) {
      if (!more) {
        grid.insertAdjacentHTML("afterend", `<div class="section-more" style="margin-top:20px;text-align:center"><button class="btn btn--outline" type="button" id="cg-more">Show more</button></div>`);
        more = $("#cg-more");
        more.addEventListener("click", async () => {
          more.disabled = true;
          try {
            const r = await FrameX.http.get("/reviews/gallery", { page: page + 1 });
            page += 1;
            items = items.concat(r.items.map(fromApi));
            total = r.total;
          } catch (error) {
            FrameX.toast.show("More reviews couldn't be loaded. Please try again.");
          }
          more.disabled = false;
          render();
        });
      }
    } else if (more) more.parentElement.remove();
  }

  /** Where a customer writes their own review: on the page of an order that was delivered to them. */
  async function shareBox(box) {
    if (!FrameX.http.enabled()) {
      box.innerHTML = `<p class="cg-share__lead">Reviews can be written here once ordering is switched on for this site.</p>`;
      return;
    }
    const state = await FrameX.auth.ready;
    if (!state.authenticated) {
      box.innerHTML = `<p class="cg-share__lead">Log in, open the order that was delivered to you, and rate what you received. You can add a photo there.</p>
        <div><a class="btn btn--dark" href="orders.html">Log in and open my orders</a></div>`;
      return;
    }
    let delivered = [];
    try {
      delivered = (await FrameX.http.get("/orders", { limit: 50 })).items.filter((o) => o.status === "DELIVERED");
    } catch (error) {
      /* the list below simply stays empty */
    }
    box.innerHTML = delivered.length
      ? `<p class="cg-share__lead">These orders were delivered to you. Open one to rate what you received and add your photo:</p>
        <ul class="cg-orders">${delivered
          .slice(0, 8)
          .map((o) => `<li><a class="btn btn--outline btn--sm" href="order.html?id=${encodeURIComponent(o.orderNumber)}#reviews">${icon("star")} Review order ${esc(o.orderNumber)}${o.firstItem ? ` · ${esc(o.firstItem.name)}` : ""}</a></li>`)
          .join("")}</ul>`
      : `<p class="cg-share__lead">You can write a review as soon as an order has been delivered to you. It will show up on its order page.</p>
        <div><a class="btn btn--outline" href="orders.html">My orders</a></div>`;
  }

  async function init() {
    const grid = $("#cg-grid");
    if (!grid) return;
    grid.innerHTML = `<div class="skeleton" style="min-height:240px"></div>`;
    let loaded = false;
    if (FrameX.http.enabled()) {
      try {
        const r = await FrameX.http.get("/reviews/gallery");
        items = r.items.map(fromApi);
        total = r.total;
        loaded = true;
      } catch (error) {
        console.error("Customer gallery failed to load", error);
      }
    }
    if (!loaded) {
      try {
        items = await FrameX.api.getReviews();
        total = items.length;
      } catch (error) {
        items = [];
      }
    }
    render();
    const box = $("#cg-share-box");
    if (box) shareBox(box);
  }

  FrameX.customerGalleryPage = { init };
})((window.FrameX = window.FrameX || {}));
