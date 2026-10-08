/* ==========================================================================
   Artists: applications ("Join as an artist"), admin onboarding, the public
   directory and profile, and the artist's own profile and pictures.

   Like shops, artists have no public sign-up: someone applies, a FrameX admin
   approves, and that creates the artist and a login that is finished through
   a one-time setup link.

   Privacy: an artist's public location is their city, state and (if they
   choose) their area. No street address is stored. Their phone number and
   email address are never part of a public answer.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
import { inspectImage } from "../lib/image-info.js";
import { esc, htmlEmail, sendMail } from "../lib/mailer.js";
import * as storage from "../lib/storage.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";
import { issueToken } from "./auth-service.js";

export const ARTIST_CODE = /^FRX-ART-\d{3,}$/i;
export const USERNAME = /^[a-z0-9][a-z0-9_.]{2,29}$/;
const MEDIA_REF = /^media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const LISTED = "a.status = 'ACTIVE'";

const like = (text) => `%${String(text).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
export const mediaPath = (id, thumb = false) => (id ? `/media/${id}${thumb ? "/thumb" : ""}` : "");

/** ["Oil", " canvas ", ""] -> up to 12 short, distinct labels. */
export function cleanList(value, { max = 12, length = 40 } = {}) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  const out = [];
  for (const item of list) {
    // eslint-disable-next-line no-control-regex
    const s = String(item ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, length);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/* ---------------------------------------------------------------- Shapes */

const rating = (row) => ({ average: row.rating_avg === null || row.rating_avg === undefined ? null : Math.round(Number(row.rating_avg) * 10) / 10, count: Number(row.rating_count) || 0 });

/** What anyone may see about an artist. */
export function publicArtist(row) {
  return {
    id: row.artist_code,
    artistCode: row.artist_code,
    username: row.username,
    name: row.name,
    bio: row.bio || "",
    experience: row.experience || "",
    specialties: row.specialties || [],
    mediums: row.mediums || [],
    styles: row.styles || [],
    // City and state always; the area only when the artist shows it. Never a street address.
    location: { city: row.city, area: row.show_area ? row.area || "" : "", state: row.state },
    photo: mediaPath(row.photo_media),
    cover: mediaPath(row.cover_media),
    customEnabled: Boolean(row.custom_enabled),
    rating: rating(row),
    startingPrice: row.starting_price === null || row.starting_price === undefined ? null : Number(row.starting_price),
    artworkCount: Number(row.artwork_count) || 0,
    isDemo: Boolean(row.is_demo)
  };
}

/** Everything about an artist, for the artist and for admins. */
function fullArtist(row) {
  return {
    ...publicArtist(row),
    uuid: row.id,
    area: row.area || "",
    showArea: Boolean(row.show_area),
    email: row.email,
    phone: row.phone,
    status: row.status,
    photoRef: row.photo_media ? `media:${row.photo_media}` : "",
    coverRef: row.cover_media ? `media:${row.cover_media}` : "",
    applicationId: row.application_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    account: row.account_email ? { email: row.account_email, name: row.account_name, status: row.account_status, lastLoginAt: row.account_last_login } : null
  };
}

// Rating, the cheapest custom service and the number of artworks on sale, worked out in the same query.
const STATS = `
  (SELECT avg(r.rating) FROM reviews r WHERE r.target_type = 'ARTIST' AND r.target_id = a.artist_code AND r.status = 'PUBLISHED') AS rating_avg,
  (SELECT count(*) FROM reviews r WHERE r.target_type = 'ARTIST' AND r.target_id = a.artist_code AND r.status = 'PUBLISHED') AS rating_count,
  (SELECT min(s.price) FROM painting_services s WHERE s.artist_id = a.id AND s.active AND s.removed_at IS NULL) AS starting_price,
  (SELECT count(*) FROM artworks w WHERE w.artist_id = a.id AND w.status = 'APPROVED') AS artwork_count`;

/* ---------------------------------------------------------------- Public directory */

/** Listed artists. q matches name, username, a style, a medium, a speciality, city or area. */
export async function listArtists({ q = "", style = "", city = "", page = 1, limit = 12 } = {}) {
  const params = [];
  let where = LISTED;
  if (q) {
    params.push(like(q));
    const n = params.length;
    where += ` AND (lower(a.name) LIKE $${n} OR lower(a.username) LIKE $${n} OR lower(a.city) LIKE $${n} OR (a.show_area AND lower(coalesce(a.area, '')) LIKE $${n}) OR lower(a.state) LIKE $${n}
      OR lower(a.styles::text) LIKE $${n} OR lower(a.mediums::text) LIKE $${n} OR lower(a.specialties::text) LIKE $${n})`;
  }
  if (style) {
    params.push(like(style));
    where += ` AND (lower(a.styles::text) LIKE $${params.length} OR lower(a.mediums::text) LIKE $${params.length} OR lower(a.specialties::text) LIKE $${params.length})`;
  }
  if (city) {
    params.push(like(city));
    where += ` AND (lower(a.city) LIKE $${params.length} OR (a.show_area AND lower(coalesce(a.area, '')) LIKE $${params.length}))`;
  }
  const size = Math.min(Math.max(1, limit), 48);
  const total = (await db.query(`SELECT count(*)::int AS n FROM artists a WHERE ${where}`, params)).rows[0].n;
  params.push(size, (Math.max(1, page) - 1) * size);
  const { rows } = await db.query(`SELECT a.*, ${STATS} FROM artists a WHERE ${where} ORDER BY a.created_at DESC, a.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows.map(publicArtist), total, page: Math.max(1, page), limit: size };
}

/** The row of a listed artist by artist ID (FRX-ART-1001) or @username; null when there is none. */
export async function listedArtistRow(ref, q = db) {
  const value = String(ref || "").trim().replace(/^@/, "");
  if (!value) return null;
  const { rows } = await q.query(`SELECT a.*, ${STATS} FROM artists a WHERE ${LISTED} AND (a.artist_code = $1 OR lower(a.username) = $2)`, [value.toUpperCase(), value.toLowerCase()]);
  return rows[0] || null;
}

export async function getPublicArtist(ref) {
  const row = await listedArtistRow(ref);
  if (!row) throw errors.notFound("We couldn't find that artist.", "ARTIST_NOT_FOUND");
  return publicArtist(row);
}

/** The styles, mediums and cities listed artists have, for the filters of the directory. */
export async function directoryFacets() {
  const { rows } = await db.query(`SELECT a.styles, a.mediums, a.city FROM artists a WHERE ${LISTED}`);
  const count = (lists) => {
    const m = new Map();
    for (const list of lists) for (const item of list || []) m.set(item, (m.get(item) || 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 24).map(([name, n]) => ({ name, count: n }));
  };
  return { styles: count(rows.map((r) => r.styles)), mediums: count(rows.map((r) => r.mediums)), cities: count(rows.map((r) => [r.city])) };
}

/* ---------------------------------------------------------------- Applications */

const publicApplication = (a) => ({
  id: a.id, name: a.name, email: a.email, phone: a.phone, city: a.city, state: a.state, artStyles: a.art_styles, mediums: a.mediums, experience: a.experience, portfolioUrl: a.portfolio_url,
  message: a.message, status: a.status, reviewNote: a.review_note, reviewedAt: a.reviewed_at, artistCode: a.artist_code || null, createdAt: a.created_at
});

const applicationMail = {
  received: (a) => ({
    subject: "We received your FrameX artist application",
    text: `Hi ${a.name},\n\nThanks for applying to join FrameX as an artist. Our team will look at your details and contact you. You don't have a login yet; if you are approved we'll send a link to set your password.\n\nFrameX`,
    html: htmlEmail({ heading: "We received your application", paragraphs: [`Hi ${esc(a.name)},`, "Thanks for applying to join FrameX as an artist. Our team will look at your details and contact you.", "You don't have a login yet. If you are approved, we'll send a link to set your password."], notice: "You received this because this email address was entered on the FrameX artist application form." })
  }),
  rejected: (a) => ({ subject: "About your FrameX artist application", text: `Hi ${a.name},\n\nThank you for applying to join FrameX as an artist. We're not able to approve the application at the moment. You're welcome to contact us with any questions.\n\nFrameX` }),
  setup: (artist, url, hours) => ({
    subject: `Your FrameX artist account (${artist.artist_code})`,
    text: `Hello ${artist.name},\n\nYou have been approved as an artist on FrameX.\n\nYour artist ID: ${artist.artist_code}\n\nSet your password with this link. It works once and expires in ${hours} hours:\n\n${url}\n\nAfter that, log in with this email address and your password.\n\nFrameX`,
    html: htmlEmail({ preview: `You are approved. Artist ID ${artist.artist_code}`, heading: "You are approved as a FrameX artist", paragraphs: [`Your artist ID: <strong>${esc(artist.artist_code)}</strong>`, "Set your password with the button below. After that, log in with this email address and your password."], button: { label: "Set artist password", url, note: `The link expires in ${hours} hours and works once.` }, notice: "You received this because a FrameX admin approved an artist with this email address." }),
    links: [{ label: "Set artist password", url }]
  })
};

/** "Join as an artist": stores a request for FrameX to review. It creates NO login. */
export async function submitApplication(data, ip) {
  const open = await db.query("SELECT 1 FROM artist_applications WHERE lower(email) = $1 AND status = 'PENDING'", [data.email]);
  if (open.rows.length) throw errors.conflict("We already have an application from this email address. Our team will contact you.", { email: "An application from this email is already being reviewed." });
  const id = newId();
  const app = await db.tx(async (q) => {
    const { rows } = await q.query(
      `INSERT INTO artist_applications (id, name, email, phone, city, state, art_styles, mediums, experience, portfolio_url, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, data.name, data.email, data.phone, data.city, data.state, data.artStyles || null, data.mediums || null, data.experience || null, data.portfolioUrl || null, data.message || null]
    );
    await audit(q, { action: ACTIONS.ARTIST_APPLICATION_SUBMITTED, targetType: "artist_application", targetId: id, ip });
    return rows[0];
  });
  sendMail({ to: app.email, ...applicationMail.received(app) }).catch(() => {});
  if (config.email.adminNotify) sendMail({ to: config.email.adminNotify, subject: `New artist application: ${app.name}`, text: `${app.name} applied from ${app.city}, ${app.state}.\nPhone: ${app.phone}\nEmail: ${app.email}\n\nReview it in the FrameX admin dashboard.` }).catch(() => {});
  return { id: app.id, status: app.status };
}

