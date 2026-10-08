/* ==========================================================================
   Custom paintings: an artist's price list, a customer's request, the
   artist's answer, and the work until it is delivered.

   The life of a request (its `status`):

     PENDING_ARTIST_RESPONSE
        | artist declines            -> DECLINED            (nothing was ever payable)
        | artist accepts             -> ADVANCE_PAYMENT_PENDING
     ADVANCE_PAYMENT_PENDING
        | VERIFIED advance payment   -> ADVANCE_PAID        (only painting-payment-service does this)
     ADVANCE_PAID
        | artist starts              -> PAINTING_IN_PROGRESS
     PAINTING_IN_PROGRESS
        | artist marks it completed  -> REMAINING_PAYMENT_PENDING
     REMAINING_PAYMENT_PENDING
        | VERIFIED balance payment   -> READY_FOR_DISPATCH  (only painting-payment-service does this)
     READY_FOR_DISPATCH
        | artist dispatches          -> SHIPPED -> DELIVERED

   Every change goes through move(), which refuses anything that is not on
   this map. So an artist can't start before the advance is paid, a request
   can't be paid before it is accepted, and nothing can be dispatched before
   the balance is paid: those arrows simply don't exist.

   The split: advance = price x percent / 100, rounded to a whole rupee;
   balance = price - advance. Whole rupees, integer arithmetic, and the two
   always add up to the price (the database checks it too). The percent is
   the platform setting at the moment the request is made, stored with the
   request, so a later change of the setting never changes an agreed price.

   Refunds are tracked beside the status (refund_status), not inside it. What
   is refunded when, and who decides, is FrameX's policy: see TODO in
   adminCancel().
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { HttpError, errors } from "../lib/errors.js";
import { newId } from "../lib/tokens.js";
import { isUuid } from "../lib/validate.js";
import { addressSnapshot, ownAddress } from "./address-service.js";
import { listedArtistRow, mediaPath } from "./artist-service.js";
import { artistUserIds, notifyUser, notifyUsers } from "./notification-service.js";
import { attachUploads, linkTo, ownUploads, publicUpload } from "./upload-service.js";

export const STATUSES = ["PENDING_ARTIST_RESPONSE", "DECLINED", "ADVANCE_PAYMENT_PENDING", "ADVANCE_PAID", "PAINTING_IN_PROGRESS", "REMAINING_PAYMENT_PENDING", "READY_FOR_DISPATCH", "SHIPPED", "DELIVERED", "CANCELLED"];
/** The only moves that exist. */
export const NEXT = {
  PENDING_ARTIST_RESPONSE: ["DECLINED", "ADVANCE_PAYMENT_PENDING", "CANCELLED"],
  ADVANCE_PAYMENT_PENDING: ["ADVANCE_PAID", "CANCELLED"],
  ADVANCE_PAID: ["PAINTING_IN_PROGRESS", "CANCELLED"],
  PAINTING_IN_PROGRESS: ["REMAINING_PAYMENT_PENDING", "CANCELLED"],
  REMAINING_PAYMENT_PENDING: ["READY_FOR_DISPATCH", "CANCELLED"],
  READY_FOR_DISPATCH: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  DECLINED: [],
  CANCELLED: []
};
// Moves that only a verified payment may make (painting-payment-service passes `verifiedPayment`).
const PAYMENT_ONLY = new Set(["ADVANCE_PAID", "READY_FOR_DISPATCH"]);
export const SYSTEM = { id: null, role: "SYSTEM" };
export const REQUEST_NUMBER = /^CP-\d{6,}$/;
const MIN_PRICE = 100;
const MAX_PRICE = 2_000_000;
const MAX_SERVICES = 40;
const MAX_OPEN_PER_ARTIST = 3;
const KEY = /^[A-Za-z0-9_-]{16,80}$/;

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");
const notFound = () => errors.notFound("We couldn't find that painting request.", "PAINTING_NOT_FOUND");
const conflict = (code, message) => new HttpError(409, code, message);
const text = (value, max) => {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
};

/** price and percent -> { advance, balance } in whole rupees; always advance + balance === price, both at least 1. */
export function splitPrice(price, percent) {
  const advance = Math.min(price - 1, Math.max(1, Math.round((price * percent) / 100)));
  return { advance, balance: price - advance };
}

/* ---------------------------------------------------------------- The artist's price list */

const serviceShape = (r) => ({ id: r.id, title: r.title, artType: r.art_type, medium: r.medium || "", size: r.size, price: r.price, currency: "INR", description: r.description || "", estDays: r.est_days, active: r.active });

function cleanService(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const fields = {};
  const title = text(body.title, 80);
  if (title.length < 3) fields.title = "Name the service, e.g. Pencil portrait.";
  const artType = text(body.artType, 60);
  if (!artType) fields.artType = "Say what kind of work it is, e.g. Pencil drawing.";
  const size = text(body.size, 40);
  if (!size) fields.size = "Enter the size, e.g. 12 x 16 in.";
  const price = Number(body.price);
  if (!Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) fields.price = `Enter a price in whole rupees, from ${rupees(MIN_PRICE)} to ${rupees(MAX_PRICE)}.`;
  const estDays = body.estDays === "" || body.estDays === null || body.estDays === undefined ? null : Number(body.estDays);
  if (estDays !== null && (!Number.isInteger(estDays) || estDays < 1 || estDays > 365)) fields.estDays = "Enter the number of days, from 1 to 365.";
  if (Object.keys(fields).length) throw errors.validation(fields);
  return { title, artType, medium: text(body.medium, 80) || null, size, price, description: text(body.description, 600) || null, estDays, active: body.active !== false };
}

