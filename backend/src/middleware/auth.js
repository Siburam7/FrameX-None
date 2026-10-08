/* ==========================================================================
   Authentication + authorization middleware.

   The role always comes from the database row behind the session — never
   from anything the browser sends. Every protected route states what it
   needs:
     requireAuth                 any logged-in user
     requireRole("ADMIN")        that role only
     requireOwnShop              SHOP user AND the :shopCode in the URL is their own shop
     requireArtist               ARTIST user (the artist they act for comes from their session, never from the request)
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { errors } from "../lib/errors.js";
import { clearSessionCookie, readCookie } from "../lib/security.js";
import { hashToken } from "../lib/tokens.js";

const TOUCH_AFTER_MS = 5 * 60 * 1000;

function tokenFrom(req) {
  const cookie = readCookie(req, config.cookie.name);
  if (cookie) return { token: cookie, via: "cookie" };
  const header = req.headers.authorization || "";
  if (config.allowBearer && header.startsWith("Bearer ")) return { token: header.slice(7).trim(), via: "bearer" };
  return null;
}

/** Looks up the session (if any) and sets req.auth = { sessionId, user, via } or null. */
export async function attachSession(req, res, next) {
  req.auth = null;
  const found = tokenFrom(req);
  if (!found || found.token.length < 20 || found.token.length > 200) return next();
  const { rows } = await db.query(
    `SELECT s.id AS session_id, s.last_seen_at,
            u.id, u.name, u.email, u.phone, u.role, u.status, u.shop_id, u.created_at,
            u.artist_id, sh.shop_code, sh.name AS shop_name, sh.approval_status, sh.active_status, ar.artist_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN shops sh ON sh.id = u.shop_id
       LEFT JOIN artists ar ON ar.id = u.artist_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(found.token)]
  );
  const row = rows[0];
  // A disabled account (or a shop that is no longer approved) loses access at once.
  if (!row || row.status !== "ACTIVE" || (row.role === "SHOP" && row.approval_status !== "APPROVED")) {
    if (found.via === "cookie") clearSessionCookie(res);
    return next();
  }
  req.auth = {
    sessionId: row.session_id,
    via: found.via,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status,
      shopId: row.shop_id,
      shopCode: row.shop_code,
      artistId: row.artist_id,
      artistCode: row.artist_code,
      createdAt: row.created_at
    }
  };
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_AFTER_MS) {
    db.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]).catch(() => {});
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth) throw errors.unauthorized();
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.auth) throw errors.unauthorized();
  if (!roles.includes(req.auth.user.role)) throw errors.forbidden();
  next();
};

/**
 * Shop-only routes shaped /api/shops/:shopCode/...
 * The shop in the URL must be the logged-in user's own shop. Changing the code
 * in the URL to another shop's is refused here, before any handler runs.
 */
/** Artist-only routes (/api/artist/...). Which artist is always the one behind the session. */
export function requireArtist(req, res, next) {
  if (!req.auth) throw errors.unauthorized();
  const { user } = req.auth;
  if (user.role !== "ARTIST" || !user.artistId) throw errors.forbidden();
  next();
}

export function requireOwnShop(req, res, next) {
  if (!req.auth) throw errors.unauthorized();
  const { user } = req.auth;
  if (user.role !== "SHOP" || !user.shopId) throw errors.forbidden();
  if (String(req.params.shopCode || "").toUpperCase() !== user.shopCode) throw errors.forbidden("You can only manage your own shop.");
  next();
}