export async function adminListApplications({ status = "" } = {}) {
  const { rows } = await db.query(`SELECT p.*, a.artist_code FROM artist_applications p LEFT JOIN artists a ON a.id = p.artist_id ${status ? "WHERE p.status = $1" : ""} ORDER BY p.created_at DESC LIMIT 200`, status ? [status] : []);
  return rows.map(publicApplication);
}

export async function adminRejectApplication(id, reason, actor, ip) {
  const row = await db.tx(async (q) => {
    const { rows } = await q.query("UPDATE artist_applications SET status = 'REJECTED', review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1 AND status = 'PENDING' RETURNING *", [id, reason || null, actor.id]);
    if (rows[0]) await audit(q, { actor, action: ACTIONS.ARTIST_APPLICATION_REJECTED, targetType: "artist_application", targetId: id, metadata: { reason: reason || "" }, ip });
    return rows[0];
  });
  if (!row) throw errors.conflict("This application has already been decided.");
  sendMail({ to: row.email, ...applicationMail.rejected(row) }).catch(() => {});
  return publicApplication(row);
}

/* ---------------------------------------------------------------- Admin: artists */

const ADMIN_SELECT = `SELECT a.*, ${STATS}, u.email AS account_email, u.name AS account_name, u.status AS account_status, u.last_login_at AS account_last_login
  FROM artists a LEFT JOIN users u ON u.artist_id = a.id AND u.role = 'ARTIST'`;