export async function listOwnServices(artist) {
  const { rows } = await db.query("SELECT * FROM painting_services WHERE artist_id = $1 AND removed_at IS NULL ORDER BY price, created_at", [artist.id]);
  return rows.map(serviceShape);
}

/** What customers can pick from on an artist's profile. */
export async function listPublicServices(artistId) {
  const { rows } = await db.query("SELECT * FROM painting_services WHERE artist_id = $1 AND removed_at IS NULL AND active ORDER BY price, created_at", [artistId]);
  return rows.map(serviceShape);
}

/** Add a service (id null) or change one of the artist's own. */
export async function saveService(artist, id, input, { actor, ip = null }) {
  const s = cleanService(input);
  if (id && !isUuid(id)) throw errors.notFound("We couldn't find that service.", "SERVICE_NOT_FOUND");
  const row = await db.tx(async (q) => {
    if (id) {
      const { rows } = await q.query(
        "UPDATE painting_services SET title = $3, art_type = $4, medium = $5, size = $6, price = $7, description = $8, est_days = $9, active = $10, updated_at = now() WHERE id = $1 AND artist_id = $2 AND removed_at IS NULL RETURNING *",
        [id, artist.id, s.title, s.artType, s.medium, s.size, s.price, s.description, s.estDays, s.active]
      );
      if (!rows[0]) throw errors.notFound("We couldn't find that service.", "SERVICE_NOT_FOUND");
      await audit(q, { actor, action: ACTIONS.PAINTING_SERVICE_SAVED, targetType: "painting_service", targetId: id, metadata: { artist: artist.code, price: s.price }, ip });
      return rows[0];
    }
    const count = (await q.query("SELECT count(*)::int AS n FROM painting_services WHERE artist_id = $1 AND removed_at IS NULL", [artist.id])).rows[0].n;
    if (count >= MAX_SERVICES) throw conflict("SERVICE_LIMIT", `You can list up to ${MAX_SERVICES} services. Remove one you no longer offer.`);
    const newServiceId = newId();
    const { rows } = await q.query(
      "INSERT INTO painting_services (id, artist_id, title, art_type, medium, size, price, description, est_days, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [newServiceId, artist.id, s.title, s.artType, s.medium, s.size, s.price, s.description, s.estDays, s.active]
    );
    await audit(q, { actor, action: ACTIONS.PAINTING_SERVICE_SAVED, targetType: "painting_service", targetId: newServiceId, metadata: { artist: artist.code, price: s.price, created: true }, ip });
    return rows[0];
  });
  return serviceShape(row);
}

/** Remove a service from the price list. Requests already made keep their own copy of it. */
export async function removeService(artist, id) {
  if (!isUuid(id)) throw errors.notFound("We couldn't find that service.", "SERVICE_NOT_FOUND");
  const { rows } = await db.query("UPDATE painting_services SET removed_at = now(), active = false, updated_at = now() WHERE id = $1 AND artist_id = $2 AND removed_at IS NULL RETURNING id", [id, artist.id]);
  if (!rows[0]) throw errors.notFound("We couldn't find that service.", "SERVICE_NOT_FOUND");
}

/* ---------------------------------------------------------------- Moving a request */

export const addEvent = (q, requestId, { status = null, detail = null, actor = SYSTEM }) =>
  q.query("INSERT INTO painting_events (id, request_id, status, detail, actor_user_id, actor_role) VALUES ($1, $2, $3, $4, $5, $6)", [newId(), requestId, status, detail, actor.id || null, actor.role || "SYSTEM"]);

/**
 * Move a request to another status, inside the caller's transaction.
 * `row` must be the request as it is now (locked FOR UPDATE by the caller).
 * Refuses any move that is not on the map, and the two payment-only moves
 * unless they come from a verified payment.
 */
export async function move(q, row, to, { actor = SYSTEM, detail = null, set = {}, verifiedPayment = false } = {}) {
  if (!(NEXT[row.status] || []).includes(to)) throw conflict("PAINTING_INVALID_STEP", stepMessage(row.status, to));
  if (PAYMENT_ONLY.has(to) && !verifiedPayment) throw conflict("PAINTING_PAYMENT_REQUIRED", stepMessage(row.status, to));
  const columns = { status: to, ...set };
  const names = Object.keys(columns);
  await q.query(`UPDATE painting_requests SET ${names.map((n, i) => `${n} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [row.id, ...names.map((n) => columns[n])]);
  await addEvent(q, row.id, { status: to, detail, actor });
  return { ...row, ...columns };
}

/** Why a move is not possible, in words the artist or customer can act on. */
function stepMessage(from, to) {
  if (to === "PAINTING_IN_PROGRESS") return from === "ADVANCE_PAYMENT_PENDING" || from === "PENDING_ARTIST_RESPONSE" ? "The advance payment has not been received yet. The painting can start once it is paid." : "This painting can't be started now.";
  if (to === "REMAINING_PAYMENT_PENDING") return "Only a painting that is in progress can be marked as completed.";
  if (to === "SHIPPED") return from === "REMAINING_PAYMENT_PENDING" ? "The remaining payment has not been received yet. The painting can be dispatched once it is paid." : "This painting can't be dispatched now.";
  if (to === "DELIVERED") return "Only a dispatched painting can be marked as delivered.";
  if (to === "ADVANCE_PAID" || to === "READY_FOR_DISPATCH") return "This step needs a verified payment.";
  if (to === "CANCELLED") return "This request can't be cancelled any more.";
  return "This request has already been answered.";
}

