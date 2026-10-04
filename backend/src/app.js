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
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import miscRoutes, { devRoutes } from "./routes/misc.js";
import shopRoutes from "./routes/shops.js";
import userRoutes from "./routes/users.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders);

  /* ---- API ---- */
  app.use("/api", cors);
  app.use("/api", rateLimit("api", { windowMs: 60_000, max: 300 }));
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/api", csrfGuard);
  app.use("/api", requestContext);
  app.use("/api", attachSession);

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/shops", shopRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", miscRoutes);
  devRoutes(app); // development mailbox; registers nothing in production
  app.use("/api", notFoundHandler);

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
