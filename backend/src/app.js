/* The Express application: security middleware, the API, and (optionally) the website files. */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config, PROJECT_ROOT } from "./config.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { requestContext } from "./lib/context.js";
import { rateLimit } from "./lib/rate-limit.js";
import { cors, csrfGuard, securityHeaders } from "./lib/security.js";
import { attachSession } from "./middleware/auth.js";
import addressRoutes from "./routes/addresses.js";
import adminRoutes from "./routes/admin.js";
import analyticsRoutes from "./routes/analytics.js";
import { artistDashboardRoutes, artistRoutes, artworkRoutes } from "./routes/artists.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import checkoutRoutes from "./routes/checkout.js";
import contactRoutes from "./routes/contact.js";
import miscRoutes, { devRoutes } from "./routes/misc.js";
import orderRoutes from "./routes/orders.js";
import paintingRoutes, { notificationRoutes, reviewRoutes } from "./routes/paintings.js";
import shopDashboardRoutes, { catalogRoutes } from "./routes/shop-dashboard.js";
import shopRoutes from "./routes/shops.js";
import uploadRoutes, { fileRoutes } from "./routes/uploads.js";
import userRoutes from "./routes/users.js";
import { handleWebhook } from "./services/payment-service.js";
import { sendReviewPhoto } from "./services/review-service.js";
import { sendMedia } from "./services/shop-product-service.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders);

  /* ---- Payment gateway webhooks ----
     Called by the gateway's servers, not by a browser: no session, no CORS, no
     CSRF header. What makes a call trustworthy is its signature, checked over
     the exact bytes received, so the body is read raw (before express.json). */
  app.post("/api/payments/webhook/:provider", rateLimit("webhook", { windowMs: 60_000, max: 600 }), express.raw({ type: () => true, limit: "512kb" }), async (req, res) => {
    res.json(await handleWebhook(String(req.params.provider).toLowerCase(), req.body, req.headers));
  });

  /* ---- API ---- */
  app.use("/api", cors);
  app.use("/api", rateLimit("api", { windowMs: 60_000, max: 300 }));
  // A shop's product record (text, sizes, components) is larger than other requests.
  app.use("/api/shops/:shopCode/products", express.json({ limit: "400kb" }));
  // Uploaded files are not JSON: their bytes are read as a stream by the upload routes.
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/api", csrfGuard);
  app.use("/api", requestContext);
  app.use("/api", attachSession);

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/shops", shopDashboardRoutes); // a shop's own orders and products
  app.use("/api/shops", shopRoutes);
  app.use("/api/catalog", catalogRoutes);
  app.use("/api/uploads", uploadRoutes); // customer photos (private)
  app.use("/api/files", fileRoutes); // signed, short-lived links to them
  app.use("/api/cart", cartRoutes);
  app.use("/api/addresses", addressRoutes);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/artists", artistRoutes); // Art & Artists: the directory and profiles
  app.use("/api/artworks", artworkRoutes); // approved artworks
  app.use("/api/artist", artistDashboardRoutes); // an artist's own dashboard
  app.use("/api/paintings", paintingRoutes); // a customer's custom painting requests and their payments
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/analytics", analyticsRoutes); // visitor statistics from the website (only with the visitor's consent)
  app.use("/api/contact", contactRoutes); // a message from the Contact page
  app.use("/api/admin", adminRoutes);
  app.use("/api", miscRoutes);
  devRoutes(app); // development mailbox; registers nothing in production
  app.use("/api", notFoundHandler);

  /* ---- Product pictures uploaded by shops (public, like the pictures on any product page) ---- */
  app.get("/media/review/:id", sendReviewPhoto); // the photo of a published review
  app.get("/media/:id", sendMedia);
  app.get("/media/:id/:variant", sendMedia);

  /* ---- Website files (local development, or a single-server deployment) ----
     Only the public site is served: root *.html, /assets and /js.
     backend/, .git, docs and dotfiles are never reachable. */
  if (config.serveFrontend) {
    app.use("/assets", express.static(path.join(PROJECT_ROOT, "assets"), { index: false, dotfiles: "deny" }));
    app.use("/js", express.static(path.join(PROJECT_ROOT, "js"), { index: false, dotfiles: "deny" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      const name = req.path === "/" ? "index.html" : req.path.slice(1);
      if (!/^[a-z0-9-]+\.html$/i.test(name)) return next();
      const file = path.join(PROJECT_ROOT, name);
      return fs.existsSync(file) ? res.sendFile(file) : next();
    });
  }

  app.use((req, res) => res.status(404).type("text").send("Not found"));
  app.use(errorHandler);
  return app;
}
