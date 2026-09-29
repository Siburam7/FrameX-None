/* "From our community" tiles. Tiles with a `video` play on hover/focus with a mute toggle. */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon, prefersReducedMotion } = FrameX.dom;

  const tile = (item) => `<article class="community-card">
      <div class="community-card__media">
        ${
          item.video
            ? `<video muted loop playsinline preload="none" poster="${esc(item.image)}" src="${esc(item.video)}"></video>
               <button class="icon-btn community-card__mute" type="button" data-mute-toggle aria-pressed="false" aria-label="Unmute video">${icon("volume-off")}</button>`
            : `<img src="${esc(item.image)}" alt="${esc(item.title)}" width="700" height="850" loading="lazy" decoding="async">`
        }
        ${item.isDemo ? `<span class="badge badge--sample community-card__demo">Sample photo</span>` : ""}
        ${item.productId ? `<a class="product-card__open" href="${FrameX.qs.productUrl(item.productId)}" aria-label="View ${esc(item.title)}"></a>` : ""}
      </div>
      <div class="community-card__caption"><strong>${esc(item.title)}</strong><span>${esc(item.caption)}</span></div>
    </article>`;

  function wireVideos(rail) {
    $$(".community-card", rail).forEach((card) => {
      const video = $("video", card);
      if (!video || prefersReducedMotion()) return;
      const play = () => video.play().catch(() => {});
      const stop = () => video.pause();
      card.addEventListener("mouseenter", play);
      card.addEventListener("mouseleave", stop);
      card.addEventListener("focusin", play);
      card.addEventListener("focusout", stop);
      const mute = $("[data-mute-toggle]", card);
      mute.addEventListener("click", () => {
        video.muted = !video.muted;
        mute.setAttribute("aria-pressed", String(!video.muted));
        mute.setAttribute("aria-label", video.muted ? "Unmute video" : "Mute video");
        mute.innerHTML = icon(video.muted ? "volume-off" : "volume-on");
      });
    });
  }

  async function init() {
    const rail = $("#community-rail");
    if (!rail) return;
    try {
      const items = await FrameX.api.getCommunity();
      rail.innerHTML = items.map(tile).join("");
      wireVideos(rail);
      rail.setAttribute("data-reveal-stagger", "");
      FrameX.reveal.observe(rail);
    } catch (error) {
      console.error("Community failed to load", error);
      FrameX.templates.showError(rail, "Community photos couldn't be loaded.", init);
    }
  }

  FrameX.community = { init };
})((window.FrameX = window.FrameX || {}));
