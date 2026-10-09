/* ==========================================================================
   The admin dashboard's reports. Read-only: nothing here changes an order,
   a payment or an account.

   WHERE EACH FIGURE COMES FROM
     Orders, sales, refunds, payments, accounts, sellers, custom paintings
         the database tables the checkout and the payment gateway write.
         An order counts as PAID only when orders.paid_at is set, which
         happens in exactly two places: the gateway's payment was verified by
         the server (payment-service.js), or a Cash on Delivery order was
         marked delivered. A browser coming back from the payment page proves
         nothing and changes none of these numbers. Each order is one row, so
         nothing is counted twice however often a payment is reported.
     Visitors, pages, product / template views, searches, sources
         analytics_events, sent by the website only for visitors who allowed
         analytics. They are a floor, not a head count, and every answer says so.

   THE WORDS
     created     orders made in the period (whatever happened to them later)
     paid        orders whose payment was verified in the period
     gross       money of the orders (and painting payments) paid in the period
     refunds     money sent back in the period (gateway refunds that went through,
                 and painting refunds an admin recorded)
     net         gross - refunds
     test        made with the payment gateway in TEST mode, or marked as a test
                 by an admin: shown on their own, never part of the figures above

   A day is a day in the reports' time zone (ANALYTICS_UTC_OFFSET_MINUTES,
   India time by default), not a UTC day.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { errors } from "../lib/errors.js";
import { liveVisitors, LIVE_WINDOW_MS } from "./analytics-service.js";

export const RANGES = ["today", "7d", "30d", "90d", "custom"];
const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const off = () => config.analytics.utcOffsetMinutes;

/* ---------------------------------------------------------------- Periods */

const localDay = (date) => new Date(date.getTime() + off() * 60_000).toISOString().slice(0, 10);
const startOfLocalDay = (ymd) => new Date(Date.parse(ymd + "T00:00:00Z") - off() * 60_000);
const realDate = (s) => DATE.test(String(s || "")) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(Date.parse(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;

/**
 * { range: today | 7d | 30d | 90d | custom, from, to }  ->  the period as instants.
 * from / to (custom) are calendar days "YYYY-MM-DD", both included. A period ends today at the latest.
 */
export function resolveRange({ range = "30d", from = "", to = "" } = {}, now = new Date()) {
  const key = RANGES.includes(range) ? range : "30d";
  const today = localDay(now);
  let a;
  let b;
  if (key === "custom") {
    if (!realDate(from)) throw errors.validation({ from: "Choose the first day (YYYY-MM-DD)." });
    if (!realDate(to)) throw errors.validation({ to: "Choose the last day (YYYY-MM-DD)." });
    if (from > to) throw errors.validation({ to: "The last day is before the first day." });
    if (from > today) throw errors.validation({ from: "The first day is in the future." });
    a = startOfLocalDay(from);
    b = new Date(startOfLocalDay(to > today ? today : to).getTime() + DAY);
    if ((b - a) / DAY > 366) throw errors.validation({ to: "Choose a period of one year or less." });
  } else {
    b = new Date(startOfLocalDay(today).getTime() + DAY);
    a = new Date(b.getTime() - { today: 1, "7d": 7, "30d": 30, "90d": 90 }[key] * DAY);
  }
  const days = Math.round((b - a) / DAY);
  return { key, from: a, to: b, days, bucket: days === 1 ? "hour" : "day", fromDate: localDay(a), toDate: localDay(new Date(b.getTime() - 1)), previous: { from: new Date(a.getTime() - (b - a)), to: a }, now };
}

/** The period as the dashboard is told about it. */
const describe = (r) => ({ key: r.key, from: r.fromDate, to: r.toDate, days: r.days, bucket: r.bucket, utcOffsetMinutes: off(), generatedAt: r.now.toISOString() });

// A timestamp as the wall clock of the reports' time zone, and the key of the hour or the day it falls in.
const localSql = (col) => `((${col} AT TIME ZONE 'UTC') + interval '${off()} minutes')`;
const keySql = (col, r) => `to_char(${localSql(col)}, '${r.bucket === "hour" ? 'YYYY-MM-DD"T"HH24' : "YYYY-MM-DD"}')`;

function keysOf(r) {
  if (r.bucket === "hour") return Array.from({ length: 24 }, (_, h) => `${r.fromDate}T${String(h).padStart(2, "0")}`);
  const out = [];
  for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY) out.push(localDay(new Date(t)));
  return out;
}

/** { visitors: rows, orders: rows }, rows = [{ k, n }]  ->  one point per hour / day, with 0 where nothing happened. */
function seriesOf(r, groups) {
  const maps = Object.entries(groups).map(([field, rows]) => [field, new Map(rows.map((x) => [x.k, Number(x.n) || 0]))]);
  return keysOf(r).map((key) => Object.assign({ key }, Object.fromEntries(maps.map(([field, m]) => [field, m.get(key) || 0]))));
}

const n = (value) => Number(value) || 0;
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await db.query(sql, params)).rows[0] || {};
const REAL = "NOT coalesce(o.is_test, false)";
const REAL_R = "NOT coalesce(r.is_test, false)";
const WEB = "e.source = 'web' AND e.occurred_at >= $1 AND e.occurred_at < $2";
const VISITOR_NOTE = "Counted from visitors who allowed analytics on the website. People who declined, or never chose, are not in these numbers.";

