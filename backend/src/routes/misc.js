/* /api/health, /api/config, /api/geo/search and the development mailbox. */
import { Router } from "express";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { geocoderEnabled, searchPlaces } from "../lib/geocoder.js";
import { devOutbox, emailDelivery } from "../lib/mailer.js";
import { smsDelivery } from "../lib/sms.js";
import { rateLimit } from "../lib/rate-limit.js";
import { v, validate } from "../lib/validate.js";

const router = Router();

router.get("/health", async (req, res) => {
  await db.query("SELECT 1");
  res.json({ ok: true, database: db.kind });
});

// Settings the website needs (nothing secret).
router.get("/config", (req, res) => {
  res.json({
    nearby: { radiusOptionsKm: config.nearby.radiusOptionsKm, defaultRadiusKm: config.nearby.defaultRadiusKm, maxRadiusKm: config.nearby.maxRadiusKm },
    features: {
      placeSearch: geocoderEnabled(),
      bearerTokens: config.allowBearer,
      devMailbox: config.devMailbox,
      // "real" = messages are really sent by a provider; "dev" = development mailbox only; "none" = not configured.
      emailDelivery: emailDelivery(),
      smsDelivery: smsDelivery()
    }
  });
});

/**
 * Place search for a manually entered location ("Dhenkanal", "751001").
 * Answers 200 with available:false when place search is off or unreachable,
 * so the website can fall back to matching shop addresses by text.
 */
router.get("/geo/search", rateLimit("geo", { windowMs: 60_000, max: 20 }), async (req, res) => {
  const { q } = validate(req.query, { q: v.string({ min: 2, max: 100, label: "Location" }) });
  if (!geocoderEnabled()) return res.json({ available: false, results: [] });
  try {
    res.json({ available: true, results: await searchPlaces(q) });
  } catch (error) {
    console.error("[geo] place search failed:", error.message);
    res.json({ available: false, results: [] });
  }
});

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * DEVELOPMENT ONLY. With EMAIL_PROVIDER=dev no email is sent; the messages
 * that would have been sent are listed here so reset and setup links can be
 * tested. These routes are not registered in production.
 */
export function devRoutes(app) {
  if (!config.devMailbox) return;
  app.get("/api/dev/outbox", (req, res) => res.json({ items: devOutbox() }));
  app.get("/dev/mailbox", (req, res) => {
    const items = devOutbox();
    res.set("Cache-Control", "no-store").type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>FrameX development mailbox</title>
      <style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#faf6ee;color:#050816}main{max-width:760px;margin:0 auto;padding:24px 16px}
      .note{padding:12px 16px;border-radius:12px;background:#fff3dc;color:#7c3f06}article{margin-top:16px;padding:16px;border:1px solid #e4e5e7;border-radius:12px;background:#fff}
      pre{white-space:pre-wrap;word-break:break-word;font:14px/1.5 ui-monospace,monospace}a.btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:999px;background:#050816;color:#fff;text-decoration:none}
      small{color:#5b5f6b}</style></head><body><main>
      <h1>Development mailbox</h1>
      <p class="note"><strong>Development only.</strong> Messages listed here were NOT sent. They are the emails and text messages FrameX would send while EMAIL_PROVIDER or SMS_PROVIDER is "dev". With a real provider configured they are delivered instead, and in production this page does not exist.</p>
      ${items.length ? "" : "<p>No messages yet. Use “Forgot password” or approve a shop to create one.</p>"}
      ${items
        .map(
          (m) => `<article><small>${escapeHtml(m.at)} · ${m.kind === "sms" ? "SMS" : "Email"} to ${escapeHtml(m.to)}</small><h2>${escapeHtml(m.subject)}</h2><pre>${escapeHtml(m.text)}</pre>
            ${(m.links || []).map((l) => `<a class="btn" href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`).join(" ")}</article>`
        )
        .join("")}
      </main></body></html>`);
  });
}

export default router;
