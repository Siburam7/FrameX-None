/* ==========================================================================
   Rate limiting (fixed window, in memory).
   Enough for one server instance. With several instances behind a load
   balancer, move the counters to a shared store (Redis) — only this file changes.
   ========================================================================== */
import { config } from "../config.js";
import { errors } from "./errors.js";

const buckets = new Map(); // "name:key" -> { count, resetAt }

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

/** Count one hit; throws 429 when the limit for this window is used up. */
export function hit(name, key, { windowMs, max }) {
  if (!config.rateLimit.enabled) return;
  const id = `${name}:${key}`;
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count += 1;
  if (b.count > max) throw errors.tooMany(Math.max(1, Math.ceil((b.resetAt - now) / 1000)));
}

/** Express middleware: limit by client IP (plus an optional extra key). */
export const rateLimit = (name, { windowMs, max, key = null }) => (req, res, next) => {
  hit(name, req.ip + (key ? ":" + key(req) : ""), { windowMs, max });
  next();
};

export const resetRateLimits = () => buckets.clear();
