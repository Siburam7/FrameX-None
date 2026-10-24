/* ==========================================================================
   /api/admin — everything here needs a logged-in user whose role, as stored
   in the database, is ADMIN (router.use below). There is no admin sign-up.
   ========================================================================== */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { isUuid, v, validate } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";
import * as analytics from "../services/admin-analytics-service.js";
import * as artists from "../services/artist-service.js";
import * as artworks from "../services/artwork-service.js";
import * as contact from "../services/contact-service.js";
import * as orders from "../services/order-service.js";
import * as paintings from "../services/painting-service.js";
import * as payments from "../services/payment-service.js";
import * as payouts from "../services/payout-service.js";
import * as reviews from "../services/review-service.js";
import * as settings from "../services/settings-service.js";
import * as coupons from "../services/coupon-service.js";
import * as shopProducts from "../services/shop-product-service.js";
import * as shops from "../services/shop-service.js";
import * as users from "../services/user-admin-service.js";
import * as support from "../services/support-service.js";
import * as care from "../services/care-service.js";
import * as edits from "../services/order-edit-service.js";
import { INDIAN_STATES, readAddress } from "../services/address-service.js";

const router = Router();
/* ---- Orders: admins and FrameX Care (owner, 2026-10-24: a care person changes an order when the customer asks in
   the chat). Everything else below stays admin-only; so does marking a test order and the WhatsApp list. ---- */
const staffOrders = Router();
staffOrders.use(requireRole("ADMIN", "CARE"));
staffOrders.get("/", async (req, res) => {
  const f = validate(req.query, {
    status: v.enumOf(orders.ORDER_STATUSES, { required: false }),
    paymentStatus: v.enumOf(orders.PAYMENT_STATUSES, { required: false }),
    q: v.string({ max: 80 }),
    page: v.number({ min: 1, max: 100000, required: false })
  });
  res.json(await orders.adminListOrders({ status: f.status, paymentStatus: f.paymentStatus, q: f.q, page: f.page || 1 }));
});

// The states an address may name (the address form on the order page)
staffOrders.get("/_/states", (req, res) => res.json({ states: INDIAN_STATES }));
staffOrders.get("/:orderNumber", async (req, res) => res.json({ order: await orders.adminGetOrder(req.params.orderNumber) }));

// Fulfilment by FrameX: a short-lived link to the customer's ORIGINAL photo of an order line (logged).
staffOrders.post("/:orderNumber/photos/:uploadId/link", async (req, res) => {
  res.json({ link: await orders.adminPhotoLink(req.params.orderNumber, req.params.uploadId, { actor: req.auth.user, ip: req.ip }) });
});

staffOrders.post("/:orderNumber/status", async (req, res) => {
  const { status, note } = validate(req.body, { status: v.enumOf(orders.ORDER_STATUSES.filter((s) => s !== "PENDING_PAYMENT" && s !== "PLACED"), { label: "Status" }), note: v.string({ max: 300, label: "Note" }) });
  const actor = req.auth.user;
  if (status === "CANCELLED") {
    const order = await orders.adminOrderRow(req.params.orderNumber);
    await payments.cancelOrder(order, { from: orders.ADMIN_CAN_CANCEL, reason: note || "Cancelled by FrameX.", actor, ip: req.ip });
    return res.json({ order: await orders.adminGetOrder(req.params.orderNumber) });
  }
  res.json({ order: await orders.adminAdvance(req.params.orderNumber, status, { note, actor, ip: req.ip }) });
});

// amount in whole rupees; leave it out to refund everything that is left.
staffOrders.post("/:orderNumber/refund", async (req, res) => {
  const { amount, reason } = validate(req.body, { amount: v.number({ min: 1, max: 10_000_000, required: false, label: "Amount" }), reason: v.string({ max: 200, label: "Reason" }) });
  if (amount !== null && amount !== undefined && !Number.isInteger(amount)) throw errors.validation({ amount: "Enter a whole number of rupees." });
  const order = await orders.adminOrderRow(req.params.orderNumber);
  await payments.refundPayment(order.id, { amount: amount ?? null, reason, actor: req.auth.user, ip: req.ip });
  res.json({ order: await orders.adminGetOrder(req.params.orderNumber) });
});