/** A username nobody has: the wanted one, or one made from the name. */
async function freeUsername(q, wanted, name) {
  let base = String(wanted || "").toLowerCase().replace(/^@/, "");
  if (!USERNAME.test(base)) base = String(name || "artist").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24);
  if (!USERNAME.test(base)) base = "artist";
  const taken = new Set((await q.query("SELECT lower(username) AS u FROM artists WHERE lower(username) LIKE $1", [`${base.replace(/[%_\\]/g, "\\$&")}%`])).rows.map((r) => r.u));
  if (wanted && USERNAME.test(String(wanted).toLowerCase()) && taken.has(base)) throw errors.conflict("That username is taken.", { username: "That username is taken. Please choose another." });
  let name2 = base;
  for (let i = 2; taken.has(name2); i += 1) name2 = `${base.slice(0, 26)}${i}`;
  return name2;
}

async function insertArtist(q, a, { applicationId = null, actor }) {
  const id = newId();
  const code = "FRX-ART-" + (await q.query("SELECT nextval('artist_code_seq')::int AS n")).rows[0].n;
  const username = await freeUsername(q, a.username, a.name);
  const { rows } = await q.query(
    `INSERT INTO artists (id, artist_code, username, name, bio, experience, specialties, mediums, styles, city, area, state, email, phone, status, is_demo, application_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
    [id, code, username, a.name, a.bio || null, a.experience || null, JSON.stringify(cleanList(a.specialties)), JSON.stringify(cleanList(a.mediums)), JSON.stringify(cleanList(a.styles)),
      a.city, a.area || null, a.state, a.email || null, a.phone || null, a.active === false ? "INACTIVE" : "ACTIVE", Boolean(a.isDemo), applicationId, actor ? actor.id : null]
  );
  return rows[0];
}

/** Creates the ARTIST login: no password yet, only a one-time setup link. */
async function createAccount(q, artist, { email, name }, actor, ip) {
  const clash = await q.query("SELECT role FROM users WHERE lower(email) = $1", [email]);
  if (clash.rows.length) throw errors.conflict("That email address already has a FrameX account. Use a different email for the artist login.", { accountEmail: "This email already has a FrameX account." });
  const userId = newId();
  await q.query("INSERT INTO users (id, name, email, role, status, artist_id) VALUES ($1, $2, $3, 'ARTIST', 'PENDING_SETUP', $4)", [userId, name || artist.name, email, artist.id]);
  const setup = await issueToken(q, userId, "ACCOUNT_SETUP", { createdBy: actor.id });
  await audit(q, { actor, action: ACTIONS.ARTIST_ACCOUNT_CREATED, targetType: "artist", targetId: artist.artist_code, metadata: { accountEmail: email }, ip });
  return { userId, setup };
}

async function deliverSetup(artist, email, setup) {
  const mail = await sendMail({ to: email, ...applicationMail.setup(artist, setup.url, config.tokens.accountSetupHours) });
  // The link is also handed to the admin once, to pass on if email isn't set up.
  return { artistCode: artist.artist_code, accountEmail: email, setupUrl: setup.url, expiresAt: setup.expiresAt, emailed: Boolean(mail.delivered), emailStatus: mail.delivered ? "sent" : mail.reason };
}

export async function adminGetArtist(id) {
  if (!isUuid(id)) throw errors.notFound("That artist doesn't exist.");
  const { rows } = await db.query(`${ADMIN_SELECT} WHERE a.id = $1`, [id]);
  if (!rows[0]) throw errors.notFound("That artist doesn't exist.");
  return fullArtist(rows[0]);
}

export async function adminListArtists({ status = "", q = "" } = {}) {
  const where = [];
  const params = [];
  if (status) where.push(`a.status = $${params.push(status)}`);
  if (q) where.push(`(lower(a.name) LIKE $${params.push(like(q))} OR lower(a.username) LIKE $${params.length} OR lower(a.artist_code) LIKE $${params.length} OR lower(a.city) LIKE $${params.length})`);
  const { rows } = await db.query(`${ADMIN_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.created_at DESC LIMIT 500`, params);
  return rows.map(fullArtist);
}

/** Approve an application: one transaction creates the artist, their login (pending setup) and marks the application. */
export async function adminApproveApplication(id, { artist, accountEmail, accountName }, actor, ip) {
  const result = await db.tx(async (q) => {
    const app = (await q.query("SELECT * FROM artist_applications WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!app) throw errors.notFound("That application doesn't exist.");
    if (app.status !== "PENDING") throw errors.conflict("This application has already been decided.");
    const created = await insertArtist(q, { ...artist, email: artist.email || app.email, phone: artist.phone || app.phone }, { applicationId: id, actor });
    const account = await createAccount(q, created, { email: accountEmail, name: accountName || app.name }, actor, ip);
    await q.query("UPDATE artist_applications SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now(), artist_id = $3, updated_at = now() WHERE id = $1", [id, actor.id, created.id]);
    await audit(q, { actor, action: ACTIONS.ARTIST_APPROVED, targetType: "artist", targetId: created.artist_code, metadata: { applicationId: id }, ip });
    return { created, account };
  });
  return { artist: await adminGetArtist(result.created.id), credentials: await deliverSetup(result.created, accountEmail, result.account.setup) };
}

/** Admin adds an artist without an application. */
export async function adminCreateArtist({ artist, accountEmail, accountName }, actor, ip) {
  const result = await db.tx(async (q) => {
    const created = await insertArtist(q, artist, { actor });
    await audit(q, { actor, action: ACTIONS.ARTIST_CREATED, targetType: "artist", targetId: created.artist_code, ip });
    const account = accountEmail ? await createAccount(q, created, { email: accountEmail, name: accountName || artist.name }, actor, ip) : null;
    return { created, account };
  });
  return { artist: await adminGetArtist(result.created.id), credentials: result.account ? await deliverSetup(result.created, accountEmail, result.account.setup) : null };
}

/** Create the artist's login, or send a fresh one-time link. */
export async function adminIssueCredentials(id, { accountEmail, accountName }, actor, ip) {
  const artist = (await db.query("SELECT * FROM artists WHERE id = $1", [id])).rows[0];
  if (!artist) throw errors.notFound("That artist doesn't exist.");
  const result = await db.tx(async (q) => {
    const user = (await q.query("SELECT * FROM users WHERE artist_id = $1 AND role = 'ARTIST'", [id])).rows[0];
    if (!user) {
      if (!accountEmail) throw errors.validation({ accountEmail: "Enter the email address the artist will log in with." });
      return { email: accountEmail, setup: (await createAccount(q, artist, { email: accountEmail, name: accountName }, actor, ip)).setup };
    }
    return { email: user.email, setup: await issueToken(q, user.id, "ACCOUNT_SETUP", { createdBy: actor.id }) };
  });
  return deliverSetup(artist, result.email, result.setup);
}

/** List or unlist an artist. Unlisting also takes their artworks off sale and stops new painting requests. */
export async function adminSetStatus(id, status, actor, ip) {
  const artist = await adminGetArtist(id);
  await db.tx(async (q) => {
    await q.query("UPDATE artists SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
    await q.query("UPDATE catalog_products SET status = CASE WHEN $2 = 'ACTIVE' AND listing_status = 'published' THEN 'ACTIVE' ELSE 'INACTIVE' END, updated_at = now() WHERE owner_artist_id = $1 AND status <> 'REMOVED'", [id, status]);
    await audit(q, { actor, action: ACTIONS.ARTIST_STATUS_CHANGED, targetType: "artist", targetId: artist.artistCode, metadata: { to: status }, ip });
  });
  return adminGetArtist(id);
}

/* ---------------------------------------------------------------- Profile (admin and the artist) */

const text = (value, max) => {
  // eslint-disable-next-line no-control-regex
  const s = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  return s.slice(0, max);
};

/** A "media:<id>" reference that is one of this artist's own pictures -> its id (or null to clear). */
async function ownMedia(q, artistId, ref) {
  if (ref === "" || ref === null) return null;
  const m = MEDIA_REF.exec(String(ref));
  const row = m && (await q.query("SELECT id FROM media_files WHERE id = $1 AND artist_id = $2", [m[1], artistId])).rows[0];
  if (!row) throw errors.validation({ photo: "That picture couldn't be used. Upload it again from your device." });
  return row.id;
}

/**
 * Change an artist's profile. Only the fields that were sent change.
 * `byAdmin` may also change the contact details FrameX keeps.
 */
export async function updateProfile(artistId, changes, { actor, ip = null, byAdmin = false }) {
  const current = (await db.query("SELECT * FROM artists WHERE id = $1", [artistId])).rows[0];
  if (!current) throw errors.notFound("That artist doesn't exist.");
  const sets = [];
  const params = [];
  const set = (column, value, cast = "") => sets.push(`${column} = $${params.push(value)}${cast}`);
  const fields = {};
  if (changes.name !== undefined) {
    const name = text(changes.name, 80);
    if (name.length < 2) fields.name = "Enter your name.";
    else set("name", name);
  }
  if (changes.city !== undefined) {
    const city = text(changes.city, 80);
    if (city.length < 2) fields.city = "Enter your city.";
    else set("city", city);
  }
  if (changes.state !== undefined) {
    const state = text(changes.state, 80);
    if (state.length < 2) fields.state = "Enter your state.";
    else set("state", state);
  }
  if (changes.area !== undefined) set("area", text(changes.area, 120) || null);
  if (changes.showArea !== undefined) set("show_area", Boolean(changes.showArea));
  if (changes.bio !== undefined) set("bio", text(changes.bio, 2000) || null);
  if (changes.experience !== undefined) set("experience", text(changes.experience, 300) || null);
  for (const key of ["specialties", "mediums", "styles"]) if (changes[key] !== undefined) set(key, JSON.stringify(cleanList(changes[key])), "::jsonb");
  if (changes.customEnabled !== undefined) set("custom_enabled", Boolean(changes.customEnabled));
  if (changes.username !== undefined && String(changes.username).toLowerCase().replace(/^@/, "") !== current.username.toLowerCase()) {
    const username = String(changes.username).toLowerCase().replace(/^@/, "");
    if (!USERNAME.test(username)) fields.username = "Use 3 to 30 letters, numbers, dots or underscores.";
    else if ((await db.query("SELECT 1 FROM artists WHERE lower(username) = $1 AND id <> $2", [username, artistId])).rows.length) fields.username = "That username is taken. Please choose another.";
    else set("username", username);
  }
  if (byAdmin) {
    if (changes.email !== undefined) set("email", changes.email || null);
    if (changes.phone !== undefined) set("phone", changes.phone || null);
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
  await db.tx(async (q) => {
    if (changes.photo !== undefined) set("photo_media", await ownMedia(q, artistId, changes.photo));
    if (changes.cover !== undefined) set("cover_media", await ownMedia(q, artistId, changes.cover));
    if (!sets.length) return;
    params.push(artistId);
    await q.query(`UPDATE artists SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    // The seller name on the artist's artworks follows their name.
    if (changes.name !== undefined) await q.query("UPDATE catalog_products SET shop_name = (SELECT name FROM artists WHERE id = $1), updated_at = now() WHERE owner_artist_id = $1", [artistId]);
    await audit(q, { actor, action: byAdmin ? ACTIONS.ARTIST_UPDATED : ACTIONS.ARTIST_PROFILE_UPDATED, targetType: "artist", targetId: current.artist_code, metadata: { fields: Object.keys(changes).filter((k) => changes[k] !== undefined) }, ip });
  });
  return byAdmin ? adminGetArtist(artistId) : getOwnProfile(artistId);
}

