/* ==========================================================================
   /api/uploads — a logged-in customer's own photos.

     POST   /            send one photo. The request body is the file itself
                         (its raw bytes, not a form):
                           Content-Type: image/jpeg | image/png | image/webp
                           X-File-Name:  the file's name, URL-encoded
                         The server reads the real format and pixel size from
                         the bytes and stores the file unchanged.
     GET    /:id         what the server knows about one of your photos
     POST   /:id/link    a short-lived link to see or download it
     DELETE /:id         remove a photo that no cart line or order uses

   /api/files/<token>    the file a signed link points at (no session needed:
                         the token is the proof, and it expires in minutes)

   A photo id only ever works for the account that uploaded it. Access for
   FrameX staff and shops goes through the order it belongs to (routes/admin.js,
   routes/shop-orders.js), never through these routes.
   ========================================================================== */
import { Router } from "express";
import { rateLimit } from "../lib/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import * as uploads from "../services/upload-service.js";

const router = Router();
router.use(requireAuth);

router.post("/", rateLimit("upload", { windowMs: 10 * 60_000, max: 120 }), async (req, res) => {
  const row = await uploads.receiveUpload(req.auth.user, req);
  res.status(201).json({ upload: uploads.publicUpload(row) });
});

router.get("/:id", async (req, res) => res.json({ upload: uploads.publicUpload(await uploads.ownUpload(req.auth.user.id, req.params.id)) }));

router.post("/:id/link", rateLimit("file-link", { windowMs: 60_000, max: 120 }), async (req, res) => {
  const row = await uploads.ownUpload(req.auth.user.id, req.params.id);
  res.json({ link: uploads.linkTo(row, { download: Boolean(req.body && req.body.download) }) });
});

router.delete("/:id", async (req, res) => {
  await uploads.deleteOwnUpload(req.auth.user.id, req.params.id);
  res.json({ ok: true });
});

export default router;

/** GET /api/files/:token */
export const fileRoutes = Router();
fileRoutes.get("/:token", rateLimit("file", { windowMs: 60_000, max: 240 }), uploads.sendLinkedFile);
