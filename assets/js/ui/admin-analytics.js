/* ==========================================================================
   Admin dashboard: Analytics (admin.html#/analytics) and one account's record
   (admin.html#/users/<id>). ADMIN role only.

     #/analytics[/overview]      sales, visitors, customers and carts at a glance
     #/analytics/traffic         where visits come from, pages, searches, the funnel
     #/analytics/sales           orders, payments by gateway, COD, refunds, net revenue
     #/analytics/catalog         popular products, categories, templates, artworks
     #/analytics/sellers         each shop's and each artist's orders and sales
     #/analytics/paintings       custom painting requests and their payments
     #/analytics/accounts        registrations, logins and failed logins
       ?range=today|7d|30d|90d   or  ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD

   This page only draws what /api/admin/analytics/* answers. The backend checks
   the session and the ADMIN role on every request, and works every figure out
   itself: orders and money from the database's verified payment records,
   visitor figures from visitors who allowed analytics. Nothing here is made up:
   a period with nothing in it shows "nothing", not a sample chart.
   ========================================================================== */
(function (FrameX) {
  const { $, escapeHtml: esc, icon } = FrameX.dom;
  const http = () => FrameX.http;
  const view = () => FrameX.orderView;
  const price = (n) => FrameX.pricing.formatPrice(Math.round(Number(n) || 0));
  const num = (n) => (Number(n) || 0).toLocaleString("en-IN");

  const TABS = [
    ["overview", "Overview"],
    ["traffic", "Visitors"],
    ["sales", "Sales & payments"],
    ["catalog", "Products"],
    ["sellers", "Shops & artists"],
    ["paintings", "Custom paintings"],
    ["accounts", "Accounts & logins"],
  ];
  const RANGES = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["custom", "Custom"]];
  const GATEWAY = { cashfree: "Cashfree", razorpay: "Razorpay" };
  const CHANNEL = { direct: "Direct (typed the address, a bookmark, an app)", search: "Search engines", social: "Social media", referral: "Other websites", campaign: "Tagged campaign links", email: "Email", paid: "Paid ads" };
  const DEVICE = { desktop: "Computers", mobile: "Phones", tablet: "Tablets" };
  const INSTRUMENT = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", other: "Other" };
  const PAINTING = {
    PENDING_ARTIST_RESPONSE: "Waiting for the artist", DECLINED: "Declined by the artist", ADVANCE_PAYMENT_PENDING: "Accepted, advance not paid yet", ADVANCE_PAID: "Advance paid",
    PAINTING_IN_PROGRESS: "Being painted", REMAINING_PAYMENT_PENDING: "Finished, remaining payment due", READY_FOR_DISPATCH: "Paid in full, ready to send", SHIPPED: "Shipped", DELIVERED: "Delivered", CANCELLED: "Cancelled",
  };
  const REASON = { INVALID_CREDENTIALS: "Wrong email, phone or password", ACCOUNT_DISABLED: "The account is disabled", ACCOUNT_NOT_READY: "The account's password is not set up yet", SHOP_NOT_APPROVED: "The shop is not approved", OTHER: "Other" };
  // What the payment gateway told the server, in plain words.
  const NOTICE = {
    ORDER_PLACED: "Payment confirmed, order placed", ALREADY_APPLIED: "A payment already recorded was reported again (nothing changed)", ATTEMPT_FAILED: "A payment attempt failed",
    DUPLICATE_PAYMENT: "A second payment arrived for an order that was already paid: refund it by hand", LATE_PAYMENT_REFUNDED: "Paid after the order had been cancelled: refunded", LATE_PAYMENT_NEEDS_REFUND: "Paid after the request was closed: refund it by hand",
    MISMATCH_REJECTED: "The amount did not match the order: rejected", NO_MATCHING_ORDER: "About a payment FrameX has no order for", PAINTING_STAGE_PAID: "A custom painting payment was confirmed", IGNORED: "Not about a payment (nothing to do)", NOT_PROCESSED: "Received, not processed yet",
  };
  const NEEDS_ATTENTION = ["DUPLICATE_PAYMENT", "LATE_PAYMENT_NEEDS_REFUND", "MISMATCH_REJECTED", "NO_MATCHING_ORDER", "NOT_PROCESSED"];

  let liveTimer = 0;

  /* ---------------------------------------------------------------- Small pieces */

  const dayLabel = (key) => {
    const [date, hour] = key.split("T");
    if (hour !== undefined) return `${hour}:00`;
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const longDay = (ymd) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  };
  const zone = (minutes) => `UTC${minutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
  const before = (days) => (days === 1 ? "the day before" : `the ${days} days before`);

  const card = (id, label, value, { sub = "", extra = "", tone = "" } = {}) =>
    `<div class="an-card ${tone}" data-card="${id}"><span class="an-card__label">${esc(label)}</span><strong class="an-card__value">${value}</strong>${sub ? `<span class="an-card__sub">${sub}</span>` : ""}${extra}</div>`;
  /** "▲ 12% vs the 7 days before"; nothing to compare with says so instead of showing a made-up percentage. */
  function change(now, was, days) {
    if (!was) return now ? `<span class="an-delta">nothing in ${before(days)}</span>` : "";
    const pct = Math.round(((now - was) / was) * 100);
    return `<span class="an-delta ${pct > 0 ? "is-up" : pct < 0 ? "is-down" : ""}">${pct > 0 ? "▲" : pct < 0 ? "▼" : "="} ${Math.abs(pct)}% vs ${before(days)}</span>`;
  }
  const cards = (list) => `<div class="an-cards">${list.join("")}</div>`;
  const section = (title, body, lead = "") => `<section class="an-section"><h2 class="ad-subtitle">${esc(title)}</h2>${lead ? `<p class="sd-lead">${lead}</p>` : ""}${body}</section>`;
  const note = (html, tone = "") => `<p class="an-note ${tone}">${icon(tone === "an-note--warn" ? "alert" : "shield")}<span>${html}</span></p>`;
  const empty = (title, text = "") => `<div class="sd-empty an-empty">${icon("chart")}<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ""}</div>`;

  /** One bar per hour or day. Under it, the same numbers as a table (for screen readers and for copying). */
  function chart(id, title, points, field, format = num) {
    const values = points.map((p) => Number(p[field]) || 0);
    const max = Math.max(0, ...values);
    const total = values.reduce((a, b) => a + b, 0);
    if (!max) return `<figure class="an-chart" data-chart="${id}"><figcaption>${esc(title)}</figcaption><div class="an-chart__empty">Nothing in this period</div></figure>`;
    const W = 640;
    const H = 150;
    const base = H - 2;
    const step = (W - 8) / points.length;
    const gap = Math.min(6, step * 0.25);
    const bars = values
      .map((v, i) => {
        const h = v ? Math.max(2, (v / max) * (base - 12)) : 0;
        return `<rect x="${(4 + i * step + gap / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${Math.max(1, step - gap).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(dayLabel(points[i].key))}: ${esc(format(v))}</title></rect>`;
      })
      .join("");
    // The first, the middle and the last hour or day, as ordinary text under the bars.
    const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i) => `<span>${esc(dayLabel(points[i].key))}</span>`).join("");
    return `<figure class="an-chart" data-chart="${id}">
      <figcaption>${esc(title)} <span>highest ${esc(format(max))}</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: ${esc(format(total))} in all, highest ${esc(format(max))}" preserveAspectRatio="none"><line x1="4" y1="${base}" x2="${W - 4}" y2="${base}"/>${bars}</svg>
      <div class="an-chart__axis" aria-hidden="true">${ticks}</div>
      <details class="an-chart__data"><summary>Show the numbers</summary><div class="sd-table-wrap"><table class="sd-table"><thead><tr><th scope="col">${points[0].key.includes("T") ? "Hour" : "Day"}</th><th scope="col">${esc(title)}</th></tr></thead><tbody>${points
        .map((p, i) => `<tr><td>${esc(dayLabel(p.key))}</td><td>${esc(format(values[i]))}</td></tr>`)
        .join("")}</tbody></table></div></details>
    </figure>`;
  }

  /** A list with a bar behind each line: the longest bar is the largest value. */
  function rank(id, items, { name, value, show = num, sub = null, none = "Nothing in this period" }) {
    if (!items.length) return `<div class="an-rank an-rank--empty" data-rank="${id}">${esc(none)}</div>`;
    const max = Math.max(1, ...items.map(value));
    return `<ol class="an-rank" data-rank="${id}">${items
      .map((x) => `<li><span class="an-rank__bar" style="width:${Math.max(2, Math.round((value(x) / max) * 100))}%"></span><span class="an-rank__name">${esc(name(x))}${sub && sub(x) ? `<small>${esc(sub(x))}</small>` : ""}</span><strong class="an-rank__value">${esc(show(value(x)))}</strong></li>`)
      .join("")}</ol>`;
  }
  const table = (id, headers, lines, none = "Nothing in this period") =>
    lines.length
      ? `<div class="sd-table-wrap" data-table="${id}"><table class="sd-table"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${lines.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<div class="an-rank an-rank--empty" data-table="${id}">${esc(none)}</div>`;
  const pair = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  const facts = (id, list) => `<dl class="ao-facts an-facts" data-facts="${id}">${list.join("")}</dl>`;
  const two = (a, b) => `<div class="an-two">${a}${b}</div>`;
  const panel = (title, body, lead = "") => `<div class="co-card an-panel"><h3 class="an-panel__title">${esc(title)}</h3>${lead ? `<p class="sd-lead">${lead}</p>` : ""}${body}</div>`;

  /* ---------------------------------------------------------------- The frame: period, reports */

  function state(parts, params) {
    const tab = TABS.some(([id]) => id === parts[1]) ? parts[1] : "overview";
    const range = RANGES.some(([id]) => id === params.get("range")) ? params.get("range") : "30d";
    return { tab, range, from: params.get("from") || "", to: params.get("to") || "", page: Math.max(1, Number(params.get("page")) || 1) };
  }
  function link(s, change = {}) {
    const n = Object.assign({}, s, change);
    const q = new URLSearchParams();
    q.set("range", n.range);
    if (n.range === "custom" && n.from && n.to) (q.set("from", n.from), q.set("to", n.to));
    if (n.page > 1) q.set("page", n.page);
    return `#/analytics/${n.tab}?${q}`;
  }
  const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

  function frame(s, { head }) {
    return `${head("Analytics", "Sales and orders come from the database's verified payment records. Visitor figures come only from visitors who allowed analytics.")}
      <div class="an-bar">
        <div class="chip-scroll chip-scroll--wrap" role="group" aria-label="Period">${RANGES.map(([id, label]) => `<a class="chip" href="${link(s, { range: id, page: 1 })}" aria-pressed="${s.range === id}" data-range="${id}">${label}</a>`).join("")}</div>
        <form class="an-custom" data-custom${s.range === "custom" ? "" : " hidden"}>
          <label>From <input class="input" type="date" name="from" value="${esc(s.from)}" max="${today()}" required></label>
          <label>To <input class="input" type="date" name="to" value="${esc(s.to)}" max="${today()}" required></label>
          <button class="btn btn--dark btn--sm" type="submit">Show</button>
        </form>
      </div>
      <nav class="chip-scroll chip-scroll--wrap an-tabs" aria-label="Reports">${TABS.map(([id, label]) => `<a class="chip" href="${link(s, { tab: id, page: 1 })}"${s.tab === id ? ' aria-current="page"' : ""} aria-pressed="${s.tab === id}" data-tab="${id}">${label}</a>`).join("")}</nav>
      <div data-report></div>`;
  }
  const period = (r) =>
    `<p class="an-period" data-period>${icon("clock")}<span>${r.from === r.to ? esc(longDay(r.from)) : `${esc(longDay(r.from))} to ${esc(longDay(r.to))}`} · ${r.days} ${r.days === 1 ? "day" : "days"} · days are counted in ${zone(r.utcOffsetMinutes)}</span></p>`;

  /* ---------------------------------------------------------------- Overview */

  function overview(d, s) {
    const days = d.range.days;
    const v = d.visitors;
    const testNote = d.test.orders || d.test.paid ? note(`<strong>Test orders are not counted.</strong> ${num(d.test.orders)} test ${d.test.orders === 1 ? "order" : "orders"} in this period (${price(d.test.paid)} paid with the payment gateway in TEST mode, or marked as a test by an admin). See <a href="${link(s, { tab: "sales" })}">Sales &amp; payments</a>.`) : "";
    return `${period(d.range)}
      ${section(
        "Sales",
        `${cards([
          card("gross", "Gross sales", price(d.money.gross), { sub: `orders ${price(d.money.orders)} · paintings ${price(d.money.paintings)}`, extra: change(d.money.gross, d.money.before.gross, days) }),
          card("refunds", "Refunds", price(d.money.refunds), { sub: "money sent back in this period" }),
          card("net", "Net revenue", price(d.money.net), { sub: "gross sales minus refunds", extra: change(d.money.net, d.money.before.net, days), tone: "an-card--strong" }),
          card("orders-created", "Orders created", num(d.orders.created), { extra: change(d.orders.created, d.orders.before.created, days) }),
          card("orders-paid", "Orders paid", num(d.orders.paid), { sub: "payment verified by the server", extra: change(d.orders.paid, d.orders.before.paid, days) }),
          card("orders-cancelled", "Orders cancelled", num(d.orders.cancelled)),
        ])}${testNote}`,
        "Paid means the payment gateway confirmed the payment to the server, or a Cash on Delivery order was delivered. A browser returning from the payment page is not counted as a payment.",
      )}
      ${section(
        "Visitors",
        !v.collecting
          ? note("Visitor statistics are switched off on the server (<code>ANALYTICS_ENABLED=false</code>). Sales, orders and accounts are not affected.", "an-note--warn")
          : `${cards([
              card("visitors", "Unique visitors", num(v.unique), { extra: change(v.unique, v.before.unique, days) }),
              card("visits", "Visits", num(v.visits), { extra: change(v.visits, v.before.visits, days) }),
              card("page-views", "Page views", num(v.pageViews), { extra: change(v.pageViews, v.before.pageViews, days) }),
              card("product-views", "Product views", num(v.productViews)),
              card("live", "On the site now", `<span data-live>${num(d.live.visitors)}</span>`, { sub: `active in the last ${d.live.windowMinutes} minutes` }),
            ])}${note(esc(v.note))}`,
      )}
      ${section(
        "Customers and carts",
        cards([
          card("customers", "Registered customers", num(d.accounts.customers), { sub: "all time" }),
          card("new-customers", "New registrations", num(d.accounts.newCustomers), { extra: change(d.accounts.newCustomers, d.accounts.before.newCustomers, days) }),
          card("logins", "Logins", num(d.accounts.logins)),
          card("failed-logins", "Failed logins", num(d.accounts.failedLogins), { tone: d.accounts.failedLogins > d.accounts.logins && d.accounts.failedLogins > 10 ? "an-card--alert" : "" }),
          card("cart-additions", "Items added to carts", num(d.cart.additions), { sub: `worth ${price(d.cart.value)}` }),
          card("abandoned", "Abandoned carts", num(d.cart.abandoned.carts), { sub: `${price(d.cart.abandoned.value)} left in carts untouched for ${d.cart.abandoned.afterHours} hours or more` }),
        ]),
      )}
      ${section("Day by day", `<div class="an-charts">${chart("gross", "Gross sales", d.series, "gross", price)}${chart("orders", "Orders created", d.series, "orders")}${v.collecting ? chart("visitors", "Unique visitors", d.series, "visitors") : ""}</div>`)}`;
  }

  /* ---------------------------------------------------------------- Visitors */

  function traffic(d) {
    if (!d.collecting) return `${period(d.range)}${note("Visitor statistics are switched off on the server (<code>ANALYTICS_ENABLED=false</code>).", "an-note--warn")}`;
    const v = d.visitors;
    const none = !v.unique;
    const top = Math.max(1, ...d.funnel.map((f) => f.count));
    return `${period(d.range)}${note(esc(d.note))}
      ${cards([card("visitors", "Unique visitors", num(v.unique)), card("visits", "Visits", num(v.visits)), card("page-views", "Page views", num(v.pageViews)), card("product-views", "Product views", num(v.productViews)), card("checkouts", "Visits that started checkout", num(v.checkouts))])}
      ${none ? empty("No visitor statistics in this period", "Nobody who allowed analytics visited in these days. Orders and sales are in the other reports.") : ""}
      ${section(
        "From a visit to a paid order",
        `<ol class="an-funnel" data-funnel>${d.funnel
          .map((f) => `<li data-step="${f.step}"><span class="an-funnel__bar" style="width:${Math.max(2, Math.round((f.count / top) * 100))}%"></span><span class="an-funnel__name">${esc(f.label)}<small>${f.source === "database" ? "exact (database)" : "visitors who allowed analytics"}</small></span><strong>${num(f.count)}</strong></li>`)
          .join("")}</ol>`,
        "Each step is an honest count on its own. The cart and the orders are exact; the visitor steps only include people who allowed analytics, so do not read one step as a share of another.",
      )}
      ${two(
        panel("Where visits came from", rank("channels", d.channels, { name: (x) => CHANNEL[x.channel] || x.channel, value: (x) => x.visits })),
        panel("Websites that sent visitors", rank("referrers", d.referrers, { name: (x) => x.host, value: (x) => x.visits, none: "No visit came from another website" })),
      )}
      ${two(
        panel("First page of a visit", rank("landing", d.landingPages, { name: (x) => x.path, value: (x) => x.visits, sub: (x) => x.page })),
        panel("Most viewed pages", rank("pages", d.pages, { name: (x) => x.path, value: (x) => x.views, sub: (x) => `${num(x.visitors)} visitors` })),
      )}
      ${two(
        panel("What people searched for", rank("searches", d.searches, { name: (x) => x.query, value: (x) => x.searches, none: "Nobody searched in this period" }), "Anything that looks like an email address or a phone number is removed before a search is stored."),
        panel("Devices", rank("devices", d.devices, { name: (x) => DEVICE[x.device] || x.device, value: (x) => x.visitors })),
      )}
      ${d.campaigns.length ? section("Campaign links", table("campaigns", ["Source", "Medium", "Campaign", "Visits"], d.campaigns.map((c) => [esc(c.source || "—"), esc(c.medium || "—"), esc(c.campaign || "—"), num(c.visits)])), "Visits that arrived through a link tagged with utm_source, utm_medium or utm_campaign.") : ""}`;
  }

  /* ---------------------------------------------------------------- Sales and payments */

  function sales(d) {
    const m = d.money;
    const status = view().ORDER_STATUS;
    const attention = d.gatewayNotices.filter((x) => NEEDS_ATTENTION.includes(x.result));
    const amount = (x) => `${num(x.count)}${x.count ? `<br><span class="sd-item__meta">${price(x.amount)}</span>` : ""}`;
    return `${period(d.range)}
      ${cards([
        card("gross", "Gross sales", price(m.gross), { sub: `orders ${price(m.orders)} · paintings ${price(m.paintings)}` }),
        card("refunds", "Refunds", price(m.refunds), { sub: `${num(m.refundsOrders.count + m.refundsPaintings.count)} refunds` }),
        card("net", "Net revenue", price(m.net), { sub: "gross sales minus refunds", tone: "an-card--strong" }),
        card("orders-created", "Orders created", num(d.orders.created)),
        card("orders-paid", "Orders paid", num(d.orders.paid), { sub: d.orders.paid ? `average ${price(d.orders.averagePaidOrder)}` : "" }),
        card("orders-cancelled", "Orders cancelled", num(d.orders.cancelled)),
      ])}
      ${d.test.orders || d.test.paid || d.test.paintingPayments ? note(`<strong>Kept out of every figure on this page:</strong> ${num(d.test.orders)} test ${d.test.orders === 1 ? "order" : "orders"} created, ${num(d.test.paid)} paid (${price(d.test.paidValue)})${d.test.paintingPayments ? `, and ${num(d.test.paintingPayments)} test painting ${d.test.paintingPayments === 1 ? "payment" : "payments"} (${price(d.test.paintingValue)})` : ""}. An order is a test when it was paid with the gateway in TEST mode or an admin marked it as one${d.test.gatewayMode === "test" ? ". <strong>The gateway is in TEST mode now</strong>, so new online payments are test payments" : ""}.`) : d.test.gatewayMode === "test" ? note("The payment gateway is in TEST mode: online payments made now are labelled as test orders and are not counted as sales.") : ""}
      ${attention.length ? note(`<strong>Payments to look at:</strong> ${attention.map((x) => `${num(x.events)} × ${esc(NOTICE[x.result] || x.result)}`).join("; ")}.`, "an-note--warn") : ""}
      <div class="an-charts">${chart("gross", "Gross sales", d.series, "gross", price)}${chart("created", "Orders created", d.series, "created")}${chart("paid", "Orders paid", d.series, "paid")}${chart("refunds", "Refunds", d.series, "refunds", price)}</div>
      ${two(
        panel("Where the orders created in this period stand now", rank("status", [...d.orders.byStatus].sort((a, b) => b.orders - a.orders), { name: (x) => status[x.status] || x.status, value: (x) => x.orders, sub: (x) => price(x.value), none: "No orders were created in this period" })),
        panel(
          "What the paid orders' money was for",
          facts("parts", [pair("Items (after discounts)", price(m.parts.items)), pair("Tax", price(m.parts.tax)), pair("Delivery", price(m.parts.shipping)), pair("Cash on Delivery fee", price(m.parts.codFee)), pair("Gift wrapping", price(m.parts.giftWrap)), pair("Paid orders, total", `<strong>${price(m.orders)}</strong>`), pair("Custom painting payments", price(m.paintings))]),
        ),
      )}
      ${two(
        panel(
          "Cash on Delivery",
          facts("cod", [pair("Orders created", `${num(d.cod.created)} · ${price(d.cod.createdValue)}`), pair("Delivered", num(d.cod.delivered)), pair("Cash collected", `${num(d.cod.paid)} · ${price(d.cod.paidValue)}`), pair("Still to collect (all open orders)", `${num(d.cod.awaitingCollection.orders)} · ${price(d.cod.awaitingCollection.value)}`)]),
          "A Cash on Delivery order counts as paid on the day it is marked delivered.",
        ),
        panel("Online orders", facts("online", [pair("Orders created", `${num(d.online.created)} · ${price(d.online.createdValue)}`), pair("Paid", `${num(d.online.paid)} · ${price(d.online.paidValue)}`), pair("Refunds in progress", `${num(m.refundsInProgress.count)} · ${price(m.refundsInProgress.amount)}`), pair("Refunded (orders)", `${num(m.refundsOrders.count)} · ${price(m.refundsOrders.amount)}`), pair("Refunded (paintings, recorded by hand)", `${num(m.refundsPaintings.count)} · ${price(m.refundsPaintings.amount)}`)])),
      )}
      ${section(
        "Payment gateways",
        table(
          "gateways",
          ["Gateway", "Successful", "Failed", "Pending", "Not completed", "Attempts"],
          d.gateways.map((g) => [`<strong>${esc(GATEWAY[g.provider] || g.provider)}</strong>`, amount(g.success), amount(g.failed), amount(g.pending), amount(g.cancelled), num(g.attempts)]),
          "No online payment was attempted in this period",
        ),
        "Every payment attempt started in this period, for orders and custom paintings. A payment that was later refunded still counts as successful here.",
      )}
      ${two(
        panel("Paid online with", rank("instruments", d.instruments, { name: (x) => INSTRUMENT[x.instrument] || x.instrument, value: (x) => x.orders, sub: (x) => price(x.value), none: "No online order was paid in this period" })),
        panel("What the gateway told the server", rank("notices", d.gatewayNotices, { name: (x) => NOTICE[x.result] || x.result, value: (x) => x.events, sub: (x) => GATEWAY[x.provider] || x.provider, none: "No notification arrived in this period" }), "Each notification is stored once, so the same payment reported twice is never counted twice."),
      )}`;
  }

  /* ---------------------------------------------------------------- Products, templates, artworks */

  function catalog(d) {
    const viewed = (id, items, what) => rank(id, items, { name: (x) => x.name, value: (x) => x.views, sub: (x) => `${num(x.visitors)} visitors`, none: `No ${what} view was recorded in this period` });
    const ordered = (id, items, what) => rank(id, items, { name: (x) => x.name, value: (x) => x.units, show: (n) => `${num(n)} sold`, sub: (x) => `${price(x.sales)} · ${num(x.orders)} ${x.orders === 1 ? "order" : "orders"}${x.seller ? ` · ${x.seller}` : ""}`, none: `No ${what} was ordered in this period` });
    return `${period(d.range)}${note(`<strong>Views</strong>: ${esc(d.note)} <strong>Ordered</strong> and <strong>added to cart</strong> are exact, from the database.`)}
      ${section("Products", `${two(panel("Most viewed", viewed("products-viewed", d.products.viewed, "product")), panel("Most ordered", ordered("products-ordered", d.products.ordered, "product"), "Orders that were placed and not cancelled."))}
        ${two(panel("Most added to a cart", rank("products-carted", d.products.addedToCart, { name: (x) => x.name, value: (x) => x.additions, none: "Nothing was added to a cart in this period" })), panel("Categories opened", rank("categories", d.categories, { name: (x) => x.name, value: (x) => x.views, sub: (x) => `${num(x.visitors)} visitors`, none: "No category was opened in this period" })))}`)}
      ${section("Templates", two(panel("Most viewed", viewed("templates-viewed", d.templates.viewed, "template")), panel("Most ordered", ordered("templates-ordered", d.templates.ordered, "template"))))}
      ${section("Artworks", two(panel("Most viewed", viewed("artworks-viewed", d.artworks.viewed, "artwork")), panel("Sold", ordered("artworks-ordered", d.artworks.ordered, "artwork"))))}`;
  }

  /* ---------------------------------------------------------------- Shops and artists */

  function sellers(d, s) {
    const pages = Math.ceil(d.shops.total / d.shops.limit);
    const type = { FRAME_X_STUDIO: "FrameX Studio", SHOP: "Shop" };
    return `${period(d.range)}
      ${section(
        "Shops",
        `${table(
          "shops",
          ["Seller", "Orders", "Items", "Ordered", "Paid", "Delivered", "Cancelled"],
          d.shops.items.map((x) => [`<strong>${esc(x.name)}</strong><br><span class="sd-item__meta">${esc(type[x.sellerType] || x.sellerType)} · <code>${esc(x.ref)}</code></span>`, num(x.orders), num(x.units), price(x.ordered), price(x.paid), num(x.delivered), num(x.cancelled)]),
          "No shop had an order in this period",
        )}${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${s.page > 1 ? `<a class="btn btn--outline btn--sm" href="${link(s, { page: s.page - 1 })}">Previous</a>` : ""}<span>Page ${d.shops.page} of ${pages} · ${num(d.shops.total)} sellers</span>${s.page < pages ? `<a class="btn btn--outline btn--sm" href="${link(s, { page: s.page + 1 })}">Next</a>` : ""}</nav>` : ""}`,
        "The lines of the orders created in this period. Ordered = placed and not cancelled; Paid = the order's payment was verified. Amounts are the items' prices, without tax and delivery.",
      )}
      ${section(
        "Artists",
        table(
          "artists",
          ["Artist", "Artworks sold", "Artwork sales", "Painting requests", "Accepted", "Declined", "Delivered", "Painting payments"],
          d.artists.map((a) => [`<strong>${esc(a.name)}</strong><br><span class="sd-item__meta"><code>${esc(a.code)}</code>${a.status === "ACTIVE" ? "" : " · not listed"}</span>`, num(a.artworks.units), price(a.artworks.sales), num(a.paintings.requests), num(a.paintings.accepted), num(a.paintings.declined), num(a.paintings.delivered), price(a.paintings.collected)]),
          "No artist sold an artwork or received a painting request in this period",
        ),
        "Painting requests are the ones made in this period; painting payments are the advance and remaining payments verified in this period.",
      )}`;
  }

  /* ---------------------------------------------------------------- Custom paintings */

  function paintings(d) {
    const r = d.requests;
    const o = d.open;
    return `${period(d.range)}
      ${cards([
        card("requested", "Requests", num(r.requested), { sub: r.requested ? `worth ${price(r.requestedValue)}` : "" }),
        card("accepted", "Accepted by the artist", num(r.accepted)),
        card("declined", "Declined by the artist", num(r.declined)),
        card("advance", `Advance payments (${d.advancePercent}%)`, price(d.payments.advance.amount), { sub: `${num(d.payments.advance.payments)} verified` }),
        card("balance", "Remaining payments", price(d.payments.balance.amount), { sub: `${num(d.payments.balance.payments)} verified` }),
        card("collected", "Collected for paintings", price(d.payments.collected), { tone: "an-card--strong" }),
      ])}
      ${d.test.payments ? note(`Not counted: ${num(d.test.payments)} test painting ${d.test.payments === 1 ? "payment" : "payments"} (${price(d.test.amount)}), made with the gateway in TEST mode.`) : ""}
      <div class="an-charts">${chart("requests", "Requests", d.series, "requests")}${chart("collected", "Collected for paintings", d.series, "collected", price)}</div>
      ${two(
        panel(
          "Still to come (as things stand now)",
          facts("open", [pair("Waiting for the artist's answer", num(o.waitingForArtist)), pair("Accepted, advance not paid yet", `${num(o.advanceDue.requests)} · ${price(o.advanceDue.amount)}`), pair("Being painted", num(o.inProgress)), pair("Finished, remaining payment due", `${num(o.balanceDue.requests)} · ${price(o.balanceDue.amount)}`), pair("Refunds FrameX still owes", `${num(o.refundDue.requests)} · ${price(o.refundDue.amount)}`)]),
          "All open requests, whenever they were made.",
        ),
        panel("In this period", facts("flow", [pair("Cancelled", num(r.cancelled)), pair("Delivered", num(r.delivered)), pair("Refunds recorded", `${num(d.refunds.recorded)} · ${price(d.refunds.amount)}`)])),
      )}
      ${two(
        panel("Where this period's requests stand now", rank("status", [...d.byStatus].sort((a, b) => b.requests - a.requests), { name: (x) => PAINTING[x.status] || x.status, value: (x) => x.requests, none: "No request was made in this period" })),
        panel(
          "Payment attempts",
          table("attempts", ["Gateway", "For", "Result", "Attempts", "Amount"], d.attempts.map((a) => [esc(GATEWAY[a.provider] || a.provider), a.stage === "ADVANCE" ? "Advance" : "Remaining", esc(view().PAYMENT_STATUS[a.status] || a.status), num(a.attempts), price(a.amount)]), "No painting payment was attempted in this period"),
        ),
      )}`;
  }

  /* ---------------------------------------------------------------- Accounts and logins */

  function accounts(d, s) {
    const role = { CUSTOMER: "Customers", SHOP: "Shop logins", ARTIST: "Artist logins", ADMIN: "Admins" };
    const l = d.logins;
    const pages = Math.ceil(d.failed.total / d.failed.limit);
    const customers = d.roles.find((r) => r.role === "CUSTOMER");
    return `${period(d.range)}
      ${cards([
        card("customers", "Registered customers", num(customers.accounts), { sub: "all time" }),
        card("new-customers", "New registrations", num(customers.created)),
        card("logins", "Logins", num(l.logins), { sub: `${num(l.accounts)} different accounts` }),
        card("failed-logins", "Failed logins", num(l.failed), { sub: `${num(l.failedAccounts)} accounts aimed at · ${num(l.failedUnknownAccount)} with no such account`, tone: l.failed > l.logins && l.failed > 10 ? "an-card--alert" : "" }),
      ])}
      <div class="an-charts">${chart("registrations", "New registrations", d.series, "registrations")}${chart("logins", "Logins", d.series, "logins")}${chart("failed", "Failed logins", d.series, "failed")}</div>
      ${two(
        panel("Accounts", table("roles", ["Kind", "Accounts", "New in this period", "Disabled"], d.roles.map((r) => [esc(role[r.role] || r.role), num(r.accounts), num(r.created), num(r.disabled)]))),
        panel("Why logins failed", rank("reasons", d.failedByReason, { name: (x) => REASON[x.reason] || x.reason, value: (x) => x.attempts, none: "No login failed in this period" })),
      )}
      ${section(
        "Accounts with the most failed logins",
        table("targets", ["Account", "Failed logins", "Last one"], d.failedByAccount.map((a) => [`<a class="sd-item__name" href="#/users/${esc(a.id)}">${esc(a.name)}</a><br><span class="sd-item__meta">${esc(a.email)} · ${esc(a.role.toLowerCase())}</span>`, num(a.attempts), esc(view().when(a.last))]), "No account had a failed login in this period"),
        "Many failures on one account can mean someone is guessing its password. A login is slowed down after repeated failures; you can disable an account in Accounts.",
      )}
      ${section(
        "Failed logins, newest first",
        `${table(
          "failed",
          ["When", "Account", "Reason", "Login form", "Address"],
          d.failed.items.map((f) => [esc(view().when(f.at)), f.account ? `${esc(f.account.name)}<br><span class="sd-item__meta">${esc(f.account.email)}</span>` : `<span class="sd-item__meta">No account with those details</span>`, esc(REASON[f.reason] || f.reason), f.form === "shop" ? "Shop" : "Customer", `<code>${esc(f.ip || "—")}</code>`]),
          "No login failed in this period",
        )}${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${s.page > 1 ? `<a class="btn btn--outline btn--sm" href="${link(s, { page: s.page - 1 })}">Newer</a>` : ""}<span>Page ${d.failed.page} of ${pages} · ${num(d.failed.total)} failed logins</span>${s.page < pages ? `<a class="btn btn--outline btn--sm" href="${link(s, { page: s.page + 1 })}">Older</a>` : ""}</nav>` : ""}`,
        "What was typed is never stored: only which account an attempt was aimed at (if there is one), the reason and the network address.",
      )}`;
  }

  const DRAW = { overview, traffic, sales, catalog, sellers, paintings, accounts };

  /** admin.html#/analytics/... */
  async function show(main, parts, params, { head }) {
    clearInterval(liveTimer);
    const s = state(parts, params);
    main.innerHTML = frame(s, { head });
    const out = $("[data-report]", main);
    $("[data-custom]", main).addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      window.location.hash = link(s, { range: "custom", from: f.get("from"), to: f.get("to"), page: 1 });
    });
    if (s.range === "custom" && (!s.from || !s.to)) {
      out.innerHTML = empty("Choose the first and the last day", "Pick two dates above and press Show. A period can be up to one year long.");
      return;
    }
    out.innerHTML = `<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:260px;margin-top:16px"></div>`;
    let data;
    try {
      data = await http().get(`/admin/analytics/${s.tab}`, { range: s.range, from: s.range === "custom" ? s.from : "", to: s.range === "custom" ? s.to : "", page: s.page });
    } catch (error) {
      // A period the server refuses (dates the wrong way round, more than a year): said next to the dates.
      if (error.status === 422) {
        out.innerHTML = `<div class="form-status form-status--error is-visible" role="alert">${icon("alert")}<span>${esc(Object.values(error.fields || {})[0] || error.message)}</span></div>`;
        return;
      }
      if (error.status === 401 || error.status === 403) throw error;
      console.error("Report failed", error);
      return FrameX.templates.showError(out, "This report couldn't be loaded.", () => show(main, parts, params, { head }));
    }
    out.innerHTML = DRAW[s.tab](data, s);
    // "On the site now" is asked again every half minute while this report is open.
    if (s.tab === "overview" && $("[data-live]", out))
      liveTimer = setInterval(async () => {
        const el = $("[data-live]", out);
        if (!el || !el.isConnected) return clearInterval(liveTimer);
        if (document.visibilityState !== "visible") return;
        try {
          const live = await http().get("/admin/analytics/live");
          if (el.isConnected && live.visitors !== null) el.textContent = num(live.visitors);
        } catch (e) {
          /* the next tick tries again */
        }
      }, 30000);
  }

  /* ---------------------------------------------------------------- One account: contact details and order history */

  async function customer(main, id, params, { head }) {
    const page = Math.max(1, Number(params.get("page")) || 1);
    const d = await http().get(`/admin/users/${encodeURIComponent(id)}`, { page });
    const u = d.user;
    const v = view();
    const STATUS = { ACTIVE: "Active", PENDING_SETUP: "Waiting for password setup", DISABLED: "Disabled" };
    const pages = Math.ceil(d.orders.total / d.orders.limit);
    const address = (a) => [a.line1, a.line2, a.landmark, a.city, a.state, a.postalCode].filter(Boolean).join(", ");
    main.innerHTML = `${head(u.name, `${esc(u.role.toLowerCase())} account${u.shopCode ? ` · <code>${esc(u.shopCode)}</code>` : ""}${u.artistCode ? ` · <code>${esc(u.artistCode)}</code>` : ""} · joined ${esc(v.when(u.createdAt))}`, `<a class="btn btn--outline btn--sm" href="#/users">All accounts</a>`)}
      ${cards([
        card("orders", "Orders", num(d.stats.orders), { sub: d.stats.testOrders ? `${num(d.stats.testOrders)} of them test orders` : d.stats.cancelled ? `${num(d.stats.cancelled)} cancelled` : "" }),
        card("paid-orders", "Paid orders", num(d.stats.paidOrders)),
        card("paid", "Paid in all", price(d.stats.paid), { sub: "verified payments, test orders left out", tone: "an-card--strong" }),
        card("refunded", "Refunded", price(d.stats.refunded)),
        card("cart", "In the cart now", d.cart.lines ? price(d.cart.value) : "Empty", { sub: d.cart.lines ? `${num(d.cart.lines)} ${d.cart.lines === 1 ? "item" : "items"} · last touched ${esc(v.when(d.cart.updatedAt))}` : "" }),
      ])}
      ${two(
        panel(
          "Contact details",
          facts("contact", [
            pair("Name", esc(u.name)),
            pair("Email", `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>`),
            pair("Phone", u.phone ? `<a href="tel:${esc(u.phone)}">${esc(u.phone)}</a>` : "Not given"),
            pair("Account", `<span class="sd-status sd-status--${u.status === "ACTIVE" ? "published" : u.status === "DISABLED" ? "unpublished" : "pending_review"}">${esc(STATUS[u.status] || u.status)}</span>`),
            pair("Last login", esc(v.when(u.lastLoginAt) || "Not since the account was created")),
            pair("Failed logins, last 30 days", `${num(d.stats.failedLogins30Days)}${d.stats.lastFailedLoginAt ? ` · last ${esc(v.when(d.stats.lastFailedLoginAt))}` : ""}`),
          ]),
          "The password is never shown here, and can't be set here. Opening this page is written to the activity log.",
        ),
        panel(
          "Saved addresses",
          d.addresses.length
            ? `<ul class="an-addresses" data-addresses>${d.addresses.map((a) => `<li><strong>${esc(a.fullName)}</strong>${a.isDefault ? ` <span class="sd-status sd-status--draft">Default</span>` : ""}<span>${esc(address(a))}</span><span>${esc(a.phone)}</span></li>`).join("")}</ul>`
            : `<div class="an-rank an-rank--empty">No saved address</div>`,
        ),
      )}
      ${section(
        "Order history",
        d.orders.items.length
          ? `<div class="sd-table-wrap" data-table="orders"><table class="sd-table"><thead><tr><th scope="col">Order</th><th scope="col">Items</th><th scope="col">Order status</th><th scope="col">Payment</th><th scope="col">Total</th><th scope="col">Date</th></tr></thead><tbody>
            ${d.orders.items
              .map(
                (o) => `<tr><td><a class="sd-item__name" href="#/orders/${esc(o.orderNumber)}">${esc(o.orderNumber)}</a>${o.isTest ? ` <span class="sd-status sd-status--draft an-test">Test</span>` : ""}</td>
                <td>${esc(o.firstItem ? o.firstItem.name : "")}${o.itemCount > 1 ? `<br><span class="sd-item__meta">+ ${o.itemCount - 1} more</span>` : ""}</td>
                <td>${v.badge(o.status, v.ORDER_STATUS)}</td><td>${v.paymentBadge(o)}<br><span class="sd-item__meta">${esc(v.methodLabel(o))}</span></td>
                <td><strong>${price(o.total)}</strong></td><td>${esc(v.when(o.createdAt))}</td></tr>`,
              )
              .join("")}</tbody></table></div>
            ${pages > 1 ? `<nav class="od-pages" aria-label="Pages">${page > 1 ? `<a class="btn btn--outline btn--sm" href="#/users/${esc(u.id)}?page=${page - 1}">Newer</a>` : ""}<span>Page ${page} of ${pages} · ${num(d.orders.total)} orders</span>${page < pages ? `<a class="btn btn--outline btn--sm" href="#/users/${esc(u.id)}?page=${page + 1}">Older</a>` : ""}</nav>` : ""}`
          : `<div class="sd-empty">${icon("receipt")}<strong>No orders yet</strong><span>This account has not ordered anything.</span></div>`,
        "Open an order to see every item, the delivery address, each payment attempt and the delivery progress.",
      )}
      ${d.paintings.length ? section("Custom painting requests", table("paintings", ["Request", "Artist", "Status", "Price", "Paid", "Date"], d.paintings.map((p) => [`<a class="sd-item__name" href="#/paintings/${esc(p.number)}">${esc(p.number)}</a>${p.isTest ? ` <span class="sd-status sd-status--draft an-test">Test</span>` : ""}`, esc(p.artist), esc(PAINTING[p.status] || p.status), price(p.price), `${price(p.amountPaid)}${p.refundStatus === "REFUNDED" ? `<br><span class="sd-item__meta">refunded</span>` : p.refundStatus === "REFUND_PENDING" ? `<br><span class="sd-item__meta">refund due</span>` : ""}`, esc(v.when(p.createdAt))]))) : ""}`;
  }

  FrameX.adminAnalytics = { show, customer };
})((window.FrameX = window.FrameX || {}));
