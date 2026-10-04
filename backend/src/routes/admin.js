/* ==========================================================================
   /api/admin — everything here needs a logged-in user whose role, as stored
   in the database, is ADMIN (router.use below). There is no admin sign-up.
   ========================================================================== */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { isUuid, v, validate } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";
import * as shops from "../services/shop-service.js";

const router = Router();
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

router.get("/overview", async (req, res) => res.json(await shops.adminOverview()));

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

// Create the shop's login, or send a fresh one-time link. The password is chosen by the shop, never by the admin.
router.post("/shops/:id/credentials", async (req, res) => {
  const data = validate(req.body, { accountEmail: v.email({ required: false }), accountName: v.string({ max: 80 }) });
  res.status(201).json({ credentials: await shops.adminIssueCredentials(idParam(req), data, req.auth.user, req.ip) });
});

router.post("/shops/:id/account", async (req, res) => {
  const { enabled } = validate(req.body, { enabled: v.boolean() });
  res.json({ shop: await shops.adminSetAccountStatus(idParam(req), enabled, req.auth.user, req.ip) });
});

router.get("/audit", async (req, res) => {
  const { limit } = validate(req.query, { limit: v.number({ min: 1, max: 500, required: false }) });
  res.json({ items: await shops.adminAuditLog({ limit: limit || 100 }) });
});

export default router;