// Change a line's size (before the shop starts making it) / the delivery address (before it ships): services/order-edit-service.js
staffOrders.get("/:orderNumber/items/:itemId/sizes", async (req, res) => res.json(await edits.sizeOptions(req.params.orderNumber, req.params.itemId)));
staffOrders.post("/:orderNumber/items/:itemId/size", async (req, res) => {
  const { sizeId } = validate(req.body, { sizeId: v.string({ min: 1, max: 80, label: "Size" }) });
  res.json(await edits.changeSize(req.params.orderNumber, req.params.itemId, sizeId, { actor: req.auth.user, ip: req.ip }));
});
staffOrders.post("/:orderNumber/address", async (req, res) => res.json(await edits.changeAddress(req.params.orderNumber, readAddress(req.body), { actor: req.auth.user, ip: req.ip })));
router.use("/orders", staffOrders);

router.use(requireRole("ADMIN"));

const idParam = (req) => {
  if (!isUuid(req.params.id)) throw errors.notFound();
  return req.params.id;
};

/** Shop details an admin enters. `partial` (PATCH) validates only what was sent. */
function shopSpec({ partial = false, needLocation = true } = {}) {
  const spec = {
    name: v.string({ min: 2, max: 120, label: "Shop name" }),
    ownerName: v.string({ max: 80, label: "Owner name" }),
    email: v.email({ required: false }),
    phone: v.phone(),
    description: v.string({ max: 1000, label: "Description" }),
    addressLine1: v.string({ max: 200, label: "Address" }),
    area: v.string({ max: 120, label: "Area" }),
    city: v.string({ min: 2, max: 80, label: "City" }),
    state: v.string({ min: 2, max: 80, label: "State" }),
    postalCode: v.string({ min: 4, max: 10, label: "Postal code", pattern: /^[0-9A-Za-z -]+$/, patternMessage: "Enter a valid postal code." }),
    country: v.string({ max: 2, label: "Country", pattern: /^[A-Za-z]{2}$/, patternMessage: "Use a two-letter country code, e.g. IN." }),
    latitude: v.number({ min: -90, max: 90, required: needLocation, label: "Latitude" }),
    longitude: v.number({ min: -180, max: 180, required: needLocation, label: "Longitude" }),
    catalogRef: v.string({ max: 60, label: "Catalogue link", pattern: /^[A-Za-z0-9-]+$/, patternMessage: "Use letters, numbers and dashes only." }),
    fulfilment: v.listOf(shops.FULFILMENT, { label: "Pickup & delivery" })
  };
  if (!partial) return spec;
  return Object.fromEntries(Object.entries(spec).map(([k, rule]) => [k, v.optional(rule)]));
}

/** Real coordinates only: (0, 0) is the classic "left empty" mistake. */
function checkLocation(shop) {
  if (shop.latitude === 0 && shop.longitude === 0) throw errors.validation({ latitude: "Enter the shop's real coordinates.", longitude: "Enter the shop's real coordinates." });
  if (shop.country) shop.country = shop.country.toUpperCase();
  return shop;
}

router.get("/overview", async (req, res) => {
  const [base, orderCounts, artworkCounts, paintingCounts, artistApps, artistCount, unreadMessages, unreadChats] = await Promise.all([
    shops.adminOverview(),
    orders.adminOrderCounts(),
    artworks.adminCounts(),
    paintings.adminCounts(),
    artists.adminListApplications({ status: "PENDING" }),
    artists.adminListArtists({}),
    contact.unreadCount(),
    support.adminUnread()
  ]);
  res.json({ ...base, orders: orderCounts, artists: { total: artistCount.length, active: artistCount.filter((a) => a.status === "ACTIVE").length, applicationsPending: artistApps.length }, artworks: artworkCounts, paintings: paintingCounts, messages: { unread: unreadMessages }, chats: { unread: unreadChats } });
});

