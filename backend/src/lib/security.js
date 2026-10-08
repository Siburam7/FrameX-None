/* ==========================================================================
   HTTP security middleware: response headers, CORS and CSRF protection.
   ========================================================================== */
import { config } from "../config.js";
import { errors } from "./errors.js";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const CLIENT_HEADER = "x-framex-client";

export function securityHeaders(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  if (config.isProd) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
    res.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
  next();
}

/** The website origins that may call the API: CORS_ORIGINS plus this server itself. */
export function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host; // same origin (website served by this server)
  } catch {
    return false;
  }
}

export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin, req)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "true");
    // The file name of a download (a customer's photo) may be read by the website's own code.
    res.set("Access-Control-Expose-Headers", "Content-Disposition");
    res.set("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      // X-File-Name: the name of an uploaded photo or product picture (its bytes are the request body).
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-FrameX-Client, X-File-Name");
      res.set("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }
  } else if (req.method === "OPTIONS") {
    return res.status(204).end(); // no CORS headers: the browser blocks the real request
  }
  next();
}

/**
 * CSRF protection for state-changing requests.
 * 1. They must carry the custom X-FrameX-Client header. A cross-site form or
 *    image can't add it, and a cross-site fetch needs a CORS preflight that
 *    only allowed origins pass.
 * 2. If the browser sent an Origin, it must be an allowed website origin.
 */
export function csrfGuard(req, res, next) {
  if (!UNSAFE.has(req.method)) return next();
  if (!req.headers[CLIENT_HEADER]) throw errors.forbidden("This request was blocked for your security.", "CSRF_BLOCKED");
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, req)) throw errors.forbidden("This website is not allowed to use the FrameX API.", "ORIGIN_NOT_ALLOWED");
  next();
}

/* ---- Session cookie ---- */
export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

const cookieOptions = () => ({
  httpOnly: true, // JavaScript can't read it
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: "/api", // only sent to the API, never with page or asset requests
  ...(config.cookie.domain ? { domain: config.cookie.domain } : {})
});

export const setSessionCookie = (res, token, expiresAt) => res.cookie(config.cookie.name, token, { ...cookieOptions(), expires: expiresAt });
export const clearSessionCookie = (res) => res.clearCookie(config.cookie.name, cookieOptions());