/* ---------------------------------------------------------------- Money (shared by the overview and the sales report) */

async function money(from, to) {
  const p = [from, to];
  const o = await one(
    `SELECT count(*) FILTER (WHERE o.created_at >= $1 AND o.created_at < $2)::int AS created,
            count(*) FILTER (WHERE o.paid_at >= $1 AND o.paid_at < $2)::int AS paid,
            coalesce(sum(o.total) FILTER (WHERE o.paid_at >= $1 AND o.paid_at < $2), 0)::float8 AS gross,
            count(*) FILTER (WHERE o.cancelled_at >= $1 AND o.cancelled_at < $2)::int AS cancelled
       FROM orders o WHERE ${REAL}`,
    p
  );
  const paint = await one(
    `SELECT count(*)::int AS payments, coalesce(sum(p.amount), 0)::float8 AS gross
       FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id
      WHERE p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R}`,
    p
  );
  const refunds = await one(
    `SELECT count(*)::int AS refunds, coalesce(sum(f.amount), 0)::float8 AS amount
       FROM refunds f JOIN orders o ON o.id = f.order_id
      WHERE f.status = 'PROCESSED' AND f.updated_at >= $1 AND f.updated_at < $2 AND ${REAL}`,
    p
  );
  // Painting refunds are made by hand and recorded by an admin: the amount is what the customer had paid.
  const paintRefunds = await one(
    `SELECT count(*)::int AS refunds, coalesce(sum(r.amount_paid), 0)::float8 AS amount
       FROM audit_logs a JOIN painting_requests r ON r.request_number = a.target_id
      WHERE a.action = 'PAINTING_REFUND_RECORDED' AND a.created_at >= $1 AND a.created_at < $2 AND ${REAL_R}`,
    p
  );
  const gross = n(o.gross) + n(paint.gross);
  const refunded = n(refunds.amount) + n(paintRefunds.amount);
  return {
    orders: { created: n(o.created), paid: n(o.paid), cancelled: n(o.cancelled), gross: n(o.gross) },
    paintings: { payments: n(paint.payments), gross: n(paint.gross) },
    refunds: { orders: { count: n(refunds.refunds), amount: n(refunds.amount) }, paintings: { count: n(paintRefunds.refunds), amount: n(paintRefunds.amount) }, amount: refunded },
    gross,
    net: gross - refunded
  };
}

async function visitors(from, to) {
  const w = await one(
    `SELECT count(DISTINCT e.visitor_id)::int AS visitors, count(DISTINCT e.session_id)::int AS visits,
            count(*) FILTER (WHERE e.name = 'page_view')::int AS page_views,
            count(*) FILTER (WHERE e.name = 'view_item')::int AS product_views,
            count(DISTINCT e.session_id) FILTER (WHERE e.name = 'begin_checkout')::int AS checkouts
       FROM analytics_events e WHERE ${WEB}`,
    [from, to]
  );
  return { unique: n(w.visitors), visits: n(w.visits), pageViews: n(w.page_views), productViews: n(w.product_views), checkouts: n(w.checkouts) };
}

/** Carts that still hold items, were last touched in the period, and have not been touched for ANALYTICS_ABANDONED_CART_HOURS. */
async function abandonedCarts(from, to) {
  const c = await one(
    `SELECT count(*)::int AS carts, coalesce(sum(t.value), 0)::float8 AS value FROM (
       SELECT c.id, c.updated_at, sum(i.unit_price * i.quantity) AS value FROM carts c JOIN cart_items i ON i.cart_id = c.id GROUP BY c.id, c.updated_at
     ) t WHERE t.updated_at >= $1 AND t.updated_at < $2 AND t.updated_at < now() - interval '${config.analytics.abandonedCartHours} hours'`,
    [from, to]
  );
  return { carts: n(c.carts), value: n(c.value), afterHours: config.analytics.abandonedCartHours };
}

const cartAdditions = async (from, to) => {
  const c = await one("SELECT count(*)::int AS additions, coalesce(sum(e.value), 0)::float8 AS value FROM analytics_events e WHERE e.source = 'server' AND e.name = 'add_to_cart' AND e.occurred_at >= $1 AND e.occurred_at < $2", [from, to]);
  return { additions: n(c.additions), value: n(c.value) };
};

/* ---------------------------------------------------------------- Overview */