/* ---------------------------------------------------------------- Shapes */

const SQL = `SELECT r.*, a.artist_code, a.username, a.name AS artist_name, a.photo_media, a.city AS artist_city, a.state AS artist_state
  FROM painting_requests r JOIN artists a ON a.id = r.artist_id`;

async function partsOf(requestId, q = db) {
  const photos = (await q.query("SELECT u.* FROM painting_request_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.request_id = $1 ORDER BY p.position", [requestId])).rows;
  const events = (await q.query("SELECT status, detail, actor_role, created_at FROM painting_events WHERE request_id = $1 ORDER BY created_at, id", [requestId])).rows;
  const payments = (await q.query("SELECT stage, attempt, status, amount, instrument, failure_reason, paid_at, created_at FROM painting_payments WHERE request_id = $1 ORDER BY created_at, attempt", [requestId])).rows;
  return { photos, events, payments };
}

/** What happens next, for whoever is looking. */
function nextStep(row, who) {
  const pct = row.advance_percent;
  const s = row.status;
  if (who === "customer") {
    if (s === "PENDING_ARTIST_RESPONSE") return "Your custom painting request has been sent to the artist.";
    if (s === "DECLINED") return "The artist has declined this custom painting request.";
    if (s === "ADVANCE_PAYMENT_PENDING") return `Your request has been accepted. Please pay the ${pct}% advance to start the painting.`;
    if (s === "ADVANCE_PAID") return "Advance payment received. The artist can now start your painting.";
    if (s === "PAINTING_IN_PROGRESS") return "The artist is working on your painting.";
    if (s === "REMAINING_PAYMENT_PENDING") return `Your painting is completed. Please pay the remaining ${100 - pct}% to continue with dispatch.`;
    if (s === "READY_FOR_DISPATCH") return "Fully paid. The artist is getting your painting ready to dispatch.";
    if (s === "SHIPPED") return "Your painting has been dispatched.";
    if (s === "DELIVERED") return "Your painting has been delivered.";
    return "This request was cancelled.";
  }
  if (s === "PENDING_ARTIST_RESPONSE") return "Accept or decline this request.";
  if (s === "DECLINED") return "You declined this request.";
  if (s === "ADVANCE_PAYMENT_PENDING") return "Advance payment pending. Don't start until it is paid.";
  if (s === "ADVANCE_PAID") return "Advance Paid — Painting Can Start";
  if (s === "PAINTING_IN_PROGRESS") return "Painting in progress. Mark it as completed when it is finished.";
  if (s === "REMAINING_PAYMENT_PENDING") return "Remaining payment pending. Don't dispatch until it is paid.";
  if (s === "READY_FOR_DISPATCH") return "Fully paid. Ready to dispatch.";
  if (s === "SHIPPED") return "Dispatched. Mark it as delivered when it arrives.";
  if (s === "DELIVERED") return "Delivered.";
  return "This request was cancelled.";
}

function base(row, parts, who) {
  return {
    requestNumber: row.request_number,
    status: row.status,
    paymentStatus: row.payment_status,
    refundStatus: row.refund_status,
    nextStep: nextStep(row, who),
    service: row.service,
    price: row.price,
    currency: row.currency,
    advancePercent: row.advance_percent,
    advanceAmount: row.advance_amount,
    balanceAmount: row.balance_amount,
    amountPaid: row.amount_paid,
    amountDue: row.status === "ADVANCE_PAYMENT_PENDING" ? row.advance_amount : row.status === "REMAINING_PAYMENT_PENDING" ? row.balance_amount : 0,
    instructions: row.instructions,
    declineReason: row.status === "DECLINED" ? row.decline_reason || "" : "",
    cancelReason: row.status === "CANCELLED" ? row.cancel_reason || "" : "",
    dispatchNote: row.dispatch_note || "",
    artist: { artistCode: row.artist_code, username: row.username, name: row.artist_name, photo: mediaPath(row.photo_media), city: row.artist_city, state: row.artist_state },
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    referencePhotos: (parts.photos || []).map(publicUpload),
    history: (parts.events || []).map((e) => ({ status: e.status, detail: e.detail, by: e.actor_role, at: e.created_at })),
    payments: (parts.payments || []).map((p) => ({ stage: p.stage, attempt: p.attempt, status: p.status, amount: p.amount, method: p.instrument, reason: p.failure_reason, paidAt: p.paid_at, at: p.created_at }))
  };
}

/** For the customer who made the request. */
const customerView = (row, parts) => ({
  ...base(row, parts, "customer"),
  deliverTo: row.shipping_address,
  payable: row.status === "ADVANCE_PAYMENT_PENDING" ? "ADVANCE" : row.status === "REMAINING_PAYMENT_PENDING" ? "BALANCE" : null,
  canCancel: ["PENDING_ARTIST_RESPONSE", "ADVANCE_PAYMENT_PENDING"].includes(row.status) && row.amount_paid === 0,
  canConfirmDelivery: row.status === "SHIPPED"
});