/* ---- Orders ----
   Moving an order forward, cancelling it (a paid online order is refunded) and refunds.
   Cash on Delivery becomes PAID when the order is marked DELIVERED. */
// Orders still under way, with the customer's phone: the admin sends each one its status on WhatsApp (the admin's own app).
router.get("/order-updates", async (req, res) => res.json(await orders.adminActiveOrders()));

// Mark an order as a test (it is then kept out of sales), or take the mark away. Written to the audit log.
router.post("/orders/:orderNumber/test", async (req, res) => {
  const { test, note } = validate(req.body, { test: v.boolean(), note: v.string({ max: 200, label: "Note" }) });
  res.json({ order: await orders.adminSetTest(req.params.orderNumber, { test, note }, { actor: req.auth.user, ip: req.ip }) });
});

/* ---- Analytics ----
   Reports for one period: ?range=today|7d|30d|90d, or ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
   Money and orders come from the database's verified records, never from what a browser reported
   (services/admin-analytics-service.js says where each figure comes from). */
const period = (req) => validate(req.query, { range: v.enumOf(analytics.RANGES, { required: false }), from: v.string({ max: 10 }), to: v.string({ max: 10 }), page: v.number({ min: 1, max: 100000, required: false }) });
const report = (name) => async (req, res) => {
  const q = period(req);
  res.json(await analytics[name]({ range: q.range || "30d", from: q.from, to: q.to, page: q.page || 1 }));
};
router.get("/analytics/overview", report("overview"));
router.get("/analytics/traffic", report("traffic"));
router.get("/analytics/sales", report("sales"));
router.get("/analytics/catalog", report("catalog"));
router.get("/analytics/sellers", report("sellers"));
router.get("/analytics/paintings", report("paintings"));
router.get("/analytics/accounts", report("accounts"));
router.get("/analytics/live", (req, res) => res.json(analytics.live()));

/* ---- Products shops created ----
   Shops manage their own catalogue. FrameX keeps the last word: approve a product
   waiting for review (PRODUCT_MODERATION=true), or take any product off sale. */
router.get("/products", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["draft", "pending_review", "published", "unpublished"], { required: false }) });
  res.json({ items: await shopProducts.adminList({ status }) });
});

router.post("/products/:id/listing", async (req, res) => {
  const { status, note } = validate(req.body, { status: v.enumOf(["published", "unpublished"], { label: "Status" }), note: v.string({ max: 300, label: "Note" }) });
  if (!shopProducts.PRODUCT_ID.test(String(req.params.id))) throw errors.notFound("We couldn't find that product.", "PRODUCT_NOT_FOUND");
  res.json({ product: await shopProducts.adminSetListing(req.params.id, status, { actor: req.auth.user, ip: req.ip, note }) });
});

/* ---- Applications ---- */
router.get("/applications", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"], { required: false }) });
  res.json({ items: await shops.adminListApplications({ status }) });
});

router.get("/applications/:id", async (req, res) => res.json({ application: await shops.adminGetApplication(idParam(req)) }));

router.post("/applications/:id/review", async (req, res) => {
  const { note } = validate(req.body, { note: v.string({ max: 500 }) });
  res.json({ application: await shops.adminMarkUnderReview(idParam(req), note, req.auth.user, req.ip) });
});

router.post("/applications/:id/reject", async (req, res) => {
  const { reason } = validate(req.body, { reason: v.string({ max: 500, label: "Reason" }) });
  res.json({ application: await shops.adminRejectApplication(idParam(req), reason, req.auth.user, req.ip) });
});

