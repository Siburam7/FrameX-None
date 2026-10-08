/* Customer review cards. */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;

  const stars = (n) =>
    `<div class="review-card__stars" role="img" aria-label="${n} out of 5 stars">${Array.from(
      { length: 5 },
      (_, i) => icon("star", i < n ? "icon--fill" : ""),
    ).join("")}</div>`;

  const card = (r) => `<article class="review-card">
      <div class="review-card__who">
        ${r.avatar ? `<img class="review-card__avatar" src="${esc(r.avatar)}" alt="" width="56" height="56" loading="lazy" decoding="async">` : `<span class="review-card__avatar review-card__avatar--initials" aria-hidden="true">${esc(String(r.name || "?").slice(0, 1).toUpperCase())}</span>`}
        <div>
          <p class="review-card__name">${esc(r.name)}</p>
          ${r.isVerified ? `<span class="review-card__verified">${icon("badge-check")} Verified buyer</span>` : ""}
        </div>
      </div>
      ${stars(r.rating)}
      <p class="review-card__text">${esc(r.text)}</p>
      ${r.productName ? `<p class="review-card__product">Ordered: <b>${esc(r.productName)}</b></p>` : ""}
      <p class="review-card__date">${esc(r.dateLabel)}</p>
    </article>`;

  async function init() {
    const rail = $("#review-rail");
    if (!rail) return;
    try {
      let reviews = await FrameX.api.getReviews();
      // Reviews written by customers whose order or painting was delivered (the backend accepts no others).
      if (FrameX.http && FrameX.http.enabled()) {
        try {
          const live = (await FrameX.http.get("/reviews/latest")).items.map((r) => ({
            name: r.author, rating: r.rating, text: r.body, isVerified: true, productName: "",
            dateLabel: new Date(r.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
          }));
          if (live.length) reviews = live;
        } catch (error) {
          /* the backend isn't reachable: whatever the site's own file has is shown */
        }
      }
      if (!reviews.length) {
        rail.classList.add("review-rail--empty");
        rail.innerHTML = `<div class="state-message"><strong>No reviews yet</strong>
          <span>Reviews will appear here once customers have ordered through FrameX and shared their feedback.</span>
          <a class="btn btn--outline btn--sm" href="customer-gallery.html#share">Share your photo and review</a></div>`;
        return;
      }
      rail.innerHTML = reviews.map(card).join("");
      if (FrameX.railNav) FrameX.railNav.attach(rail);
      rail.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(rail);
    } catch (error) {
      console.error("Reviews failed to load", error);
      FrameX.templates.showError(rail, "Reviews couldn't be loaded.", init);
    }
  }

  FrameX.reviews = { init };
})((window.FrameX = window.FrameX || {}));