/**
 * For the artist who received it. The customer's full address and phone are
 * only shown once the painting is paid for and has to be sent; before that
 * the artist sees who it is for and the city.
 */
function artistView(row, parts) {
  const a = row.shipping_address || {};
  const dispatch = ["READY_FOR_DISPATCH", "SHIPPED", "DELIVERED"].includes(row.status);
  return {
    ...base(row, parts, "artist"),
    customer: { name: row.customer_name, city: a.city || "", state: a.state || "", ...(dispatch ? { phone: row.customer_phone || a.phone || "" } : {}) },
    deliverTo: dispatch ? a : null,
    actions: {
      respond: row.status === "PENDING_ARTIST_RESPONSE",
      start: row.status === "ADVANCE_PAID",
      complete: row.status === "PAINTING_IN_PROGRESS",
      dispatch: row.status === "READY_FOR_DISPATCH",
      deliver: row.status === "SHIPPED"
    }
  };
}

const adminView = (row, parts) => ({ ...base(row, parts, "artist"), customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone || "" }, deliverTo: row.shipping_address, refundNote: row.refund_note || "" });

const summary = (row) => ({
  requestNumber: row.request_number, status: row.status, paymentStatus: row.payment_status, refundStatus: row.refund_status, service: row.service, price: row.price, advanceAmount: row.advance_amount, balanceAmount: row.balance_amount,
  amountPaid: row.amount_paid, advancePercent: row.advance_percent, artist: { artistCode: row.artist_code, username: row.username, name: row.artist_name, photo: mediaPath(row.photo_media) }, customerName: row.customer_name, createdAt: row.created_at, updatedAt: row.updated_at
});

/* ---------------------------------------------------------------- The customer */

/**
 * Send a custom painting request to an artist.
 * The price is the service's price as the server has it now; nothing about
 * money comes from the browser. No payment is taken or asked for here.
 */
export async function createRequest(user, { artist: artistRef, serviceId, uploadIds, instructions, addressId, idempotencyKey }, ip = null) {
  if (!KEY.test(String(idempotencyKey || ""))) throw errors.validation({ idempotencyKey: "The request could not be identified. Reload the page and try again." });
  const find = async () => (await db.query(`${SQL} WHERE r.user_id = $1 AND r.idempotency_key = $2`, [user.id, idempotencyKey])).rows[0];
  const earlier = await find();
  if (earlier) return customerView(earlier, await partsOf(earlier.id));

  const artist = await listedArtistRow(artistRef);
  if (!artist) throw errors.notFound("We couldn't find that artist.", "ARTIST_NOT_FOUND");
  if (!artist.custom_enabled) throw conflict("CUSTOM_PAINTING_OFF", "This artist is not taking custom painting requests right now.");
  if (user.artistId && user.artistId === artist.id) throw conflict("OWN_ARTIST", "You can't send a request to yourself.");
  if (!isUuid(serviceId)) throw errors.validation({ serviceId: "Choose a size and type from the artist's price list." });
  const service = (await db.query("SELECT * FROM painting_services WHERE id = $1 AND artist_id = $2 AND removed_at IS NULL AND active", [serviceId, artist.id])).rows[0];
  if (!service) throw errors.validation({ serviceId: "That option is no longer offered. Please choose another from the artist's price list." });

  const wanted = [...new Set((Array.isArray(uploadIds) ? uploadIds : []).filter(isUuid))];
  const max = config.paintings.maxReferencePhotos;
  if (!wanted.length) throw errors.validation({ photos: "Please upload your reference photo to continue. The artist needs it to paint from." });
  if (wanted.length > max) throw errors.validation({ photos: `You can add up to ${max} reference photos.` });
  const note = text(instructions, 1500);

  let created;
  try {
    created = await db.tx(async (q) => {
      const uploads = await ownUploads(user.id, wanted, q);
      // A photo that isn't this customer's own (or was removed) simply isn't there.
      if (uploads.size !== wanted.length) throw errors.validation({ photos: "One of the photos couldn't be found. Please upload it again." });
      const address = await ownAddress(user.id, addressId, q);
      const open = (await q.query("SELECT count(*)::int AS n FROM painting_requests WHERE user_id = $1 AND artist_id = $2 AND status = 'PENDING_ARTIST_RESPONSE'", [user.id, artist.id])).rows[0].n;
      if (open >= MAX_OPEN_PER_ARTIST) throw conflict("TOO_MANY_REQUESTS", "You already have requests waiting for this artist's answer. Please wait for a reply first.");
      const percent = config.paintings.advancePercent;
      const { advance, balance } = splitPrice(service.price, percent);
      const id = newId();
      const number = "CP-" + (await q.query("SELECT nextval('painting_request_seq') AS n")).rows[0].n;
      await q.query(
        `INSERT INTO painting_requests (id, request_number, user_id, artist_id, service_id, service, price, advance_percent, advance_amount, balance_amount, instructions, status,
                                        shipping_address, customer_name, customer_email, customer_phone, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING_ARTIST_RESPONSE', $12, $13, $14, $15, $16)`,
        [id, number, user.id, artist.id, service.id, JSON.stringify(serviceShape(service)), service.price, percent, advance, balance, note, JSON.stringify(addressSnapshot(address)), user.name, user.email, address.phone || user.phone || null, idempotencyKey]
      );
      let at = 0;
      for (const uploadId of wanted) await q.query("INSERT INTO painting_request_photos (id, request_id, upload_id, position) VALUES ($1, $2, $3, $4)", [newId(), id, uploadId, (at += 1)]);
      // The photos now belong to this request: they are kept, and marked as reference pictures.
      await attachUploads(q, wanted);
      await q.query(`UPDATE uploads SET role = 'CUSTOMER_REFERENCE_IMAGE' WHERE id IN (${wanted.map((_, i) => `$${i + 1}`).join(", ")})`, wanted);
      await addEvent(q, id, { status: "PENDING_ARTIST_RESPONSE", detail: "Request sent to the artist.", actor: { id: user.id, role: "CUSTOMER" } });
      await audit(q, { actor: user, action: ACTIONS.PAINTING_REQUESTED, targetType: "painting_request", targetId: number, metadata: { artist: artist.artist_code, price: service.price, advancePercent: percent }, ip });
      return { id, number };
    });
  } catch (error) {
    // The same request sent twice at the same moment: answer with the one that got through.
    if (error && error.code === "23505") {
      const winner = await find();
      if (winner) return customerView(winner, await partsOf(winner.id));
    }
    throw error;
  }
  await notifyUser(user.id, { kind: "PAINTING_REQUEST_SENT", ref: created.number, title: "Your custom painting request has been sent", body: `Your custom painting request has been sent to the artist. ${artist.name} will accept or decline it. You pay nothing until it is accepted.`, link: `painting.html?id=${created.number}`, email: true, button: "View your request" });
  await notifyUsers(await artistUserIds(artist.id), { kind: "PAINTING_REQUEST_RECEIVED", ref: created.number, title: "New custom painting request", body: `${user.name} asked for: ${service.title}, ${service.size}, ${rupees(service.price)}. Accept or decline it in your dashboard.`, link: `artist-dashboard.html#/requests/${created.number}`, email: true, button: "Open the request" });
  return getOwnRequest(user.id, created.number);
}