// Approve = create the shop (with its location), its Shop ID and its login in one step.
router.post("/applications/:id/approve", async (req, res) => {
  const shop = checkLocation(validate(req.body && req.body.shop, shopSpec()));
  const account = validate(req.body, { accountEmail: v.email(), accountName: v.string({ max: 80 }), activate: v.boolean({ fallback: true }) });
  res.status(201).json(await shops.adminApproveApplication(idParam(req), { shop, ...account }, req.auth.user, req.ip));
});

/* ---- Shops ---- */
router.get("/shops", async (req, res) => {
  const { status, q } = validate(req.query, { status: v.enumOf(["PENDING", "APPROVED", "ACTIVE", "INACTIVE", "REJECTED"], { required: false }), q: v.string({ max: 80 }) });
  res.json({ items: await shops.adminListShops({ status, q }) });
});

router.post("/shops", async (req, res) => {
  const options = validate(req.body, { accountEmail: v.email({ required: false }), accountName: v.string({ max: 80 }), approve: v.boolean({ fallback: true }), activate: v.boolean({ fallback: true }) });
  const shop = checkLocation(validate(req.body && req.body.shop, shopSpec({ needLocation: options.approve })));
  res.status(201).json(await shops.adminCreateShop({ shop, ...options }, req.auth.user, req.ip));
});

router.get("/shops/:id", async (req, res) => res.json({ shop: await shops.adminGetShop(idParam(req)) }));

router.patch("/shops/:id", async (req, res) => {
  const changes = checkLocation(validate(req.body, shopSpec({ partial: true, needLocation: false })));
  res.json({ shop: await shops.adminUpdateShop(idParam(req), changes, req.auth.user, req.ip) });
});

router.post("/shops/:id/approval", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["PENDING", "APPROVED", "REJECTED"], { label: "Status" }) });
  res.json({ shop: await shops.adminSetApproval(idParam(req), status, req.auth.user, req.ip) });
});

router.post("/shops/:id/activate", async (req, res) => res.json({ shop: await shops.adminSetActive(idParam(req), true, req.auth.user, req.ip) }));
router.post("/shops/:id/deactivate", async (req, res) => res.json({ shop: await shops.adminSetActive(idParam(req), false, req.auth.user, req.ip) }));

// Feature a shop (e.g. a paid promotion): first in the shop lists without a location, with a "Featured" label.
router.post("/shops/:id/featured", async (req, res) => {
  const { featured, until } = validate(req.body, {
    featured: v.boolean(),
    until: v.string({ max: 10, label: "Until", pattern: /^(\d{4}-\d{2}-\d{2})?$/, patternMessage: "Enter a date like 2026-12-31." })
  });
  res.json({ shop: await shops.adminSetFeatured(idParam(req), { featured, until }, req.auth.user, req.ip) });
});

// Create the shop's login, or send a fresh one-time link. The password is chosen by the shop, never by the admin.
router.post("/shops/:id/credentials", async (req, res) => {
  const data = validate(req.body, { accountEmail: v.email({ required: false }), accountName: v.string({ max: 80 }) });
  res.status(201).json({ credentials: await shops.adminIssueCredentials(idParam(req), data, req.auth.user, req.ip) });
});

router.post("/shops/:id/account", async (req, res) => {
  const { enabled } = validate(req.body, { enabled: v.boolean() });
  res.json({ shop: await shops.adminSetAccountStatus(idParam(req), enabled, req.auth.user, req.ip) });
});

/* ---- Artists ----
   Like shops: someone applies, an admin approves, and that creates the artist and a login
   that is finished through a one-time link. There is no public artist sign-up. */