export async function overview(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const q = [r.previous.from, r.previous.to];
  const [now, before, web, webBefore] = [await money(...p), await money(...q), await visitors(...p), await visitors(...q)];
  const users = await one(
    `SELECT count(*) FILTER (WHERE role = 'CUSTOMER')::int AS customers,
            count(*) FILTER (WHERE role = 'CUSTOMER' AND created_at >= $1 AND created_at < $2)::int AS new_customers,
            count(*) FILTER (WHERE role = 'CUSTOMER' AND created_at >= $3 AND created_at < $4)::int AS new_before
       FROM users`,
    [...p, ...q]
  );
  const auth = await one("SELECT count(*) FILTER (WHERE kind = 'LOGIN')::int AS logins, count(*) FILTER (WHERE kind = 'LOGIN_FAILED')::int AS failed FROM auth_events WHERE created_at >= $1 AND created_at < $2", p);
  const test = await one(
    `SELECT count(*) FILTER (WHERE o.created_at >= $1 AND o.created_at < $2)::int AS orders,
            coalesce(sum(o.total) FILTER (WHERE o.paid_at >= $1 AND o.paid_at < $2), 0)::float8 AS paid
       FROM orders o WHERE coalesce(o.is_test, false)`,
    p
  );
  const series = seriesOf(r, {
    visitors: await rows(`SELECT ${keySql("e.occurred_at", r)} AS k, count(DISTINCT e.visitor_id)::int AS n FROM analytics_events e WHERE ${WEB} GROUP BY 1`, p),
    pageViews: await rows(`SELECT ${keySql("e.occurred_at", r)} AS k, count(*)::int AS n FROM analytics_events e WHERE ${WEB} AND e.name = 'page_view' GROUP BY 1`, p),
    orders: await rows(`SELECT ${keySql("o.created_at", r)} AS k, count(*)::int AS n FROM orders o WHERE o.created_at >= $1 AND o.created_at < $2 AND ${REAL} GROUP BY 1`, p),
    gross: await rows(
      `SELECT k, sum(n)::float8 AS n FROM (
         SELECT ${keySql("o.paid_at", r)} AS k, o.total AS n FROM orders o WHERE o.paid_at >= $1 AND o.paid_at < $2 AND ${REAL}
         UNION ALL
         SELECT ${keySql("p.paid_at", r)} AS k, p.amount AS n FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R}
       ) t GROUP BY k`,
      p
    )
  });
  return {
    range: describe(r),
    visitors: { ...web, before: { unique: webBefore.unique, visits: webBefore.visits, pageViews: webBefore.pageViews }, collecting: config.analytics.enabled, note: VISITOR_NOTE },
    // Who is on the site now. Heard from in the last five minutes, among visitors who allowed analytics.
    live: { visitors: config.analytics.enabled ? liveVisitors() : null, windowMinutes: LIVE_WINDOW_MS / 60_000 },
    accounts: { customers: n(users.customers), newCustomers: n(users.new_customers), before: { newCustomers: n(users.new_before) }, logins: n(auth.logins), failedLogins: n(auth.failed) },
    cart: { ...(await cartAdditions(...p)), abandoned: await abandonedCarts(...p) },
    orders: { ...now.orders, before: { created: before.orders.created, paid: before.orders.paid } },
    money: { gross: now.gross, refunds: now.refunds.amount, net: now.net, orders: now.orders.gross, paintings: now.paintings.gross, before: { gross: before.gross, net: before.net } },
    test: { orders: n(test.orders), paid: n(test.paid) },
    series
  };
}

/* ---------------------------------------------------------------- Traffic */

export async function traffic(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const LAND = `${WEB} AND e.landing`;
  const web = await visitors(...p);
  const m = await money(...p);
  const viewers = await one(`SELECT count(DISTINCT e.visitor_id)::int AS n FROM analytics_events e WHERE ${WEB} AND e.name = 'view_item'`, p);
  const starters = await one(`SELECT count(DISTINCT e.visitor_id)::int AS n FROM analytics_events e WHERE ${WEB} AND e.name = 'begin_checkout'`, p);
  const cart = await cartAdditions(...p);
  return {
    range: describe(r),
    note: VISITOR_NOTE,
    collecting: config.analytics.enabled,
    visitors: web,
    channels: (await rows(`SELECT coalesce(e.channel, 'direct') AS channel, count(DISTINCT e.session_id)::int AS visits FROM analytics_events e WHERE ${LAND} GROUP BY 1 ORDER BY 2 DESC, 1`, p)).map((x) => ({ channel: x.channel, visits: n(x.visits) })),
    referrers: (await rows(`SELECT e.referrer, count(DISTINCT e.session_id)::int AS visits FROM analytics_events e WHERE ${LAND} AND e.referrer IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`, p)).map((x) => ({ host: x.referrer, visits: n(x.visits) })),
    campaigns: (
      await rows(
        `SELECT e.utm_source, e.utm_medium, e.utm_campaign, count(DISTINCT e.session_id)::int AS visits
           FROM analytics_events e WHERE ${LAND} AND (e.utm_source IS NOT NULL OR e.utm_campaign IS NOT NULL) GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10`,
        p
      )
    ).map((x) => ({ source: x.utm_source, medium: x.utm_medium, campaign: x.utm_campaign, visits: n(x.visits) })),
    landingPages: (await rows(`SELECT coalesce(e.path, '/') AS path, max(e.page) AS page, count(DISTINCT e.session_id)::int AS visits FROM analytics_events e WHERE ${LAND} GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 10`, p)).map((x) => ({ path: x.path, page: x.page, visits: n(x.visits) })),
    pages: (
      await rows(`SELECT coalesce(e.path, '/') AS path, max(e.page) AS page, count(*)::int AS views, count(DISTINCT e.visitor_id)::int AS visitors FROM analytics_events e WHERE ${WEB} AND e.name = 'page_view' GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 15`, p)
    ).map((x) => ({ path: x.path, page: x.page, views: n(x.views), visitors: n(x.visitors) })),
    devices: (await rows(`SELECT coalesce(e.device, 'desktop') AS device, count(DISTINCT e.visitor_id)::int AS visitors FROM analytics_events e WHERE ${WEB} GROUP BY 1 ORDER BY 2 DESC`, p)).map((x) => ({ device: x.device, visitors: n(x.visitors) })),
    searches: (await rows(`SELECT e.query, count(*)::int AS searches FROM analytics_events e WHERE ${WEB} AND e.name = 'search' AND e.query IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`, p)).map((x) => ({ query: x.query, searches: n(x.searches) })),
    // From a visit to a paid order. The first, second and fourth steps are visitors who allowed analytics;
    // the cart and the orders are exact (database). So the steps are honest counts, not one cohort of people.
    funnel: [
      { step: "visitors", label: "Visitors", count: web.unique, source: "analytics" },
      { step: "product_viewers", label: "Looked at a product", count: n(viewers.n), source: "analytics" },
      { step: "cart_additions", label: "Items added to a cart", count: cart.additions, source: "database" },
      { step: "checkout_starters", label: "Started checkout", count: n(starters.n), source: "analytics" },
      { step: "orders_created", label: "Orders created", count: m.orders.created, source: "database" },
      { step: "orders_paid", label: "Orders paid", count: m.orders.paid, source: "database" }
    ]
  };
}