async function ownRow(userId, number, q = db, lock = false) {
  if (!REQUEST_NUMBER.test(String(number || ""))) throw notFound();
  const row = (await q.query(`${SQL} WHERE r.request_number = $1 AND r.user_id = $2${lock ? " FOR UPDATE OF r" : ""}`, [String(number), userId])).rows[0];
  // Someone else's request looks exactly like one that doesn't exist.
  if (!row) throw notFound();
  return row;
}

export const ownRequestRow = (userId, number) => ownRow(userId, number);

export async function getOwnRequest(userId, number) {
  const row = await ownRow(userId, number);
  return customerView(row, await partsOf(row.id));
}

export async function listOwnRequests(userId, { page = 1, limit = 10 } = {}) {
  const size = Math.min(Math.max(1, limit), 50);
  const total = (await db.query("SELECT count(*)::int AS n FROM painting_requests WHERE user_id = $1", [userId])).rows[0].n;
  const { rows } = await db.query(`${SQL} WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`, [userId, size, (Math.max(1, page) - 1) * size]);
  return { items: rows.map(summary), total, page: Math.max(1, page), limit: size };
}

/** A short-lived link to one of the customer's own reference photos. */
export async function ownPhotoLink(userId, number, uploadId, { download = false } = {}) {
  const row = await ownRow(userId, number);
  const photo = isUuid(uploadId) && (await db.query("SELECT u.* FROM painting_request_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.request_id = $1 AND u.id = $2 AND u.status <> 'DELETED'", [row.id, uploadId])).rows[0];
  if (!photo) throw errors.notFound("We couldn't find that photo.", "UPLOAD_NOT_FOUND");
  return linkTo(photo, { download });
}

/** The customer cancels a request that nothing has been paid for yet. */
export async function cancelOwn(user, number, reason, ip = null) {
  const done = await db.tx(async (q) => {
    const row = await ownRow(user.id, number, q, true);
    if (row.amount_paid > 0 || !["PENDING_ARTIST_RESPONSE", "ADVANCE_PAYMENT_PENDING"].includes(row.status)) throw conflict("PAINTING_NOT_CANCELLABLE", "This request can't be cancelled here any more. Please contact FrameX.");
    const moved = await move(q, row, "CANCELLED", { actor: { id: user.id, role: "CUSTOMER" }, detail: text(reason, 300) || "Cancelled by the customer.", set: { cancel_reason: text(reason, 300) || "Cancelled by the customer.", cancelled_at: new Date() } });
    await q.query("UPDATE painting_payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Request cancelled'), updated_at = now() WHERE request_id = $1 AND status = 'PENDING'", [row.id]);
    await audit(q, { actor: user, action: ACTIONS.PAINTING_CANCELLED, targetType: "painting_request", targetId: row.request_number, metadata: { by: "customer" }, ip });
    return moved;
  });
  await notifyUsers(await artistUserIds(done.artist_id), { kind: "PAINTING_CANCELLED", ref: done.request_number, title: `Request ${done.request_number} was cancelled`, body: "The customer cancelled this custom painting request.", link: `artist-dashboard.html#/requests/${done.request_number}` });
  return getOwnRequest(user.id, number);
}

