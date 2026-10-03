/* ==========================================================================
   ProductPage: the customer product page, built entirely from the product
   model (assets/js/services/product-model.js). The SAME renderer powers:
     product.html?slug=<slug>   (or ?id=<id>)  the live page
     product.html?preview=<id>                 a shop's preview of any status
     the dashboard wizard's Preview step       FrameX.productPage.render(..., { preview: true })

   Layout: gallery + product information on top, then only the sections this
   product has data for (overview, components, materials, quality, back view,
   views, specifications, customization, video, shop, reviews).
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const S = () => FrameX.productSections;
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

  /* ---------------------------------------------------------------- Info column */
  function stock(p) {
    const a = p.availability || {};
    if (a.status === "out_of_stock") return ["out", "Out of stock"];
    if (a.status === "made_to_order") return ["in", `Made to order${has(a.leadTime) ? ` · ready in ${a.leadTime}` : ""}`];
    if (typeof a.stock === "number" && a.stock > 0 && a.stock <= FrameX.config.lowStockThreshold) return ["low", `Only ${a.stock} left`];
    return ["in", "In stock"];
  }

  function radioGroup(name, label, options, current, renderOption, extra = "") {
    return `<div class="pp-opt" data-opt="${name}">
      <div class="pp-opt__label" id="pp-opt-${name}"><span>${esc(label)}</span><span class="pp-opt__value" data-opt-value="${name}"></span></div>
      <div class="pp-opt__choices pp-opt__choices--${name}" role="radiogroup" aria-labelledby="pp-opt-${name}">
        ${options.map((o) => `<button class="pp-choice pp-choice--${name}" type="button" role="radio" data-choice="${name}" data-value="${esc(o.id)}" aria-checked="${o.id === current}" tabindex="${o.id === current ? 0 : -1}">${renderOption(o)}</button>`).join("")}
      </div>${extra}</div>`;
  }

  function infoHtml(p, shop, sel, { preview }) {
    const [stockKey, stockText] = stock(p);
    const out = stockKey === "out";
    const pal = M().palette();
    const colors = (p.frame.colors && p.frame.colors.length ? p.frame.colors : p.frame.color ? [p.frame.color] : []).filter((id) => pal[id]);
    const prints = (p.print.materials || []).filter((m) => m && has(m.name));
    const covers = M().protectionOptions(p);
    const badges = [];
    if (p.pricing.discountPercent > 0 && !out) badges.push(`<span class="badge badge--discount">${Math.round(p.pricing.discountPercent)}% off</span>`);
    if (p.isNew && !out) badges.push(`<span class="badge">New</span>`);
    const facts = [["Material", p.frame.material], ["Colour", colors.length === 1 ? M().colorName(colors[0]) : ""], ["Finish", p.frame.finish], ["Frame width", p.frame.width ? `${p.frame.width} mm` : ""], ["Print", prints.length === 1 ? prints[0].name : ""], ["Front", covers.length === 1 ? covers[0].name : ""]].filter(([, v]) => has(v));
    const desc = String(p.description || "").trim();
    const short = desc.length > 240 ? desc.slice(0, desc.lastIndexOf(" ", 220)) + "…" : desc;
    const support = M().studioSupport(p);
    const rating = p.rating && p.rating.count > 0 ? `<p class="pp-rating">${icon("star", "icon--fill")} ${Number(p.rating.average).toFixed(1)} <span>(${p.rating.count} ${p.rating.count === 1 ? "review" : "reviews"})</span></p>` : "";

    return `<div class="pp-info">
      ${shop ? `<a class="pp-info__shop" href="${FrameX.qs.shopUrl(shop.id)}">${icon("store")} ${esc(shop.name)}</a>` : ""}
      <h1 class="pp-title">${esc(p.name)}</h1>
      ${rating}
      ${badges.length ? `<div class="pp-badges">${badges.join("")}</div>` : ""}
      <div class="pp-price" aria-live="polite"><strong data-price></strong><s data-was hidden></s></div>
      <dl class="pp-breakdown" data-breakdown hidden></dl>
      <p class="pp-stock pp-stock--${stockKey}">${icon(out ? "close" : "check")} ${esc(stockText)}</p>
      ${short ? `<p class="pp-lead">${esc(short)}${short !== desc ? ` <a href="#pp-overview">Read more</a>` : ""}</p>` : ""}
      ${facts.length ? `<dl class="pp-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}

      ${(p.sizes || []).length > 1
        ? radioGroup("size", "Size", p.sizes, sel.sizeId, (s) => `<strong>${esc(s.label || M().sizeDims(s))}</strong>${M().sizeDims(s) && s.label !== M().sizeDims(s) ? `<span>${esc(M().sizeDims(s))}</span>` : ""}<em data-size-price="${esc(s.id)}"></em>`)
        : (p.sizes || [])[0] ? `<p class="pp-single"><span>Size</span><strong>${esc(p.sizes[0].label || M().sizeDims(p.sizes[0]))}${M().sizeDims(p.sizes[0]) && p.sizes[0].label !== M().sizeDims(p.sizes[0]) ? ` · ${esc(M().sizeDims(p.sizes[0]))}` : ""}</strong></p>` : ""}
      ${colors.length > 1 ? radioGroup("color", "Frame colour", colors.map((id) => pal[id]), sel.colorId, (c) => `<span class="pp-swatch pp-swatch--${esc(c.texture || "solid")}" style="--swatch:${esc(c.hex)}"></span><span class="visually-hidden">${esc(c.name)}</span>`) : ""}
      ${prints.length > 1 ? radioGroup("print", "Print", prints, sel.printMaterialId, (m) => `<strong>${esc(m.name)}</strong>${Number(m.priceModifier) ? `<em>+${formatPrice(Number(m.priceModifier))}</em>` : "<em>Included</em>"}`) : ""}
      ${covers.length > 1 ? radioGroup("cover", "Front cover", covers, sel.protection, (c) => `<strong>${esc(c.name)}</strong>${c.priceModifier ? `<em>+${formatPrice(c.priceModifier)}</em>` : "<em>Included</em>"}`) : ""}

      <details class="pp-note"><summary>Add a note for the shop <span>(optional)</span></summary>
        <div class="form-field"><textarea data-note maxlength="200" rows="2" placeholder="e.g. text to include, a size not listed"></textarea></div></details>

      <div class="pp-buy">
        <div class="qty" role="group" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity" disabled>${icon("minus")}</button>
          <span class="qty__value" data-qty-value aria-live="polite">1</span>
          <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity" ${out ? "disabled" : ""}>${icon("plus")}</button>
        </div>
        <button class="btn btn--primary" type="button" data-add ${out ? "disabled" : ""}>${out ? "Out of stock" : `${icon("bag")} Add to cart`}</button>
        ${preview ? "" : FrameX.templates.wishButton(p)}
      </div>
      ${support.ok && !out
        ? `<a class="btn btn--outline btn--block pp-studio" href="${preview ? "#" : S().studioUrl(p, sel)}" data-customize>${icon("frame")} Customize This Product</a>
           <p class="pp-hint">Upload your photo in FrameX Studio and see it in this frame, with only the options this product offers.</p>`
        : ""}
      <p class="pp-feedback" data-feedback role="status">${icon("check")}<span></span></p>
    </div>`;
  }

  /* ---------------------------------------------------------------- Page */
  /**
   * Render a product page into `root`. Used by the live page and the shop preview.
   * opts: { preview, categories }
   */
  function render(root, product, shop, { preview = false, categories = [] } = {}) {
    const p = M().normalize(product);
    const sel = Object.assign(M().defaultSelection(p), { qty: 1 });
    const ctx = { shopName: shop ? shop.name : "", categories, preview };
    const sections = [
      S().overview(p),
      S().components(p),
      S().materials(p, ctx),
      S().quality(p, ctx),
      S().back(p),
      S().views(p),
      S().specifications(p, ctx),
      S().customization(p, ctx),
      S().video(p),
      S().shop(p, shop),
      S().reviews(p),
      S().delivery()
    ].filter(Boolean);
    const navItems = sections.filter((s) => s.id !== "delivery");

    root.innerHTML = `<div class="pp${preview ? " pp--preview" : ""}" data-product-page>
      <div class="pp-top">
        <div class="pp-media"><div data-gallery></div></div>
        ${infoHtml(p, shop, sel, { preview })}
      </div>
      ${navItems.length > 1 ? `<nav class="pp-nav" aria-label="Product sections"><ul>${navItems.map((s) => `<li><a href="#pp-${s.id}" data-nav="${s.id}">${esc(s.title)}</a></li>`).join("")}</ul></nav>` : ""}
      <div class="pp-sections">${sections.map((s) => s.html).join("")}</div>
      ${preview ? "" : `<div class="pp-buybar" data-buybar aria-hidden="true"><div><strong data-price></strong><span>${esc(p.name)}</span></div><button class="btn btn--primary btn--sm" type="button" data-add tabindex="-1" ${stock(p)[0] === "out" ? "disabled" : ""}>Add to cart</button></div>`}
    </div>`;

    const gallery = FrameX.productGallery.mount($("[data-gallery]", root), { name: p.name, views: M().sortedViews(p), product360: p.product360 });

    /* ---- price + options ---- */
    function refresh() {
      const q = M().quote(p, sel);
      $$("[data-price]", root).forEach((el) => (el.textContent = formatPrice(q.unit * sel.qty)));
      const was = $("[data-was]", root);
      was.hidden = !q.discountPercent;
      was.textContent = q.discountPercent ? formatPrice((q.listPrice + q.lines.slice(1).reduce((s, l) => s + l.amount, 0)) * sel.qty) : "";
      const bd = $("[data-breakdown]", root);
      bd.hidden = q.lines.length < 2 && sel.qty < 2;
      bd.innerHTML = q.lines.map((l) => `<div><dt>${esc(l.key === "base" ? l.detail || "Frame" : l.label + " · " + l.detail)}</dt><dd>${formatPrice(l.amount)}</dd></div>`).join("") + (sel.qty > 1 ? `<div><dt>× ${sel.qty}</dt><dd>${formatPrice(q.unit * sel.qty)}</dd></div>` : "");
      $$("[data-size-price]", root).forEach((el) => (el.textContent = formatPrice(M().quote(p, Object.assign({}, sel, { sizeId: el.dataset.sizePrice })).lines[0].amount)));
      const values = {
        size: (() => {
          const s = (p.sizes || []).find((x) => x.id === sel.sizeId);
          return s ? s.label || M().sizeDims(s) : "";
        })(),
        color: sel.colorId ? M().colorName(sel.colorId) : "",
        print: ((p.print.materials || []).find((m) => m.id === sel.printMaterialId) || {}).name || "",
        cover: (M().protectionOptions(p).find((c) => c.id === sel.protection) || {}).name || ""
      };
      $$("[data-opt-value]", root).forEach((el) => (el.textContent = values[el.dataset.optValue] || ""));
      $$("[data-customize]", root).forEach((a) => !preview && (a.href = S().studioUrl(p, sel)));
      S().updateCompare(root, p, sel.sizeId);
    }

    const KEYS = { size: "sizeId", color: "colorId", print: "printMaterialId", cover: "protection" };
    root.addEventListener("click", (e) => {
      const choice = e.target.closest("[data-choice]");
      if (choice) {
        sel[KEYS[choice.dataset.choice]] = choice.dataset.value;
        $$(`[data-choice="${choice.dataset.choice}"]`, root).forEach((b) => {
          b.setAttribute("aria-checked", String(b === choice));
          b.tabIndex = b === choice ? 0 : -1;
        });
        refresh();
        return;
      }
      const qtyBtn = e.target.closest("[data-qty]");
      if (qtyBtn) {
        const max = Math.min(FrameX.cart.MAX_QTY, typeof p.availability.stock === "number" && p.availability.stock > 0 ? p.availability.stock : FrameX.cart.MAX_QTY);
        sel.qty = Math.min(Math.max(sel.qty + Number(qtyBtn.dataset.qty), 1), max);
        $("[data-qty-value]", root).textContent = sel.qty;
        $('[data-qty="-1"]', root).disabled = sel.qty <= 1;
        $('[data-qty="1"]', root).disabled = sel.qty >= max;
        refresh();
        return;
      }
      if (e.target.closest("[data-add]")) return addToCart();
      const custom = e.target.closest("[data-customize]");
      if (custom && preview) {
        e.preventDefault();
        FrameX.toast.show("Preview: customers will open FrameX Studio from here.");
        return;
      }
      const viewBtn = e.target.closest("[data-show-view]");
      if (viewBtn) {
        gallery.showView(viewBtn.dataset.showView);
        $(".pp-media", root).scrollIntoView({ behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        return;
      }
      if (e.target.closest("[data-show-360]") && gallery.open360) {
        gallery.open360();
        $(".pp-media", root).scrollIntoView({ behavior: FrameX.dom.prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      }
    });
    // Arrow keys move between options inside a radio group.
    root.addEventListener("keydown", (e) => {
      const group = e.target.closest("[role=radiogroup]");
      if (!group || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const items = $$("[role=radio]", group);
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next.focus();
      next.click();
    });

    function addToCart() {
      if (stock(p)[0] === "out") return;
      if (preview) {
        FrameX.toast.show("Preview: customers will add this product to their cart here.");
        return;
      }
      const q = M().quote(p, sel);
      const size = (p.sizes || []).find((s) => s.id === sel.sizeId);
      const sizeLabel = size ? (size.label && M().sizeDims(size) && size.label !== M().sizeDims(size) ? `${size.label} (${M().sizeDims(size)})` : size.label || M().sizeDims(size)) : null;
      const colors = (p.frame.colors || []).length;
      const options = q.lines.slice(1).map((l) => `${l.label}: ${l.detail}`);
      const pm = (p.print.materials || []).find((m) => m.id === sel.printMaterialId);
      if (pm && !q.lines.some((l) => l.key === "print") && (p.print.materials || []).length > 1) options.push(`Print: ${pm.name}`);
      const cover = M().protectionOptions(p).find((c) => c.id === sel.protection);
      if (cover && !q.lines.some((l) => l.key === "protection") && M().protectionOptions(p).length > 1) options.push(`Front cover: ${cover.name}`);
      FrameX.cart.add(Object.assign({}, p, { shopName: shop ? shop.name : p.shopName }), {
        sizeId: sel.sizeId,
        size: sizeLabel,
        color: colors > 1 && sel.colorId ? M().colorName(sel.colorId) : null,
        qty: sel.qty,
        note: ($("[data-note]", root).value || "").trim(),
        options,
        unitPrice: q.unit
      });
      const box = $("[data-feedback]", root);
      $("span", box).textContent = `${sel.qty} × ${p.name}${sizeLabel ? ` (${sizeLabel})` : ""} added to your cart.`;
      box.classList.add("is-visible");
      FrameX.toast.show("Added to cart.", { action: { label: "View cart", onClick: () => FrameX.cartDrawer.open() } });
    }

    /* ---- behaviour: sections, scroll spy, mobile buy bar ---- */
    S().hydrate(root);
    S().wireComponents(root);
    S().wireVideo(root);
    refresh();
    FrameX.reveal.observe(root);

    const io = [];
    if ("IntersectionObserver" in window) {
      const links = $$("[data-nav]", root);
      if (links.length) {
        const spy = new IntersectionObserver(
          (entries) => entries.forEach((en) => en.isIntersecting && links.forEach((a) => a.setAttribute("aria-current", String(a.dataset.nav === en.target.id.replace("pp-", ""))))),
          { rootMargin: "-40% 0px -55% 0px" }
        );
        $$(".pp-section", root).forEach((s) => spy.observe(s));
        io.push(spy);
      }
      const bar = $("[data-buybar]", root);
      const main = $(".pp-buy [data-add]", root);
      if (bar && main) {
        const watch = new IntersectionObserver(([en]) => {
          const show = !en.isIntersecting && en.boundingClientRect.top < 0;
          bar.classList.toggle("is-visible", show);
          bar.setAttribute("aria-hidden", String(!show));
          $("[data-add]", bar).tabIndex = show ? 0 : -1;
        });
        watch.observe(main);
        io.push(watch);
      }
    }

    return {
      product: p,
      gallery,
      destroy() {
        io.forEach((o) => o.disconnect());
        gallery.destroy();
        root.innerHTML = "";
      }
    };
  }

  /* ---------------------------------------------------------------- SEO */
  function setMeta(selector, attr, key, value) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(selector.startsWith("link") ? "link" : "meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute(selector.startsWith("link") ? "href" : "content", value);
  }

  function applySeo(p, shop, categories) {
    const cat = (categories.find((c) => c.id === p.category) || {}).name;
    const title = (p.seo && p.seo.title) || `${p.name}${shop ? ` by ${shop.name}` : ""} — FrameX`;
    const desc = ((p.seo && p.seo.description) || p.description || `${p.name}${cat ? `, ${cat.toLowerCase()}` : ""}${shop ? ` from ${shop.name}` : ""} on FrameX.`).slice(0, 160);
    const url = new URL(`product.html?slug=${encodeURIComponent(p.slug || p.id)}`, location.href).href;
    const main = M().mainView(p);
    const image = main && !/^media:/.test(main.url) ? new URL(main.url, location.href).href : "";
    document.title = title;
    setMeta('meta[name="description"]', "name", "description", desc);
    setMeta('link[rel="canonical"]', "rel", "canonical", url);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", desc);
    setMeta('meta[property="og:type"]', "property", "og:type", "product");
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    if (image) setMeta('meta[property="og:image"]', "property", "og:image", image);
    // Structured data with only real fields (no invented ratings or brands).
    const q = M().quote(p, M().defaultSelection(p));
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: desc,
      sku: p.id,
      url,
      category: cat || undefined,
      image: image || undefined,
      material: p.frame.material || undefined,
      offers: {
        "@type": "Offer",
        price: q.unit,
        priceCurrency: q.currency,
        availability: p.availability.status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        seller: shop ? { "@type": "Organization", name: shop.name } : undefined
      }
    };
    if (p.rating && p.rating.count > 0) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count };
    let script = document.getElementById("pp-jsonld");
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "pp-jsonld";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(ld);
  }

  /* ---------------------------------------------------------------- Live page */
  function notFound(root, message) {
    document.title = "Frame not found — FrameX";
    root.innerHTML = `<div class="not-found">${icon("frame")}<h1 class="section-title">Frame not found</h1><p class="section-lead">${esc(message)}</p>
      <a class="btn btn--dark" href="shop.html">Browse all frames</a></div>`;
  }

  async function loadRelated(p) {
    const box = $("#related-grid");
    if (!box) return;
    $("#related-section").hidden = false;
    try {
      const { items } = await FrameX.api.getProducts({ category: p.category, limit: 12 });
      const related = items.filter((x) => x.id !== p.id).sort((a, b) => (b.shopId === p.shopId) - (a.shopId === p.shopId)).slice(0, 4);
      box.innerHTML = related.length
        ? related.map(FrameX.templates.productCard).join("")
        : `<div class="state-message"><strong>No related frames yet</strong><a class="btn btn--outline btn--sm" href="shop.html">Browse all frames</a></div>`;
    } catch (error) {
      console.error("Related products failed", error);
      FrameX.templates.showError(box, "Related frames couldn't be loaded.", () => loadRelated(p));
    }
  }

  async function init() {
    const root = $("#pdp-root");
    if (!root) return;
    const q = FrameX.qs.param;
    const previewId = q("preview");
    const ref = q("slug") || q("id");
    if (!ref && !previewId) return notFound(root, "No product was selected.");
    root.innerHTML = `<div class="pp-top"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton" style="min-height:420px"></div></div>`;
    let product, shop, categories;
    try {
      product = previewId ? await FrameX.productService.getForEditing(previewId) : await FrameX.productService.get(ref);
      if (!product) return notFound(root, "That frame doesn't exist or is no longer available.");
      [shop, categories] = await Promise.all([FrameX.api.getShop(product.shopId), FrameX.api.getCategories()]);
    } catch (error) {
      console.error("Product failed to load", error);
      return FrameX.templates.showError(root, "This frame couldn't be loaded.", init);
    }

    // Older links asked for the in-page photo preview; that lives in FrameX Studio now.
    if (!previewId && q("mode") === "custom" && M().studioSupport(product).ok) {
      location.replace(S().studioUrl(product));
      return;
    }
    // Readable, shareable URL: product.html?slug=classic-walnut-photo-frame
    if (!previewId && product.slug && q("slug") !== product.slug) history.replaceState(null, "", `product.html?slug=${encodeURIComponent(product.slug)}`);

    $("#pdp-crumb-name").textContent = product.name;
    if (previewId) {
      root.insertAdjacentHTML("beforebegin", `<div class="pp-preview-banner" role="status">${icon("alert")}<span><strong>Preview</strong> · ${esc((M().STATUS[product.status] || {}).label || product.status)}. ${product.status === "published" ? "This is how customers see it." : "Customers can't see this product until it's published."}</span><a class="btn btn--outline btn--sm" href="shop-dashboard.html#/products/${encodeURIComponent(product.id)}/edit">Back to editing</a></div>`);
      document.title = `Preview: ${product.name} — FrameX`;
    } else applySeo(product, shop, categories);

    render(root, product, shop, { preview: Boolean(previewId), categories });
    if (!previewId) loadRelated(product);
  }

  FrameX.productPage = { init, render };
})((window.FrameX = window.FrameX || {}));