/* ---------------------------------------------------------------- Sales, orders and payments */

export async function sales(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const m = await money(...p);
  const IN_RANGE = "o.created_at >= $1 AND o.created_at < $2";
  const PAID = "o.paid_at >= $1 AND o.paid_at < $2";
  const parts = await one(
    `SELECT coalesce(sum(o.subtotal - o.discount), 0)::float8 AS items, coalesce(sum(o.tax), 0)::float8 AS tax, coalesce(sum(o.shipping_fee), 0)::float8 AS shipping,
            coalesce(sum(o.cod_fee), 0)::float8 AS cod_fee, coalesce(sum(o.gift_wrap_fee), 0)::float8 AS gift_wrap
       FROM orders o WHERE ${PAID} AND ${REAL}`,
    p
  );
  const methods = await rows(
    `SELECT o.payment_method AS method, count(*) FILTER (WHERE ${IN_RANGE})::int AS created, coalesce(sum(o.total) FILTER (WHERE ${IN_RANGE}), 0)::float8 AS created_value,
            count(*) FILTER (WHERE ${PAID})::int AS paid, coalesce(sum(o.total) FILTER (WHERE ${PAID}), 0)::float8 AS paid_value,
            count(*) FILTER (WHERE o.delivered_at >= $1 AND o.delivered_at < $2)::int AS delivered
       FROM orders o WHERE ${REAL} GROUP BY 1`,
    p
  );
  const method = (id) => {
    const x = methods.find((y) => y.method === id) || {};
    return { created: n(x.created), createdValue: n(x.created_value), paid: n(x.paid), paidValue: n(x.paid_value), delivered: n(x.delivered) };
  };
  // Cash still to be collected: Cash on Delivery orders that are on their way (whenever they were placed).
  const codOpen = await one(`SELECT count(*)::int AS orders, coalesce(sum(o.total), 0)::float8 AS value FROM orders o WHERE o.payment_method = 'COD' AND o.payment_status = 'PENDING' AND o.status IN ('PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY') AND ${REAL}`);
  // Every payment attempt made through a gateway in the period, for orders and for custom paintings.
  const attempts = await rows(
    `SELECT provider, status, count(*)::int AS attempts, coalesce(sum(amount), 0)::float8 AS amount FROM (
       SELECT p.provider, p.status, p.amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.provider <> 'cod' AND p.created_at >= $1 AND p.created_at < $2 AND ${REAL}
       UNION ALL
       SELECT p.provider, p.status, p.amount FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.created_at >= $1 AND p.created_at < $2 AND ${REAL_R}
     ) t GROUP BY 1, 2`,
    p
  );
  const gateways = [...new Set(attempts.map((a) => a.provider))].sort().map((provider) => {
    const of = (...statuses) => attempts.filter((a) => a.provider === provider && statuses.includes(a.status)).reduce((sum, a) => ({ count: sum.count + n(a.attempts), amount: sum.amount + n(a.amount) }), { count: 0, amount: 0 });
    // A refunded payment was a successful payment first.
    const out = { provider, success: of("PAID", "REFUNDED", "PARTIALLY_REFUNDED"), failed: of("FAILED"), pending: of("PENDING"), cancelled: of("CANCELLED") };
    return { ...out, attempts: out.success.count + out.failed.count + out.pending.count + out.cancelled.count };
  });
  const instruments = await rows(`SELECT coalesce(o.payment_instrument, 'other') AS instrument, count(*)::int AS orders, coalesce(sum(o.total), 0)::float8 AS value FROM orders o WHERE ${PAID} AND o.payment_method = 'ONLINE' AND ${REAL} GROUP BY 1 ORDER BY 2 DESC`, p);
  const pendingRefunds = await one(`SELECT count(*)::int AS refunds, coalesce(sum(f.amount), 0)::float8 AS amount FROM refunds f JOIN orders o ON o.id = f.order_id WHERE f.status = 'PENDING' AND ${REAL}`);
  // What the gateway told the server (each notification is stored once, by its own id, so a repeat changes nothing).
  const notices = await rows("SELECT provider, coalesce(result, 'NOT_PROCESSED') AS result, count(*)::int AS events FROM payment_events WHERE received_at >= $1 AND received_at < $2 GROUP BY 1, 2 ORDER BY 1, 3 DESC", p);
  const test = await one(
    `SELECT count(*) FILTER (WHERE ${IN_RANGE})::int AS orders, count(*) FILTER (WHERE ${PAID})::int AS paid, coalesce(sum(o.total) FILTER (WHERE ${PAID}), 0)::float8 AS paid_value
       FROM orders o WHERE coalesce(o.is_test, false)`,
    p
  );
  const testPaintings = await one(`SELECT count(*)::int AS payments, coalesce(sum(p.amount), 0)::float8 AS amount FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.paid_at >= $1 AND p.paid_at < $2 AND coalesce(r.is_test, false)`, p);
  return {
    range: describe(r),
    orders: {
      ...m.orders,
      averagePaidOrder: m.orders.paid ? Math.round(m.orders.gross / m.orders.paid) : 0,
      // Where the orders created in the period stand today.
      byStatus: (await rows(`SELECT o.status, count(*)::int AS orders, coalesce(sum(o.total), 0)::float8 AS value FROM orders o WHERE ${IN_RANGE} AND ${REAL} GROUP BY 1`, p)).map((x) => ({ status: x.status, orders: n(x.orders), value: n(x.value) })),
      byPaymentStatus: (await rows(`SELECT o.payment_status AS status, count(*)::int AS orders FROM orders o WHERE ${IN_RANGE} AND ${REAL} GROUP BY 1`, p)).map((x) => ({ status: x.status, orders: n(x.orders) }))
    },
    money: {
      gross: m.gross,
      orders: m.orders.gross,
      paintings: m.paintings.gross,
      refunds: m.refunds.amount,
      refundsOrders: m.refunds.orders,
      refundsPaintings: m.refunds.paintings,
      net: m.net,
      // What the paid orders' money was for.
      parts: { items: n(parts.items), tax: n(parts.tax), shipping: n(parts.shipping), codFee: n(parts.cod_fee), giftWrap: n(parts.gift_wrap) },
      refundsInProgress: { count: n(pendingRefunds.refunds), amount: n(pendingRefunds.amount) }
    },
    cod: { ...method("COD"), awaitingCollection: { orders: n(codOpen.orders), value: n(codOpen.value) } },
    online: method("ONLINE"),
    gateways,
    instruments: instruments.map((x) => ({ instrument: x.instrument, orders: n(x.orders), value: n(x.value) })),
    gatewayNotices: notices.map((x) => ({ provider: x.provider, result: x.result, events: n(x.events) })),
    test: { orders: n(test.orders), paid: n(test.paid), paidValue: n(test.paid_value), paintingPayments: n(testPaintings.payments), paintingValue: n(testPaintings.amount), gatewayMode: config.payments.mode },
    series: seriesOf(r, {
      created: await rows(`SELECT ${keySql("o.created_at", r)} AS k, count(*)::int AS n FROM orders o WHERE ${IN_RANGE} AND ${REAL} GROUP BY 1`, p),
      paid: await rows(`SELECT ${keySql("o.paid_at", r)} AS k, count(*)::int AS n FROM orders o WHERE ${PAID} AND ${REAL} GROUP BY 1`, p),
      gross: await rows(
        `SELECT k, sum(n)::float8 AS n FROM (
           SELECT ${keySql("o.paid_at", r)} AS k, o.total AS n FROM orders o WHERE ${PAID} AND ${REAL}
           UNION ALL
           SELECT ${keySql("p.paid_at", r)} AS k, p.amount AS n FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R}
         ) t GROUP BY k`,
        p
      ),
      refunds: await rows(`SELECT ${keySql("f.updated_at", r)} AS k, sum(f.amount)::float8 AS n FROM refunds f JOIN orders o ON o.id = f.order_id WHERE f.status = 'PROCESSED' AND f.updated_at >= $1 AND f.updated_at < $2 AND ${REAL} GROUP BY 1`, p)
    })
  };
}

