/* ==========================================================================
   FrameX admin dashboard (admin.html). ADMIN role only.

   Routes (hash):
     #/overview                 counts: applications, pending / active / inactive shops
     #/analytics[/<report>]     sales, visitors, products, sellers, paintings, logins
                                for a period (ui/admin-analytics.js)
     #/users/<id>               one account: contact details and order history
     #/applications[?status=]   shop applications
     #/applications/<id>        one application: review, approve (with location), reject
     #/shops[?status=]          shops: view, activate / deactivate
     #/shops/new                add a shop without an application
     #/shops/<id>               shop details, location, status, login credentials
     #/orders[?status=]         customer orders (ui/admin-orders.js)
     #/orders/<FX-number>       one order: move it forward, cancel, refund,
                                download the customer's original photos
     #/products[?status=]       products shops created: approve one that waits
                                for review, or take one off sale
     #/messages[?status=]       messages from the Contact page (ui/admin-messages.js)
     #/activity                 audit log of admin actions

   The page is only a view. Every request goes to /api/admin/*, where the
   backend checks the session and that the user's role is ADMIN; hiding or
   showing this page changes nothing about what the API allows.
   ========================================================================== */
(function (FrameX) {
  const { $, $$, escapeHtml: esc, icon } = FrameX.dom;
  const forms = () => FrameX.forms;
  const http = () => FrameX.http;

  const NAV = [
    ["overview", "Overview", "frame"],
    ["analytics", "Analytics", "chart"],
    ["applications", "Applications", "mail"],
    ["shops", "Shops", "store"],
    ["orders", "Orders", "receipt"],
    ["products", "Shop products", "image"],
    ["artists", "Artists", "users"],
    ["artworks", "Artworks", "frame"],
    ["paintings", "Custom paintings", "edit"],
    ["reviews", "Reviews", "star"],
    ["messages", "Messages", "mail"],
    ["users", "Accounts", "user"],
    ["settings", "Settings", "settings"],
    ["activity", "Activity", "clock"],
  ];
  const LISTING = { draft: "Draft", pending_review: "Waiting for review", published: "Published", unpublished: "Off sale" };
  const LISTING_FILTERS = [["", "All"], ["pending_review", "Waiting for review"], ["published", "Published"], ["unpublished", "Off sale"], ["draft", "Drafts"]];
  const PRODUCT_TYPE = { "photo-frame": "Photo Frame", "custom-frame": "Custom Frame", template: "Template-based", personalized: "Personalized", "home-decor": "Home Decor", "wall-art": "Wall Art", "multi-panel": "Multi-Panel Set", other: "Other" };
  const APP_STATUS = { PENDING: "Pending", UNDER_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Rejected" };
  const SHOP_STATUS = { PENDING: "Pending approval", ACTIVE: "Active", INACTIVE: "Inactive", REJECTED: "Rejected" };
  const ACCOUNT_STATUS = { ACTIVE: "Active", PENDING_SETUP: "Waiting for password setup", DISABLED: "Disabled" };
  const TONE = { PENDING: "pending_review", UNDER_REVIEW: "pending_review", APPROVED: "published", ACTIVE: "published", INACTIVE: "draft", REJECTED: "unpublished", DISABLED: "unpublished", PENDING_SETUP: "pending_review" };
  const FULFILMENT = [["pickup", "Pickup"], ["shop_delivery", "Shop delivery"], ["delivery_partner", "Delivery partner"]];
  const ACTIONS = {
    APPLICATION_SUBMITTED: "Application submitted", APPLICATION_UNDER_REVIEW: "Application put under review", APPLICATION_REJECTED: "Application rejected",
    SHOP_APPROVED: "Shop approved", SHOP_CREATED: "Shop created", SHOP_REJECTED: "Shop rejected", SHOP_UPDATED: "Shop details updated", SHOP_ACTIVATED: "Shop activated",
    SHOP_DEACTIVATED: "Shop deactivated", SHOP_ACCOUNT_CREATED: "Shop login created", SHOP_CREDENTIALS_ISSUED: "New password link issued", SHOP_ACCOUNT_DISABLED: "Shop login disabled",
    SHOP_ACCOUNT_ENABLED: "Shop login enabled", SHOP_PROFILE_UPDATED: "Shop edited its profile", PASSWORD_RESET: "Password reset", ACCOUNT_SETUP_COMPLETED: "Shop set its password",
    ORDER_STATUS_CHANGED: "Order status changed", ORDER_CANCELLED: "Order cancelled", ORDER_REFUNDED: "Order refunded",
    ORDER_PHOTO_ACCESSED: "Customer photo downloaded", ORDER_ITEM_FULFILMENT_CHANGED: "Shop updated an order item",
    ORDER_TEST_LABEL_CHANGED: "Order marked (or unmarked) as a test", CUSTOMER_RECORD_VIEWED: "Account record opened",
    SHOP_PRODUCT_SAVED: "Shop saved a product", SHOP_PRODUCT_DELETED: "Shop deleted a product", PRODUCT_MODERATED: "Product listing changed by FrameX",
    SETTINGS_CHANGED: "Platform settings changed", USER_STATUS_CHANGED: "Account switched on or off",
    ARTIST_APPLICATION_SUBMITTED: "Artist application submitted", ARTIST_APPLICATION_REJECTED: "Artist application rejected", ARTIST_APPROVED: "Artist approved", ARTIST_CREATED: "Artist created",
    ARTIST_UPDATED: "Artist details updated", ARTIST_STATUS_CHANGED: "Artist listed or unlisted", ARTIST_ACCOUNT_CREATED: "Artist login created", ARTIST_PROFILE_UPDATED: "Artist edited their profile",
    ARTWORK_SUBMITTED: "Artwork submitted for review", ARTWORK_APPROVED: "Artwork approved", ARTWORK_REJECTED: "Artwork rejected", ARTWORK_STATUS_CHANGED: "Artwork shown, paused or withdrawn",
    PAINTING_SERVICE_SAVED: "Artist changed their price list", PAINTING_REQUESTED: "Custom painting requested", PAINTING_ACCEPTED: "Artist accepted a painting request",
    PAINTING_DECLINED: "Artist declined a painting request", PAINTING_STATUS_CHANGED: "Custom painting moved on", PAINTING_CANCELLED: "Custom painting cancelled",
    PAINTING_PAYMENT_VERIFIED: "Painting payment verified", PAINTING_REFERENCE_ACCESSED: "Reference photo downloaded", PAINTING_REFUND_RECORDED: "Painting refund recorded", REVIEW_MODERATED: "Review hidden or shown", CONTACT_MESSAGE_DELETED: "Contact message deleted",
  };

  let root, admin;
  const badge = (status, labels) => `<span class="sd-status sd-status--${TONE[status] || "draft"}">${esc(labels[status] || status)}</span>`;
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const address = (s) => [s.address.line1, s.address.area, s.address.city, s.address.state, s.address.postalCode].filter(Boolean).join(", ");
  const mapUrl = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  function parse() {
    const h = window.location.hash.replace(/^#/, "") || "/overview";
    const [path, query] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
  }

  function layout(section) {
    root.innerHTML = `<div class="sd">
      <aside class="sd-side">
        <div class="sd-shop"><span class="sd-logo">${icon("shield")}</span><div><strong>FrameX Admin</strong><span class="sd-side__who">${esc(admin.name)}</span></div></div>
        <nav class="sd-nav" aria-label="Admin"><ul>${NAV.map(([id, label, ic]) => `<li><a href="#/${id}"${id === section ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a></li>`).join("")}</ul></nav>
        <button class="btn btn--outline btn--sm" type="button" data-logout>${icon("logout")} Log out</button>
      </aside>
      <section class="sd-main" data-main></section>
    </div>`;
    $("[data-logout]", root).addEventListener("click", async () => {
      await FrameX.auth.logout();
      window.location.href = "login.html";
    });
    return $("[data-main]", root);
  }

  const head = (title, lead, action = "") => `<header class="sd-head"><div><h1 class="sd-title">${esc(title)}</h1>${lead ? `<p class="sd-lead">${lead}</p>` : ""}</div>${action}</header>`;
  const chips = (base, current, options) =>
    `<div class="chip-scroll" role="group" aria-label="Filter">${options.map(([id, label]) => `<a class="chip" href="#/${base}${id ? "?status=" + id : ""}" aria-pressed="${current === id}">${esc(label)}</a>`).join("")}</div>`;

  /* ---------------------------------------------------------------- Overview */
  async function overview(main) {
    const [o, apps] = await Promise.all([http().get("/admin/overview"), http().get("/admin/applications", { status: "PENDING" })]);
    const tile = (n, label, href, tone = "") => `<a class="ad-tile ${tone}" href="${href}"><strong>${n}</strong><span>${esc(label)}</span></a>`;
    main.innerHTML = `${head("Overview", "Shop onboarding at a glance.", `<a class="btn btn--outline btn--sm" href="#/analytics">${icon("chart")} Analytics</a>`)}
      <div class="ad-tiles">
        ${tile(o.applications.pending + o.applications.underReview, "Shop applications to review", "#/applications?status=PENDING", o.applications.pending ? "ad-tile--alert" : "")}
        ${tile(o.shops.approved, "Approved shops", "#/shops?status=APPROVED")}
        ${tile(o.shops.pending, "Pending shops", "#/shops?status=PENDING")}
        ${tile(o.shops.active, "Active shops (listed)", "#/shops?status=ACTIVE")}
        ${tile(o.shops.inactive, "Inactive shops (hidden)", "#/shops?status=INACTIVE")}
        ${o.messages ? tile(o.messages.unread, "New messages from the Contact page", "#/messages?status=NEW", o.messages.unread ? "ad-tile--alert" : "") : ""}
      </div>
      <h2 class="ad-subtitle">Orders</h2>
      <div class="ad-tiles">
        ${tile(o.orders.placed, "New orders to confirm", "#/orders?status=PLACED", o.orders.placed ? "ad-tile--alert" : "")}
        ${tile(o.orders.inProgress, "Orders in progress", "#/orders")}
        ${tile(o.orders.awaitingPayment, "Waiting for payment", "#/orders?status=PENDING_PAYMENT")}
        ${tile(o.orders.delivered, "Delivered", "#/orders?status=DELIVERED")}
      </div>
      ${FrameX.adminArt ? FrameX.adminArt.overviewTiles(o) : ""}
      <h2 class="ad-subtitle">Waiting for review</h2>
      ${apps.items.length ? `<ul class="sd-list">${apps.items.slice(0, 5).map(applicationRow).join("")}</ul>` : `<div class="sd-empty">${icon("check")}<strong>No applications waiting</strong><span>New shop applications from the “Partner With FrameX” page appear here.</span></div>`}`;
  }

  /* ---------------------------------------------------------------- Applications */
  const applicationRow = (a) => `<li class="sd-item ad-item">
      <div class="sd-item__main"><a class="sd-item__name" href="#/applications/${esc(a.id)}">${esc(a.shopName)}</a>
        <span class="sd-item__meta">${esc(a.ownerName)} · ${esc(a.city)}, ${esc(a.state)} · applied ${esc(when(a.createdAt))}</span>
        ${a.shopCode ? `<span class="sd-item__source">Became ${esc(a.shopCode)}</span>` : ""}</div>
      ${badge(a.status, APP_STATUS)}
      <div class="sd-item__actions"><a class="iu-btn" href="#/applications/${esc(a.id)}">${icon("eye")} View</a></div></li>`;

  async function applications(main, params) {
    const status = params.get("status") || "";
    const { items } = await http().get("/admin/applications", { status });
    main.innerHTML = `${head("Shop applications", "Requests sent from the “Partner With FrameX” page. Applying does not create a login.")}
      <div class="sd-toolbar">${chips("applications", status, [["", "All"], ["PENDING", "Pending"], ["UNDER_REVIEW", "Under review"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]])}</div>
      ${items.length ? `<ul class="sd-list">${items.map(applicationRow).join("")}</ul>` : `<div class="sd-empty">${icon("mail")}<strong>No applications here</strong></div>`}`;
  }

  /** The shop details form (approve an application, add a shop, edit a shop). */
  function shopFields(s = {}, { account = false, accountEmail = "", activate = true, edit = false } = {}) {
    const f = forms().field;
    const o = { prefix: "sh" };
    const catalogue = (FrameX.seed.shops || []).map((c) => [c.id, `${c.name} (${c.id})`]);
    return `
      <fieldset class="ad-group"><legend>Shop</legend>
        <div class="form-grid form-grid--2">
          ${f("name", "Shop name", { ...o, required: true, value: s.name, maxlength: 120 })}
          ${f("ownerName", "Owner name", { ...o, value: s.ownerName, maxlength: 80 })}
          ${f("phone", "Shop phone", { ...o, type: "tel", value: s.phone, hint: "Shown to customers." })}
          ${f("email", "Shop contact email", { ...o, type: "email", value: s.email, hint: "For FrameX's records. Not shown publicly." })}
        </div>
        ${f("description", "About the shop", { ...o, rows: 2, value: s.description, maxlength: 1000 })}
      </fieldset>
      <fieldset class="ad-group"><legend>Address and location</legend>
        ${f("addressLine1", "Address", { ...o, value: s.addressLine1, maxlength: 200 })}
        <div class="form-grid form-grid--3">
          ${f("area", "Area", { ...o, value: s.area, maxlength: 120 })}
          ${f("city", "City", { ...o, required: true, value: s.city, maxlength: 80 })}
          ${f("state", "State", { ...o, required: true, value: s.state, maxlength: 80 })}
          ${f("postalCode", "PIN code", { ...o, required: true, value: s.postalCode, maxlength: 10 })}
          ${f("country", "Country code", { ...o, required: true, value: s.country || "IN", maxlength: 2 })}
        </div>
        <div class="form-grid form-grid--2">
          ${f("latitude", "Latitude", { ...o, required: true, value: s.latitude ?? "", inputmode: "decimal", placeholder: "e.g. 20.658612", hint: "From the shop's exact pin on a map." })}
          ${f("longitude", "Longitude", { ...o, required: true, value: s.longitude ?? "", inputmode: "decimal", placeholder: "e.g. 85.598134" })}
        </div>
        <div class="ad-geo">
          <button class="btn btn--outline btn--sm" type="button" data-geo-lookup>${icon("search")} Look up coordinates from the address</button>
          <a class="btn btn--outline btn--sm" href="#" target="_blank" rel="noopener noreferrer" data-geo-map hidden>${icon("pin")} Check this pin on the map</a>
          <p class="ad-geo__note">Distances shown to customers are measured from these coordinates. Use the shop's real position: look it up, then check the pin on the map and correct it if needed. Never guess.</p>
          <ul class="ad-geo__results" data-geo-results hidden></ul>
        </div>
      </fieldset>
      <fieldset class="ad-group"><legend>Listing</legend>
        <div class="form-field"><span class="ad-label">Pickup and delivery</span><div class="ad-checks">${FULFILMENT.map(([id, label]) => `<label class="wz-check"><input type="checkbox" name="fulfilment" value="${id}"${(s.fulfilment || ["pickup"]).includes(id) ? " checked" : ""}> ${label}</label>`).join("")}</div></div>
        <div class="form-field" data-invalid="false"><label for="sh-catalogRef">Catalogue link <span class="hint">(optional)</span></label>
          <select class="select" id="sh-catalogRef" name="catalogRef"><option value="">Not linked</option>${catalogue.map(([id, label]) => `<option value="${esc(id)}"${s.catalogRef === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>
          <p class="form-field__hint">Connects this shop to its products in the website's catalogue file until products move to the database (Step 2).</p>
          <p class="form-field__error">${icon("alert")}<span></span></p></div>
      </fieldset>
      ${account ? `<fieldset class="ad-group"><legend>Shop login</legend>
        ${f("accountEmail", "Login email", { ...o, required: !edit, type: "email", value: accountEmail, hint: "The shop receives its Shop ID and a one-time link to set its own password. You never choose or see the password." })}
        <label class="wz-check"><input type="checkbox" name="activate"${activate ? " checked" : ""}> List the shop publicly straight away (Active)</label>
      </fieldset>` : ""}`;
  }

  function readShop(form) {
    const v = forms().values(form);
    return {
      shop: {
        name: v.name, ownerName: v.ownerName, phone: v.phone, email: v.email, description: v.description, addressLine1: v.addressLine1, area: v.area, city: v.city, state: v.state,
        postalCode: v.postalCode, country: v.country, latitude: v.latitude, longitude: v.longitude, catalogRef: v.catalogRef, fulfilment: new FormData(form).getAll("fulfilment"),
      },
      accountEmail: v.accountEmail || "",
      activate: Boolean(form.elements.activate && form.elements.activate.checked),
    };
  }

  /** Coordinate helpers on a shop form: lookup, candidate list, map link. */
  function wireGeo(form) {
    const lat = form.elements.latitude;
    const lng = form.elements.longitude;
    const map = $("[data-geo-map]", form);
    const results = $("[data-geo-results]", form);
    const syncMap = () => {
      const ok = lat.value.trim() !== "" && lng.value.trim() !== "" && Number.isFinite(Number(lat.value)) && Number.isFinite(Number(lng.value));
      map.hidden = !ok;
      if (ok) map.href = mapUrl(Number(lat.value), Number(lng.value));
    };
    lat.addEventListener("input", syncMap);
    lng.addEventListener("input", syncMap);
    syncMap();
    $("[data-geo-lookup]", form).addEventListener("click", async (e) => {
      const v = forms().values(form);
      const q = [v.addressLine1, v.area, v.city, v.state, v.postalCode].filter(Boolean).join(", ");
      if (q.length < 3) return FrameX.toast.show("Fill in the address first.");
      const button = e.currentTarget; // only valid during the click itself
      forms().busy(button, true, "Looking up…");
      let r = { available: false, results: [] };
      try {
        r = await http().get("/geo/search", { q });
        if (r.available && !r.results.length && v.city) r = await http().get("/geo/search", { q: [v.area, v.city, v.state].filter(Boolean).join(", ") });
      } catch (error) {
        /* handled below */
      }
      if (!button.isConnected) return; // the form was replaced while waiting
      forms().busy(button, false);
      results.hidden = false;
      results.innerHTML = !r.available
        ? `<li class="ad-geo__empty">Place search isn't available. Open a map, find the shop, and copy its latitude and longitude here.</li>`
        : r.results.length
          ? r.results.map((p, i) => `<li><button type="button" data-geo-pick="${i}"><strong>${esc(p.label)}</strong><span>${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)} · ${esc(p.kind || "place")}</span></button></li>`).join("") +
            `<li class="ad-geo__empty">These are approximate (often a street or town centre). Pick the closest, then check the pin on the map and adjust the numbers to the shop's real position.</li>`
          : `<li class="ad-geo__empty">Nothing found for that address. Open a map, find the shop, and copy its latitude and longitude here.</li>`;
      results.onclick = (ev) => {
        const b = ev.target.closest("[data-geo-pick]");
        if (!b) return;
        const p = r.results[Number(b.dataset.geoPick)];
        lat.value = p.latitude;
        lng.value = p.longitude;
        syncMap();
        FrameX.toast.show("Coordinates filled in. Check the pin on the map before saving.");
      };
    });
  }

  /** One-time credentials panel: Shop ID + setup link. The password is never shown because nobody but the shop knows it. */
  function credentialsHtml(c) {
    return `<div class="ad-credentials" role="status" tabindex="-1">
      <h2>${icon("lock")} Shop login details</h2>
      <dl class="account-list">
        <div><dt>Shop ID</dt><dd><code>${esc(c.shopCode)}</code></dd></div>
        <div><dt>Login email</dt><dd>${esc(c.accountEmail)}</dd></div>
        <div><dt>One-time password link</dt><dd><input class="input ad-credentials__link" readonly value="${esc(c.setupUrl)}" aria-label="One-time password link"><button class="iu-btn" type="button" data-copy="${esc(c.setupUrl)}">${icon("copy")} Copy link</button></dd></div>
        <div><dt>Link expires</dt><dd>${esc(when(c.expiresAt))}</dd></div>
      </dl>
      <p class="wz-note">${icon("alert")} ${c.emailed ? "The link was emailed to the shop." : `${{ not_configured: "No email was sent: the email service is not configured.", dev: "No email was sent: this server is in development mode.", provider_error: "The email could NOT be sent: the email provider refused it." }[c.emailStatus] || "No email was sent."} Send this link to the shop owner yourself, for example on WhatsApp.`} It works once and is shown only now; you can always create a new one.</p>
    </div>`;
  }

  async function application(main, id) {
    const { application: a } = await http().get(`/admin/applications/${id}`);
    const open = a.status === "PENDING" || a.status === "UNDER_REVIEW";
    const rows = [["Shop name", a.shopName], ["Owner", a.ownerName], ["Phone", a.phone], ["Email", a.email], ["Address", `${a.address}, ${a.city}, ${a.state} ${a.postalCode}`], ["About the shop", a.businessDetails], ["Message", a.message], ["Applied", when(a.createdAt)], ["Review note", a.reviewNote], ["Decided", when(a.reviewedAt)]].filter(([, v]) => v);
    main.innerHTML = `<a class="wz-back" href="#/applications">${icon("chev-left")} All applications</a>
      ${head(a.shopName, "", badge(a.status, APP_STATUS))}
      <dl class="sd-profile">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      ${a.shopCode ? `<p class="wz-note">${icon("check")} Approved as <strong>${esc(a.shopCode)}</strong>. Manage it under <a href="#/shops">Shops</a>.</p>` : ""}
      ${open ? `<div class="ad-actions">
          ${a.status === "PENDING" ? `<button class="btn btn--outline btn--sm" type="button" data-act="review">Mark as under review</button>` : ""}
          <button class="btn btn--outline btn--sm sd-danger" type="button" data-act="reject-open">Reject</button>
        </div>
        <form id="reject-form" class="ad-panel" hidden novalidate>
          ${forms().field("reason", "Reason (kept in FrameX's records)", { rows: 2, maxlength: 500, prefix: "rj" })}
          <div class="form-status" role="status"></div>
          <div class="ad-actions"><button class="btn btn--dark btn--sm" type="submit">Reject application</button><button class="btn btn--outline btn--sm" type="button" data-act="reject-cancel">Cancel</button></div>
        </form>
        <h2 class="ad-subtitle">Approve and create the shop</h2>
        <p class="sd-lead">Check the details, add the shop's real location, and approve. This creates the shop, its Shop ID and its login in one step.</p>
        <form id="approve-form" class="ad-form" novalidate>
          ${shopFields({ name: a.shopName, ownerName: a.ownerName, phone: a.phone, email: a.email, addressLine1: a.address, city: a.city, state: a.state, postalCode: a.postalCode, description: a.businessDetails }, { account: true, accountEmail: a.email })}
          <div class="form-status" role="status" aria-live="polite"></div>
          <div><button class="btn btn--primary" type="submit">${icon("check")} Approve shop</button></div>
        </form>` : ""}
      <div data-result></div>`;

    main.onclick = async (e) => {
      const act = (e.target.closest("[data-act]") || {}).dataset;
      if (!act) return;
      if (act.act === "review") {
        await http().post(`/admin/applications/${id}/review`, {});
        FrameX.toast.show("Marked as under review.");
        application(main, id);
      }
      if (act.act === "reject-open") $("#reject-form", main).hidden = false;
      if (act.act === "reject-cancel") $("#reject-form", main).hidden = true;
    };
    if (!open) return;
    forms().handle($("#reject-form", main), {
      send: (v) => http().post(`/admin/applications/${id}/reject`, { reason: v.reason }),
      onSuccess() {
        FrameX.toast.show("Application rejected.");
        application(main, id);
      },
    });
    const form = $("#approve-form", main);
    wireGeo(form);
    forms().handle(form, {
      busyLabel: "Approving…",
      send: () => http().post(`/admin/applications/${id}/approve`, readShop(form)),
      onSuccess(result) {
        main.innerHTML = `<a class="wz-back" href="#/applications">${icon("chev-left")} All applications</a>
          ${head(`${result.shop.name} is approved`, `Shop ID <strong>${esc(result.shop.shopCode)}</strong> · ${esc(SHOP_STATUS[result.shop.status])}`)}
          ${credentialsHtml(result.credentials)}
          <div class="ad-actions"><a class="btn btn--dark btn--sm" href="#/shops/${esc(result.shop.uuid)}">Open shop</a><a class="btn btn--outline btn--sm" href="#/applications">Back to applications</a></div>`;
        $(".ad-credentials", main).focus();
      },
    });
  }

  /* ---------------------------------------------------------------- Shops */
  const shopRow = (s) => `<li class="sd-item ad-item" data-shop="${esc(s.uuid)}">
      <div class="sd-item__main"><a class="sd-item__name" href="#/shops/${esc(s.uuid)}">${esc(s.name)}</a>
        <span class="sd-item__meta"><code>${esc(s.shopCode)}</code> · ${esc([s.address.city, s.address.state].filter(Boolean).join(", "))}${s.account ? ` · login: ${esc(ACCOUNT_STATUS[s.account.status] || s.account.status)}` : " · no login yet"}</span>
        ${s.isDemo ? `<span class="sd-item__source">Development sample data</span>` : ""}</div>
      ${badge(s.status, SHOP_STATUS)}
      <div class="sd-item__actions"><a class="iu-btn" href="#/shops/${esc(s.uuid)}">${icon("eye")} View</a>
        ${s.status === "ACTIVE" ? `<button class="iu-btn" type="button" data-shop-act="deactivate">Deactivate</button>` : ""}
        ${s.status === "INACTIVE" ? `<button class="iu-btn iu-btn--go" type="button" data-shop-act="activate">Activate</button>` : ""}</div></li>`;

  async function shops(main, params) {
    const status = params.get("status") || "";
    const { items } = await http().get("/admin/shops", { status });
    main.innerHTML = `${head("Shops", "Only approved and active shops appear to customers and in nearby search.", `<a class="btn btn--primary" href="#/shops/new">${icon("plus")} Add shop</a>`)}
      <div class="sd-toolbar">${chips("shops", status, [["", "All"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["REJECTED", "Rejected"]])}</div>
      ${items.length ? `<ul class="sd-list">${items.map(shopRow).join("")}</ul>` : `<div class="sd-empty">${icon("store")}<strong>No shops here</strong><span>Approve an application or add a shop.</span></div>`}`;
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-shop-act]");
      if (!btn) return;
      const id = btn.closest("[data-shop]").dataset.shop;
      try {
        await http().post(`/admin/shops/${id}/${btn.dataset.shopAct}`);
        FrameX.toast.show(btn.dataset.shopAct === "activate" ? "Shop activated. It is now listed." : "Shop deactivated. It is hidden from customers.");
      } catch (error) {
        FrameX.toast.show(error.message);
      }
      shops(main, params);
    };
  }

  function newShop(main) {
    main.innerHTML = `<a class="wz-back" href="#/shops">${icon("chev-left")} All shops</a>
      ${head("Add a shop", "For shops FrameX has already verified (for example, in person). The shop gets a Shop ID and a link to set its own password.")}
      <form id="shop-form" class="ad-form" novalidate>${shopFields({}, { account: true })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--primary" type="submit">Create approved shop</button></div></form>`;
    const form = $("#shop-form", main);
    wireGeo(form);
    forms().handle(form, {
      busyLabel: "Creating…",
      send: () => http().post("/admin/shops", { ...readShop(form), approve: true }),
      onSuccess(result) {
        main.innerHTML = `<a class="wz-back" href="#/shops">${icon("chev-left")} All shops</a>
          ${head(`${result.shop.name} was added`, `Shop ID <strong>${esc(result.shop.shopCode)}</strong>`)}
          ${result.credentials ? credentialsHtml(result.credentials) : ""}
          <div class="ad-actions"><a class="btn btn--dark btn--sm" href="#/shops/${esc(result.shop.uuid)}">Open shop</a></div>`;
      },
    });
  }

  async function shop(main, id, credentials = null) {
    const { shop: s } = await http().get(`/admin/shops/${id}`);
    const hasPin = s.location.latitude !== null && s.location.longitude !== null;
    main.innerHTML = `<a class="wz-back" href="#/shops">${icon("chev-left")} All shops</a>
      ${head(s.name, `<code>${esc(s.shopCode)}</code>${s.isDemo ? " · Development sample data" : ""}`, badge(s.status, SHOP_STATUS))}
      <div data-credentials>${credentials ? credentialsHtml(credentials) : ""}</div>
      <div class="ad-cards">
        <section class="account-card"><h2>${icon("pin")} Location</h2>
          <p>${esc(address(s)) || "No address"}</p>
          ${hasPin ? `<p class="ad-coords"><code>${s.location.latitude.toFixed(6)}, ${s.location.longitude.toFixed(6)}</code></p><a class="btn btn--outline btn--sm" href="${mapUrl(s.location.latitude, s.location.longitude)}" target="_blank" rel="noopener noreferrer">${icon("pin")} View on map</a>` : `<p class="pp-muted">No coordinates yet. The shop can't be approved without them.</p>`}
        </section>
        <section class="account-card"><h2>${icon("store")} Status</h2>
          <p>${s.status === "ACTIVE" ? "Listed: customers can find this shop." : s.status === "INACTIVE" ? "Approved but hidden from customers." : s.status === "PENDING" ? "Waiting for approval. Not listed." : "Rejected. Not listed, and its login is blocked."}</p>
          <div class="ad-actions">
            ${s.status === "ACTIVE" ? `<button class="btn btn--outline btn--sm" type="button" data-act="deactivate">Deactivate</button>` : ""}
            ${s.status === "INACTIVE" ? `<button class="btn btn--dark btn--sm" type="button" data-act="activate">Activate</button>` : ""}
            ${s.approvalStatus !== "APPROVED" ? `<button class="btn btn--dark btn--sm" type="button" data-act="approve">Approve</button>` : ""}
            ${s.approvalStatus !== "REJECTED" ? `<button class="btn btn--outline btn--sm sd-danger" type="button" data-act="reject">${s.approvalStatus === "APPROVED" ? "Withdraw approval" : "Reject"}</button>` : ""}
          </div>
        </section>
        <section class="account-card"><h2>${icon("lock")} Shop login</h2>
          ${s.account
            ? `<dl class="account-list"><div><dt>Email</dt><dd>${esc(s.account.email)}</dd></div><div><dt>Status</dt><dd>${badge(s.account.status, ACCOUNT_STATUS)}</dd></div><div><dt>Last login</dt><dd>${esc(when(s.account.lastLoginAt)) || "Never"}</dd></div></dl>
               <div class="ad-actions">${s.account.status !== "DISABLED" ? `<button class="btn btn--outline btn--sm" type="button" data-act="credentials">${s.account.status === "PENDING_SETUP" ? "New setup link" : "Send password reset link"}</button><button class="btn btn--outline btn--sm sd-danger" type="button" data-act="disable">Disable login</button>` : `<button class="btn btn--dark btn--sm" type="button" data-act="enable">Enable login</button>`}</div>`
            : `<p class="pp-muted">This shop has no login yet.</p>
               <form id="account-form" class="form-grid" novalidate>${forms().field("accountEmail", "Login email", { required: true, type: "email", prefix: "ac" })}<div class="form-status" role="status"></div><div><button class="btn btn--dark btn--sm" type="submit">Create login</button></div></form>`}
        </section>
      </div>
      <h2 class="ad-subtitle">Shop information</h2>
      <form id="shop-form" class="ad-form" novalidate>${shopFields({ name: s.name, ownerName: s.ownerName, phone: s.phone, email: s.email, description: s.description, addressLine1: s.address.line1, area: s.address.area, city: s.address.city, state: s.address.state, postalCode: s.address.postalCode, country: s.address.country, latitude: s.location.latitude, longitude: s.location.longitude, catalogRef: s.catalogRef, fulfilment: s.fulfilment })}
        <div class="form-status" role="status" aria-live="polite"></div>
        <div><button class="btn btn--dark" type="submit">Save changes</button></div></form>`;

    const form = $("#shop-form", main);
    wireGeo(form);
    forms().handle(form, {
      busyLabel: "Saving…",
      send: () => http().patch(`/admin/shops/${id}`, readShop(form).shop),
      onSuccess() {
        FrameX.toast.show("Shop details saved.");
        shop(main, id);
      },
    });
    const accountForm = $("#account-form", main);
    if (accountForm)
      forms().handle(accountForm, {
        send: (v) => http().post(`/admin/shops/${id}/credentials`, { accountEmail: v.accountEmail }),
        onSuccess: (r) => shop(main, id, r.credentials),
      });

    main.onclick = async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      // Destructive changes ask twice.
      if (["reject", "disable", "deactivate"].includes(act) && !btn.classList.contains("is-confirming")) {
        btn.classList.add("is-confirming");
        btn.dataset.label = btn.textContent;
        btn.textContent = "Tap again to confirm";
        setTimeout(() => btn.isConnected && (btn.classList.remove("is-confirming"), (btn.textContent = btn.dataset.label)), 4000);
        return;
      }
      try {
        let creds = null;
        if (act === "activate" || act === "deactivate") await http().post(`/admin/shops/${id}/${act}`);
        if (act === "approve") await http().post(`/admin/shops/${id}/approval`, { status: "APPROVED" });
        if (act === "reject") await http().post(`/admin/shops/${id}/approval`, { status: "REJECTED" });
        if (act === "disable" || act === "enable") await http().post(`/admin/shops/${id}/account`, { enabled: act === "enable" });
        if (act === "credentials") creds = (await http().post(`/admin/shops/${id}/credentials`, {})).credentials;
        FrameX.toast.show({ activate: "Shop activated.", deactivate: "Shop deactivated.", approve: "Shop approved.", reject: "Approval withdrawn.", disable: "Shop login disabled.", enable: "Shop login enabled.", credentials: "New link created." }[act]);
        await shop(main, id, creds);
        if (creds) $(".ad-credentials", main).focus();
      } catch (error) {
        FrameX.toast.show(error.fields ? Object.values(error.fields)[0] : error.message);
      }
    };
  }

  async function copyLink(btn) {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      FrameX.toast.show("Link copied.");
    } catch (e) {
      const input = btn.parentElement.querySelector("input");
      if (input) input.select();
      FrameX.toast.show("Select the link and copy it.");
    }
  }

  /* ---------------------------------------------------------------- Shop products
     Shops decide what they sell. The platform keeps the last word: a product
     that waits for review is approved here, and any product can be taken off
     sale. The backend checks that a product is complete before it publishes it. */
  async function products(main, params) {
    const status = params.get("status") || "";
    const { items } = await http().get("/admin/products", { status });
    const tone = { draft: "draft", pending_review: "pending_review", published: "published", unpublished: "unpublished" };
    main.innerHTML = `${head("Shop products", "Products that shops created in their dashboards. Approve one that is waiting for review, or take a product off sale. Catalogue-file products are not listed here.")}
      <div class="sd-toolbar"><div class="chip-scroll" role="group" aria-label="Filter by listing">${LISTING_FILTERS.map(([id, label]) => `<a class="chip" href="#/products${id ? `?status=${id}` : ""}" aria-pressed="${status === id}">${esc(label)}</a>`).join("")}</div></div>
      ${
        items.length
          ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">Product</th><th scope="col">Shop</th><th scope="col">Listing</th><th scope="col">Updated</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>
          ${items
            .map(
              (p) => `<tr data-product="${esc(p.id)}">
              <td><div class="ad-product">${p.image ? `<img src="${esc(http().asset(p.image))}" alt="" width="48" height="48" loading="lazy">` : ""}<div><strong>${esc(p.name)}</strong><br><span class="sd-item__meta">${esc(PRODUCT_TYPE[p.productType] || "Type not chosen")}</span></div></div></td>
              <td><a href="#/shops">${esc(p.shopName)}</a><br><span class="sd-item__meta"><code>${esc(p.shopCode)}</code></span></td>
              <td><span class="sd-status sd-status--${tone[p.status] || "draft"}">${esc(LISTING[p.status] || p.status)}</span><br><span class="sd-item__meta">${p.onSale ? "On sale" : "Not on sale"}</span></td>
              <td>${esc(when(p.updatedAt))}</td>
              <td><div class="sd-item__actions">
                ${p.status === "published" ? `<a class="iu-btn" href="product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${icon("eye")} View</a><button class="iu-btn iu-btn--danger" type="button" data-listing="unpublished">Take off sale</button>` : ""}
                ${p.status === "pending_review" ? `<button class="iu-btn iu-btn--go" type="button" data-listing="published">${icon("check")} Approve</button><button class="iu-btn iu-btn--danger" type="button" data-listing="unpublished">Decline</button>` : ""}
                ${p.status === "unpublished" ? `<button class="iu-btn iu-btn--go" type="button" data-listing="published">Put back on sale</button>` : ""}
              </div></td>
            </tr>`,
            )
            .join("")}
        </tbody></table></div>`
          : `<div class="sd-empty">${icon("image")}<strong>${status ? "No product matches this filter" : "No shop has created a product yet"}</strong><span>Products appear here as soon as a shop saves one in its dashboard.</span></div>`
      }`;
    main.onclick = async (e) => {
      const btn = e.target.closest("[data-listing]");
      if (!btn) return;
      const to = btn.dataset.listing;
      // Taking something off sale asks twice.
      if (to === "unpublished" && !btn.classList.contains("is-confirming")) {
        btn.classList.add("is-confirming");
        btn.dataset.label = btn.textContent;
        btn.textContent = "Tap again to confirm";
        setTimeout(() => btn.isConnected && (btn.classList.remove("is-confirming"), (btn.textContent = btn.dataset.label)), 4000);
        return;
      }
      btn.disabled = true;
      try {
        await http().post(`/admin/products/${encodeURIComponent(btn.closest("[data-product]").dataset.product)}/listing`, { status: to });
        FrameX.toast.show(to === "published" ? "Published. The product is on sale if its shop is listed." : "Taken off sale.");
      } catch (error) {
        const issues = error.details && error.details.issues;
        FrameX.toast.show(issues && issues.length ? `${error.message} ${issues.map((i) => i.message).join(". ")}.` : error.message, { duration: 7000 });
      }
      products(main, params);
    };
  }

  /* ---------------------------------------------------------------- Activity */
  async function activity(main) {
    const { items } = await http().get("/admin/audit", { limit: 150 });
    main.innerHTML = `${head("Activity", "Who approved, rejected or changed what. Entries can't be edited.")}
      ${items.length ? `<div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">On</th><th scope="col">By</th></tr></thead><tbody>
        ${items.map((l) => `<tr><td>${esc(when(l.at))}</td><td>${esc(ACTIONS[l.action] || l.action)}</td><td>${esc(["shop", "order", "artist", "artwork", "painting_request", "settings"].includes(l.targetType) ? l.targetId : l.targetType.replace("_", " "))}</td><td>${l.actor ? `${esc(l.actor.name)} <span class="pp-muted">(${esc(l.actor.role.toLowerCase())})</span>` : `<span class="pp-muted">Public form</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="sd-empty">${icon("clock")}<strong>No activity yet</strong></div>`}`;
  }

  /* ---------------------------------------------------------------- Router */
  async function route() {
    const { parts, params } = parse();
    const section = NAV.some(([id]) => id === parts[0]) ? parts[0] : "overview";
    const main = layout(section);
    main.onclick = null;
    main.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
    if (FrameX.adminMessages) FrameX.adminMessages.badge();
    document.title = `${NAV.find(([id]) => id === section)[1]} — FrameX admin`;
    try {
      if (section === "overview") await overview(main);
      if (section === "analytics") await FrameX.adminAnalytics.show(main, parts, params, { head });
      if (section === "applications") await (parts[1] ? application(main, parts[1]) : applications(main, params));
      if (section === "shops") await (parts[1] === "new" ? newShop(main) : parts[1] ? shop(main, parts[1]) : shops(main, params));
      if (section === "orders") await (parts[1] ? FrameX.adminOrders.detail(main, parts[1], { head }) : FrameX.adminOrders.list(main, params, { head }));
      if (section === "products") await products(main, params);
      if (section === "activity") await activity(main);
      const art = FrameX.adminArt;
      if (section === "artists") await art.artists(main, params, { head });
      if (section === "artworks") await art.artworks(main, params, { head });
      if (section === "paintings") await (parts[1] ? art.painting(main, parts[1], { head }) : art.paintings(main, params, { head }));
      if (section === "reviews") await art.reviews(main, params, { head });
      if (section === "messages") await FrameX.adminMessages.list(main, params, { head });
      if (section === "users") await (parts[1] ? FrameX.adminAnalytics.customer(main, parts[1], params, { head }) : art.users(main, params, { head }));
      if (section === "settings") await art.settings(main, params, { head });
    } catch (error) {
      // The session ended or the role changed: the API said no, so leave.
      if (error.status === 401) return window.location.replace(FrameX.auth.loginUrl());
      if (error.status === 403) return window.location.replace("index.html");
      if (error.status === 404) return (main.innerHTML = `<div class="sd-empty">${icon("alert")}<strong>That doesn't exist any more</strong><a class="btn btn--outline btn--sm" href="#/overview">Back to overview</a></div>`);
      console.error("Admin view failed", error);
      FrameX.templates.showError(main, "This page couldn't be loaded.", route);
    }
  }

  async function init() {
    root = $("#admin-root");
    if (!root) return;
    admin = await FrameX.auth.guard(["ADMIN"], {
      onForbidden() {
        root.innerHTML = `<div class="not-found">${icon("lock")}<h1 class="section-title">Admins only</h1><p class="section-lead">This page is for FrameX administrators.</p><a class="btn btn--dark" href="index.html">Back to FrameX</a></div>`;
      },
    });
    if (!admin) return;
// "Copy link" buttons anywhere in the dashboard.
    root.addEventListener("click", (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) copyLink(copy);
    });
    window.addEventListener("hashchange", route);
    route();
  }

  FrameX.adminPage = { init };
})((window.FrameX = window.FrameX || {}));
