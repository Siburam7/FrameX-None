/* Gallery / inspiration page: sections of frame styles from gallery data. */
(function (FrameX) {
  const { $, escapeHtml: esc } = FrameX.dom;

  const tile = (item) => `<figure class="gallery-tile"><img src="${esc(item.src)}" alt="${esc(item.alt)}" width="640" height="800" loading="lazy" decoding="async"></figure>`;

  async function init() {
    const root = $("#gallery-root");
    const nav = $("#gallery-nav");
    if (!root) return;
    try {
      const sections = await FrameX.api.getGallery();
      nav.innerHTML = sections.map((s) => `<a class="chip" href="#g-${esc(s.id)}">${esc(s.title)}</a>`).join("");
      root.innerHTML = sections
        .map((s) => `<section class="gallery-section" id="g-${esc(s.id)}" aria-labelledby="g-title-${esc(s.id)}">
            <div class="gallery-section__head"><h2 class="gallery-section__title" id="g-title-${esc(s.id)}">${esc(s.title)}</h2></div>
            <div class="gallery-grid">${s.items.map(tile).join("")}</div></section>`)
        .join("");
      // Never leave a broken image behind
      root.addEventListener("error", (e) => e.target.closest && e.target.closest(".gallery-tile") && e.target.closest(".gallery-tile").remove(), true);
    } catch (error) {
      console.error("Gallery failed to load", error);
      FrameX.templates.showError(root, "The gallery couldn't be loaded.", init);
    }
  }

  FrameX.galleryPage = { init };
})((window.FrameX = window.FrameX || {}));