/* ---------------------------------------------------------------- Products, templates, artworks */

// Order lines that count as "ordered": the order was made in the period, is real, and was not cancelled or left unpaid.
const ORDERED = `o.created_at >= $1 AND o.created_at < $2 AND ${REAL} AND o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')`;

export async function catalog(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const viewed = async (name, type) =>
    (
      await rows(
        `SELECT e.item_id, max(e.item_name) AS name, count(*)::int AS views, count(DISTINCT e.visitor_id)::int AS visitors
           FROM analytics_events e WHERE ${WEB} AND e.name = $3 AND e.item_type = $4 AND e.item_id IS NOT NULL GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 10`,
        [...p, name, type]
      )
    ).map((x) => ({ id: x.item_id, name: x.name || x.item_id, views: n(x.views), visitors: n(x.visitors) }));
  const ordered = async (where) =>
    (
      await rows(
        `SELECT i.product_id AS id, max(i.name) AS name, max(i.shop_name) AS seller, sum(i.quantity)::int AS units, count(DISTINCT o.id)::int AS orders, coalesce(sum(i.line_total), 0)::float8 AS sales
           FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${ORDERED} AND ${where} GROUP BY 1 ORDER BY 4 DESC, 6 DESC LIMIT 10`,
        p
      )
    ).map((x) => ({ id: x.id, name: x.name, seller: x.seller, units: n(x.units), orders: n(x.orders), sales: n(x.sales) }));
  return {
    range: describe(r),
    note: VISITOR_NOTE,
    products: {
      viewed: await viewed("view_item", "product"),
      ordered: await ordered("i.kind = 'PRODUCT' AND i.seller_type <> 'ARTIST' AND i.product_id IS NOT NULL"),
      addedToCart: (
        await rows(
          `SELECT e.item_id, max(e.item_name) AS name, count(*)::int AS additions FROM analytics_events e
            WHERE e.source = 'server' AND e.name = 'add_to_cart' AND e.item_type = 'product' AND e.item_id IS NOT NULL AND e.occurred_at >= $1 AND e.occurred_at < $2 GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 10`,
          p
        )
      ).map((x) => ({ id: x.item_id, name: x.name || x.item_id, additions: n(x.additions) }))
    },
    categories: (
      await rows(`SELECT e.item_id, max(e.item_name) AS name, count(*)::int AS views, count(DISTINCT e.visitor_id)::int AS visitors FROM analytics_events e WHERE ${WEB} AND e.name = 'view_item_list' AND e.item_id IS NOT NULL GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 10`, p)
    ).map((x) => ({ id: x.item_id, name: x.name || x.item_id, views: n(x.views), visitors: n(x.visitors) })),
    templates: {
      viewed: await viewed("view_template", "template"),
      ordered: (
        await rows(
          `SELECT i.template_id AS id, coalesce(max(t.title), max(i.name)) AS name, sum(i.quantity)::int AS units, count(DISTINCT o.id)::int AS orders, coalesce(sum(i.line_total), 0)::float8 AS sales
             FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN catalog_templates t ON t.id = i.template_id
            WHERE ${ORDERED} AND i.template_id IS NOT NULL GROUP BY 1 ORDER BY 3 DESC, 5 DESC LIMIT 10`,
          p
        )
      ).map((x) => ({ id: x.id, name: x.name, units: n(x.units), orders: n(x.orders), sales: n(x.sales) }))
    },
    artworks: { viewed: await viewed("view_artwork", "artwork"), ordered: await ordered("i.seller_type = 'ARTIST' AND i.product_id IS NOT NULL") }
  };
}

