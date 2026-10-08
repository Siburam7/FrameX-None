/* ==========================================================================
   /api/shops
     Public:  GET /            listed shops (approved + active)
              GET /nearby      shops within a radius of a point, with distance
              GET /:ref        one listed shop (Shop ID or catalogue reference)
              POST /applications   "Partner with FrameX" request (no login is created)
     Shop:    GET   /:shopCode/dashboard   the logged-in shop's own data
              PATCH /:shopCode/profile     fields a shop may edit itself
   ========================================================================== */
import { Router } from "express";
import { config } from "../config.js";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";
import { requireOwnShop } from "../middleware/auth.js";
import * as shops from "../services/shop-service.js";

const router = Router();
const MINUTE = 60_000;

const point = (query, required) =>
  validate(query, {
    lat: v.number({ min: -90, max: 90, required, label: "Latitude" }),
    lng: v.number({ min: -180, max: 180, required, label: "Longitude" })
  });

router.get("/", async (req, res) => {
  const { q, page, limit } = validate(req.query, {
    q: v.string({ max: 80 }),
    page: v.number({ min: 1, max: 1000, required: false }),
    limit: v.number({ min: 1, max: 100, required: false })
  });
  const { lat, lng } = point(req.query, false);
  const hasPoint = lat !== null && lng !== null;
  res.json(await shops.listPublicShops({ q, lat: hasPoint ? lat : null, lng: hasPoint ? lng : null, page: page || 1, limit: limit || 20 }));
});

// GET /api/shops/nearby?lat=20.66&lng=85.6&radius=25
router.get("/nearby", rateLimit("nearby", { windowMs: MINUTE, max: 60 }), async (req, res) => {
  const { lat, lng } = point(req.query, true);
  const { radius, limit } = validate(req.query, {
    radius: v.number({ min: 0.5, max: config.nearby.maxRadiusKm, required: false, label: "Radius" }),
    limit: v.number({ min: 1, max: config.nearby.maxResults, required: false })
  });
  const radiusKm = radius || config.nearby.defaultRadiusKm;
  const items = await shops.nearbyShops({ lat, lng, radiusKm, limit: limit || config.nearby.maxResults });
  res.json({ origin: { latitude: lat, longitude: lng }, radiusKm, unit: "km", measure: "straight-line", total: items.length, items });
});

// Stores a request for FrameX to review. The applicant gets NO account from this.
router.post("/applications", rateLimit("applications", { windowMs: 60 * MINUTE, max: 5 }), async (req, res) => {
  const data = validate(req.body, {
    shopName: v.string({ min: 2, max: 120, label: "Shop name" }),
    ownerName: v.string({ min: 2, max: 80, label: "Owner name" }),
    phone: v.phone({ required: true }),
    email: v.email(),
    address: v.string({ min: 5, max: 300, label: "Shop address" }),
    city: v.string({ min: 2, max: 80, label: "City" }),
    state: v.string({ min: 2, max: 80, label: "State" }),
    postalCode: v.string({ min: 4, max: 10, label: "Postal code", pattern: /^[0-9A-Za-z -]+$/, patternMessage: "Enter a valid postal code." }),
    businessDetails: v.string({ max: 1000, label: "Business details" }),
    message: v.string({ max: 1000, label: "Message" })
  });
  const application = await shops.submitApplication(data, req.ip);
  res.status(201).json({ application, message: "Thanks! FrameX will review your shop and contact you. You'll receive login details only if it's approved." });
});

/* ---- The shop's own data: SHOP role AND :shopCode must be their own shop ---- */

router.get("/:shopCode/dashboard", requireOwnShop, async (req, res) => {
  res.json({ shop: await shops.ownShop(req.auth.user.shopId) });
});

router.patch("/:shopCode/profile", requireOwnShop, async (req, res) => {
  const data = validate(req.body, {
    phone: v.optional(v.phone()),
    description: v.optional(v.string({ max: 1000, label: "Description" })),
    fulfilment: v.optional(v.listOf(shops.FULFILMENT, { label: "Pickup & delivery" })),
    giftWrap: v.optional(v.boolean())
  });
  res.json({ shop: await shops.updateOwnShop(req.auth.user.shopId, data, req.auth.user, req.ip) });
});

router.get("/:ref", async (req, res) => {
  const shop = await shops.getPublicShop(String(req.params.ref).slice(0, 80));
  if (!shop) throw errors.notFound("That shop doesn't exist or is no longer listed.");
  res.json({ shop });
});

export default router;
