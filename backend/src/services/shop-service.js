/* ==========================================================================
   Shops: public discovery (list, nearby, detail), partner applications,
   admin onboarding (approve, reject, create, update, activate, credentials)
   and the shop's own profile.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";
import { boundingBox, haversineSql } from "../lib/geo.js";
import { messages, sendMail } from "../lib/mailer.js";
import { newId } from "../lib/tokens.js";
import { issueToken, revokeSessions } from "./auth-service.js";

const PUBLIC = "approval_status = 'APPROVED' AND active_status = 'ACTIVE'";
export const FULFILMENT = ["pickup", "shop_delivery", "delivery_partner"];

/** One status for display: REJECTED | PENDING | INACTIVE | ACTIVE (ACTIVE = approved + active). */
export const shopStatus = (row) => (row.approval_status === "REJECTED" ? "REJECTED" : row.approval_status === "PENDING" ? "PENDING" : row.active_status === "ACTIVE" ? "ACTIVE" : "INACTIVE");

/** What anyone may see about a listed shop. No owner name, no login email. */
export function publicShop(row) {
  return {
    id: row.shop_code,
    shopCode: row.shop_code,
    catalogRef: row.catalog_ref,
    name: row.name,
    description: row.description,
    phone: row.phone,
    address: { line1: row.address_line1, area: row.area, city: row.city, state: row.state, postalCode: row.postal_code, country: row.country },
    location: { latitude: row.latitude, longitude: row.longitude },
    distanceKm: row.distance_km === undefined || row.distance_km === null ? null : Math.round(Number(row.distance_km) * 100) / 100,
    fulfilment: row.fulfilment || [],
    openingHours: row.opening_hours || null,
    status: shopStatus(row),
    isDemo: row.is_demo
  };
}

/** Everything about a shop, for its owner and for admins. */
export function fullShop(row) {
  return {
    ...publicShop(row),
    uuid: row.id,
    ownerName: row.owner_name,
    email: row.email,
    approvalStatus: row.approval_status,
    activeStatus: row.active_status,
    applicationId: row.application_id,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    account: row.account_email
      ? { email: row.account_email, name: row.account_name, status: row.account_status, lastLoginAt: row.account_last_login }
      : null
  };
}

/* ---------------------------------------------------------------- Public discovery */

