/* ==========================================================================
   Template detail page (template.html?t=<slug>): large preview, details,
   what can be personalised, sizes + prices, and related templates.
   Sets the page title, description and canonical URL from the template data.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const { templateUI } = FrameX;
  const { formatPrice } = FrameX.pricing;

  function setMeta(t) {
    document.title = `${t.title} — Personalised photo frame template | FrameX`;
    const desc = $('meta[name="description"]');
    if (desc) desc.setAttribute("content", t.description);
    let canonical = $('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(templateUI.url(t), location.href).href;
  }

  function notFound(root) {
    root.innerHTML = `<div class="not-found">${icon("frame")}<h1>Template not found</h1>
      <p>This design may have been removed or the link is incomplete.</p>
      <a class="btn btn--dark" href="templates.html">Browse all templates</a></div>`;
  }

  async function init() {
    const root = $("#tpl-detail");
    if (!root) return;
    const slug = FrameX.qs.param("t");
    let t = null;
    let categories = [];
    let options = { sizes: [] };
    try {
      [t, categories, options] = await Promise.all([
        slug ? FrameX.api.getTemplate(slug) : null,
        FrameX.api.getTemplateCategories(),
        FrameX.api.getTemplateOptions(),
      ]);
    } catch (error) {
      console.error("Template failed to load", error);
      return FrameX.templates.showError(
        root,
        "This template couldn't be loaded.",
        init,
      );
    }
    if (!t) return notFound(root);
    if (FrameX.templateEngine.validate(t).length) {
      root.innerHTML = `<div class="not-found">${icon("alert")}<h1>This template isn't available right now</h1><p>Please choose another design.</p><a class="btn btn--dark" href="templates.html">Browse all templates</a></div>`;
      return;
    }
    setMeta(t);
    if (FrameX.analytics) FrameX.analytics.track("view_template", { itemType: "template", itemId: t.id, itemName: t.title, category: t.category });
    const category = categories.find((c) => c.id === t.category);
    const sizes = options.sizes.filter((s) => (t.sizes || []).includes(s.id));
    $("#tpl-crumb").textContent = t.title;

    const textList = (t.textFields || [])
      .map(
        (f) =>
          `<li>${icon("check")}<span>${esc(f.label)}${f.defaultValue ? ` <span class="tpl-info__example">e.g. “${esc(f.defaultValue)}”</span>` : ""}</span></li>`,
      )
      .join("");
    root.innerHTML = `<div class="tpl-detail">
      <div class="tpl-detail__preview">
        <div class="tpl-detail__canvas tpl-detail__canvas--${esc(t.orientation)}">
          ${t.previewImage ? `<img src="${esc(t.previewImage)}" alt="${esc(t.title)} template preview">` : FrameX.templateEngine.render(t, { mode: "sample", label: `${t.title} template, shown with example photos` })}
        </div>
        <p class="tpl-detail__note">Shown with example photos. Your own photos and text replace them.</p>
      </div>
      <div class="tpl-info">
        <p class="eyebrow">${esc(category ? category.name : "Template")}${templateUI.badge(t) ? " · " : ""}${t.isTrending ? "Trending" : t.isNew ? "New" : t.isPopular ? "Popular" : ""}</p>
        <h1 class="tpl-info__title">${esc(t.title)}</h1>
        <p class="tpl-info__desc">${esc(t.description)}</p>
        <p class="tpl-info__price">From <strong>${formatPrice(templateUI.priceFrom(t))}</strong></p>
        <ul class="tpl-info__facts">
          <li>${icon("image")}<span><strong>${templateUI.photoLabel(t.photosRequired)}</strong> needed</span></li>
          <li>${icon("frame")}<span><strong>${esc(t.orientation.charAt(0).toUpperCase() + t.orientation.slice(1))}</strong> design</span></li>
          <li>${icon("ruler")}<span><strong>${sizes.length} ${sizes.length === 1 ? "size" : "sizes"}</strong> available</span></li>
        </ul>
        <a class="btn btn--primary btn--block tpl-info__cta" href="${templateUI.customizeUrl(t)}">Customize this design ${icon("arrow-right", "icon--nudge")}</a>
        ${textList ? `<div class="tpl-info__block"><h2>You can personalise</h2><ul class="tpl-info__list">${textList}</ul></div>` : ""}
        ${sizes.length ? `<div class="tpl-info__block"><h2>Sizes and prices</h2><dl class="tpl-info__sizes">${sizes.map((s) => `<dt>${esc(s.label)} <span>${esc(s.dimensions)}</span></dt><dd>${formatPrice(templateUI.priceFor(t, s.id))}</dd>`).join("")}</dl></div>` : ""}
      </div>
    </div>`;

    // Related: same category first, then other trending designs.
    const related = $("#tpl-related-grid");
    if (related) {
      const same = (
        await FrameX.api.getTemplates({ category: t.category, limit: 8 })
      ).items.filter((x) => x.id !== t.id);
      const more = (
        await FrameX.api.getTemplates({ trending: true, limit: 8 })
      ).items.filter((x) => x.id !== t.id && !same.some((s) => s.id === x.id));
      const list = same.concat(more).slice(0, 4);
      const names = new Map(categories.map((c) => [c.id, c.name]));
      related.innerHTML = list
        .map((x) => templateUI.card(x, { categoryName: names.get(x.category) }))
        .join("");
      $("#tpl-related").hidden = !list.length;
    }
  }

  FrameX.templateDetailPage = { init };
})((window.FrameX = window.FrameX || {}));