function artistSpec({ partial = false } = {}) {
  const spec = {
    name: v.string({ min: 2, max: 80, label: "Artist name" }),
    username: v.string({ max: 30, label: "Username", pattern: /^@?[A-Za-z0-9][A-Za-z0-9_.]{2,29}$/, patternMessage: "Use 3 to 30 letters, numbers, dots or underscores." }),
    bio: v.string({ max: 2000, label: "About" }),
    experience: v.string({ max: 300, label: "Experience" }),
    city: v.string({ min: 2, max: 80, label: "City" }),
    area: v.string({ max: 120, label: "Area" }),
    state: v.string({ min: 2, max: 80, label: "State" }),
    email: v.email({ required: false }),
    phone: v.phone()
  };
  return partial ? Object.fromEntries(Object.entries(spec).map(([k, rule]) => [k, v.optional(rule)])) : spec;
}
const artistLists = (body) => Object.fromEntries(["specialties", "mediums", "styles"].filter((k) => body && body[k] !== undefined).map((k) => [k, body[k]]));

router.get("/artist-applications", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["PENDING", "APPROVED", "REJECTED"], { required: false }) });
  res.json({ items: await artists.adminListApplications({ status }) });
});
router.post("/artist-applications/:id/approve", async (req, res) => {
  const artist = { ...validate(req.body && req.body.artist, artistSpec()), ...artistLists(req.body && req.body.artist) };
  const account = validate(req.body, { accountEmail: v.email(), accountName: v.string({ max: 80 }) });
  res.status(201).json(await artists.adminApproveApplication(idParam(req), { artist, ...account }, req.auth.user, req.ip));
});
router.post("/artist-applications/:id/reject", async (req, res) => {
  const { reason } = validate(req.body, { reason: v.string({ max: 500, label: "Reason" }) });
  res.json({ application: await artists.adminRejectApplication(idParam(req), reason, req.auth.user, req.ip) });
});

router.get("/artists", async (req, res) => {
  const { status, q } = validate(req.query, { status: v.enumOf(["ACTIVE", "INACTIVE"], { required: false }), q: v.string({ max: 80 }) });
  res.json({ items: await artists.adminListArtists({ status, q }) });
});
router.post("/artists", async (req, res) => {
  const artist = { ...validate(req.body && req.body.artist, artistSpec()), ...artistLists(req.body && req.body.artist), isDemo: Boolean(req.body && req.body.artist && req.body.artist.isDemo) };
  const account = validate(req.body, { accountEmail: v.email({ required: false }), accountName: v.string({ max: 80 }) });
  res.status(201).json(await artists.adminCreateArtist({ artist, ...account }, req.auth.user, req.ip));
});
router.get("/artists/:id", async (req, res) => res.json({ artist: await artists.adminGetArtist(idParam(req)) }));
router.patch("/artists/:id", async (req, res) => {
  const changes = { ...validate(req.body, artistSpec({ partial: true })), ...artistLists(req.body) };
  for (const key of ["showArea", "customEnabled"]) if (req.body && req.body[key] !== undefined) changes[key] = Boolean(req.body[key]);
  res.json({ artist: await artists.updateProfile(idParam(req), changes, { actor: req.auth.user, ip: req.ip, byAdmin: true }) });
});
router.post("/artists/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["ACTIVE", "INACTIVE"], { label: "Status" }) });
  res.json({ artist: await artists.adminSetStatus(idParam(req), status, req.auth.user, req.ip) });
});
// Create the artist's login, or send a fresh one-time link. The password is chosen by the artist, never by the admin.
router.post("/artists/:id/credentials", async (req, res) => {
  const data = validate(req.body, { accountEmail: v.email({ required: false }), accountName: v.string({ max: 80 }) });
  res.status(201).json({ credentials: await artists.adminIssueCredentials(idParam(req), data, req.auth.user, req.ip) });
});

/* ---- Artworks ----
   Nothing an artist adds is public until an admin approves it here. */
router.get("/artworks", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(artworks.ARTWORK_STATUSES, { required: false }) });
  res.json({ items: await artworks.adminList({ status }), counts: await artworks.adminCounts() });
});
router.post("/artworks/:id/review", async (req, res) => {
  const data = validate(req.body, { decision: v.enumOf(["APPROVED", "REJECTED"], { label: "Decision" }), reason: v.string({ max: 500, label: "Reason" }) });
  res.json({ artwork: await artworks.adminReview(req.params.id, data, { actor: req.auth.user, ip: req.ip }) });
});
router.post("/artworks/:id/visible", async (req, res) => {
  const { visible } = validate(req.body, { visible: v.boolean() });
  res.json({ artwork: await artworks.adminSetVisible(req.params.id, visible, { actor: req.auth.user, ip: req.ip }) });
});

