/* Customer review cards. */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;

  const stars = (n) =>
    `<div class="review-card__stars" role="img" aria-label="${n} out of 5 stars">${Array.from({ length: 5 }, (_, i) =>
      icon("star", i < n ? "icon--fill" : "")
    ).join("")}</div>`;

  const card = (r) => `<article class="review-card">
      <div class="review-card__who">
        <img class="review-card__avatar" src="${esc(r.avatar)}" alt="" width="56" height="56" loading="lazy" decoding="async">
        <div>
          <p class="review-card__name">${esc(r.name)}</p>
          ${r.isVerified ? `<span class="review-card__verified">${icon("badge-check")} Verified buyer</span>` : ""}
        </div>
      </div>
      ${stars(r.rating)}
      <p class="review-card__text">${esc(r.text)}</p>
      <p class="review-card__product">Ordered: <b>${esc(r.productName)}</b></p>
      <p class="review-card__date">${esc(r.dateLabel)}</p>
    </article>`;

  async function init() {
    const rail = $("#review-rail");
    if (!rail) return;
    try {
      const reviews = await FrameX.api.getReviews();
      rail.innerHTML = reviews.map(card).join("");
      rail.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(rail);
    } catch (error) {
      console.error("Reviews failed to load", error);
      FrameX.templates.showError(rail, "Reviews couldn't be loaded.", init);
    }
  }

  FrameX.reviews = { init };
})((window.FrameX = window.FrameX || {}));