/** The customer says the painting arrived. */
export async function confirmDelivery(user, number) {
  const done = await db.tx(async (q) => {
    const row = await ownRow(user.id, number, q, true);
    return move(q, row, "DELIVERED", { actor: { id: user.id, role: "CUSTOMER" }, detail: "The customer confirmed delivery.", set: { delivered_at: new Date() } });
  });
  await notifyUsers(await artistUserIds(done.artist_id), { kind: "PAINTING_DELIVERED", ref: done.request_number, title: `Painting ${done.request_number} delivered`, body: "The customer confirmed that the painting arrived.", link: `artist-dashboard.html#/requests/${done.request_number}` });
  return getOwnRequest(user.id, number);
}

/* ---------------------------------------------------------------- The artist */

async function artistRow(artist, number, q = db, lock = false) {
  if (!REQUEST_NUMBER.test(String(number || ""))) throw notFound();
  const row = (await q.query(`${SQL} WHERE r.request_number = $1 AND r.artist_id = $2${lock ? " FOR UPDATE OF r" : ""}`, [String(number), artist.id])).rows[0];
  // Another artist's request looks exactly like one that doesn't exist.
  if (!row) throw notFound();
  return row;
}

export async function getArtistRequest(artist, number) {
  const row = await artistRow(artist, number);
  return artistView(row, await partsOf(row.id));
}

const FILTERS = {
  new: ["PENDING_ARTIST_RESPONSE"],
  accepted: ["ADVANCE_PAYMENT_PENDING"],
  active: ["ADVANCE_PAID", "PAINTING_IN_PROGRESS", "REMAINING_PAYMENT_PENDING", "READY_FOR_DISPATCH", "SHIPPED"],
  completed: ["DELIVERED"],
  declined: ["DECLINED", "CANCELLED"]
};
export const REQUEST_FILTERS = Object.keys(FILTERS);

export async function listArtistRequests(artist, { filter = "", page = 1, limit = 20 } = {}) {
  const size = Math.min(Math.max(1, limit), 50);
  const statuses = FILTERS[filter] || null;
  const where = `r.artist_id = $1${statuses ? ` AND r.status IN (${statuses.map((s) => `'${s}'`).join(", ")})` : ""}`;
  const total = (await db.query(`SELECT count(*)::int AS n FROM painting_requests r WHERE ${where}`, [artist.id])).rows[0].n;
  const { rows } = await db.query(`${SQL} WHERE ${where} ORDER BY r.updated_at DESC LIMIT $2 OFFSET $3`, [artist.id, size, (Math.max(1, page) - 1) * size]);
  const counts = (await db.query("SELECT status, count(*)::int AS n FROM painting_requests WHERE artist_id = $1 GROUP BY status", [artist.id])).rows;
  const by = Object.fromEntries(Object.entries(FILTERS).map(([name, list]) => [name, counts.filter((c) => list.includes(c.status)).reduce((sum, c) => sum + c.n, 0)]));
  return { items: rows.map((r) => ({ ...summary(r), nextStep: nextStep(r, "artist") })), total, page: Math.max(1, page), limit: size, counts: by };
}

/** ACCEPT or DECLINE. Accepting asks the customer for the advance; declining closes the request with nothing payable. */
export async function respond(artist, number, { accept, reason = "" }, { actor, ip = null }) {
  const done = await db.tx(async (q) => {
    const row = await artistRow(artist, number, q, true);
    const by = { id: actor.id, role: "ARTIST" };
    if (accept) {
      const moved = await move(q, row, "ADVANCE_PAYMENT_PENDING", { actor: by, detail: `Accepted by the artist. Advance of ${rupees(row.advance_amount)} (${row.advance_percent}%) requested.`, set: { responded_at: new Date() } });
      await audit(q, { actor, action: ACTIONS.PAINTING_ACCEPTED, targetType: "painting_request", targetId: row.request_number, metadata: { artist: artist.code }, ip });
      return moved;
    }
    const why = text(reason, 300);
    const moved = await move(q, row, "DECLINED", { actor: by, detail: why ? `Declined by the artist: ${why}` : "Declined by the artist.", set: { responded_at: new Date(), decline_reason: why || null } });
    await audit(q, { actor, action: ACTIONS.PAINTING_DECLINED, targetType: "painting_request", targetId: row.request_number, metadata: { artist: artist.code }, ip });
    return moved;
  });
  const link = `painting.html?id=${done.request_number}`;
  if (accept) await notifyUser(done.user_id, { kind: "PAINTING_ACCEPTED", ref: done.request_number, title: "Your custom painting request was accepted", body: `Your request has been accepted. Please pay the ${done.advance_percent}% advance (${rupees(done.advance_amount)}) to start the painting.`, link, email: true, button: "Pay the advance" });
  else await notifyUser(done.user_id, { kind: "PAINTING_DECLINED", ref: done.request_number, title: "Your custom painting request was declined", body: "The artist has declined this custom painting request. Nothing was charged.", link, email: true, button: "View your request" });
  return getArtistRequest(artist, number);
}

/**
 * The artist's own steps after the money arrived:
 *   start     ADVANCE_PAID -> PAINTING_IN_PROGRESS
 *   complete  PAINTING_IN_PROGRESS -> REMAINING_PAYMENT_PENDING (the customer is asked for the balance)
 *   dispatch  READY_FOR_DISPATCH -> SHIPPED
 *   deliver   SHIPPED -> DELIVERED
 */
