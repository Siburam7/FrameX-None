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
                                download the customer's original photos,
                                tell its shops on WhatsApp
     #/payouts                  what FrameX owes each shop and artist
     #/payouts/<shop|artist>/<id>  one seller: their payout account, the
                                orders in the amount, record a payout (ui/admin-payouts.js)
     #/products[?status=]       products shops created: approve one that waits
                                for review, or take one off sale
     #/chats[/<id>]             the help chat: conversations with customers (ui/admin-support.js)
     #/care                     Care team: the FrameX Care logins (ui/admin-support.js); live chats: #/live (ui/care-desk.js)
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

  // FrameX Care logins (owner, 2026-10-24) see only these two; the API refuses them everything else anyway.
  const CARE_NAV = [
    ["live", "Live chats", "mail"],
    ["orders", "Orders", "receipt"],
  ];
  const NAV_ADMIN = [
    ["overview", "Overview", "frame"],
    ["analytics", "Analytics", "chart"],
    ["applications", "Applications", "mail"],
    ["shops", "Shops", "store"],
    ["orders", "Orders", "receipt"],
    ["payouts", "Payouts", "wallet"],
    ["coupons", "Coupons", "gift"],
    ["promotions", "Promotions", "gift"],
    ["products", "All frames", "image"],
    ["artists", "Artists", "users"],
    ["artworks", "Artworks", "frame"],
    ["paintings", "Custom paintings", "edit"],
    ["reviews", "Reviews", "star"],
    ["live", "Live chats", "mail"],
    ["chats", "Chats", "mail"],
    ["care", "Care team", "users"],
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
    SHOP_DEACTIVATED: "Shop deactivated", SHOP_FEATURED: "Shop featured / not featured", SHOP_ACCOUNT_CREATED: "Shop login created", SHOP_CREDENTIALS_ISSUED: "New password link issued", SHOP_ACCOUNT_DISABLED: "Shop login disabled",
    SHOP_ACCOUNT_ENABLED: "Shop login enabled", SHOP_PROFILE_UPDATED: "Shop edited its profile", PASSWORD_RESET: "Password reset", ACCOUNT_SETUP_COMPLETED: "Shop set its password",
    ORDER_STATUS_CHANGED: "Order status changed", ORDER_CANCELLED: "Order cancelled", ORDER_REFUNDED: "Order refunded",
    ORDER_PHOTO_ACCESSED: "Customer photo downloaded", ORDER_ITEM_FULFILMENT_CHANGED: "Shop updated an order item",
    ORDER_TEST_LABEL_CHANGED: "Order marked (or unmarked) as a test", CUSTOMER_RECORD_VIEWED: "Account record opened",
    SHOP_PRODUCT_SAVED: "Shop saved a product", SHOP_PRODUCT_DELETED: "Shop deleted a product", PRODUCT_MODERATED: "Product listing changed by FrameX",
    SETTINGS_CHANGED: "Platform settings changed", COUPON_CREATED: "Coupon created", COUPON_UPDATED: "Coupon changed", PAYOUT_ACCOUNT_CHANGED: "Payout account changed", PAYOUT_ACCOUNT_VIEWED: "Payout account details viewed", PAYOUT_RECORDED: "Payout recorded", USER_STATUS_CHANGED: "Account switched on or off",
    ARTIST_APPLICATION_SUBMITTED: "Artist application submitted", ARTIST_APPLICATION_REJECTED: "Artist application rejected", ARTIST_APPROVED: "Artist approved", ARTIST_CREATED: "Artist created",
    ARTIST_UPDATED: "Artist details updated", ARTIST_STATUS_CHANGED: "Artist listed or unlisted", ARTIST_ACCOUNT_CREATED: "Artist login created", ARTIST_PROFILE_UPDATED: "Artist edited their profile",
    ARTWORK_SUBMITTED: "Artwork submitted for review", ARTWORK_APPROVED: "Artwork approved", ARTWORK_REJECTED: "Artwork rejected", ARTWORK_STATUS_CHANGED: "Artwork shown, paused or withdrawn",
    PAINTING_SERVICE_SAVED: "Artist changed their price list", PAINTING_REQUESTED: "Custom painting requested", PAINTING_ACCEPTED: "Artist accepted a painting request",
    PAINTING_DECLINED: "Artist declined a painting request", PAINTING_STATUS_CHANGED: "Custom painting moved on", PAINTING_CANCELLED: "Custom painting cancelled",
    PAINTING_PAYMENT_VERIFIED: "Painting payment verified", PAINTING_REFERENCE_ACCESSED: "Reference photo downloaded", PAINTING_REFUND_RECORDED: "Painting refund recorded", REVIEW_MODERATED: "Review hidden or shown", CONTACT_MESSAGE_DELETED: "Contact message deleted",
  };

  let root, admin;
  let NAV = NAV_ADMIN;
  let leave = null; // stops the screen that is open (the care desk's live connection)
  const badge = (status, labels) => `<span class="sd-status sd-status--${TONE[status] || "draft"}">${esc(labels[status] || status)}</span>`;
  // A promotion's last day, India time ("2026-12-31" for the date field, "31 Dec 2026" to read)
  const featuredDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const featuredDay = (iso) => new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const address = (s) => [s.address.line1, s.address.area, s.address.city, s.address.state, s.address.postalCode].filter(Boolean).join(", ");
  const mapUrl = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  function parse() {
    const h = window.location.hash.replace(/^#/, "") || "/overview";
    const [path, query] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
  }

  /* Refresh: the screens show what the backend said when they were opened; nothing updates by itself.
     "Refresh" asks again for the screen that is open (same filter, same page, same order) and stays where
     the admin had scrolled to. The time under the button is when this screen's data was last loaded. */
  let refreshing = false;
  let typed = false; // something was typed on this screen and not saved yet
  let touched = false; // a button on this screen was used (a form may be open): live reloads wait for "Refresh"
  let quiet = false; // a reload of the same screen: it stays on screen until the new one is ready
  async function refresh() {
    if (refreshing) return;
    if (typed && !window.confirm("You have typed something on this screen that isn't saved. Refresh anyway?")) return;
    await reload();
  }

  async function reload() {
    const y = window.scrollY;
    refreshing = true;
    quiet = true;
    try {
      await route();
    } finally {
      refreshing = false;
      quiet = false;
      const button = $("[data-refresh]", root);
      if (button) {
        button.disabled = false;
        button.classList.remove("btn--primary");
        button.classList.add("btn--outline");
        button.innerHTML = `${icon("refresh")} Refresh`;
      }
      window.scrollTo(0, y);
    }
  }

  /* Live (owner, 2026-11-09: "pura Admin page ko live kar doo … refresh ki koi need nehi"): the server says which
     area changed (GET /api/admin/stream; any order, payment, application, review, message, or another tab's change)
     and the open screen loads itself again, quietly, keeping its scroll. Never while the admin is typing, has a field
     in focus or has used a button on the screen (a form may be open), and never on an editor: then "Refresh" turns
     orange ("New updates") instead. Live chats and Chats keep their own live connection. */
  const OWN_LIVE = ["live", "chats"];
  const editor = (section, parts) =>
    ["settings", "care"].includes(section) || (section === "products" && parts[1]) || (section === "promotions" && parts[1]) || (section === "shops" && parts[1] === "new");
  let liveTimer = 0;
  let livePending = false;
  let liveStarted = false;

  function startLive() {
    if (liveStarted || admin.role !== "ADMIN") return;
    liveStarted = true;
    let first = true;
    http().stream("/admin/stream", {
      onEvent: (type) => type === "changed" && liveSoon(),
      onOpen: () => (first ? (first = false) : liveSoon()), // connected again: catch up on what came meanwhile
    });
    document.addEventListener("visibilitychange", () => !document.hidden && livePending && liveSoon());
  }

  function liveSoon() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(liveReload, 700); // several changes at once: one reload
  }

  async function liveReload() {
    const { parts } = parse();
    const section = NAV.some(([id]) => id === parts[0]) ? parts[0] : NAV[0][0];
    if (OWN_LIVE.includes(section)) return;
    if (document.hidden || refreshing) return (livePending = true);
    livePending = false;
    const own = Date.now() - http().lastWriteAt() < 4000; // this tab's own change: its screen is already up to date
    const main = $("[data-main]", root);
    const focus = document.activeElement;
    const busy = typed || touched || Boolean(main && focus && main.contains(focus) && /^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName)) || Boolean(document.querySelector("dialog[open]"));
    if (editor(section, parts) || busy) {
      if (own) return;
      const button = $("[data-refresh]", root);
      if (button && !button.disabled) {
        button.classList.remove("btn--outline");
        button.classList.add("btn--primary");
        button.innerHTML = `${icon("refresh")} New updates`;
      }
      return;
    }
    await reload();
  }

  function layout(section) {
    root.innerHTML = `<div class="sd">
      <aside class="sd-side">
        ${admin.role === "CARE" ? `<div class="sd-shop"><img class="sd-care-dp" src="assets/img/brand/framex-care.png" alt="FrameX Care" width="56" height="56"><div><strong>${esc(admin.name)}</strong><span class="sd-side__who">FrameX Care</span></div></div>` : `<div class="sd-shop"><span class="sd-logo">${icon("shield")}</span><div><strong>FrameX Admin</strong><span class="sd-side__who">${esc(admin.name)}</span></div></div>`}
        <div style="display:grid;gap:4px;justify-items:start">
          <button class="btn btn--outline btn--sm" type="button" data-refresh title="Load the newest data for this screen"${refreshing ? " disabled" : ""}>${icon("refresh")} ${refreshing ? "Refreshing…" : "Refresh"}</button>
          <span class="sd-side__who" data-refreshed role="status"></span>
        </div>
        <nav class="sd-nav" aria-label="Admin"><ul>${NAV.map(([id, label, ic]) => `<li><a href="#/${id}"${id === section ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a></li>`).join("")}</ul></nav>
        <button class="btn btn--outline btn--sm" type="button" data-logout>${icon("logout")} Log out</button>
      </aside>
      <section class="sd-main" data-main></section>
    </div>`;
    $("[data-refresh]", root).addEventListener("click", refresh);
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
  /* The Overview (owner, 2026-10-31): today's figures, what needs doing, the last 7 days, the latest orders, carts left
     without ordering (with "Send reminder"), what is running out, then the shop and artist tiles. */
  const ORDER_LABEL = { PENDING_PAYMENT: "Waiting for payment", PLACED: "New", CONFIRMED: "Confirmed", PROCESSING: "Being made", SHIPPED: "Shipped", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled" };
  const ORDER_TONE = { PENDING_PAYMENT: "draft", PLACED: "pending_review", DELIVERED: "published", CANCELLED: "unpublished" };
  const rupees = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  const ago = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `${Math.max(1, min)} min ago`;
    if (min < 1440) return `${Math.round(min / 60)} h ago`;
    const days = Math.round(min / 1440);
    return days === 1 ? "yesterday" : `${days} days ago`;
  };
  /** "▲ 18% vs yesterday" (or "▼") from two values; "" when there is nothing to compare. */
  const change = (now, before, words) => {
    if (!before && !now) return "";
    if (!before) return `<small>nothing ${words}</small>`;
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0 ? `<small>same as ${words}</small>` : `<small class="${pct > 0 ? "ov-up" : "ov-down"}">${Math.abs(pct)}% vs ${words}</small>`;
  };

  async function overview(main) {
    const [o, apps, d] = await Promise.all([http().get("/admin/overview"), http().get("/admin/applications", { status: "PENDING" }), http().get("/admin/dashboard")]);
    const tile = (n, label, href, tone = "") => `<a class="adm-tile ${tone}" href="${href}"><strong>${n}</strong><span>${esc(label)}</span></a>`;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const hello = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${esc(admin.name.split(" ")[0])} · ${new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date())}`;

    // Things to do: only the ones that are not zero
    const todo = [
      [o.orders.placed, "New orders to confirm", "#/orders?status=PLACED", "receipt", "Confirm"],
      [o.applications.pending + o.applications.underReview, "Shop applications to review", "#/applications?status=PENDING", "store", "Review"],
      [o.artists ? o.artists.applicationsPending : 0, "Artist applications to review", "#/artists", "users", "Review"],
      [o.artworks ? o.artworks.PENDING_REVIEW : 0, "Artworks waiting for approval", "#/artworks?status=PENDING_REVIEW", "image", "Review"],
      [o.paintings ? o.paintings.refundPending : 0, "Painting refunds to make", "#/paintings?status=CANCELLED", "wallet", "Open"],
      [o.chats ? o.chats.unread : 0, "Unread chats from customers", "#/chats?status=OPEN", "mail", "Open"],
      [o.messages ? o.messages.unread : 0, "New messages from the Contact page", "#/messages?status=NEW", "mail", "Open"],
    ].filter(([n]) => n > 0);

    const most = Math.max(1, ...d.last7.map((x) => x.value));
    const dayName = (ymd) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(ymd + "T00:00:00Z"));
    const dayLong = (ymd) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ymd + "T00:00:00Z"));
    const week = d.last7.reduce((a, x) => ({ value: a.value + x.value, orders: a.orders + x.orders }), { value: 0, orders: 0 });
    const conv = d.conversion.week;

    main.innerHTML = `${head("Overview", hello, `<a class="btn btn--outline btn--sm" href="#/analytics">${icon("chart")} Analytics</a>`)}
      <div class="ov-kpis">
        <div class="ov-kpi"><b>${rupees(d.today.value)}</b><span>Sales today</span>${change(d.today.value, d.yesterday.value, "yesterday")}</div>
        <div class="ov-kpi"><b>${d.today.orders}</b><span>Orders today</span>${change(d.today.orders, d.yesterday.orders, "yesterday")}</div>
        <div class="ov-kpi"><b>${d.today.visitors}</b><span>Visitors today</span>${d.today.live === null ? "" : `<small class="ov-live">${d.today.live} on the site now</small>`}</div>
        <div class="ov-kpi"><b>${conv === null ? "—" : conv + "%"}</b><span>Visits that ordered (7 days)</span>${conv === null || d.conversion.weekBefore === null ? "" : `<small class="${conv >= d.conversion.weekBefore ? "ov-up" : "ov-down"}">${Math.abs(Math.round((conv - d.conversion.weekBefore) * 10) / 10)} points vs the week before</small>`}</div>
      </div>
      <p class="ov-note">Sales = orders placed (not cancelled, not waiting for payment). Visitors count only people who allowed analytics.</p>
      <div class="ov-two">
        <section class="ov-card"><h2 class="ov-card__title">Needs your attention</h2>
          ${todo.length ? `<ul class="ov-todo">${todo.map(([n, label, href, ic, verb]) => `<li><span class="ov-todo__icon">${icon(ic)}</span><b>${n}</b><span class="ov-todo__label">${esc(label)}</span><a href="${href}">${verb} →</a></li>`).join("")}</ul>` : `<div class="sd-empty">${icon("check")}<strong>All clear</strong><span>Nothing is waiting for you right now.</span></div>`}
        </section>
        <section class="ov-card"><h2 class="ov-card__title">Sales, last 7 days <a href="#/analytics">Analytics</a></h2>
          <div class="ov-bars" role="list">${d.last7
            .map((x) => `<div class="ov-bars__col" role="listitem" tabindex="0" aria-label="${esc(`${dayLong(x.date)}: ${rupees(x.value)}, ${x.orders} ${x.orders === 1 ? "order" : "orders"}`)}"><i style="height:${x.value ? Math.max(3, (x.value / most) * 100) : 0}%"></i><em>${esc(dayLong(x.date))} · ${rupees(x.value)} · ${x.orders} ${x.orders === 1 ? "order" : "orders"}</em></div>`)
            .join("")}</div>
          <div class="ov-days">${d.last7.map((x) => `<span>${esc(dayName(x.date))}</span>`).join("")}</div>
          <p class="ov-total">This week <b>${rupees(week.value)}</b> from <b>${week.orders}</b> ${week.orders === 1 ? "order" : "orders"}${week.orders ? ` · average order <b>${rupees(week.value / week.orders)}</b>` : ""}</p>
        </section>
      </div>
      <div class="ov-two">
        <section class="ov-card"><h2 class="ov-card__title">Latest orders <a href="#/orders">All orders</a></h2>
          ${d.latestOrders.length ? `<table class="ov-table"><thead><tr><th>Order</th><th class="ov-hide-s">Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>${d.latestOrders
            .map((x) => `<tr><td><a href="#/orders/${encodeURIComponent(x.orderNumber)}"><b>${esc(x.orderNumber)}</b></a><small>${esc(ago(x.createdAt))}</small></td><td class="ov-hide-s">${esc(x.customer || "")}</td><td>${rupees(x.total)}</td><td><span class="sd-status sd-status--${ORDER_TONE[x.status] || "pending_review"}">${esc(ORDER_LABEL[x.status] || x.status)}</span></td></tr>`)
            .join("")}</tbody></table>` : `<div class="sd-empty">${icon("receipt")}<strong>No orders yet</strong></div>`}
        </section>
        <section class="ov-card" data-carts><h2 class="ov-card__title">Carts left without ordering <a href="#/analytics">All</a></h2>
          <p class="ov-total ov-total--top"><b>${d.carts.carts}</b> ${d.carts.carts === 1 ? "cart" : "carts"} worth <b>${rupees(d.carts.value)}</b> untouched for ${d.carts.afterHours} hours or more</p>
          ${d.carts.items.length ? `<table class="ov-table"><tbody>${d.carts.items.map(cartRow).join("")}</tbody></table>` : ""}
        </section>
      </div>
      ${d.lowStock.length ? `<section class="ov-card"><h2 class="ov-card__title">Running low on stock <a href="#/products">All frames</a></h2><table class="ov-table"><tbody>${d.lowStock
        .map((p) => `<tr><td><b>${esc(p.name)}</b>${p.shop ? ` · ${esc(p.shop)}` : ""}</td><td>${p.stock ? `${p.stock} left` : `<span class="sd-status sd-status--unpublished">Out of stock</span>`}</td></tr>`)
        .join("")}</tbody></table></section>` : ""}
      <h2 class="adm-subtitle">Shops</h2>
      <div class="adm-tiles">
        ${tile(o.applications.pending + o.applications.underReview, "Shop applications to review", "#/applications?status=PENDING", o.applications.pending ? "adm-tile--alert" : "")}
        ${tile(o.shops.approved, "Approved shops", "#/shops?status=APPROVED")}
        ${tile(o.shops.pending, "Pending shops", "#/shops?status=PENDING")}
        ${tile(o.shops.active, "Active shops (listed)", "#/shops?status=ACTIVE")}
        ${tile(o.shops.inactive, "Inactive shops (hidden)", "#/shops?status=INACTIVE")}
      </div>
      <h2 class="adm-subtitle">Orders</h2>
      <div class="adm-tiles">
        ${tile(o.orders.placed, "New orders to confirm", "#/orders?status=PLACED", o.orders.placed ? "adm-tile--alert" : "")}
        ${tile(o.orders.inProgress, "Orders in progress", "#/orders")}
        ${tile(o.orders.awaitingPayment, "Waiting for payment", "#/orders?status=PENDING_PAYMENT")}
        ${tile(o.orders.delivered, "Delivered", "#/orders?status=DELIVERED")}
      </div>
      ${FrameX.adminArt ? FrameX.adminArt.overviewTiles(o) : ""}
      <h2 class="adm-subtitle">Waiting for review</h2>
      ${apps.items.length ? `<ul class="sd-list">${apps.items.slice(0, 5).map(applicationRow).join("")}</ul>` : `<div class="sd-empty">${icon("check")}<strong>No applications waiting</strong><span>New shop applications from the “Partner With FrameX” page appear here.</span></div>`}`;
    bindReminders(main, () => overview(main));
  }

  /** A cart left without ordering, with its reminder (one per cart until it changes). */
  const cartRow = (c) => `<tr><td><b>${esc(c.customer || "Customer")}</b><small>${c.items} ${c.items === 1 ? "item" : "items"} · left ${esc(ago(c.leftAt))}</small></td><td>${rupees(c.value)}</td><td>${
    c.reminderSentAt ? `<small>Reminded ${esc(ago(c.reminderSentAt))}</small>` : c.remindersOff ? `<small>Turned reminders off</small>` : `<button class="btn btn--outline btn--sm" type="button" data-remind="${esc(c.cartId)}">Send reminder</button>`
  }</td></tr>`;

  /** "Send reminder" buttons inside `scope`; `again` redraws the screen after one was sent. */
  function bindReminders(scope, again) {
    scope.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-remind]");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        await http().post(`/admin/carts/${encodeURIComponent(btn.dataset.remind)}/remind`);
        FrameX.toast.show("Reminder email sent.");
        again();
      } catch (error) {
        FrameX.toast.show(error.message || "The reminder couldn't be sent.");
        btn.disabled = false;
        btn.textContent = "Send reminder";
      }
    });
  }

  /* ---------------------------------------------------------------- Applications */
  const applicationRow = (a) => `<li class="sd-item adm-item">
      <div class="sd-item__main"><a class="sd-item__name" href="#/applications/${esc(a.id)}">${esc(a.shopName)}</a>
        <span class="sd-item__meta">${esc(a.ownerName)} · ${esc(a.city)}, ${esc(a.state)} · applied ${esc(when(a.createdAt))}</span>
        ${a.shopCode ? `<span class="sd-item__source">Became ${esc(a.shopCode)}</span>` : ""}</div>
      ${badge(a.status, APP_STATUS)}
      <div class="sd-item__actions"><a class="iu-btn" href="#/applications/${esc(a.id)}">${icon("eye")} View</a></div></li>`;

  async function applications(main, params) {
    const status = params.get("status") || "";
    const { items } = await http().get("/admin/applications", { status });
    main.innerHTML = `${head("Shop applications", "Requests sent from the “Partner With FrameX” page. Applying does not create a login. An artist's application (“Join as an Artist”) is not here: it is under <a href=\"#/artists\">Artists</a>.")}
      <div class="sd-toolbar">${chips("applications", status, [["", "All"], ["PENDING", "Pending"], ["UNDER_REVIEW", "Under review"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]])}</div>
      ${items.length ? `<ul class="sd-list">${items.map(applicationRow).join("")}</ul>` : `<div class="sd-empty">${icon("mail")}<strong>No applications here</strong></div>`}`;
  }

  /** The shop details form (approve an application, add a shop, edit a shop). */
  function shopFields(s = {}, { account = false, accountEmail = "", activate = true, edit = false } = {}) {
    const f = forms().field;
    const o = { prefix: "sh" };
    const catalogue = (FrameX.seed.shops || []).map((c) => [c.id, `${c.name} (${c.id})`]);
    return `
      <fieldset class="adm-group"><legend>Shop</legend>
        <div class="form-grid form-grid--2">
          ${f("name", "Shop name", { ...o, required: true, value: s.name, maxlength: 120 })}
          ${f("ownerName", "Owner name", { ...o, value: s.ownerName, maxlength: 80 })}
          ${f("phone", "Shop phone", { ...o, type: "tel", value: s.phone, hint: "Shown to customers." })}
          ${f("email", "Shop contact email", { ...o, type: "email", value: s.email, hint: "For FrameX's records. Not shown publicly." })}
        </div>
        ${f("description", "About the shop", { ...o, rows: 2, value: s.description, maxlength: 1000 })}
      </fieldset>
      <fieldset class="adm-group"><legend>Address and location</legend>
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
        <div class="adm-geo">
          <button class="btn btn--outline btn--sm" type="button" data-geo-lookup>${icon("search")} Look up coordinates from the address</button>
          <a class="btn btn--outline btn--sm" href="#" target="_blank" rel="noopener noreferrer" data-geo-map hidden>${icon("pin")} Check this pin on the map</a>
          <p class="adm-geo__note">Distances shown to customers are measured from these coordinates. Use the shop's real position: look it up, then check the pin on the map and correct it if needed. Never guess.</p>
          <ul class="adm-geo__results" data-geo-results hidden></ul>
        </div>
      </fieldset>
      <fieldset class="adm-group"><legend>Listing</legend>
        <div class="form-field"><span class="adm-label">Pickup and delivery</span><div class="adm-checks">${FULFILMENT.map(([id, label]) => `<label class="wz-check"><input type="checkbox" name="fulfilment" value="${id}"${(s.fulfilment || ["pickup"]).includes(id) ? " checked" : ""}> ${label}</label>`).join("")}</div></div>
        <div class="form-field" data-invalid="false"><label for="sh-catalogRef">Catalogue link <span class="hint">(optional)</span></label>
          <select class="select" id="sh-catalogRef" name="catalogRef"><option value="">Not linked</option>${catalogue.map(([id, label]) => `<option value="${esc(id)}"${s.catalogRef === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>
          <p class="form-field__hint">Connects this shop to its products in the website's catalogue file until products move to the database (Step 2).</p>
          <p class="form-field__error">${icon("alert")}<span></span></p></div>
      </fieldset>
      ${account ? `<fieldset class="adm-group"><legend>Shop login</legend>
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
        ? `<li class="adm-geo__empty">Place search isn't available. Open a map, find the shop, and copy its latitude and longitude here.</li>`
        : r.results.length
          ? r.results.map((p, i) => `<li><button type="button" data-geo-pick="${i}"><strong>${esc(p.label)}</strong><span>${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)} · ${esc(p.kind || "place")}</span></button></li>`).join("") +
            `<li class="adm-geo__empty">These are approximate (often a street or town centre). Pick the closest, then check the pin on the map and adjust the numbers to the shop's real position.</li>`
          : `<li class="adm-geo__empty">Nothing found for that address. Open a map, find the shop, and copy its latitude and longitude here.</li>`;
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

  /* WhatsApp for a shop's login details: nothing is sent by FrameX. The button opens the admin's OWN WhatsApp in a
     chat with the shop's phone number, with the message written; the admin presses Send there. The message carries
     the one-time password link, so it must only go to the shop's own number: the page says so. */
  const waDigits = (phone) => {
    const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length === 10) return "91" + digits;
    return digits.length >= 11 && digits.length <= 15 ? digits : "";
  };
  function shopWaText(c) {
    const first = String(c.ownerName || "").trim().split(/\s+/)[0];
    const site = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}`;
    return [
      `Hello${first ? " " + first : ""}, this is FrameX.`,
      "",
      c.firstSetup ? `Good news: ${c.shopName} has been approved on FrameX.` : `Here is a new password link for ${c.shopName} on FrameX.`,
      "",
      `Your Shop ID: ${c.shopCode}`,
      `${c.firstSetup ? "Set your password" : "Choose a new password"} with this link. It works once, until ${when(c.expiresAt)}:`,
      c.setupUrl,
      "",
      `Then log in with your Shop ID or ${c.accountEmail}:`,
      `${site}login.html?type=shop`,
      "",
      c.firstSetup ? "Welcome to FrameX." : "Thank you.",
    ].join("\n");
  }

  /** One-time credentials panel: Shop ID + setup link. The password is never shown because nobody but the shop knows it. */
  function credentialsHtml(c) {
    return `<div class="adm-credentials" role="status" tabindex="-1">
      <h2>${icon("lock")} Shop login details</h2>
      <dl class="account-list">
        <div><dt>Shop ID</dt><dd><code>${esc(c.shopCode)}</code></dd></div>
        <div><dt>Login email</dt><dd>${esc(c.accountEmail)}</dd></div>
        <div><dt>One-time password link</dt><dd><input class="input adm-credentials__link" readonly value="${esc(c.setupUrl)}" aria-label="One-time password link"><button class="iu-btn" type="button" data-copy="${esc(c.setupUrl)}">${icon("copy")} Copy link</button></dd></div>
        <div><dt>Link expires</dt><dd>${esc(when(c.expiresAt))}</dd></div>
      </dl>
      ${
        c.shopName && waDigits(c.phone)
          ? `<div class="adm-actions"><a class="btn btn--dark btn--sm" href="https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(shopWaText(c))}" target="framex-whatsapp" rel="noopener" data-wa-shop>${icon("phone")} Send these details on WhatsApp</a></div>
        <p class="wz-note">${icon("alert")} This opens your own WhatsApp in a chat with the shop's number (${esc(c.phone)}), with the message written: you press Send there. The link lets whoever holds it set the shop's password, so send it only to the shop's own number.</p>`
          : c.shopName
            ? `<p class="wz-note">${icon("alert")} No WhatsApp button: this shop has no mobile number WhatsApp can use. Copy the link and pass it on yourself.</p>`
            : ""
      }
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
      ${open ? `<div class="adm-actions">
          ${a.status === "PENDING" ? `<button class="btn btn--outline btn--sm" type="button" data-act="review">Mark as under review</button>` : ""}
          <button class="btn btn--outline btn--sm sd-danger" type="button" data-act="reject-open">Reject</button>
        </div>
        <form id="reject-form" class="adm-panel" hidden novalidate>
          ${forms().field("reason", "Reason (kept in FrameX's records)", { rows: 2, maxlength: 500, prefix: "rj" })}
          <div class="form-status" role="status"></div>
          <div class="adm-actions"><button class="btn btn--dark btn--sm" type="submit">Reject application</button><button class="btn btn--outline btn--sm" type="button" data-act="reject-cancel">Cancel</button></div>
        </form>
        <h2 class="adm-subtitle">Approve and create the shop</h2>
        <p class="sd-lead">Check the details, add the shop's real location, and approve. This creates the shop, its Shop ID and its login in one step.</p>
        <form id="approve-form" class="adm-form" novalidate>
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
          <div class="adm-actions"><a class="btn btn--dark btn--sm" href="#/shops/${esc(result.shop.uuid)}">Open shop</a><a class="btn btn--outline btn--sm" href="#/applications">Back to applications</a></div>`;
        $(".adm-credentials", main).focus();
      },
    });
  }

  /* ---------------------------------------------------------------- Shops */
  const shopRow = (s) => `<li class="sd-item adm-item" data-shop="${esc(s.uuid)}">
      <div class="sd-item__main"><a class="sd-item__name" href="#/shops/${esc(s.uuid)}">${esc(s.name)}</a>
        <span class="sd-item__meta"><code>${esc(s.shopCode)}</code> · ${esc([s.address.city, s.address.state].filter(Boolean).join(", "))}${s.account ? ` · login: ${esc(ACCOUNT_STATUS[s.account.status] || s.account.status)}` : " · no login yet"}</span>
        ${s.isDemo ? `<span class="sd-item__source">Development sample data</span>` : ""}</div>
      ${badge(s.status, SHOP_STATUS)}${s.featured ? ` <span class="badge badge--featured">Featured</span>` : ""}
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
      <form id="shop-form" class="adm-form" novalidate>${shopFields({}, { account: true })}
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
          <div class="adm-actions"><a class="btn btn--dark btn--sm" href="#/shops/${esc(result.shop.uuid)}">Open shop</a></div>`;
      },
    });
  }

  async function shop(main, id, credentials = null) {
    const { shop: s } = await http().get(`/admin/shops/${id}`);
    const hasPin = s.location.latitude !== null && s.location.longitude !== null;
    main.innerHTML = `<a class="wz-back" href="#/shops">${icon("chev-left")} All shops</a>
      ${head(s.name, `<code>${esc(s.shopCode)}</code>${s.isDemo ? " · Development sample data" : ""}`, badge(s.status, SHOP_STATUS))}
      <div data-credentials>${credentials ? credentialsHtml(credentials) : ""}</div>
      <div class="adm-cards">
        <section class="account-card"><h2>${icon("pin")} Location</h2>
          <p>${esc(address(s)) || "No address"}</p>
          ${hasPin ? `<p class="adm-coords"><code>${s.location.latitude.toFixed(6)}, ${s.location.longitude.toFixed(6)}</code></p><a class="btn btn--outline btn--sm" href="${mapUrl(s.location.latitude, s.location.longitude)}" target="_blank" rel="noopener noreferrer">${icon("pin")} View on map</a>` : `<p class="pp-muted">No coordinates yet. The shop can't be approved without them.</p>`}
        </section>
        <section class="account-card"><h2>${icon("store")} Status</h2>
          <p>${s.status === "ACTIVE" ? "Listed: customers can find this shop." : s.status === "INACTIVE" ? "Approved but hidden from customers." : s.status === "PENDING" ? "Waiting for approval. Not listed." : "Rejected. Not listed, and its login is blocked."}</p>
          <div class="adm-actions">
            ${s.status === "ACTIVE" ? `<button class="btn btn--outline btn--sm" type="button" data-act="deactivate">Deactivate</button>` : ""}
            ${s.status === "INACTIVE" ? `<button class="btn btn--dark btn--sm" type="button" data-act="activate">Activate</button>` : ""}
            ${s.approvalStatus !== "APPROVED" ? `<button class="btn btn--dark btn--sm" type="button" data-act="approve">Approve</button>` : ""}
            ${s.approvalStatus !== "REJECTED" ? `<button class="btn btn--outline btn--sm sd-danger" type="button" data-act="reject">${s.approvalStatus === "APPROVED" ? "Withdraw approval" : "Reject"}</button>` : ""}
          </div>
        </section>
        <section class="account-card"><h2>${icon("star")} Featured</h2>
          <p>${s.featured ? (s.featuredUntil ? `Featured until ${esc(featuredDay(s.featuredUntil))}: shown first in the shop lists, with a “Featured” label.` : "Featured: shown first in the shop lists, with a “Featured” label, until you switch it off.") : s.featuredOn ? "The promotion has ended. Not featured." : "Not featured. Featured shops come first in the shop lists (for visitors without a location) and carry a “Featured” label, for example as a paid promotion."}</p>
          <form id="featured-form" class="form-grid" novalidate>
            <label class="wz-check"><input type="checkbox" name="featured"${s.featured ? " checked" : ""}> Feature this shop</label>
            ${forms().field("until", "Until (last day)", { type: "date", prefix: "ft", value: s.featured && s.featuredUntil ? featuredDate(s.featuredUntil) : "", hint: "Leave empty to keep it featured until you switch it off." })}
            <div class="form-status" role="status" aria-live="polite"></div>
            <div><button class="btn btn--dark btn--sm" type="submit">Save</button></div>
          </form>
        </section>
        <section class="account-card"><h2>${icon("lock")} Shop login</h2>
          ${s.account
            ? `<dl class="account-list"><div><dt>Email</dt><dd>${esc(s.account.email)}</dd></div><div><dt>Status</dt><dd>${badge(s.account.status, ACCOUNT_STATUS)}</dd></div><div><dt>Last login</dt><dd>${esc(when(s.account.lastLoginAt)) || "Never"}</dd></div></dl>
               <div class="adm-actions">${s.account.status !== "DISABLED" ? `<button class="btn btn--outline btn--sm" type="button" data-act="credentials">${s.account.status === "PENDING_SETUP" ? "New setup link" : "Send password reset link"}</button><button class="btn btn--outline btn--sm sd-danger" type="button" data-act="disable">Disable login</button>` : `<button class="btn btn--dark btn--sm" type="button" data-act="enable">Enable login</button>`}</div>`
            : `<p class="pp-muted">This shop has no login yet.</p>
               <form id="account-form" class="form-grid" novalidate>${forms().field("accountEmail", "Login email", { required: true, type: "email", prefix: "ac" })}<div class="form-status" role="status"></div><div><button class="btn btn--dark btn--sm" type="submit">Create login</button></div></form>`}
        </section>
      </div>
      <h2 class="adm-subtitle">Shop information</h2>
      <form id="shop-form" class="adm-form" novalidate>${shopFields({ name: s.name, ownerName: s.ownerName, phone: s.phone, email: s.email, description: s.description, addressLine1: s.address.line1, area: s.address.area, city: s.address.city, state: s.address.state, postalCode: s.address.postalCode, country: s.address.country, latitude: s.location.latitude, longitude: s.location.longitude, catalogRef: s.catalogRef, fulfilment: s.fulfilment })}
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
    const featuredForm = $("#featured-form", main);
    forms().handle(featuredForm, {
      busyLabel: "Saving…",
      send: (v) => http().post(`/admin/shops/${id}/featured`, { featured: Boolean(featuredForm.elements.featured.checked), until: featuredForm.elements.featured.checked ? v.until || "" : "" }),
      onSuccess(r) {
        FrameX.toast.show(r.shop.featured ? "The shop is featured." : "The shop is no longer featured.");
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
        if (creds) $(".adm-credentials", main).focus();
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
              <td><div class="adm-product">${p.image ? `<img src="${esc(http().asset(p.image))}" alt="" width="48" height="48" loading="lazy">` : ""}<div><strong>${esc(p.name)}</strong><br><span class="sd-item__meta">${esc(PRODUCT_TYPE[p.productType] || "Type not chosen")}</span></div></div></td>
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
        ${items.map((l) => `<tr><td>${esc(when(l.at))}</td><td>${esc(ACTIONS[l.action] || l.action)}</td><td>${l.targetType === "shop_application" && l.targetId ? `<a href="#/applications/${esc(l.targetId)}">Shop application: open</a>` : l.targetType === "artist_application" ? `<a href="#/artists">Artist application: see Artists</a>` : esc(["shop", "order", "artist", "artwork", "painting_request", "settings"].includes(l.targetType) ? l.targetId : l.targetType.replace("_", " "))}</td><td>${l.actor ? `${esc(l.actor.name)} <span class="pp-muted">(${esc(l.actor.role.toLowerCase())})</span>` : `<span class="pp-muted">Public form</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="sd-empty">${icon("clock")}<strong>No activity yet</strong></div>`}`;
  }

  /* ---------------------------------------------------------------- Router */
  async function route() {
    const { parts, params } = parse();
    const section = NAV.some(([id]) => id === parts[0]) ? parts[0] : NAV[0][0];
    if (leave) {
      leave();
      leave = null;
    }
    const old = $("[data-main]", root);
    const same = quiet && old && root.getAttribute("data-section") === section;
    let main;
    if (same) {
      main = old.cloneNode(true); // the same picture without the old screen's handlers, until the new one is drawn
      old.replaceWith(main);
    } else main = layout(section);
    root.setAttribute("data-section", section);
    main.onclick = null;
    main.onsubmit = null;
    typed = false;
    touched = false;
    main.oninput = () => (typed = true);
    if (!same) main.innerHTML = FrameX.templates.skeletonPage("dash");
    const loaded = (ok) => {
      const stamp = $("[data-refreshed]", root);
      if (stamp) stamp.textContent = ok ? `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Couldn't be updated";
    };
    if (admin.role === "ADMIN" && FrameX.adminMessages) FrameX.adminMessages.badge();
    if (admin.role === "ADMIN" && FrameX.adminSupport && section !== "chats") FrameX.adminSupport.badge();
    document.title = `${NAV.find(([id]) => id === section)[1]} — FrameX admin`;
    try {
      if (section === "live") leave = await FrameX.careDesk.mount(main, admin);
      if (section === "overview") await overview(main);
      if (section === "analytics") await FrameX.adminAnalytics.show(main, parts, params, { head });
      if (section === "applications") await (parts[1] ? application(main, parts[1]) : applications(main, params));
      if (section === "shops") await (parts[1] === "new" ? newShop(main) : parts[1] ? shop(main, parts[1]) : shops(main, params));
      if (section === "orders") await (parts[1] ? FrameX.adminOrders.detail(main, parts[1], { head }) : FrameX.adminOrders.list(main, params, { head }));
      if (section === "payouts") await (parts[1] ? FrameX.adminPayouts.detail(main, parts[1], parts[2], { head }) : FrameX.adminPayouts.list(main, { head }));
      // Every shop's frames: add / edit for any shop with the 4-step editor (ui/admin-frames.js)
      if (section === "products" && parts[1] === "new-artwork") await FrameX.adminFrames.newArtwork(main, { head });
      else if (section === "products" && parts[1] === "artist") await FrameX.adminFrames.artworkEditor(main, decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
      else if (section === "products") await (parts[1] === "new" ? FrameX.adminFrames.newFrame(main, { head }) : parts[1] && parts[2] ? FrameX.adminFrames.editor(main, decodeURIComponent(parts[1]), decodeURIComponent(parts[2])) : FrameX.adminFrames.list(main, params, { head }));
      if (section === "activity") await activity(main);
      const art = FrameX.adminArt;
      if (section === "artists") await art.artists(main, params, { head });
      if (section === "artworks") await art.artworks(main, params, { head });
      if (section === "paintings") await (parts[1] ? art.painting(main, parts[1], { head }) : art.paintings(main, params, { head }));
      if (section === "reviews") await art.reviews(main, params, { head });
      if (section === "care") await FrameX.adminSupport.team(main, { head });
      if (section === "chats") leave = await (parts[1] ? FrameX.adminSupport.thread(main, parts[1], { head }) : FrameX.adminSupport.list(main, params, { head })); // live while shown
      if (section === "messages") await FrameX.adminMessages.list(main, params, { head });
      if (section === "users") await (parts[1] ? FrameX.adminAnalytics.customer(main, parts[1], params, { head }) : art.users(main, params, { head }));
      if (section === "settings") await art.settings(main, params, { head });
      if (section === "coupons") await art.coupons(main, params, { head });
      if (section === "promotions") await (parts[1] === "new" ? FrameX.adminPromotions.edit(main, null, params, { head }) : parts[1] ? FrameX.adminPromotions.edit(main, parts[1], params, { head }) : FrameX.adminPromotions.list(main, { head }));
      loaded(true);
    } catch (error) {
      loaded(false);
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
    admin = await FrameX.auth.guard(["ADMIN", "CARE"], {
      onForbidden() {
        root.innerHTML = `<div class="not-found">${icon("lock")}<h1 class="section-title">Admins only</h1><p class="section-lead">This page is for FrameX administrators.</p><a class="btn btn--dark" href="index.html">Back to FrameX</a></div>`;
      },
    });
    if (!admin) return;
    if (admin.role === "CARE") {
      NAV = CARE_NAV;
      const crumb = $(".page-banner__crumbs [aria-current]");
      if (crumb) crumb.textContent = "FrameX Care";
    }
// "Copy link" buttons anywhere in the dashboard.
    root.addEventListener("click", (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) copyLink(copy);
    });
    // A button used on the screen (it may have opened a form): live reloads wait (see liveReload)
    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-main] button")) touched = true;
    });
    window.addEventListener("hashchange", route);
    route();
    startLive();
  }

  FrameX.adminPage = { init };
})((window.FrameX = window.FrameX || {}));