/* ---------------------------------------------------------------- Shops and artists */

const paging = (page, limit, max = 50) => {
  const size = Math.min(Math.max(1, Math.floor(Number(limit)) || 20), max);
  const at = Math.max(1, Math.floor(Number(page)) || 1);
  return { size, at, skip: (at - 1) * size };
};

export async function sellers(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const { size, at, skip } = paging(query.page, query.limit);
  const LIVE = "o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')";
  // Shops (and FrameX Studio itself): the lines of the orders made in the period.
  const shopSql = `FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.created_at >= $1 AND o.created_at < $2 AND ${REAL} AND i.seller_type <> 'ARTIST'`;
  const shopTotal = n((await one(`SELECT count(*)::int AS n FROM (SELECT 1 ${shopSql} GROUP BY i.seller_type, i.shop_ref) t`, p)).n);
  const shops = await rows(
    `SELECT i.seller_type, i.shop_ref, max(i.shop_name) AS name, count(DISTINCT o.id) FILTER (WHERE ${LIVE})::int AS orders,
            coalesce(sum(i.quantity) FILTER (WHERE ${LIVE}), 0)::int AS units,
            coalesce(sum(i.line_total) FILTER (WHERE ${LIVE}), 0)::float8 AS ordered,
            coalesce(sum(i.line_total) FILTER (WHERE o.paid_at IS NOT NULL), 0)::float8 AS paid,
            count(DISTINCT o.id) FILTER (WHERE o.status = 'CANCELLED')::int AS cancelled,
            count(DISTINCT o.id) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered
       ${shopSql} GROUP BY i.seller_type, i.shop_ref ORDER BY 6 DESC, 3 LIMIT ${size} OFFSET ${skip}`,
    p
  );
  // Artists: finished artworks sold, and custom paintings asked for, in the period.
  const artists = await rows(
    `SELECT a.id, a.artist_code, a.name, a.status,
            coalesce(s.units, 0)::int AS units, coalesce(s.sales, 0)::float8 AS sales, coalesce(s.orders, 0)::int AS orders,
            coalesce(q.requests, 0)::int AS requests, coalesce(q.accepted, 0)::int AS accepted, coalesce(q.declined, 0)::int AS declined, coalesce(q.delivered, 0)::int AS delivered,
            coalesce(c.collected, 0)::float8 AS collected
       FROM artists a
       LEFT JOIN (SELECT i.artist_id, sum(i.quantity) AS units, sum(i.line_total) AS sales, count(DISTINCT o.id) AS orders
                    FROM order_items i JOIN orders o ON o.id = i.order_id
                   WHERE o.created_at >= $1 AND o.created_at < $2 AND ${REAL} AND ${LIVE} AND i.artist_id IS NOT NULL GROUP BY 1) s ON s.artist_id = a.id
       LEFT JOIN (SELECT r.artist_id, count(*) AS requests,
                         count(*) FILTER (WHERE r.responded_at IS NOT NULL AND r.status <> 'DECLINED') AS accepted,
                         count(*) FILTER (WHERE r.status = 'DECLINED') AS declined,
                         count(*) FILTER (WHERE r.status = 'DELIVERED') AS delivered
                    FROM painting_requests r WHERE r.created_at >= $1 AND r.created_at < $2 AND ${REAL_R} GROUP BY 1) q ON q.artist_id = a.id
       LEFT JOIN (SELECT r.artist_id, sum(p.amount) AS collected FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id
                   WHERE p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R} GROUP BY 1) c ON c.artist_id = a.id
      WHERE coalesce(s.orders, 0) + coalesce(q.requests, 0) > 0 OR coalesce(c.collected, 0) > 0
      ORDER BY coalesce(s.sales, 0) + coalesce(c.collected, 0) DESC, a.name LIMIT 50`,
    p
  );
  return {
    range: describe(r),
    shops: {
      items: shops.map((x) => ({ sellerType: x.seller_type, ref: x.shop_ref, name: x.name, orders: n(x.orders), units: n(x.units), ordered: n(x.ordered), paid: n(x.paid), cancelled: n(x.cancelled), delivered: n(x.delivered) })),
      total: shopTotal,
      page: at,
      limit: size
    },
    artists: artists.map((x) => ({
      id: x.id,
      code: x.artist_code,
      name: x.name,
      status: x.status,
      artworks: { orders: n(x.orders), units: n(x.units), sales: n(x.sales) },
      paintings: { requests: n(x.requests), accepted: n(x.accepted), declined: n(x.declined), delivered: n(x.delivered), collected: n(x.collected) }
    }))
  };
}