export async function artistStep(artist, number, step, { note = "" } = {}, { actor, ip = null }) {
  const by = { id: actor.id, role: "ARTIST" };
  const plan = {
    start: { to: "PAINTING_IN_PROGRESS", detail: "The artist started the painting.", set: () => ({ started_at: new Date() }) },
    complete: { to: "REMAINING_PAYMENT_PENDING", detail: "The artist marked the painting as completed.", set: () => ({ completed_at: new Date() }) },
    dispatch: { to: "SHIPPED", detail: text(note, 300) ? `Dispatched: ${text(note, 300)}` : "Dispatched.", set: () => ({ shipped_at: new Date(), dispatch_note: text(note, 300) || null }) },
    deliver: { to: "DELIVERED", detail: "Marked as delivered by the artist.", set: () => ({ delivered_at: new Date() }) }
  }[step];
  if (!plan) throw errors.validation({ step: "Choose what to do next." });
  const done = await db.tx(async (q) => {
    const row = await artistRow(artist, number, q, true);
    const moved = await move(q, row, plan.to, { actor: by, detail: plan.detail, set: plan.set() });
    await audit(q, { actor, action: ACTIONS.PAINTING_STATUS_CHANGED, targetType: "painting_request", targetId: row.request_number, metadata: { artist: artist.code, to: plan.to }, ip });
    return moved;
  });
  const link = `painting.html?id=${done.request_number}`;
  const pct = 100 - done.advance_percent;
  const message = {
    start: { kind: "PAINTING_STARTED", title: "Your painting has been started", body: "The artist has started working on your painting." },
    complete: { kind: "PAINTING_COMPLETED", title: "Your painting is completed", body: `Your painting is completed. Please pay the remaining ${pct}% (${rupees(done.balance_amount)}) to continue with dispatch.`, email: true, button: "Pay the remaining amount" },
    dispatch: { kind: "PAINTING_SHIPPED", title: "Your painting has been dispatched", body: done.dispatch_note ? `Your painting is on its way. ${done.dispatch_note}` : "Your painting is on its way.", email: true, button: "View your painting" },
    deliver: { kind: "PAINTING_DELIVERED", title: "Your painting was delivered", body: "Your painting has been delivered. We hope you love it." }
  }[step];
  await notifyUser(done.user_id, { ref: done.request_number, link, ...message });
  return getArtistRequest(artist, number);
}

/** A short-lived link to the customer's ORIGINAL reference photo, for the artist the request belongs to. Logged. */
export async function artistPhotoLink(artist, number, uploadId, { actor, ip = null }) {
  const row = await artistRow(artist, number);
  if (["DECLINED", "CANCELLED"].includes(row.status)) throw conflict("PAINTING_CLOSED", "This request is closed, so its photos are no longer available.");
  const photo = isUuid(uploadId) && (await db.query("SELECT u.*, p.position FROM painting_request_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.request_id = $1 AND u.id = $2 AND u.status <> 'DELETED'", [row.id, uploadId])).rows[0];
  if (!photo) throw errors.notFound("We couldn't find that photo.", "UPLOAD_NOT_FOUND");
  await audit(db, { actor, action: ACTIONS.PAINTING_REFERENCE_ACCESSED, targetType: "painting_request", targetId: row.request_number, metadata: { artist: artist.code, upload: photo.id }, ip });
  return linkTo(photo, { download: true, name: `${row.request_number}-reference${photo.position}-${photo.original_name}`.slice(0, 180) });
}

/** What the artist has been paid for so far (before any commission: payouts are not automated). */
export async function artistEarnings(artist) {
  const r = (await db.query(
    `SELECT coalesce(sum(amount_paid) FILTER (WHERE refund_status <> 'REFUNDED'), 0)::int AS received,
            coalesce(sum(price - amount_paid) FILTER (WHERE status IN ('ADVANCE_PAYMENT_PENDING', 'ADVANCE_PAID', 'PAINTING_IN_PROGRESS', 'REMAINING_PAYMENT_PENDING')), 0)::int AS outstanding,
            count(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered
       FROM painting_requests WHERE artist_id = $1`,
    [artist.id]
  )).rows[0];
  const art = (await db.query(
    `SELECT coalesce(sum(i.line_total), 0)::int AS total, count(*)::int AS lines FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE i.artist_id = $1 AND o.payment_status = 'PAID' AND o.status NOT IN ('CANCELLED', 'RETURNED')`,
    [artist.id]
  )).rows[0];
  return { paintings: { received: r.received, outstanding: r.outstanding, delivered: r.delivered }, artworks: { paid: art.total, lines: art.lines }, commissionPercent: config.platform.commissionPercent, note: "Amounts customers have paid. Payouts to artists are arranged by FrameX and are not automated." };
}

/* ---------------------------------------------------------------- FrameX staff */

