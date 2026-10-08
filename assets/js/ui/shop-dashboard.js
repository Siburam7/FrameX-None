/* ==========================================================================
   Shop dashboard (shop-dashboard.html). SHOP role only.

   Routes (hash, so it works on any static host):
     #/overview                    Shop ID, status, location, account
     #/profile                     shop profile (FrameX-controlled identity +
                                   the fields a shop may edit itself, including
                                   whether it offers gift wrapping)
     #/products                    what the shop sells: its own products (it
                                   decides the type, details, pictures, price,
                                   stock…) and its FrameX catalogue products
     #/products/new  #/products/<id>/edit     the product wizard
     #/orders[?filter=]            orders that contain the shop's products
     #/orders/<FX-number>          one order: the shop's own items, the
                                   customer's original photos, progress
     #/inventory                   stock and availability
     #/account                     login details, password, log out

   Access: the page asks the backend who is logged in (FrameX.auth.guard) and
   every request goes to /api/shops/<own Shop ID>/…. The backend refuses those
   for customers, admins and any other shop, takes the shop from the session
   (never from the address) and applies the platform's rules to whatever is
   saved, so nothing here can show or change another shop's data.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const svc = () => FrameX.productService;
  const http = () => FrameX.http;
  const view = () => FrameX.orderView;

  const NAV = [
    ["overview", "Overview", "frame"],
    ["profile", "Shop profile", "store"],
    ["products", "Products", "image"],
    ["orders", "Orders", "bag"],
    ["inventory", "Inventory", "package"],
    ["account", "Account", "settings"],
  ];
  const SHOP_STATUS = {
    ACTIVE: ["Approved · Active", "published", "Your shop is listed. Customers can find it and see how far away it is."],
    INACTIVE: ["Approved · Inactive", "draft", "Your shop is approved but not listed to customers right now. Contact FrameX to activate it."],
    PENDING: ["Waiting for approval", "pending_review", "FrameX is still reviewing your shop."],
    REJECTED: ["Not approved", "unpublished", "This shop isn't approved on FrameX."],
  };
  const FILTERS = [
    ["all", "All"],
    ["draft", "Drafts"],
    ["pending_review", "Pending review"],
    ["published", "Published"],
    ["unpublished", "Unpublished"],
  ];
  const ORDER_FILTERS = [
    ["open", "To make"],
    ["done", "Finished"],
    ["all", "All"],
  ];

  let root, shop;
  let listState = { status: "all", q: "" };

  const monogram = (name) =>
    String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  const statusBadge = (s) =>
    `<span class="sd-status sd-status--${esc(s)}">${esc((M().STATUS[s] || { label: s }).label)}</span>`;
  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
  const api = (rest) => `/shops/${encodeURIComponent(shop.shopCode)}${rest}`;

  function parse() {
    const h = location.hash.replace(/^#/, "") || "/overview";
    const [path, query] = h.split("?");
    return {
      parts: path.split("/").filter(Boolean),
      params: new URLSearchParams(query || ""),
    };
  }

  /* ---------------------------------------------------------------- Layout */
  function layout(section) {
    root.onclick = null;
    const [label, tone] = SHOP_STATUS[shop.status] || [shop.status, "draft"];
    root.innerHTML = `<div class="sd">
      <aside class="sd-side">
        <div class="sd-shop"><span class="sd-logo">${esc(monogram(shop.name))}</span><div><strong>${esc(shop.name)}</strong><span class="sd-side__who"><code>${esc(shop.shopCode)}</code></span></div></div>
        <span class="sd-status sd-status--${tone}">${esc(label)}</span>
        <nav class="sd-nav" aria-label="Dashboard"><ul>${NAV.map(([id, text, ic]) => `<li><a href="#/${id}"${id === section ? ' aria-current="page"' : ""}>${icon(ic)}<span>${text}</span></a></li>`).join("")}</ul></nav>
        <button class="btn btn--outline btn--sm" type="button" data-logout>${icon("logout")} Log out</button>
      </aside>
      <section class="sd-main" data-main></section>
    </div>`;
    $("[data-logout]", root).addEventListener("click", logout);
    return $("[data-main]", root);
  }

  async function logout() {
    window.onbeforeunload = null;
    await FrameX.auth.logout();
    window.location.href = "login.html?type=shop";
  }

  /* ---------------------------------------------------------------- Overview */
  const mapUrl = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  const fullAddress = () => [shop.address.line1, shop.address.area, shop.address.city, shop.address.state, shop.address.postalCode].filter(Boolean).join(", ");

  async function overviewView(main) {
    const [label, tone, meaning] = SHOP_STATUS[shop.status] || [shop.status, "draft", ""];
    const loc = shop.location || {};
    const hasPin = loc.latitude != null && loc.longitude != null;
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">${esc(shop.name)}</h1><p class="sd-lead">Your shop on FrameX.</p></div>
        ${shop.status === "ACTIVE" ? `<a class="btn btn--outline btn--sm" href="${FrameX.qs.shopUrl(shop.shopCode)}">View public page</a>` : ""}</header>
      <div class="sd-cards">
        <article class="sd-card" data-orders-card><h2>Orders to make</h2><p class="sd-card__big" data-open-orders>…</p><p>Orders with your products that are not delivered yet.</p><a class="btn btn--outline btn--sm" href="#/orders">Open orders</a></article>
        <article class="sd-card"><h2>Shop ID</h2><p class="sd-card__big"><code>${esc(shop.shopCode)}</code></p><p>Your FrameX identity. Use it (or your email) to log in.</p></article>
        <article class="sd-card"><h2>Status</h2><p><span class="sd-status sd-status--${tone}">${esc(label)}</span></p><p>${esc(meaning)}</p></article>
        <article class="sd-card"><h2>Location</h2><p>${esc(fullAddress()) || "No address on file"}</p>
          ${hasPin ? `<p><code>${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}</code></p><a class="btn btn--outline btn--sm" href="${mapUrl(loc.latitude, loc.longitude)}" target="_blank" rel="noopener noreferrer">${icon("pin")} View on map</a>` : ""}
          <p>Customers' distances are measured to this point. If the pin is wrong, ask FrameX to correct it.</p></article>
        <article class="sd-card"><h2>Account</h2><p>${esc(shop.account ? shop.account.email : "")}</p><a class="btn btn--outline btn--sm" href="#/account">Account settings</a></article>
      </div>`;
    try {
      const r = await http().get(api("/orders"), { filter: "open" });
      const box = $("[data-open-orders]", main);
      if (box) box.textContent = String(r.total);
    } catch (error) {
      const box = $("[data-open-orders]", main);
      if (box) box.textContent = "—";
    }
  }

  /* ---------------------------------------------------------------- Products */
  /** Products an older version of this dashboard kept in this browser only. */
  function importBanner() {
    const local = svc().localOnly(shop.id);
    const own = local.filter((l) => !l.isCatalogueEdit);
    const edits = local.filter((l) => l.isCatalogueEdit);
    if (!own.length && !edits.length) return "";
    return `<div class="wz-note sd-import" data-import-box>${icon("alert")}<div>
        ${own.length ? `<strong>${own.length} ${own.length === 1 ? "product is" : "products are"} saved only in this browser.</strong> <span>An older version of this dashboard kept products on this device. Move ${own.length === 1 ? "it" : "them"} to your shop account so ${own.length === 1 ? "it is" : "they are"} safe, the same on every device, and can really be ordered.</span>
        <button class="btn btn--dark btn--sm" type="button" data-import>${icon("upload")} Move to my shop account</button>` : ""}
        ${edits.length ? `<p>${edits.length} ${edits.length === 1 ? "edit" : "edits"} to FrameX catalogue products ${edits.length === 1 ? "is" : "are"} also saved in this browser. Catalogue products are managed by FrameX, so ${edits.length === 1 ? "it" : "they"} can't be moved; ask FrameX to update the catalogue, or make your own copy of the product. <button class="iu-btn" type="button" data-drop-edits>Remove ${edits.length === 1 ? "it" : "them"} from this browser</button></p>` : ""}
      </div></div>`;
  }

  async function runImport(button, main) {
    const own = svc()
      .localOnly(shop.id)
      .filter((l) => !l.isCatalogueEdit);
    button.disabled = true;
    let moved = 0;
    let failed = 0;
    for (let i = 0; i < own.length; i++) {
      button.textContent = `Moving ${i + 1} of ${own.length}…`;
      try {
        await svc().adoptLocal(own[i].record);
        moved += 1;
      } catch (error) {
        console.error("Product couldn't be moved", error);
        failed += 1;
      }
    }
    FrameX.toast.show(failed ? `${moved} moved. ${failed} couldn't be moved: open ${failed === 1 ? "it" : "them"} and try again.` : `${moved} ${moved === 1 ? "product" : "products"} moved to your shop account${moved ? " as saved" : ""}.`, { duration: 6000 });
    productsView(main);
  }

  async function productsView(main) {
    main.innerHTML = `<div class="sd-loading"><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div></div>`;
    const all = await svc().forShop(shop.id);
    const counts = all.reduce(
      (m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m),
      {},
    );
    const q = listState.q.toLowerCase();
    const shown = all.filter(
      (p) =>
        (listState.status === "all" || p.status === listState.status) &&
        (!q || (p.name || "").toLowerCase().includes(q)),
    );

    main.innerHTML = `<header class="sd-head">
        <div><h1 class="sd-title">Products</h1><p class="sd-lead">${all.length} ${all.length === 1 ? "product" : "products"} · ${counts.published || 0} published. You decide what you sell: the type, details, pictures, price and stock.</p></div>
        <a class="btn btn--primary" href="#/products/new">${icon("plus")} Add product</a>
      </header>
      ${shop.status === "ACTIVE" ? "" : `<p class="wz-note">${icon("alert")} Your shop isn't listed to customers right now, so published products are not on sale yet. You can still prepare them.</p>`}
      ${importBanner()}
      <div class="sd-toolbar">
        <label class="field sd-search"><span class="visually-hidden">Search products</span>${icon("search")}<input class="input" type="search" data-q value="${esc(listState.q)}" placeholder="Search your products"></label>
        <div class="chip-scroll" role="group" aria-label="Filter by status">${FILTERS.map(([id, label]) => `<button class="chip" type="button" data-filter="${id}" aria-pressed="${listState.status === id}">${label}${id === "all" ? ` (${all.length})` : counts[id] ? ` (${counts[id]})` : ""}</button>`).join("")}</div>
      </div>
      ${
        shown.length
          ? `<ul class="sd-list">${shown.map(itemHtml).join("")}</ul>`
          : `<div class="sd-empty">${icon("frame")}<strong>${all.length ? "No products match" : "No products yet"}</strong><span>${all.length ? "Try another filter." : "Add your first product: a photo frame, home decor, wall art, a multi-panel set or anything else you make. It takes a few minutes and saves as you go."}</span>${all.length ? "" : `<a class="btn btn--primary btn--sm" href="#/products/new">Add product</a>`}</div>`
      }`;

    $$("[data-thumb-ref]", main).forEach((img) =>
      FrameX.mediaService
        .resolve(img.dataset.thumbRef, { thumb: true })
        .then((u) => (img.src = u || M().FALLBACK_IMAGE)),
    );
    $("[data-q]", main).addEventListener(
      "input",
      FrameX.dom.debounce((e) => {
        listState.q = e.target.value.trim();
        productsView(main).then(() => {
          const box = $("[data-q]", main);
          box.focus();
          box.setSelectionRange(box.value.length, box.value.length);
        });
      }, 250),
    );
    main.onclick = async (e) => {
      const f = e.target.closest("[data-filter]");
      if (f) {
        listState.status = f.dataset.filter;
        return productsView(main);
      }
      const importBtn = e.target.closest("[data-import]");
      if (importBtn) return runImport(importBtn, main);
      if (e.target.closest("[data-drop-edits]")) {
        svc()
          .localOnly(shop.id)
          .filter((l) => l.isCatalogueEdit)
          .forEach((l) => FrameX.seedProvider.forgetLocal(l.record.id));
        return productsView(main);
      }
      const btn = e.target.closest("[data-item-act]");
      if (!btn) return;
      const product = all.find(
        (p) => p.id === btn.closest("[data-item]").dataset.item,
      );
      await itemAction(btn, product, main);
    };
  }

  function itemHtml(p) {
    const main = M().mainView(p);
    const thumb = (main ? main.thumb || main.url : "") || p.listingImage || "";
    const sizes = (p.sizes || []).length;
    const fromFile = p.source === "catalogue";
    const type = M().productTypeOf(p);
    const need = M().photoRequirement(p, {});
    const live = p.status === "published";
    return `<li class="sd-item" data-item="${esc(p.id)}">
      <img class="sd-item__img" ${/^media:/.test(thumb) ? `data-thumb-ref="${esc(thumb)}" src="${M().FALLBACK_IMAGE}"` : `src="${esc(http().asset(thumb) || M().FALLBACK_IMAGE)}"`} alt="" width="72" height="72" loading="lazy">
      <div class="sd-item__main">
        ${fromFile ? `<span class="sd-item__name">${esc(p.name)}</span>` : `<a class="sd-item__name" href="#/products/${encodeURIComponent(p.id)}/edit">${esc(p.name || "Untitled product")}</a>`}
        <span class="sd-item__meta">${p.pricing && p.pricing.basePrice ? `From ${formatPrice(FrameX.pricing.startingPrice(p))}` : "No price yet"} · ${sizes} ${sizes === 1 ? "size" : "sizes"} · ${(p.views || []).length} images${p.updatedAt && !fromFile ? ` · Updated ${esc(when(p.updatedAt))}` : ""}</span>
        <span class="sd-item__source">${p.productType || fromFile ? esc(type.name) : "Type not chosen"} · ${need.count ? `customer adds ${need.count === 1 ? "1 photo" : `${need.count} photos`}` : "no customer photo"}${fromFile ? " · FrameX catalogue (managed by FrameX)" : ""}${live && !fromFile && p.onSale === false ? " · not on sale while your shop is unlisted" : ""}</span>
      </div>
      ${statusBadge(p.status)}
      <div class="sd-item__actions">
        ${
          fromFile
            ? `<a class="iu-btn" href="product.html?slug=${encodeURIComponent(p.slug || p.id)}" target="_blank" rel="noopener">${icon("eye")} View</a>
               <button class="iu-btn" type="button" data-item-act="duplicate">${icon("copy")} Make my own copy</button>`
            : `<a class="iu-btn" href="#/products/${encodeURIComponent(p.id)}/edit">${icon("edit")} Edit</a>
               <a class="iu-btn" href="product.html?preview=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${icon("eye")} Preview</a>
               <button class="iu-btn" type="button" data-item-act="duplicate">${icon("copy")} Duplicate</button>
               ${live ? `<button class="iu-btn" type="button" data-item-act="unpublish">Unpublish</button>` : p.status === "pending_review" ? "" : `<button class="iu-btn iu-btn--go" type="button" data-item-act="publish">${FrameX.config.productModeration ? "Submit" : "Publish"}</button>`}
               <button class="iu-btn iu-btn--danger" type="button" data-item-act="delete">${icon("trash")} Delete</button>`
        }
      </div>
    </li>`;
  }

  async function itemAction(btn, product, main) {
    const a = btn.dataset.itemAct;
    try {
      if (a === "duplicate") {
        // A copy of a catalogue product starts with the type the catalogue implies (a frame is a photo frame).
        const source = product.source === "catalogue" ? Object.assign({}, product, { productType: product.productType || M().productTypeOf(product).id }) : product;
        const copy = await svc().duplicate(source);
        FrameX.toast.show(`Created “${copy.name}” as a draft.`, {
          action: {
            label: "Edit",
            onClick: () =>
              (location.hash = `#/products/${encodeURIComponent(copy.id)}/edit`),
          },
        });
      }
      if (a === "publish") {
        const r = await svc().publish(product);
        if (!r.ok) {
          FrameX.toast.show(
            `“${product.name || "This product"}” is missing information.`,
            {
              action: {
                label: "Fix it",
                onClick: () =>
                  (location.hash = `#/products/${encodeURIComponent(product.id)}/edit?step=publish`),
              },
            },
          );
          return;
        }
        FrameX.toast.show(
          r.status === "pending_review"
            ? "Submitted. FrameX will review it before it goes on sale."
            : "Published.",
        );
      }
      if (a === "unpublish") {
        await svc().unpublish(product);
        FrameX.toast.show("Unpublished. Customers can't see it now.");
      }
      if (a === "delete") {
        if (!btn.classList.contains("is-confirming")) {
          btn.classList.add("is-confirming");
          btn.textContent = "Tap again to confirm";
          setTimeout(
            () => btn.isConnected && btn.classList.remove("is-confirming"),
            4000,
          );
          return;
        }
        await svc().remove(product);
        FrameX.toast.show("Product deleted.");
      }
    } catch (error) {
      console.error("Product action failed", error);
      FrameX.toast.show(
        error.friendly || error.message || "That didn't work. Please try again.",
        { duration: 6000 },
      );
    }
    productsView(main);
  }

  /* ---------------------------------------------------------------- Inventory */
  async function inventoryView(main) {
    const all = await svc().forShop(shop.id);
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Inventory</h1><p class="sd-lead">Stock and availability for every product. Changes save when you press Save on that row. Stock goes down by itself when an order is placed.</p></div></header>
      ${
        all.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Availability</th><th scope="col">Stock</th><th scope="col"><span class="visually-hidden">Save</span></th></tr></thead><tbody>
        ${all
          .map((p) => {
            const fixed = p.source === "catalogue";
            return `<tr data-row="${esc(p.id)}"><th scope="row">${esc(p.name || "Untitled")}${fixed ? `<br><span class="sd-item__meta">FrameX catalogue</span>` : ""}</th><td>${statusBadge(p.status)}</td>
            <td><select class="select" data-inv="status" aria-label="Availability of ${esc(p.name)}"${fixed ? " disabled" : ""}>${M()
              .AVAILABILITY.map(
                (a) =>
                  `<option value="${a.id}"${p.availability.status === a.id ? " selected" : ""}>${a.name}</option>`,
              )
              .join("")}</select></td>
            <td><input class="input" type="number" min="0" step="1" data-inv="stock" value="${p.availability.stock ?? ""}" placeholder="—" aria-label="Stock of ${esc(p.name)}"${fixed ? " disabled" : ""}></td>
            <td>${fixed ? `<span class="sd-item__meta">Managed by FrameX</span>` : `<button class="iu-btn" type="button" data-inv-save>Save</button>`}</td></tr>`;
          })
          .join("")}</tbody></table></div>`
          : `<div class="sd-empty">${icon("package")}<strong>No products yet</strong><a class="btn btn--primary btn--sm" href="#/products/new">Add product</a></div>`
      }`;
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-inv-save]");
      if (!btn) return;
      const row = btn.closest("[data-row]");
      const p = M().sanitizeShopInput(
        all.find((x) => x.id === row.dataset.row),
      );
      const stock = $("[data-inv='stock']", row).value;
      p.availability = Object.assign({}, p.availability, {
        status: $("[data-inv='status']", row).value,
        stock: stock === "" ? null : Math.max(0, Number(stock)),
      });
      if (p.availability.stock === 0) p.availability.status = "out_of_stock";
      try {
        await svc().save(p);
        FrameX.toast.show(`Saved stock for ${p.name}.`);
        inventoryView(main);
      } catch (error) {
        FrameX.toast.show(error.friendly || "Couldn't save. Please try again.", { duration: 6000 });
      }
    };
  }

  /* ---------------------------------------------------------------- Orders
     The backend sends only orders that contain this shop's products, and of
     those only this shop's own items. The customer's ORIGINAL photos are
     downloaded through a link the backend signs for a few minutes (and logs). */
  const STEP_HINT = {
    NEW: "Not started",
    ACCEPTED: "You have seen it and will make it",
    IN_PRODUCTION: "Being printed / framed",
    READY: "Finished, waiting to be handed over",
    HANDED_OVER: "Given to the customer or the courier",
  };

  async function ordersView(main, params) {
    const filter = ORDER_FILTERS.some(([id]) => id === params.get("filter")) ? params.get("filter") : "open";
    const page = Number(params.get("page")) || 1;
    main.innerHTML = `<div class="sd-loading"><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div></div>`;
    const r = await http().get(api("/orders"), { filter: filter === "all" ? "" : filter, page });
    const v = view();
    const link = (extra) => {
      const q = new URLSearchParams(Object.assign({}, filter === "open" ? {} : { filter }, extra));
      [...q.keys()].forEach((k) => !q.get(k) && q.delete(k));
      return "#/orders" + (q.toString() ? "?" + q : "");
    };
    const pages = Math.ceil(r.total / r.limit);
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Orders</h1><p class="sd-lead">Orders that contain your products. You see your own items, the customer's photos for them, and who to hand them to.</p></div></header>
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter orders">${ORDER_FILTERS.map(([id, label]) => `<a class="chip" href="${id === "open" ? "#/orders" : `#/orders?filter=${id}`}" aria-pressed="${filter === id}">${label}</a>`).join("")}</div></div>
      ${
        r.items.length
          ? `<div class="sd-table-wrap"><table class="sd-table so-table"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Your items</th><th scope="col">Photos</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Placed</th></tr></thead><tbody>
          ${r.items
            .map(
              (o) => `<tr>
              <td><a class="sd-item__name" href="#/orders/${esc(o.orderNumber)}">${esc(o.orderNumber)}</a>${o.needsAction ? ` <span class="ob ob--wait">New</span>` : ""}<br><span class="sd-item__meta">${esc(o.firstItem ? o.firstItem.name : "")}${o.itemCount > 1 ? ` + ${o.itemCount - 1} more` : ""}</span></td>
              <td>${esc(o.customerName)}${o.giftWrap ? `<br><span class="sd-item__meta"><span aria-hidden="true">🎁</span> Gift wrap</span>` : ""}</td>
              <td>${o.itemCount} · <strong>${formatPrice(o.itemsTotal)}</strong></td>
              <td>${o.photoCount ? `${icon("image")} ${o.photoCount}` : `<span class="sd-item__meta">None</span>`}</td>
              <td>${v.badge(o.status, v.ORDER_STATUS)}</td>
              <td><span class="sd-item__meta">${esc(o.payment)}</span></td>
              <td>${esc(v.when(o.placedAt))}</td>
            </tr>`,
            )
            .join("")}
        </tbody></table></div>
        ${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${page > 1 ? `<a class="btn btn--outline btn--sm" href="${link({ page: page - 1 })}">Newer</a>` : ""}<span>Page ${page} of ${pages} · ${r.total} orders</span>${page < pages ? `<a class="btn btn--outline btn--sm" href="${link({ page: page + 1 })}">Older</a>` : ""}</nav>` : ""}`
          : `<div class="sd-empty">${icon("bag")}<strong>${filter === "open" ? "Nothing to make right now" : "No orders here"}</strong><span>${filter === "open" ? "When a customer orders one of your products, the order appears here with the photo to print." : "No order matches this filter."}</span></div>`
      }`;
  }

  function orderItemHtml(o, i) {
    const v = view();
    const steps = o.fulfilmentStatuses || [];
    const stepName = (steps.find((s) => s.id === i.fulfilment.status) || { label: i.fulfilment.status }).label;
    const facts = [i.size, i.color].filter(Boolean).map(esc).join(" · ");
    return `<section class="co-card so-item" data-item="${esc(i.id)}">
      <div class="so-item__head">
        <img src="${esc(http().asset(i.image) || M().FALLBACK_IMAGE)}" alt="" width="72" height="72" loading="lazy">
        <div class="so-item__info">
          <h2 class="so-item__name">${esc(i.name)}</h2>
          <p class="so-item__qty">Quantity <strong>${i.quantity}</strong> · ${formatPrice(i.lineTotal)}</p>
          ${facts ? `<p>${facts}</p>` : ""}
          ${(i.options || []).map((t) => `<p>${esc(t)}</p>`).join("")}
          ${i.design ? (i.design.summary || []).map((t) => `<p>${esc(t)}</p>`).join("") : ""}
          ${i.design && i.design.customText ? Object.values(i.design.customText).filter(Boolean).map((t) => `<p>Text: “${esc(t)}”</p>`).join("") : ""}
          ${i.note ? `<p class="so-item__note">${icon("alert")} Customer's note: ${esc(i.note)}</p>` : ""}
        </div>
      </div>
      ${
        i.photosRequired || (i.photos || []).length
          ? `<div class="so-item__photos"><h3 class="ad-subtitle">${icon("image")} Customer ${i.photos.length === 1 ? "photo" : "photos"} to print</h3>
          ${v.photosHtml(i, { actions: o.canDownloadPhotos ? (p) => `<button class="btn btn--dark btn--sm" type="button" data-photo="${esc(p.id)}" data-photo-action="download">${icon("upload")} Download original</button>` : null })}
          ${(i.photos || []).some((p) => p.placement) ? `<p class="co-fine">${icon("frame")}<span>How the customer placed ${i.photos.length > 1 ? "each picture" : "the picture"} in the frame: ${(i.photos || []).map((p, n) => (p.placement ? `${i.photos.length > 1 ? `Photo ${n + 1}: ` : ""}centred on the point ${Math.round(p.placement.x * 100)}% from the left and ${Math.round(p.placement.y * 100)}% from the top of the photo, zoom ${p.placement.zoom}×` : "")).filter(Boolean).join("; ")}.</span></p>` : ""}
          ${o.canDownloadPhotos ? "" : `<p class="co-fine co-fine--warn">${icon("lock")}<span>This order is not active, so its photos can't be downloaded.</span></p>`}</div>`
          : `<p class="co-fine">${icon("check")}<span>Ready-made: no customer photo for this item.</span></p>`
      }
      ${
        o.canUpdate
          ? `<form class="so-step" data-step-form>
          <div class="form-field"><label for="so-step-${esc(i.id)}">Progress</label>
            <select class="select" id="so-step-${esc(i.id)}" name="status" data-step-select>${steps.map((s) => `<option value="${esc(s.id)}"${s.id === i.fulfilment.status ? " selected" : ""}>${esc(s.label)}</option>`).join("")}</select></div>
          <div class="form-field"><label for="so-note-${esc(i.id)}">Note for the customer</label><input id="so-note-${esc(i.id)}" name="note" maxlength="200" value="${esc(i.fulfilment.note || "")}" placeholder="Optional, e.g. Ready for pickup after 5 pm"></div>
          <button class="btn btn--primary btn--sm" type="submit">Save progress</button>
          <p class="so-step__hint" data-step-hint>${esc(STEP_HINT[i.fulfilment.status] || "")}</p>
        </form>`
          : `<p class="so-item__step">Progress: <strong>${esc(stepName)}</strong>${i.fulfilment.note ? ` · ${esc(i.fulfilment.note)}` : ""}</p>`
      }
    </section>`;
  }

  function renderOrder(main, o, message = "") {
    const v = view();
    const to = o.deliverTo || {};
    const lines = [to.line1, to.line2, to.landmark, [to.city, to.state].filter(Boolean).join(", ") + (to.postalCode ? ` ${to.postalCode}` : "")].filter(Boolean);
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Order ${esc(o.orderNumber)}</h1><p class="sd-lead">${esc(o.customerName)} · placed ${esc(v.when(o.placedAt))}</p></div><a class="btn btn--outline btn--sm" href="#/orders">All orders</a></header>
      ${message ? `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(message)}</span></div>` : ""}
      <div class="od-summary">
        <div><span>Order status</span>${v.badge(o.status, v.ORDER_STATUS)}</div>
        <div><span>Payment</span><strong>${esc(o.payment)}</strong></div>
        <div><span>Your items</span><strong>${o.itemCount} · ${formatPrice(o.itemsTotal)}</strong></div>
        <div><span>Gift wrapping</span><strong>${o.giftWrap ? `<span aria-hidden="true">🎁</span> Yes` : "No"}</strong></div>
      </div>
      ${o.status === "CANCELLED" ? `<p class="od-cancel">${icon("alert")}<span>This order was cancelled${o.cancelReason ? `: ${esc(o.cancelReason)}` : "."} Don't make it.</span></p>` : ""}
      ${o.giftWrap && o.status !== "CANCELLED" ? `<p class="co-note co-note--gift"><span aria-hidden="true">🎁</span><span><strong>The customer asked for gift wrapping.</strong> Please gift wrap your items for this order before handing them over.</span></p>` : ""}
      ${o.otherShopsItems ? `<p class="co-note">${icon("store")}<span>This order also has ${o.otherShopsItems} ${o.otherShopsItems === 1 ? "item" : "items"} from other sellers. You only see and make your own.</span></p>` : ""}
      <div class="ao-grid">
        <div>${o.items.map((i) => orderItemHtml(o, i)).join("")}</div>
        <div>
          <section class="co-card"><h2 class="co-card__title">${icon("pin")} Hand over to</h2>
            <address class="od-address"><strong>${esc(to.name || o.customerName)}</strong><br>${lines.map(esc).join("<br>")}${to.phone ? `<br>${icon("phone")} ${esc(to.phone)}` : ""}</address>
            ${o.cashToCollect ? `<p class="co-fine co-fine--warn">${icon("cash")}<span>Cash on Delivery. FrameX tells you the amount to collect for the whole order.</span></p>` : ""}
          </section>
          <section class="co-card"><h2 class="co-card__title">${icon("image")} Printing customer photos</h2>
            <p class="co-lead">“Download original” gives you the exact file the customer uploaded: full size, never resized or enhanced by FrameX. Print it as it is. The link works for a few minutes and every download is recorded.</p>
          </section>
        </div>
      </div>`;
  }

  async function orderView(main, orderNumber) {
    main.innerHTML = `<div class="sd-loading"><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:220px"></div></div>`;
    let order;
    try {
      order = (await http().get(api("/orders/" + encodeURIComponent(orderNumber)))).order;
    } catch (error) {
      if (error.status !== 404) throw error;
      main.innerHTML = `<div class="sd-empty">${icon("alert")}<strong>That order isn't one of your shop's orders</strong><span>Check the order number, or look in your orders.</span><a class="btn btn--outline btn--sm" href="#/orders">All orders</a></div>`;
      return;
    }
    renderOrder(main, order);
    // The customer's original file, through a link the backend signs for this shop and this order line only.
    view().wirePhotos(main, async (uploadId) => (await http().post(api(`/orders/${encodeURIComponent(orderNumber)}/photos/${encodeURIComponent(uploadId)}/link`))).link);
    // What the chosen step means, under the list.
    main.addEventListener("change", (e) => {
      const pick = e.target.closest("[data-step-select]");
      if (pick) $("[data-step-hint]", pick.closest("[data-step-form]")).textContent = STEP_HINT[pick.value] || "";
    });
    main.addEventListener("submit", async (e) => {
      const form = e.target.closest("[data-step-form]");
      if (!form) return;
      e.preventDefault();
      const itemId = form.closest("[data-item]").dataset.item;
      const button = $("button[type=submit]", form);
      button.disabled = true;
      try {
        order = (await http().patch(api(`/orders/${encodeURIComponent(orderNumber)}/items/${encodeURIComponent(itemId)}`), { status: form.elements.status.value, note: form.elements.note.value.trim() })).order;
        renderOrder(main, order);
        FrameX.toast.show("Progress saved. The customer sees it in their order.");
      } catch (error) {
        if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl("shop"));
        renderOrder(main, order, error.message);
      }
    });
  }

  /* ---------------------------------------------------------------- Profile, account */
  function profileView(main) {
    const { FULFILMENT_METHODS } = FrameX.constants;
    const forms = FrameX.forms;
    const options = Object.entries(FULFILMENT_METHODS).filter(([id, m]) => m.enabled && ["pickup", "shop_delivery", "delivery_partner"].includes(id));
    const fixed = [
      ["Shop ID", shop.shopCode],
      ["Shop name", shop.name],
      ["Owner", shop.ownerName],
      ["Address", fullAddress()],
    ];
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Shop profile</h1><p class="sd-lead">What customers see about your shop.</p></div></header>
      <dl class="sd-profile">${fixed.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v ? esc(v) : `<span class="pp-muted">Not added yet</span>`}</dd></div>`).join("")}</dl>
      <p class="wz-note">${icon("lock")} Shop ID, name, address and map location are managed by FrameX. To change them, <a href="contact.html">contact FrameX</a>.</p>
      <h2 class="ad-subtitle">Details you can edit</h2>
      <form id="shop-profile-form" class="form-grid" novalidate>
        ${forms.field("phone", "Shop phone", { type: "tel", autocomplete: "tel", value: shop.phone || "", hint: "Shown to customers on your shop page.", prefix: "sp" })}
        ${forms.field("description", "About your shop", { rows: 4, maxlength: 1000, value: shop.description || "", prefix: "sp" })}
        <div class="form-field"><span class="ad-label">Pickup and delivery</span><div class="ad-checks">${options.map(([id, m]) => `<label class="wz-check"><input type="checkbox" name="fulfilment" value="${id}"${(shop.fulfilment || []).includes(id) ? " checked" : ""}> ${esc(m.label)}</label>`).join("")}</div></div>
        <div class="form-field"><span class="ad-label">Gift wrapping</span><div class="ad-checks"><label class="wz-check"><input type="checkbox" name="giftWrap"${shop.giftWrap !== false ? " checked" : ""}> My shop can gift wrap its products</label></div>
          <p class="form-field__hint">At checkout FrameX asks customers whether they want their order gift wrapped. If you can't offer it, untick this: the option is then not offered for orders that contain your products. You can also switch it off for a single product in the product editor.</p></div>
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--dark btn--sm" type="submit">Save changes</button></div>
      </form>`;
    const form = $("#shop-profile-form", main);
    forms.handle(form, {
      busyLabel: "Saving…",
      send: (v) => http().patch(api("/profile"), { phone: v.phone, description: v.description, fulfilment: new FormData(form).getAll("fulfilment"), giftWrap: form.elements.giftWrap.checked }),
      onSuccess(result) {
        setShop(result.shop);
        FrameX.toast.show("Shop profile saved.");
        profileView(main);
      },
    });
  }

  function accountView(main) {
    const a = shop.account || {};
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Account</h1><p class="sd-lead">How you log in to FrameX.</p></div></header>
      <dl class="sd-profile">
        <div><dt>Shop ID</dt><dd><code>${esc(shop.shopCode)}</code></dd></div>
        <div><dt>Login email</dt><dd>${esc(a.email || "")}</dd></div>
        <div><dt>Last login</dt><dd>${a.lastLoginAt ? esc(when(a.lastLoginAt)) : "—"}</dd></div>
      </dl>
      <div class="ad-actions"><a class="btn btn--dark btn--sm" href="account.html">${icon("lock")} Change password</a><button class="btn btn--outline btn--sm" type="button" data-logout-2>${icon("logout")} Log out</button></div>
      <h2 class="ad-subtitle">How selling on FrameX works</h2>
      <div class="sd-cards">
        <article class="sd-card"><h2>You decide</h2><p>What you sell and its type, the name, description, pictures, price, sizes, materials, stock, delivery notes, whether a product can be gift wrapped and, where the type allows it, how many photos a customer adds.</p></article>
        <article class="sd-card"><h2>FrameX decides</h2><p>Payments, customer accounts, how orders are stored, the rules of each product type (a photo frame always needs the customer's photo) and how customer photos are kept and shared. ${FrameX.config.productModeration ? "FrameX also reviews a product before it first goes on sale." : "A published product goes on sale straight away; FrameX can take one off sale if it breaks the rules."}</p></article>
        <article class="sd-card"><h2>Your data</h2><p>Products and their pictures are saved in your shop's FrameX account, not on this device. You only ever see orders that contain your own products.</p></article>
      </div>`;
    $("[data-logout-2]", main).addEventListener("click", logout);
  }

  /* ---------------------------------------------------------------- Router */
  async function route() {
    window.onbeforeunload = null;
    const { parts, params } = parse();
    const section = NAV.some(([id]) => id === parts[0]) ? parts[0] : "overview";
    const main = layout(section);
    main.onclick = null;
    document.title = `${NAV.find(([id]) => id === section)[1]} · ${shop.name} — FrameX shop dashboard`;
    try {
      root.classList.remove("is-editing");
      if (section === "overview") return await overviewView(main);
      if (section === "profile") return profileView(main);
      if (section === "account") return accountView(main);
      if (section === "orders") {
        if (parts[1]) {
          document.title = `Order ${decodeURIComponent(parts[1])} · ${shop.name} — FrameX`;
          return await orderView(main, decodeURIComponent(parts[1]));
        }
        return await ordersView(main, params);
      }
      if (section === "products" && parts[1]) {
        const box = document.createElement("div");
        main.appendChild(box);
        root.classList.add("is-editing");
        await FrameX.productWizard.open(box, {
          productId: parts[1] === "new" ? null : decodeURIComponent(parts[1]),
          shopId: shop.id,
          step: params.get("step") || "basic",
        });
        document.title = `${parts[1] === "new" ? "New product" : "Edit product"} · ${shop.name} — FrameX`;
        return;
      }
      if (section === "products") await productsView(main);
      if (section === "inventory") await inventoryView(main);
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl("shop"));
      console.error("Dashboard view failed", error);
      FrameX.templates.showError(main, "This page couldn't be loaded.", route);
    }
  }

  /** Keep the backend's shop record, plus the id its products carry. */
  function setShop(s) {
    shop = Object.assign({}, s, {
      // A shop FrameX linked to the catalogue file sells under that link; every other shop under its Shop ID.
      id: s.catalogRef || s.shopCode,
    });
  }

  function message(title, text, actions) {
    root.innerHTML = `<div class="not-found">${icon("lock")}<h1 class="section-title">${title}</h1><p class="section-lead">${text}</p><div class="final-cta__actions">${actions}</div></div>`;
  }

  async function start() {
    const state = await FrameX.auth.ready;
    if (!state.available || !state.reachable) {
      return message(
        "The shop dashboard isn't available right now",
        state.available ? "We can't reach the FrameX server. Please try again in a little while." : "Shop accounts haven't been switched on for this site yet.",
        `<a class="btn btn--dark" href="partner.html">Partner with FrameX</a><a class="btn btn--outline" href="index.html">Back to FrameX</a>`,
      );
    }
    const user = await FrameX.auth.guard(["SHOP"], {
      accountType: "shop",
      onForbidden: (u) =>
        message(
          "This area is for FrameX partner shops",
          "You're logged in with a different kind of account.",
          `<a class="btn btn--dark" href="${u.role === "ADMIN" ? "admin.html" : "account.html"}">${u.role === "ADMIN" ? "Open admin dashboard" : "Go to my account"}</a><a class="btn btn--outline" href="partner.html">Partner with FrameX</a>`,
        ),
    });
    if (!user) return;
    try {
      // The backend answers only for the logged-in shop's own Shop ID.
      const [dashboard, settings] = await Promise.all([http().get(`/shops/${encodeURIComponent(user.shop.shopCode)}/dashboard`), http().serverConfig()]);
      setShop(dashboard.shop);
      // Whether a shop's first "Publish" waits for FrameX is the backend's setting.
      FrameX.config.productModeration = Boolean(settings && settings.features && settings.features.productModeration);
    } catch (error) {
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl("shop"));
      return message("Your shop couldn't be loaded", esc(error.message), `<a class="btn btn--dark" href="shop-dashboard.html">Try again</a>`);
    }
    route();
  }

  function init() {
    root = $("#sd-root");
    if (!root) return;
    window.addEventListener("hashchange", () => shop && route());
    start();
  }

  FrameX.shopDashboard = { init };
})((window.FrameX = window.FrameX || {}));