/* ---- Custom paintings ---- */
router.get("/paintings", async (req, res) => {
  const f = validate(req.query, { status: v.enumOf(paintings.STATUSES, { required: false }), q: v.string({ max: 80 }), page: v.number({ min: 1, max: 100000, required: false }) });
  res.json({ ...(await paintings.adminList({ status: f.status, q: f.q, page: f.page || 1 })), counts: await paintings.adminCounts() });
});
router.get("/paintings/:number", async (req, res) => res.json({ request: await paintings.adminGet(req.params.number) }));
router.post("/paintings/:number/cancel", async (req, res) => {
  const { reason } = validate(req.body, { reason: v.string({ min: 3, max: 300, label: "Reason" }) });
  res.json({ request: await paintings.adminCancel(req.params.number, reason, { actor: req.auth.user, ip: req.ip }) });
});
// Records that a refund was made by hand. It moves no money.
router.post("/paintings/:number/refund-recorded", async (req, res) => {
  const { note } = validate(req.body, { note: v.string({ min: 3, max: 300, label: "Note" }) });
  res.json({ request: await paintings.adminRecordRefund(req.params.number, note, { actor: req.auth.user, ip: req.ip }) });
});
router.post("/paintings/:number/delivered", async (req, res) => res.json({ request: await paintings.adminMarkDelivered(req.params.number, { actor: req.auth.user, ip: req.ip }) }));

/* ---- Platform settings ---- */
router.get("/settings", async (req, res) => res.json({ items: await settings.listSettings() }));
// { key: value } for the settings to change; null puts a setting back to the server's default.
router.patch("/settings", async (req, res) => res.json({ items: await settings.updateSettings(req.body, { actor: req.auth.user, ip: req.ip }) }));

/* ---- Coupons ---- */
// Every coupon with how many orders used it and how much it took off. No delete: a coupon is switched off (orders refer to it).
router.get("/coupons", async (req, res) => res.json({ items: await coupons.adminList() }));
// { code, title, percentOff, minOrder?, maxDiscount?, perUserLimit?, startsOn?, endsOn?, active? } (dates YYYY-MM-DD, India time)
router.post("/coupons", async (req, res) => res.status(201).json({ coupon: await coupons.adminCreate(req.body, { actor: req.auth.user, ip: req.ip }) }));
// Only the fields sent; null / "" = no limit or no date
router.patch("/coupons/:code", async (req, res) => res.json({ coupon: await coupons.adminUpdate(req.params.code, req.body, { actor: req.auth.user, ip: req.ip }) }));

/* ---- Reviews ---- */
router.get("/reviews", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["PUBLISHED", "HIDDEN"], { required: false }) });
  res.json({ items: await reviews.adminList({ status }) });
});
router.post("/reviews/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["PUBLISHED", "HIDDEN"], { label: "Status" }) });
  res.json({ review: await reviews.adminSetStatus(idParam(req), status, { actor: req.auth.user, ip: req.ip }) });
});

/* ---- Messages from the Contact page ---- */
router.get("/messages", async (req, res) => {
  const f = validate(req.query, { status: v.enumOf(["NEW", "READ"], { required: false }), page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 50, required: false }) });
  res.json(await contact.adminList({ status: f.status || "", page: f.page || 1, limit: f.limit || 20 }));
});
router.post("/messages/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["NEW", "READ"], { label: "Status" }) });
  res.json({ message: await contact.adminSetStatus(idParam(req), status) });
});
router.delete("/messages/:id", async (req, res) => res.json(await contact.adminDelete(idParam(req), { actor: req.auth.user, ip: req.ip })));