async function adminRow(number, q = db, lock = false) {
  if (!REQUEST_NUMBER.test(String(number || ""))) throw notFound();
  const row = (await q.query(`${SQL} WHERE r.request_number = $1${lock ? " FOR UPDATE OF r" : ""}`, [String(number)])).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function adminGet(number) {
  const row = await adminRow(number);
  return adminView(row, await partsOf(row.id));
}

export async function adminList({ status = "", q = "", page = 1, limit = 20 } = {}) {
  const params = [];
  const where = [];
  if (status) where.push(`r.status = $${params.push(status)}`);
  if (q) where.push(`(lower(r.request_number) LIKE $${params.push(`%${String(q).toLowerCase().replace(/[%_\\]/g, "\\$&")}%`)} OR lower(r.customer_name) LIKE $${params.length} OR lower(a.name) LIKE $${params.length})`);
  const sql = where.length ? "WHERE " + where.join(" AND ") : "";
  const size = Math.min(Math.max(1, limit), 50);
  const total = (await db.query(`SELECT count(*)::int AS n FROM painting_requests r JOIN artists a ON a.id = r.artist_id ${sql}`, params)).rows[0].n;
  params.push(size, (Math.max(1, page) - 1) * size);
  const { rows } = await db.query(`${SQL} ${sql} ORDER BY r.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows.map(summary), total, page: Math.max(1, page), limit: size };
}

/**
 * FrameX cancels a request (any time before it is dispatched).
 * If money was paid, the request is marked REFUND_PENDING: nothing is sent
 * back automatically.
 * TODO (business policy, to be decided by FrameX): how much of the advance is
 * returned when a request is cancelled after the artist has started, and who
 * may ask for it. Until that is decided, a FrameX admin refunds by hand in the
 * payment gateway's dashboard and records it here with adminRecordRefund().
 */
export async function adminCancel(number, reason, { actor, ip = null }) {
  const why = text(reason, 300);
  if (why.length < 3) throw errors.validation({ reason: "Say why the request is being cancelled." });
  const done = await db.tx(async (q) => {
    const row = await adminRow(number, q, true);
    const moved = await move(q, row, "CANCELLED", { actor: { id: actor.id, role: "ADMIN" }, detail: `Cancelled by FrameX: ${why}`, set: { cancel_reason: why, cancelled_at: new Date(), ...(row.amount_paid > 0 ? { refund_status: "REFUND_PENDING" } : {}) } });
    await q.query("UPDATE painting_payments SET status = 'CANCELLED', failure_reason = coalesce(failure_reason, 'Request cancelled'), updated_at = now() WHERE request_id = $1 AND status = 'PENDING'", [row.id]);
    await audit(q, { actor, action: ACTIONS.PAINTING_CANCELLED, targetType: "painting_request", targetId: row.request_number, metadata: { by: "admin", reason: why, amountPaid: row.amount_paid }, ip });
    return moved;
  });
  const body = done.amount_paid > 0 ? `This custom painting request was cancelled by FrameX: ${why} FrameX will contact you about the ${rupees(done.amount_paid)} you paid.` : `This custom painting request was cancelled by FrameX: ${why}`;
  await notifyUser(done.user_id, { kind: "PAINTING_CANCELLED", ref: done.request_number, title: `Painting request ${done.request_number} was cancelled`, body, link: `painting.html?id=${done.request_number}`, email: true, button: "View your request" });
  await notifyUsers(await artistUserIds(done.artist_id), { kind: "PAINTING_CANCELLED", ref: done.request_number, title: `Request ${done.request_number} was cancelled`, body: `FrameX cancelled this request: ${why}`, link: `artist-dashboard.html#/requests/${done.request_number}` });
  return adminGet(number);
}

/** Record that a refund was made by hand (in the gateway's dashboard, or another way). Changes no money. */
export async function adminRecordRefund(number, note, { actor, ip = null }) {
  const what = text(note, 300);
  if (what.length < 3) throw errors.validation({ note: "Say what was refunded and how." });
  await db.tx(async (q) => {
    const row = await adminRow(number, q, true);
    if (row.refund_status !== "REFUND_PENDING") throw conflict("NO_REFUND_PENDING", "This request has no refund waiting.");
    await q.query("UPDATE painting_requests SET refund_status = 'REFUNDED', refund_note = $2, updated_at = now() WHERE id = $1", [row.id, what]);
    await addEvent(q, row.id, { status: null, detail: `Refund recorded by FrameX: ${what}`, actor: { id: actor.id, role: "ADMIN" } });
    await audit(q, { actor, action: ACTIONS.PAINTING_REFUND_RECORDED, targetType: "painting_request", targetId: row.request_number, metadata: { note: what }, ip });
  });
  return adminGet(number);
}

/** FrameX marks a dispatched painting as delivered (the artist or the customer can too). */
export async function adminMarkDelivered(number, { actor, ip = null }) {
  await db.tx(async (q) => {
    const row = await adminRow(number, q, true);
    await move(q, row, "DELIVERED", { actor: { id: actor.id, role: "ADMIN" }, detail: "Marked as delivered by FrameX.", set: { delivered_at: new Date() } });
    await audit(q, { actor, action: ACTIONS.PAINTING_STATUS_CHANGED, targetType: "painting_request", targetId: row.request_number, metadata: { to: "DELIVERED", by: "admin" }, ip });
  });
  return adminGet(number);
}

export async function adminCounts() {
  const { rows } = await db.query("SELECT status, count(*)::int AS n FROM painting_requests GROUP BY status");
  return { ...Object.fromEntries(STATUSES.map((s) => [s, (rows.find((r) => r.status === s) || { n: 0 }).n])), refundPending: (await db.query("SELECT count(*)::int AS n FROM painting_requests WHERE refund_status = 'REFUND_PENDING'")).rows[0].n };
}
