/* ==========================================================================
   Shop dashboard (shop-dashboard.html). SHOP role only.

   Routes (hash, so it works on any static host):
     #/overview                    Shop ID, status, location, account
     #/profile                     shop profile (FrameX-controlled identity +
                                   the fields a shop may edit itself)
     #/products  #/orders  #/inventory
                                   Step 2 areas. Product tools work today only
                                   for shops linked to the catalogue file, and
                                   save in this browser; otherwise a placeholder.
     #/account                     login details, password, log out

   Access: the page asks the backend who is logged in (FrameX.auth.guard) and
   loads the shop from GET /api/shops/<own Shop ID>/dashboard. The backend
   refuses that request for customers, admins and any other shop, so nothing
   here can show another shop's data.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const { formatPrice } = FrameX.pricing;
  const M = () => FrameX.productModel;
  const svc = () => FrameX.productService;

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

  function overviewView(main) {
    const [label, tone, meaning] = SHOP_STATUS[shop.status] || [shop.status, "draft", ""];
    const loc = shop.location || {};
    const hasPin = loc.latitude != null && loc.longitude != null;
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">${esc(shop.name)}</h1><p class="sd-lead">Your shop on FrameX.</p></div>
        ${shop.status === "ACTIVE" ? `<a class="btn btn--outline btn--sm" href="${FrameX.qs.shopUrl(shop.shopCode)}">View public page</a>` : ""}</header>
      <div class="sd-cards">
        <article class="sd-card"><h2>Shop ID</h2><p class="sd-card__big"><code>${esc(shop.shopCode)}</code></p><p>Your FrameX identity. Use it (or your email) to log in.</p></article>
        <article class="sd-card"><h2>Status</h2><p><span class="sd-status sd-status--${tone}">${esc(label)}</span></p><p>${esc(meaning)}</p></article>
        <article class="sd-card"><h2>Location</h2><p>${esc(fullAddress()) || "No address on file"}</p>
          ${hasPin ? `<p><code>${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}</code></p><a class="btn btn--outline btn--sm" href="${mapUrl(loc.latitude, loc.longitude)}" target="_blank" rel="noopener noreferrer">${icon("pin")} View on map</a>` : ""}
          <p>Customers' distances are measured to this point. If the pin is wrong, ask FrameX to correct it.</p></article>
        <article class="sd-card"><h2>Account</h2><p>${esc(shop.account ? shop.account.email : "")}</p><a class="btn btn--outline btn--sm" href="#/account">Account settings</a></article>
      </div>`;
  }

  /* ---------------------------------------------------------------- Products */
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
        <div><h1 class="sd-title">Products</h1><p class="sd-lead">${all.length} ${all.length === 1 ? "product" : "products"} · ${counts.published || 0} published</p></div>
        <a class="btn btn--primary" href="#/products/new">${icon("plus")} Add product</a>
      </header>
      <div class="sd-toolbar">
        <label class="field sd-search"><span class="visually-hidden">Search products</span>${icon("search")}<input class="input" type="search" data-q value="${esc(listState.q)}" placeholder="Search your products"></label>
        <div class="chip-scroll" role="group" aria-label="Filter by status">${FILTERS.map(([id, label]) => `<button class="chip" type="button" data-filter="${id}" aria-pressed="${listState.status === id}">${label}${id === "all" ? ` (${all.length})` : counts[id] ? ` (${counts[id]})` : ""}</button>`).join("")}</div>
      </div>
      ${
        shown.length
          ? `<ul class="sd-list">${shown.map(itemHtml).join("")}</ul>`
          : `<div class="sd-empty">${icon("frame")}<strong>${all.length ? "No products match" : "No products yet"}</strong><span>${all.length ? "Try another filter." : "Add your first product. It takes a few minutes and you can save as you go."}</span>${all.length ? "" : `<a class="btn btn--primary btn--sm" href="#/products/new">Add product</a>`}</div>`
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
    const thumb = p.listingImage || (main ? main.thumb || main.url : "");
    const sizes = (p.sizes || []).length;
    const source =
      p.source === "catalogue"
        ? p.hasLocalChanges
          ? "From the catalogue file, edited on this device"
          : "From the catalogue file (js/edit.js)"
        : "Created in this dashboard";
    const live = p.status === "published";
    return `<li class="sd-item" data-item="${esc(p.id)}">
      <img class="sd-item__img" ${/^media:/.test(thumb) ? `data-thumb-ref="${esc(thumb)}" src="${M().FALLBACK_IMAGE}"` : `src="${esc(thumb || M().FALLBACK_IMAGE)}"`} alt="" width="72" height="72" loading="lazy">
      <div class="sd-item__main">
        <a class="sd-item__name" href="#/products/${encodeURIComponent(p.id)}/edit">${esc(p.name || "Untitled product")}</a>
        <span class="sd-item__meta">${p.pricing && p.pricing.basePrice ? `From ${formatPrice(FrameX.pricing.startingPrice(p))}` : "No price yet"} · ${sizes} ${sizes === 1 ? "size" : "sizes"} · ${(p.views || []).length} images${p.updatedAt ? ` · Updated ${esc(when(p.updatedAt))}` : ""}</span>
        <span class="sd-item__source">${esc(source)}</span>
      </div>
      ${statusBadge(p.status)}
      <div class="sd-item__actions">
        <a class="iu-btn" href="#/products/${encodeURIComponent(p.id)}/edit">${icon("edit")} Edit</a>
        <a class="iu-btn" href="product.html?preview=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${icon("eye")} Preview</a>
        <button class="iu-btn" type="button" data-item-act="duplicate">${icon("copy")} Duplicate</button>
        ${live ? `<button class="iu-btn" type="button" data-item-act="unpublish">Unpublish</button>` : p.status === "pending_review" ? "" : `<button class="iu-btn iu-btn--go" type="button" data-item-act="publish">${FrameX.config.productModeration ? "Submit" : "Publish"}</button>`}
        ${p.source === "catalogue" && !p.hasLocalChanges ? "" : `<button class="iu-btn iu-btn--danger" type="button" data-item-act="delete">${icon("trash")} ${p.source === "catalogue" ? "Discard changes" : "Delete"}</button>`}
      </div>
    </li>`;
  }

  async function itemAction(btn, product, main) {
    const a = btn.dataset.itemAct;
    try {
      if (a === "duplicate") {
        const copy = await svc().duplicate(product);
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
            ? "Submitted for review."
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
        FrameX.toast.show(
          product.source === "catalogue"
            ? "Your changes were discarded."
            : "Product deleted.",
        );
      }
    } catch (error) {
      console.error("Product action failed", error);
      FrameX.toast.show(
        error.friendly || "That didn't work. Please try again.",
      );
    }
    productsView(main);
  }

  /* ---------------------------------------------------------------- Inventory */
  async function inventoryView(main) {
    const all = await svc().forShop(shop.id);
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Inventory</h1><p class="sd-lead">Stock and availability for every product. Changes save when you press Save on that row.</p></div></header>
      ${
        all.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Availability</th><th scope="col">Stock</th><th scope="col"><span class="visually-hidden">Save</span></th></tr></thead><tbody>
        ${all
          .map(
            (
              p,
            ) => `<tr data-row="${esc(p.id)}"><th scope="row">${esc(p.name || "Untitled")}</th><td>${statusBadge(p.status)}</td>
            <td><select class="select" data-inv="status" aria-label="Availability of ${esc(p.name)}">${M()
              .AVAILABILITY.map(
                (a) =>
                  `<option value="${a.id}"${p.availability.status === a.id ? " selected" : ""}>${a.name}</option>`,
              )
              .join("")}</select></td>
            <td><input class="input" type="number" min="0" step="1" data-inv="stock" value="${p.availability.stock ?? ""}" placeholder="—" aria-label="Stock of ${esc(p.name)}"></td>
            <td><button class="iu-btn" type="button" data-inv-save>Save</button></td></tr>`,
          )
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
        FrameX.toast.show(error.friendly || "Couldn't save. Please try again.");
      }
    };
  }

  /* ---------------------------------------------------------------- Orders, profile, settings */
  function ordersView(main) {
    const wa = ((FrameX.seed.site || {}).contact || {}).whatsapp;
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">Orders</h1><p class="sd-lead">Online orders arrive here once FrameX checkout is connected.</p></div></header>
      <div class="sd-empty">${icon("bag")}<strong>No online orders yet</strong><span>Today customers send their cart to FrameX on WhatsApp${wa ? ` (${esc(FrameX.contact.formatWhatsapp(wa))})` : ""}, and FrameX passes the order to your shop.</span></div>`;
  }

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
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--dark btn--sm" type="submit">Save changes</button></div>
      </form>`;
    const form = $("#shop-profile-form", main);
    forms.handle(form, {
      busyLabel: "Saving…",
      send: (v) => FrameX.http.patch(`/shops/${encodeURIComponent(shop.shopCode)}/profile`, { phone: v.phone, description: v.description, fulfilment: new FormData(form).getAll("fulfilment") }),
      onSuccess(result) {
        setShop(result.shop);
        FrameX.toast.show("Shop profile saved.");
        profileView(main);
      },
    });
  }

  /** Products / inventory are Step 2. Shown instead of the tools for shops not linked to the catalogue file. */
  function comingSoon(main, title, text, ic) {
    main.innerHTML = `<header class="sd-head"><div><h1 class="sd-title">${title}</h1></div></header>
      <div class="sd-empty">${icon(ic)}<strong>${title} are coming in the next FrameX update</strong><span>${text}</span></div>`;
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
      ${shop.productTools ? `<h2 class="ad-subtitle">Products on this device</h2><div data-device></div>` : ""}`;
    $("[data-logout-2]", main).addEventListener("click", logout);
    if (shop.productTools) settingsView($("[data-device]", main));
  }

  async function settingsView(main) {
    main.innerHTML = `<div class="sd-cards">
        <article class="sd-card"><h2>Publishing</h2><p>${FrameX.config.productModeration ? "FrameX reviews new products before they go live (Pending review)." : "Products go live as soon as you publish them. FrameX may add a review step later; products would then show “Pending review” first."}</p></article>
        <article class="sd-card"><h2>Export products</h2><p>Download the products you created or edited on this device as a file you can send to FrameX. Uploaded photos stay on this device and are not in the file.</p><button class="btn btn--outline btn--sm" type="button" data-export>${icon("upload")} Download products (JSON)</button></article>
        <article class="sd-card"><h2>This device</h2><p>Remove every product, draft and photo this browser saved for the dashboard. Products in the catalogue file are not affected.</p><button class="btn btn--outline btn--sm sd-danger" type="button" data-wipe>Clear dashboard data</button></article>
      </div>`;
    main.onclick = async (e) => {
      if (e.target.closest("[data-export]")) {
        const list = (await svc().forShop(shop.id)).filter(
          (p) => p.hasLocalChanges,
        );
        const blob = new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                shopId: shop.id,
                products: list,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        );
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `framex-products-${shop.id}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      const wipe = e.target.closest("[data-wipe]");
      if (wipe) {
        if (!wipe.classList.contains("is-confirming")) {
          wipe.classList.add("is-confirming");
          wipe.textContent = "Tap again to clear everything";
          return;
        }
        const keys = FrameX.config.storageKeys;
        try {
          localStorage.removeItem(keys.shopProducts);
          localStorage.removeItem(keys.shopEditor);
        } catch (err) {
          /* ignore */
        }
        await FrameX.mediaService.collectGarbage([]);
        FrameX.toast.show("Dashboard data cleared from this device.");
        settingsView(main);
      }
    };
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
      if (section === "overview") return overviewView(main);
      if (section === "profile") return profileView(main);
      if (section === "account") return accountView(main);
      if (section === "orders") return ordersView(main);
      // Step 2 areas: placeholders unless this shop is linked to the catalogue file.
      if (!shop.productTools) {
        return section === "products"
          ? comingSoon(main, "Products", "You'll add and manage your frames here once product management opens for your shop. FrameX will let you know.", "image")
          : comingSoon(main, "Inventory", "Stock and availability for your products will be managed here.", "package");
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
      console.error("Dashboard view failed", error);
      FrameX.templates.showError(main, "This page couldn't be loaded.", route);
    }
  }

  /** Keep the backend's shop record, plus the id the (catalogue-file) product tools use. */
  function setShop(s) {
    shop = Object.assign({}, s, {
      // Products still live in the catalogue file (Step 2 moves them to the backend):
      // only a shop FrameX has linked to that file can use the product tools.
      id: s.catalogRef || s.shopCode,
      productTools: Boolean(s.catalogRef),
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
      setShop((await FrameX.http.get(`/shops/${encodeURIComponent(user.shop.shopCode)}/dashboard`)).shop);
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