/* ---------------------------------------------------------------- Custom paintings */

export async function paintings(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const flow = await one(
    `SELECT count(*) FILTER (WHERE r.created_at >= $1 AND r.created_at < $2)::int AS requested,
            count(*) FILTER (WHERE r.responded_at >= $1 AND r.responded_at < $2 AND r.status <> 'DECLINED')::int AS accepted,
            count(*) FILTER (WHERE r.responded_at >= $1 AND r.responded_at < $2 AND r.status = 'DECLINED')::int AS declined,
            count(*) FILTER (WHERE r.cancelled_at >= $1 AND r.cancelled_at < $2)::int AS cancelled,
            count(*) FILTER (WHERE r.delivered_at >= $1 AND r.delivered_at < $2)::int AS delivered,
            coalesce(sum(r.price) FILTER (WHERE r.created_at >= $1 AND r.created_at < $2), 0)::float8 AS requested_value
       FROM painting_requests r WHERE ${REAL_R}`,
    p
  );
  const stage = async (name) => {
    const x = await one(`SELECT count(*)::int AS payments, coalesce(sum(p.amount), 0)::float8 AS amount FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.stage = $3 AND p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R}`, [...p, name]);
    return { payments: n(x.payments), amount: n(x.amount) };
  };
  // Money that is still to come, as things stand now (whenever the request was made).
  const open = await one(
    `SELECT count(*) FILTER (WHERE r.status = 'PENDING_ARTIST_RESPONSE')::int AS waiting_artist,
            count(*) FILTER (WHERE r.status = 'ADVANCE_PAYMENT_PENDING')::int AS advance_due, coalesce(sum(r.advance_amount) FILTER (WHERE r.status = 'ADVANCE_PAYMENT_PENDING'), 0)::float8 AS advance_due_amount,
            count(*) FILTER (WHERE r.status = 'REMAINING_PAYMENT_PENDING')::int AS balance_due, coalesce(sum(r.balance_amount) FILTER (WHERE r.status = 'REMAINING_PAYMENT_PENDING'), 0)::float8 AS balance_due_amount,
            count(*) FILTER (WHERE r.status IN ('ADVANCE_PAID', 'PAINTING_IN_PROGRESS'))::int AS in_progress,
            count(*) FILTER (WHERE r.refund_status = 'REFUND_PENDING')::int AS refund_due, coalesce(sum(r.amount_paid) FILTER (WHERE r.refund_status = 'REFUND_PENDING'), 0)::float8 AS refund_due_amount
       FROM painting_requests r WHERE ${REAL_R}`
  );
  const refunded = await one(
    `SELECT count(*)::int AS refunds, coalesce(sum(r.amount_paid), 0)::float8 AS amount FROM audit_logs a JOIN painting_requests r ON r.request_number = a.target_id
      WHERE a.action = 'PAINTING_REFUND_RECORDED' AND a.created_at >= $1 AND a.created_at < $2 AND ${REAL_R}`,
    p
  );
  const attempts = await rows(
    `SELECT p.provider, p.stage, p.status, count(*)::int AS attempts, coalesce(sum(p.amount), 0)::float8 AS amount
       FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.created_at >= $1 AND p.created_at < $2 AND ${REAL_R} GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    p
  );
  const test = await one(`SELECT count(*)::int AS payments, coalesce(sum(p.amount), 0)::float8 AS amount FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.paid_at >= $1 AND p.paid_at < $2 AND coalesce(r.is_test, false)`, p);
  const [advance, balance] = [await stage("ADVANCE"), await stage("BALANCE")];
  return {
    range: describe(r),
    advancePercent: config.paintings.advancePercent,
    requests: { requested: n(flow.requested), requestedValue: n(flow.requested_value), accepted: n(flow.accepted), declined: n(flow.declined), cancelled: n(flow.cancelled), delivered: n(flow.delivered) },
    // Where the requests made in the period stand today.
    byStatus: (await rows(`SELECT r.status, count(*)::int AS requests FROM painting_requests r WHERE r.created_at >= $1 AND r.created_at < $2 AND ${REAL_R} GROUP BY 1`, p)).map((x) => ({ status: x.status, requests: n(x.requests) })),
    payments: { advance, balance, collected: advance.amount + balance.amount },
    open: {
      waitingForArtist: n(open.waiting_artist),
      advanceDue: { requests: n(open.advance_due), amount: n(open.advance_due_amount) },
      balanceDue: { requests: n(open.balance_due), amount: n(open.balance_due_amount) },
      inProgress: n(open.in_progress),
      refundDue: { requests: n(open.refund_due), amount: n(open.refund_due_amount) }
    },
    refunds: { recorded: n(refunded.refunds), amount: n(refunded.amount) },
    attempts: attempts.map((x) => ({ provider: x.provider, stage: x.stage, status: x.status, attempts: n(x.attempts), amount: n(x.amount) })),
    test: { payments: n(test.payments), amount: n(test.amount) },
    series: seriesOf(r, {
      requests: await rows(`SELECT ${keySql("r.created_at", r)} AS k, count(*)::int AS n FROM painting_requests r WHERE r.created_at >= $1 AND r.created_at < $2 AND ${REAL_R} GROUP BY 1`, p),
      collected: await rows(`SELECT ${keySql("p.paid_at", r)} AS k, sum(p.amount)::float8 AS n FROM painting_payments p JOIN painting_requests r ON r.id = p.request_id WHERE p.paid_at >= $1 AND p.paid_at < $2 AND ${REAL_R} GROUP BY 1`, p)
    })
  };
}

/* ---------------------------------------------------------------- Accounts and logins */

export async function accounts(query) {
  const r = resolveRange(query);
  const p = [r.from, r.to];
  const { size, at, skip } = paging(query.page, query.limit, 100);
  const IN = "a.created_at >= $1 AND a.created_at < $2";
  const roles = await rows("SELECT role, count(*)::int AS accounts, count(*) FILTER (WHERE status = 'DISABLED')::int AS disabled, count(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS created FROM users GROUP BY 1", p);
  const logins = await one(
    `SELECT count(*) FILTER (WHERE a.kind = 'LOGIN')::int AS logins, count(DISTINCT a.user_id) FILTER (WHERE a.kind = 'LOGIN')::int AS accounts,
            count(*) FILTER (WHERE a.kind = 'LOGIN_FAILED')::int AS failed,
            count(*) FILTER (WHERE a.kind = 'LOGIN_FAILED' AND a.user_id IS NULL)::int AS failed_unknown,
            count(DISTINCT a.user_id) FILTER (WHERE a.kind = 'LOGIN_FAILED')::int AS failed_accounts
       FROM auth_events a WHERE ${IN}`,
    p
  );
  const failedTotal = n(logins.failed);
  const recent = await rows(
    `SELECT a.created_at, a.reason, a.account_type, a.ip, u.name, u.email, u.role
       FROM auth_events a LEFT JOIN users u ON u.id = a.user_id WHERE a.kind = 'LOGIN_FAILED' AND ${IN} ORDER BY a.created_at DESC LIMIT ${size} OFFSET ${skip}`,
    p
  );
  return {
    range: describe(r),
    roles: ["CUSTOMER", "SHOP", "ARTIST", "ADMIN"].map((role) => {
      const x = roles.find((y) => y.role === role) || {};
      return { role, accounts: n(x.accounts), disabled: n(x.disabled), created: n(x.created) };
    }),
    logins: { logins: n(logins.logins), accounts: n(logins.accounts), failed: failedTotal, failedUnknownAccount: n(logins.failed_unknown), failedAccounts: n(logins.failed_accounts) },
    failedByReason: (await rows(`SELECT coalesce(a.reason, 'OTHER') AS reason, count(*)::int AS attempts FROM auth_events a WHERE a.kind = 'LOGIN_FAILED' AND ${IN} GROUP BY 1 ORDER BY 2 DESC`, p)).map((x) => ({ reason: x.reason, attempts: n(x.attempts) })),
    // The accounts most often aimed at with a wrong password.
    failedByAccount: (
      await rows(`SELECT u.id, u.name, u.email, u.role, count(*)::int AS attempts, max(a.created_at) AS last FROM auth_events a JOIN users u ON u.id = a.user_id WHERE a.kind = 'LOGIN_FAILED' AND ${IN} GROUP BY u.id, u.name, u.email, u.role ORDER BY 5 DESC, 6 DESC LIMIT 10`, p)
    ).map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.role, attempts: n(x.attempts), last: x.last })),
    failed: {
      items: recent.map((x) => ({ at: x.created_at, reason: x.reason, form: x.account_type, ip: x.ip, account: x.email ? { name: x.name, email: x.email, role: x.role } : null })),
      total: failedTotal,
      page: at,
      limit: size
    },
    series: seriesOf(r, {
      registrations: await rows(`SELECT ${keySql("u.created_at", r)} AS k, count(*)::int AS n FROM users u WHERE u.role = 'CUSTOMER' AND u.created_at >= $1 AND u.created_at < $2 GROUP BY 1`, p),
      logins: await rows(`SELECT ${keySql("a.created_at", r)} AS k, count(*)::int AS n FROM auth_events a WHERE a.kind = 'LOGIN' AND ${IN} GROUP BY 1`, p),
      failed: await rows(`SELECT ${keySql("a.created_at", r)} AS k, count(*)::int AS n FROM auth_events a WHERE a.kind = 'LOGIN_FAILED' AND ${IN} GROUP BY 1`, p)
    })
  };
}

/** Who is on the site now (see analytics-service.js -> liveVisitors). null = visitor statistics are switched off. */
export const live = () => ({ visitors: config.analytics.enabled ? liveVisitors() : null, windowMinutes: LIVE_WINDOW_MS / 60_000, at: new Date().toISOString(), note: VISITOR_NOTE });
