/* /api/care — the FrameX Care desk (admin panel -> Live chats): care people (CARE role) and admins.
   services/care-service.js (live chats) and services/support-service.js (the conversations).

     GET  /stream                    live connection: new requests, messages, typing, chats taken / ended
     GET  /queue                     waiting requests, my live chats, other live chats, messages left
     POST /presence                  { available } "Available" / "Away"
     GET  /threads?status=           all conversations (OPEN | CLOSED | "")
     GET  /threads/:id               one conversation (marks it read)
     POST /threads/:id/accept        take a waiting request
     POST /threads/:id/reply         { body }
     POST /threads/:id/typing
     POST /threads/:id/end           end a live chat
     POST /threads/:id/status        { status: OPEN | CLOSED } */
import { Router } from "express";
import { addStaff, openStream } from "../lib/live-bus.js";
import { v, validate } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";
import * as care from "../services/care-service.js";
import * as support from "../services/support-service.js";

const router = Router();
router.use(requireRole("CARE", "ADMIN"));

router.get("/stream", async (req, res) => {
  const available = await care.isAvailable(req.auth.user.id);
  openStream(req, res, (r) => addStaff(req.auth.user, r, available));
});
router.get("/queue", async (req, res) => res.json(await care.queue(req.auth.user)));
router.post("/presence", async (req, res) => {
  const { available } = validate(req.body, { available: v.boolean() });
  res.json(await care.setPresence(req.auth.user, available));
});
router.get("/threads", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(["OPEN", "CLOSED"], { required: false, label: "Status" }) });
  res.json(await support.adminList({ status: status || "" }));
});
router.get("/threads/:id", async (req, res) => res.json({ thread: await support.adminGet(req.params.id) }));
router.post("/threads/:id/accept", async (req, res) => res.json({ thread: await care.acceptLive(req.params.id, req.auth.user) }));
router.post("/threads/:id/reply", async (req, res) => {
  const { body } = validate(req.body, { body: v.string({ min: 1, max: 2000, label: "Answer" }) });
  res.json({ thread: await support.adminReply(req.params.id, body.trim(), { actor: req.auth.user, ip: req.ip }) });
});
router.post("/threads/:id/typing", async (req, res) => res.json(await care.staffTyping(req.params.id, req.auth.user)));
router.post("/threads/:id/end", async (req, res) => res.json({ thread: await care.staffEnd(req.params.id, req.auth.user) }));
router.post("/threads/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["OPEN", "CLOSED"], { label: "Status" }) });
  res.json({ thread: await support.adminSetStatus(req.params.id, status, { actor: req.auth.user, ip: req.ip }) });
});

export default router;
