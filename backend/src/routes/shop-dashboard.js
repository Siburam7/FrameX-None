/* ==========================================================================
   /api/shops/:shopCode/…  — a shop's own work: its orders and its products.

   Every route here needs a logged-in SHOP user whose own Shop ID is the one in
   the address (requireOwnShop). The shop a request acts for is then taken from
   the session, never from the address or the body, so changing the Shop ID in
   the address to another shop's is refused before anything is read.

     Orders (fulfilment)
       GET   /:shopCode/orders                       the shop's orders
       GET   /:shopCode/orders/:orderNumber          one order: the shop's own lines only
       PATCH /:shopCode/orders/:orderNumber/items/:itemId     where the shop is with a line
       POST  /:shopCode/orders/:orderNumber/photos/:uploadId/link
                                                     a short-lived link to the customer's original photo

     Products (the shop's own catalogue)
       GET    /:shopCode/products                    every product the shop created, any status
       GET    /:shopCode/products/:id
       PUT    /:shopCode/products/:id                create or change (the body is the product record)
       DELETE /:shopCode/products/:id
       POST   /:shopCode/media                       upload a product picture (raw bytes)
       POST   /:shopCode/media/:id/thumb             its small copy
   ========================================================================== */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { isUuid, v, validate } from "../lib/validate.js";
import { requireOwnShop } from "../middleware/auth.js";
import { FULFILMENT_STATUSES } from "../services/order-service.js";
import * as shopOrders from "../services/shop-order-service.js";
import * as products from "../services/shop-product-service.js";

const router = Router();
const who = (req) => ({ actor: req.auth.user, ip: req.ip });

/* ---- Orders ---- */

router.get("/:shopCode/orders", requireOwnShop, async (req, res) => {
  const { filter, page } = validate(req.query, { filter: v.enumOf(["open", "done"], { required: false }), page: v.number({ min: 1, max: 100000, required: false }) });
  res.json(await shopOrders.listOrders(await shopOrders.shopContext(req.auth.user.shopId), { filter, page: page || 1 }));
});

router.get("/:shopCode/orders/:orderNumber", requireOwnShop, async (req, res) => {
  res.json({ order: await shopOrders.getOrder(await shopOrders.shopContext(req.auth.user.shopId), req.params.orderNumber) });
});

router.patch("/:shopCode/orders/:orderNumber/items/:itemId", requireOwnShop, async (req, res) => {
  if (!isUuid(req.params.itemId)) throw errors.notFound("That item isn't one of your shop's items in this order.", "ORDER_ITEM_NOT_FOUND");
  const data = validate(req.body, { status: v.enumOf(FULFILMENT_STATUSES, { label: "Step" }), note: v.string({ max: 200, label: "Note" }) });
  res.json({ order: await shopOrders.setFulfilment(await shopOrders.shopContext(req.auth.user.shopId), req.params.orderNumber, req.params.itemId, data, who(req)) });
});

router.post("/:shopCode/orders/:orderNumber/photos/:uploadId/link", requireOwnShop, rateLimit("file-link", { windowMs: 60_000, max: 120 }), async (req, res) => {
  res.json({ link: await shopOrders.photoLink(await shopOrders.shopContext(req.auth.user.shopId), req.params.orderNumber, req.params.uploadId, who(req)) });
});

/* ---- Products ---- */

router.get("/:shopCode/products", requireOwnShop, async (req, res) => {
  res.json({ items: await products.listOwn(await products.shopForProducts(req.auth.user.shopId)) });
});

router.get("/:shopCode/products/:id", requireOwnShop, async (req, res) => {
  res.json({ product: await products.getOwn(await products.shopForProducts(req.auth.user.shopId), req.params.id) });
});

router.put("/:shopCode/products/:id", requireOwnShop, rateLimit("product-save", { windowMs: 60_000, max: 120 }), async (req, res) => {
  res.json({ product: await products.saveOwn(await products.shopForProducts(req.auth.user.shopId), req.params.id, req.body, who(req)) });
});

router.delete("/:shopCode/products/:id", requireOwnShop, async (req, res) => {
  await products.deleteOwn(await products.shopForProducts(req.auth.user.shopId), req.params.id, who(req));
  res.json({ ok: true });
});

router.post("/:shopCode/media", requireOwnShop, rateLimit("media", { windowMs: 10 * 60_000, max: 300 }), async (req, res) => {
  res.status(201).json({ media: await products.receiveMedia(await products.shopForProducts(req.auth.user.shopId), req.auth.user, req) });
});

router.post("/:shopCode/media/:id/thumb", requireOwnShop, rateLimit("media", { windowMs: 10 * 60_000, max: 300 }), async (req, res) => {
  res.status(201).json({ media: await products.receiveMedia(await products.shopForProducts(req.auth.user.shopId), req.auth.user, req, { thumbOf: req.params.id }) });
});

export default router;

/** GET /api/catalog/shop-products — public: what listed shops have on sale (the website adds it to its catalogue). */
export const catalogRoutes = Router();
catalogRoutes.get("/shop-products", async (req, res) => res.json({ items: await products.publicShopProducts() }));
