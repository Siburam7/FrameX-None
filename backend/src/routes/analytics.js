/* ==========================================================================
   /api/analytics — where the website sends visitor statistics.

   Public (a visitor needs no account), so it is strict instead:
     - a batch is stored only when it says the visitor allowed analytics;
     - only known event names and field shapes are kept (analytics-service.js);
     - the usual CSRF rule applies (the X-FrameX-Client header, an allowed origin);
     - it is rate limited per address, and the address itself is never stored.
   It answers 202 whatever happened, so the website never waits on it or
   retries it: statistics are not worth a second request.
   ========================================================================== */
import { Router } from "express";
import { config } from "../config.js";
import { rateLimit } from "../lib/rate-limit.js";
import { recordWebEvents } from "../services/analytics-service.js";

const router = Router();

const host = (value) => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** This website's own hosts: a visit that "comes from" one of them did not come from anywhere. */
const ownHosts = (req) => [...new Set([req.headers.host, req.headers.origin, config.frontendUrl, ...config.corsOrigins].filter(Boolean).map(host).filter(Boolean))];

router.post("/events", rateLimit("analytics", { windowMs: 60_000, max: 120 }), async (req, res) => {
  const result = await recordWebEvents(req.body, { userAgent: String(req.headers["user-agent"] || ""), ownHosts: ownHosts(req), user: req.auth ? req.auth.user : null });
  res.status(202).json(result);
});

export default router;