/** Approved + active shops, optionally filtered by text, with distance when a point is given. */
export async function listPublicShops({ q = "", lat = null, lng = null, page = 1, limit = 20 }) {
  const params = [];
  let where = PUBLIC;
  if (q) {
    params.push(`%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
    where += ` AND (lower(name) LIKE $${params.length} OR lower(city) LIKE $${params.length} OR lower(coalesce(area, '')) LIKE $${params.length} OR postal_code LIKE $${params.length} OR lower(state) LIKE $${params.length})`;
  }
  const total = (await db.query(`SELECT count(*)::int AS n FROM shops WHERE ${where}`, params)).rows[0].n;
  const hasPoint = lat !== null && lng !== null;
  const distance = hasPoint ? `, ${haversineSql(`$${params.push(lat)}::float8`, `$${params.push(lng)}::float8`)} AS distance_km` : "";
  params.push(limit, (page - 1) * limit);
  const { rows } = await db.query(
    `SELECT *${distance} FROM shops WHERE ${where}
      ORDER BY ${hasPoint ? "distance_km ASC," : ""} name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { items: rows.map(publicShop), total, page, limit };
}

/**
 * Shops within radiusKm of a point, nearest first.
 * The latitude / longitude box (indexed) discards far-away shops; the exact
 * Haversine distance is then measured in the database for the remainder.
 */
export async function nearbyShops({ lat, lng, radiusKm, limit }) {
  const box = boundingBox(lat, lng, radiusKm);
  const params = [lat, lng, box.minLat, box.maxLat];
  let boxSql = "latitude BETWEEN $3 AND $4";
  if (box.lng) {
    params.push(box.lng.min, box.lng.max);
    boxSql += " AND longitude BETWEEN $5 AND $6";
  }
  params.push(radiusKm, limit);
  const { rows } = await db.query(
    `SELECT * FROM (
        SELECT *, ${haversineSql("$1::float8", "$2::float8")} AS distance_km
          FROM shops
         WHERE ${PUBLIC} AND ${boxSql}
     ) nearby
     WHERE distance_km <= $${params.length - 1}
     ORDER BY distance_km ASC, name ASC
     LIMIT $${params.length}`,
    params
  );
  return rows.map(publicShop);
}

/** A listed shop by Shop ID (FRX-SHOP-1001) or by its catalogue reference. */
export async function getPublicShop(ref) {
  const { rows } = await db.query(`SELECT * FROM shops WHERE ${PUBLIC} AND (shop_code = $1 OR catalog_ref = $2)`, [String(ref).toUpperCase(), String(ref)]);
  return rows[0] ? publicShop(rows[0]) : null;
}

/* ---------------------------------------------------------------- Partner applications */

export function publicApplication(a) {
  return {
    id: a.id,
    shopName: a.shop_name,
    ownerName: a.owner_name,
    phone: a.phone,
    email: a.email,
    address: a.address,
    city: a.city,
    state: a.state,
    postalCode: a.postal_code,
    businessDetails: a.business_details,
    message: a.message,
    status: a.status,
    reviewNote: a.review_note,
    reviewedAt: a.reviewed_at,
    shopCode: a.shop_code || null,
    createdAt: a.created_at
  };
}

/** "Partner with FrameX": stores a request for FrameX to review. It creates NO login. */
export async function submitApplication(data, ip) {
  const open = await db.query("SELECT 1 FROM shop_applications WHERE lower(email) = $1 AND status IN ('PENDING', 'UNDER_REVIEW')", [data.email]);
  if (open.rows.length) throw errors.conflict("We already have an application from this email address. Our team will contact you.", { email: "An application from this email is already being reviewed." });
  const id = newId();
  const { rows } = await db.tx(async (q) => {
    const inserted = await q.query(
      `INSERT INTO shop_applications (id, shop_name, owner_name, phone, email, address, city, state, postal_code, business_details, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, data.shopName, data.ownerName, data.phone, data.email, data.address, data.city, data.state, data.postalCode, data.businessDetails || null, data.message || null]
    );
    await audit(q, { action: ACTIONS.APPLICATION_SUBMITTED, targetType: "shop_application", targetId: id, ip });
    return inserted;
  });
  const app = rows[0];
  sendMail({ to: app.email, ...messages.applicationReceived(app.owner_name, app.shop_name) }).catch(() => {});
  if (config.email.adminNotify) sendMail({ to: config.email.adminNotify, ...messages.applicationNotify(app) }).catch(() => {});
  return { id: app.id, status: app.status };
}

/* ---------------------------------------------------------------- Admin */

const ADMIN_SHOP_SELECT = `SELECT s.*, u.email AS account_email, u.name AS account_name, u.status AS account_status, u.last_login_at AS account_last_login
  FROM shops s LEFT JOIN users u ON u.shop_id = s.id AND u.role = 'SHOP'`;

export async function adminOverview() {
  const apps = await db.query("SELECT status, count(*)::int AS n FROM shop_applications GROUP BY status");
  const shops = await db.query("SELECT approval_status, active_status, count(*)::int AS n FROM shops GROUP BY approval_status, active_status");
  const by = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + r.n), m), {});
  const a = by(apps.rows, "status");
  const sum = (test) => shops.rows.filter(test).reduce((n, r) => n + r.n, 0);
  return {
    applications: { pending: a.PENDING || 0, underReview: a.UNDER_REVIEW || 0, approved: a.APPROVED || 0, rejected: a.REJECTED || 0 },
    shops: {
      total: sum(() => true),
      pending: sum((r) => r.approval_status === "PENDING"),
      approved: sum((r) => r.approval_status === "APPROVED"),
      active: sum((r) => r.approval_status === "APPROVED" && r.active_status === "ACTIVE"),
      inactive: sum((r) => r.approval_status === "APPROVED" && r.active_status === "INACTIVE"),
      rejected: sum((r) => r.approval_status === "REJECTED")
    }
  };
}

export async function adminListApplications({ status = "" }) {
  const params = status ? [status] : [];
  const { rows } = await db.query(
    `SELECT a.*, s.shop_code FROM shop_applications a LEFT JOIN shops s ON s.id = a.shop_id
      ${status ? "WHERE a.status = $1" : ""} ORDER BY a.created_at DESC LIMIT 200`,
    params
  );
  return rows.map(publicApplication);
}

export async function adminGetApplication(id) {
  const { rows } = await db.query("SELECT a.*, s.shop_code FROM shop_applications a LEFT JOIN shops s ON s.id = a.shop_id WHERE a.id = $1", [id]);
  if (!rows[0]) throw errors.notFound("That application doesn't exist.");
  return publicApplication(rows[0]);
}

export async function adminMarkUnderReview(id, note, actor, ip) {
  const { rows } = await db.query(
    "UPDATE shop_applications SET status = 'UNDER_REVIEW', review_note = coalesce($2, review_note), reviewed_by = $3, updated_at = now() WHERE id = $1 AND status IN ('PENDING', 'UNDER_REVIEW') RETURNING id",
    [id, note || null, actor.id]
  );
  if (!rows.length) throw errors.conflict("Only applications that are waiting can be put under review.");
  await audit(db, { actor, action: ACTIONS.APPLICATION_UNDER_REVIEW, targetType: "shop_application", targetId: id, ip });
  return adminGetApplication(id);
}

export async function adminRejectApplication(id, reason, actor, ip) {
  const { rows } = await db.tx(async (q) => {
    const updated = await q.query(
      "UPDATE shop_applications SET status = 'REJECTED', review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1 AND status IN ('PENDING', 'UNDER_REVIEW') RETURNING *",
      [id, reason || null, actor.id]
    );
    if (updated.rows.length) await audit(q, { actor, action: ACTIONS.APPLICATION_REJECTED, targetType: "shop_application", targetId: id, metadata: { reason: reason || "" }, ip });
    return updated;
  });
  if (!rows.length) throw errors.conflict("This application has already been decided.");
  sendMail({ to: rows[0].email, ...messages.applicationRejected(rows[0].owner_name, rows[0].shop_name) }).catch(() => {});
  return adminGetApplication(id);
}

async function insertShop(q, s, { approval, active, applicationId = null, actor }) {
  if (s.catalogRef) {
    const clash = await q.query("SELECT 1 FROM shops WHERE catalog_ref = $1", [s.catalogRef]);
    if (clash.rows.length) throw errors.conflict("Another shop already uses that catalogue link.", { catalogRef: "Another shop already uses this catalogue link." });
  }
  const id = newId();
  const code = "FRX-SHOP-" + (await q.query("SELECT nextval('shop_code_seq')::int AS n")).rows[0].n;
  const { rows } = await q.query(
    `INSERT INTO shops (id, shop_code, catalog_ref, name, owner_name, email, phone, description, address_line1, area, city, state, postal_code, country,
                        latitude, longitude, approval_status, active_status, fulfilment, is_demo, application_id, created_by, approved_by, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22, $23, $24)
     RETURNING *`,
    [
      id, code, s.catalogRef || null, s.name, s.ownerName || null, s.email || null, s.phone || null, s.description || null, s.addressLine1 || null, s.area || null,
      s.city, s.state, s.postalCode, s.country || "IN", s.latitude, s.longitude, approval, active, JSON.stringify(s.fulfilment && s.fulfilment.length ? s.fulfilment : ["pickup"]),
      Boolean(s.isDemo), applicationId, actor ? actor.id : null, approval === "APPROVED" && actor ? actor.id : null, approval === "APPROVED" ? new Date() : null
    ]
  );
  return rows[0];
}

/** Creates the SHOP login for a shop: no password yet, only a one-time setup link. */
async function createShopAccount(q, shop, { email, name }, actor, ip) {
  const clash = await q.query("SELECT role FROM users WHERE lower(email) = $1", [email]);
  if (clash.rows.length) throw errors.conflict("That email address already has a FrameX account. Use a different email for the shop login.", { accountEmail: "This email already has a FrameX account." });
  const userId = newId();
  await q.query(`INSERT INTO users (id, name, email, role, status, shop_id) VALUES ($1, $2, $3, 'SHOP', 'PENDING_SETUP', $4)`, [userId, name || shop.name, email, shop.id]);
  const setup = await issueToken(q, userId, "ACCOUNT_SETUP", { createdBy: actor.id });
  await audit(q, { actor, action: ACTIONS.SHOP_ACCOUNT_CREATED, targetType: "shop", targetId: shop.shop_code, metadata: { accountEmail: email }, ip });
  return { userId, setup };
}

async function deliverSetup(shop, email, setup) {
  const mail = await sendMail({ to: email, ...messages.shopSetup(shop.name, shop.shop_code, setup.url, config.tokens.accountSetupHours) });
  // The link is also handed to the admin once, to pass on (e.g. by WhatsApp) if email isn't set up.
  return { shopCode: shop.shop_code, accountEmail: email, setupUrl: setup.url, expiresAt: setup.expiresAt, emailed: Boolean(mail.delivered), emailStatus: mail.delivered ? "sent" : mail.reason };
}

/**
 * Approve an application: one transaction creates the shop (with its real
 * location and a new Shop ID), its SHOP login (pending password setup), marks
 * the application approved and writes the audit entries.
 */
export async function adminApproveApplication(id, { shop, accountEmail, accountName, activate }, actor, ip) {
  const result = await db.tx(async (q) => {
    const app = (await q.query("SELECT * FROM shop_applications WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!app) throw errors.notFound("That application doesn't exist.");
    if (!["PENDING", "UNDER_REVIEW"].includes(app.status)) throw errors.conflict("This application has already been decided.");
    const created = await insertShop(q, shop, { approval: "APPROVED", active: activate ? "ACTIVE" : "INACTIVE", applicationId: id, actor });
    const account = await createShopAccount(q, created, { email: accountEmail, name: accountName || app.owner_name }, actor, ip);
    await q.query("UPDATE shop_applications SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now(), shop_id = $3, updated_at = now() WHERE id = $1", [id, actor.id, created.id]);
    await audit(q, { actor, action: ACTIONS.SHOP_APPROVED, targetType: "shop", targetId: created.shop_code, metadata: { applicationId: id, active: activate }, ip });
    return { created, account };
  });
  return { shop: await adminGetShop(result.created.id), credentials: await deliverSetup(result.created, accountEmail, result.account.setup) };
}

/** Admin adds a shop without an application (e.g. onboarded in person). */
export async function adminCreateShop({ shop, accountEmail, accountName, approve, activate }, actor, ip) {
  const result = await db.tx(async (q) => {
    const created = await insertShop(q, shop, { approval: approve ? "APPROVED" : "PENDING", active: approve && activate ? "ACTIVE" : "INACTIVE", actor });
    await audit(q, { actor, action: approve ? ACTIONS.SHOP_APPROVED : ACTIONS.SHOP_CREATED, targetType: "shop", targetId: created.shop_code, ip });
    const account = accountEmail ? await createShopAccount(q, created, { email: accountEmail, name: accountName || shop.ownerName }, actor, ip) : null;
    return { created, account };
  });
  return {
    shop: await adminGetShop(result.created.id),
    credentials: result.account ? await deliverSetup(result.created, accountEmail, result.account.setup) : null
  };
}

export async function adminListShops({ status = "", q = "" }) {
  const where = [];
  const params = [];
  if (status === "PENDING") where.push("s.approval_status = 'PENDING'");
  if (status === "APPROVED") where.push("s.approval_status = 'APPROVED'");
  if (status === "REJECTED") where.push("s.approval_status = 'REJECTED'");
  if (status === "ACTIVE") where.push("s.approval_status = 'APPROVED' AND s.active_status = 'ACTIVE'");
  if (status === "INACTIVE") where.push("s.approval_status = 'APPROVED' AND s.active_status = 'INACTIVE'");
  if (q) {
    params.push(`%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(lower(s.name) LIKE $1 OR lower(s.shop_code) LIKE $1 OR lower(s.city) LIKE $1)`);
  }
  const { rows } = await db.query(`${ADMIN_SHOP_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.created_at DESC LIMIT 500`, params);
  return rows.map(fullShop);
}

export async function adminGetShop(id) {
  const { rows } = await db.query(`${ADMIN_SHOP_SELECT} WHERE s.id = $1`, [id]);
  if (!rows[0]) throw errors.notFound("That shop doesn't exist.");
  return fullShop(rows[0]);
}

const SHOP_COLUMNS = {
  name: "name", ownerName: "owner_name", email: "email", phone: "phone", description: "description", addressLine1: "address_line1", area: "area",
  city: "city", state: "state", postalCode: "postal_code", country: "country", latitude: "latitude", longitude: "longitude", catalogRef: "catalog_ref"
};

/** Admin edits shop information / location. Coordinates can't be removed from an approved shop. */
export async function adminUpdateShop(id, changes, actor, ip) {
  const current = await adminGetShop(id);
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(SHOP_COLUMNS)) {
    if (changes[key] === undefined) continue;
    params.push(changes[key] === "" ? null : changes[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (changes.fulfilment !== undefined) {
    params.push(JSON.stringify(changes.fulfilment));
    sets.push(`fulfilment = $${params.length}::jsonb`);
  }
  if (!sets.length) return current;
  if (current.approvalStatus === "APPROVED" && (changes.latitude === null || changes.longitude === null)) throw errors.validation({ latitude: "An approved shop needs its coordinates." });
  if (changes.catalogRef) {
    const clash = await db.query("SELECT 1 FROM shops WHERE catalog_ref = $1 AND id <> $2", [changes.catalogRef, id]);
    if (clash.rows.length) throw errors.conflict("Another shop already uses that catalogue link.", { catalogRef: "Another shop already uses this catalogue link." });
  }
  params.push(id);
  await db.tx(async (q) => {
    await q.query(`UPDATE shops SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    await audit(q, { actor, action: ACTIONS.SHOP_UPDATED, targetType: "shop", targetId: current.shopCode, metadata: { fields: Object.keys(changes).filter((k) => changes[k] !== undefined) }, ip });
  });
  return adminGetShop(id);
}

/** Approve / reject a shop record, or return it to pending. */
export async function adminSetApproval(id, status, actor, ip) {
  const shop = await adminGetShop(id);
  if (status === "APPROVED" && (shop.location.latitude === null || shop.location.longitude === null)) throw errors.validation({ latitude: "Add the shop's coordinates before approving it." });
  await db.tx(async (q) => {
    await q.query(
      `UPDATE shops SET approval_status = $2::text, active_status = CASE WHEN $2::text = 'APPROVED' THEN active_status ELSE 'INACTIVE' END,
              approved_by = CASE WHEN $2::text = 'APPROVED' THEN $3::uuid ELSE approved_by END,
              approved_at = CASE WHEN $2::text = 'APPROVED' THEN now() ELSE approved_at END, updated_at = now()
        WHERE id = $1`,
      [id, status, actor.id]
    );
    // A shop that is no longer approved can't stay logged in.
    if (status !== "APPROVED") await q.query("UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE shop_id = $1)", [id]);
    await audit(q, { actor, action: status === "APPROVED" ? ACTIONS.SHOP_APPROVED : status === "REJECTED" ? ACTIONS.SHOP_REJECTED : ACTIONS.SHOP_UPDATED, targetType: "shop", targetId: shop.shopCode, metadata: { approval: status }, ip });
  });
  return adminGetShop(id);
}

/** Active shops are listed publicly; inactive ones are hidden but keep their account. */
export async function adminSetActive(id, active, actor, ip) {
  const shop = await adminGetShop(id);
  if (active && shop.approvalStatus !== "APPROVED") throw errors.conflict("Only an approved shop can be activated.");
  await db.tx(async (q) => {
    await q.query("UPDATE shops SET active_status = $2, updated_at = now() WHERE id = $1", [id, active ? "ACTIVE" : "INACTIVE"]);
    await audit(q, { actor, action: active ? ACTIONS.SHOP_ACTIVATED : ACTIONS.SHOP_DEACTIVATED, targetType: "shop", targetId: shop.shopCode, ip });
  });
  return adminGetShop(id);
}

/**
 * Issue login credentials for a shop: creates the account if it has none
 * (accountEmail needed), otherwise a fresh one-time link (setup, or password
 * reset if the shop already has a password). Older links stop working.
 */
export async function adminIssueCredentials(id, { accountEmail, accountName }, actor, ip) {
  const shop = await adminGetShop(id);
  if (shop.approvalStatus !== "APPROVED") throw errors.conflict("Approve the shop before creating its login.");
  const row = (await db.query("SELECT * FROM shops WHERE id = $1", [id])).rows[0];
  const existing = (await db.query("SELECT id, email, status, password_hash FROM users WHERE shop_id = $1 AND role = 'SHOP'", [id])).rows[0];
  if (!existing && !accountEmail) throw errors.validation({ accountEmail: "Enter the email address the shop will log in with." });
  const { email, setup } = await db.tx(async (q) => {
    if (!existing) {
      const account = await createShopAccount(q, row, { email: accountEmail, name: accountName || shop.ownerName }, actor, ip);
      return { email: accountEmail, setup: account.setup };
    }
    if (existing.status === "DISABLED") throw errors.conflict("This shop's login is disabled. Enable it first.");
    const token = await issueToken(q, existing.id, existing.password_hash ? "PASSWORD_RESET" : "ACCOUNT_SETUP", { createdBy: actor.id });
    await audit(q, { actor, action: ACTIONS.SHOP_CREDENTIALS_ISSUED, targetType: "shop", targetId: shop.shopCode, ip });
    return { email: existing.email, setup: token };
  });
  return deliverSetup(row, email, setup);
}

/** Disable / enable the shop's login without touching the listing. */
export async function adminSetAccountStatus(id, enabled, actor, ip) {
  const shop = await adminGetShop(id);
  const user = (await db.query("SELECT id, status, password_hash FROM users WHERE shop_id = $1 AND role = 'SHOP'", [id])).rows[0];
  if (!user) throw errors.conflict("This shop has no login yet.");
  await db.tx(async (q) => {
    await q.query("UPDATE users SET status = $2, updated_at = now() WHERE id = $1", [user.id, enabled ? (user.password_hash ? "ACTIVE" : "PENDING_SETUP") : "DISABLED"]);
    if (!enabled) await revokeSessions(q, user.id);
    await audit(q, { actor, action: enabled ? ACTIONS.SHOP_ACCOUNT_ENABLED : ACTIONS.SHOP_ACCOUNT_DISABLED, targetType: "shop", targetId: shop.shopCode, ip });
  });
  return adminGetShop(id);
}

export async function adminAuditLog({ limit = 100 }) {
  const { rows } = await db.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at, a.actor_role, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ id: r.id, action: r.action, targetType: r.target_type, targetId: r.target_id, metadata: r.metadata, at: r.created_at, actor: r.actor_name ? { name: r.actor_name, email: r.actor_email, role: r.actor_role } : null }));
}

/* ---------------------------------------------------------------- The shop's own data */

/** The logged-in shop's dashboard data. shopId comes from the session, never from the request. */
export async function ownShop(shopId) {
  const { rows } = await db.query(`${ADMIN_SHOP_SELECT} WHERE s.id = $1`, [shopId]);
  if (!rows[0]) throw errors.notFound("Your shop could not be found.");
  return fullShop(rows[0]);
}

/** Fields a shop may change itself. Name, Shop ID, address and location stay with FrameX admins. */
export async function updateOwnShop(shopId, changes, actor, ip) {
  const sets = [];
  const params = [];
  if (changes.phone !== undefined) sets.push(`phone = $${params.push(changes.phone || null)}`);
  if (changes.description !== undefined) sets.push(`description = $${params.push(changes.description || null)}`);
  if (changes.fulfilment !== undefined) sets.push(`fulfilment = $${params.push(JSON.stringify(changes.fulfilment))}::jsonb`);
  if (sets.length) {
    params.push(shopId);
    await db.tx(async (q) => {
      await q.query(`UPDATE shops SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
      await audit(q, { actor, action: ACTIONS.SHOP_PROFILE_UPDATED, targetType: "shop", targetId: actor.shopCode, metadata: { fields: Object.keys(changes).filter((k) => changes[k] !== undefined) }, ip });
    });
  }
  return ownShop(shopId);
}