/* ---- The help chat (customers write from any page; FrameX answers here) ---- */
// Admin -> Care team: FrameX Care logins (CARE role). They open the admin panel with only Live chats (/api/care) and Orders (staffOrders above).
router.get("/care-team", async (req, res) => res.json(await care.team()));
router.post("/care-team", async (req, res) => {
  const data = validate(req.body, {
    name: v.string({ min: 2, max: 30, label: "First name", pattern: /^[\p{L}][\p{L} .'-]*$/u, patternMessage: "Use letters only." }),
    email: v.email(),
    password: v.password()
  });
  res.status(201).json(await care.createMember({ name: data.name.trim(), email: data.email, password: data.password }, { actor: req.auth.user, ip: req.ip }));
});
router.patch("/care-team/:id", async (req, res) => {
  const body = req.body || {};
  const data = validate(body, {
    name: v.optional(v.string({ min: 2, max: 30, label: "First name", pattern: /^[\p{L}][\p{L} .'-]*$/u, patternMessage: "Use letters only." })),
    password: v.optional(v.password())
  });
  const active = typeof body.active === "boolean" ? body.active : undefined;
  res.json(await care.updateMember(req.params.id, { name: data.name ? data.name.trim() : "", active, password: data.password || "" }, { actor: req.auth.user, ip: req.ip }));
});

router.get("/support", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["OPEN", "CLOSED"], { required: false }) });
  res.json(await support.adminList({ status: status || "" }));
});
router.get("/support/:id", async (req, res) => res.json({ thread: await support.adminGet(idParam(req)) }));
router.post("/support/:id/reply", async (req, res) => {
  const { body } = validate(req.body, { body: v.string({ min: 1, max: 2000, label: "Answer" }) });
  res.json({ thread: await support.adminReply(idParam(req), body.trim(), { actor: req.auth.user, ip: req.ip }) });
});
router.post("/support/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["OPEN", "CLOSED"], { label: "Status" }) });
  res.json({ thread: await support.adminSetStatus(idParam(req), status, { actor: req.auth.user, ip: req.ip }) });
});

/* ---- Accounts ---- */
router.get("/users", async (req, res) => {
  const f = validate(req.query, { q: v.string({ max: 80 }), role: v.enumOf(users.ROLES, { required: false }), page: v.number({ min: 1, max: 100000, required: false }) });
  res.json(await users.listUsers({ q: f.q, role: f.role, page: f.page || 1 }));
});
// One account with its contact details, saved addresses and order history (ten orders a page).
router.get("/users/:id", async (req, res) => {
  const { page } = validate(req.query, { page: v.number({ min: 1, max: 100000, required: false }) });
  res.json(await users.getUser(idParam(req), { page: page || 1, actor: req.auth.user, ip: req.ip }));
});
router.post("/users/:id/status", async (req, res) => {
  const { enabled } = validate(req.body, { enabled: v.boolean() });
  res.json({ user: await users.setEnabled(idParam(req), enabled, { actor: req.auth.user, ip: req.ip }) });
});

/* ---- Payouts to shops and artists ---- */
// Who is owed what now, and the last payouts made.
router.get("/payouts", async (req, res) => res.json(await payouts.adminOverview()));
// One seller: what is due order by order, their FULL payout account (the look is logged), their payouts.
router.get("/payouts/:type/:id", async (req, res) => res.json(await payouts.adminSeller(req.params.type, req.params.id, { actor: req.auth.user, ip: req.ip })));
// FrameX has paid them (outside the site): record it with the bank's reference.
router.post("/payouts/:type/:id", async (req, res) => res.status(201).json(await payouts.adminRecord(req.params.type, req.params.id, req.body, { actor: req.auth.user, ip: req.ip })));

router.get("/audit", async (req, res) => {
  const { limit } = validate(req.query, { limit: v.number({ min: 1, max: 500, required: false }) });
  res.json({ items: await shops.adminAuditLog({ limit: limit || 100 }) });
});

export default router;