/** The artist behind a session's artist id: what their routes and services need. */
export async function artistContext(artistId) {
  const row = (await db.query("SELECT id, artist_code, username, name, status FROM artists WHERE id = $1", [artistId])).rows[0];
  if (!row) throw errors.forbidden();
  // refs: what this artist's order lines carry as their seller (shop-order-service reads it).
  return { id: row.id, code: row.artist_code, username: row.username, name: row.name, listed: row.status === "ACTIVE", refs: [row.artist_code] };
}

export async function getOwnProfile(artistId) {
  const { rows } = await db.query(`${ADMIN_SELECT} WHERE a.id = $1`, [artistId]);
  if (!rows[0]) throw errors.forbidden();
  const { account, applicationId, ...profile } = fullArtist(rows[0]);
  return profile;
}

/* ---------------------------------------------------------------- Pictures (public: profile photo, artwork pictures) */

const MAX_MEDIA_PER_ARTIST = 400;

/** Receive one picture from a request body (raw bytes). -> { id, ref, url, width, height } */
export async function receiveMedia(artist, user, req) {
  const max = config.media.maxBytes;
  const declared = Number(req.headers["content-length"]);
  const tooLarge = () => new HttpError(413, "MEDIA_TOO_LARGE", `That picture is larger than ${Math.round(max / (1024 * 1024))} MB. Please choose a smaller one.`);
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
  const count = (await db.query("SELECT count(*)::int AS n FROM media_files WHERE artist_id = $1", [artist.id])).rows[0].n;
  if (count >= MAX_MEDIA_PER_ARTIST) throw new HttpError(409, "MEDIA_LIMIT", "You have reached the limit of uploaded pictures. Remove artworks you no longer show, or contact FrameX.");
  let received;
  try {
    received = await storage.receive(req, max);
  } catch (error) {
    if (error instanceof storage.TooLarge) throw tooLarge();
    throw new HttpError(400, "MEDIA_FAILED", "We couldn't upload that picture. Please try again.");
  }
  try {
    const info = await inspectImage(received.tempPath);
    if (!info || !received.bytes) throw new HttpError(415, "MEDIA_UNSUPPORTED", "Please upload a JPG, PNG or WebP picture.");
    const id = newId();
    const key = storage.newKey("public", id);
    await storage.keep(received.tempPath, key);
    try {
      await db.query("INSERT INTO media_files (id, artist_id, storage_key, kind, mime_type, bytes, width, height, created_by) VALUES ($1, $2, $3, 'artist', $4, $5, $6, $7, $8)", [id, artist.id, key, info.mime, received.bytes, info.width, info.height, user.id]);
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    return { id, ref: `media:${id}`, url: mediaPath(id), width: info.width, height: info.height };
  } catch (error) {
    await storage.discard(received.tempPath);
    throw error;
  }
}

/** The ids among these "media:<id>" references that are this artist's own pictures, in the order given. */
export async function ownMediaIds(artistId, refs, q = db) {
  const ids = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const m = MEDIA_REF.exec(String(ref));
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  if (!ids.length) return [];
  const { rows } = await q.query(`SELECT id FROM media_files WHERE artist_id = $1 AND id IN (${ids.map((_, i) => `$${i + 2}`).join(", ")})`, [artistId, ...ids]);
  const mine = new Set(rows.map((r) => r.id));
  return ids.filter((id) => mine.has(id));
}

/** Artist pictures nothing refers to any more are removed after a week. */
export async function sweepUnusedArtistMedia({ olderThanDays = 7 } = {}) {
  const { rows } = await db.query(
    `SELECT m.id, m.storage_key FROM media_files m
      WHERE m.artist_id IS NOT NULL AND m.created_at < now() - ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM artists a WHERE a.photo_media = m.id OR a.cover_media = m.id)
        AND NOT EXISTS (SELECT 1 FROM artworks w WHERE w.artist_id = m.artist_id AND w.data::text LIKE '%' || m.id::text || '%')
        AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.image LIKE '%' || m.id::text || '%')
      LIMIT 500`,
    [String(olderThanDays)]
  );
  for (const row of rows) {
    await db.query("DELETE FROM media_files WHERE id = $1", [row.id]);
    await storage.remove(row.storage_key);
  }
  return rows.length;
}
