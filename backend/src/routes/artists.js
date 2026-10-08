/* ==========================================================================
   Art & Artists.

   Public (/api/artists, /api/artworks):
     GET  /api/artists                    the directory (search by name, username, style, medium, city)
     GET  /api/artists/facets             styles, mediums and cities to filter by
     GET  /api/artists/:ref               one artist (artist ID or username): profile, price list, artworks, reviews
     POST /api/artists/applications       "Join as an artist" (creates no login)
     GET  /api/artworks                   approved artworks
     GET  /api/artworks/:ref              one approved artwork

   The artist's own work (/api/artist, ARTIST login only). The artist is always
   the one behind the session; no route takes an artist id from the request:
     GET/PATCH /api/artist/profile
     POST      /api/artist/media                     upload a picture (raw bytes)
     GET       /api/artist/overview
     GET/PUT   /api/artist/artworks[/:id]            add or change (it then waits for FrameX's review)
     POST      /api/artist/artworks/:id/status       withdraw, pause, show again, send a withdrawn one for review again
     GET/POST/PUT/DELETE /api/artist/services[/:id]  the custom painting price list
     GET       /api/artist/requests[/:number]        custom painting requests
     POST      /api/artist/requests/:number/respond  accept or decline
     POST      /api/artist/requests/:number/step     start, complete, dispatch, deliver
     POST      /api/artist/requests/:number/photos/:uploadId/link
     GET/PATCH /api/artist/orders...                 orders of the artist's artworks
     GET       /api/artist/earnings
   ========================================================================== */
import { Router } from "express";
import { errors } from "../lib/errors.js";
import { rateLimit } from "../lib/rate-limit.js";
import { isUuid, v, validate } from "../lib/validate.js";
import { requireArtist } from "../middleware/auth.js";
import * as artists from "../services/artist-service.js";
import * as artworks from "../services/artwork-service.js";
import { FULFILMENT_STATUSES } from "../services/order-service.js";
import * as paintings from "../services/painting-service.js";
import * as reviews from "../services/review-service.js";
import * as shopOrders from "../services/shop-order-service.js";

const who = (req) => ({ actor: req.auth.user, ip: req.ip });
const paging = { page: v.number({ min: 1, max: 100000, required: false }), limit: v.number({ min: 1, max: 48, required: false }) };

/* ---------------------------------------------------------------- Public: artists */

export const artistRoutes = Router();

artistRoutes.get("/", async (req, res) => {
  const f = validate(req.query, { q: v.string({ max: 80 }), style: v.string({ max: 60 }), city: v.string({ max: 80 }), ...paging });
  res.json(await artists.listArtists({ q: f.q, style: f.style, city: f.city, page: f.page || 1, limit: f.limit || 12 }));
});

artistRoutes.get("/facets", async (req, res) => res.json(await artists.directoryFacets()));

// "Join as an artist". No login is created here; a FrameX admin reviews it first.
artistRoutes.post("/applications", rateLimit("artist-apply", { windowMs: 60 * 60_000, max: 10 }), async (req, res) => {
  const data = validate(req.body, {
    name: v.string({ min: 2, max: 80, label: "Your name" }),
    email: v.email(),
    phone: v.phone({ required: true }),
    city: v.string({ min: 2, max: 80, label: "City" }),
    state: v.string({ min: 2, max: 80, label: "State" }),
    artStyles: v.string({ max: 300, label: "Art styles" }),
    mediums: v.string({ max: 300, label: "Mediums" }),
    experience: v.string({ max: 300, label: "Experience" }),
    portfolioUrl: v.string({ max: 300, label: "Portfolio link", pattern: /^https?:\/\/\S+$/i, patternMessage: "Enter a link that starts with http:// or https://." }),
    message: v.string({ max: 1000, label: "Message" })
  });
  res.status(201).json(await artists.submitApplication(data, req.ip));
});

artistRoutes.get("/:ref", async (req, res) => {
  const row = await artists.listedArtistRow(req.params.ref);
  if (!row) throw errors.notFound("We couldn't find that artist.", "ARTIST_NOT_FOUND");
  const artist = artists.publicArtist(row);
  const [services, works, review] = await Promise.all([
    artist.customEnabled ? paintings.listPublicServices(row.id) : [],
    artworks.listPublic({ artist: artist.artistCode, limit: 48 }),
    reviews.listFor("ARTIST", artist.artistCode, { limit: 10 })
  ]);
  res.json({ artist, services, artworks: works.items, reviews: review.items });
});

/* ---------------------------------------------------------------- Public: artworks */

export const artworkRoutes = Router();

artworkRoutes.get("/", async (req, res) => {
  const f = validate(req.query, { q: v.string({ max: 80 }), artType: v.enumOf(artworks.ART_TYPES, { required: false }), artist: v.string({ max: 40 }), sort: v.enumOf(["new", "price-low", "price-high"], { required: false }), ...paging });
  res.json({ ...(await artworks.listPublic({ q: f.q, artType: f.artType, artist: f.artist, sort: f.sort || "new", page: f.page || 1, limit: f.limit || 12 })), artTypes: artworks.ART_TYPES.map((id) => ({ id, name: artworks.ART_TYPE_NAMES[id] })) });
});

artworkRoutes.get("/:ref", async (req, res) => {
  const artwork = await artworks.getPublic(req.params.ref);
  res.json({ artwork, reviews: (await reviews.listFor("ARTWORK", artwork.id, { limit: 10 })).items });
});

/* ---------------------------------------------------------------- The artist's dashboard */

export const artistDashboardRoutes = Router();
artistDashboardRoutes.use(requireArtist);
const me = (req) => artists.artistContext(req.auth.user.artistId);

artistDashboardRoutes.get("/overview", async (req, res) => {
  const artist = await me(req);
  const [works, requests, earnings] = await Promise.all([artworks.ownCounts(artist), paintings.listArtistRequests(artist, { limit: 1 }), paintings.artistEarnings(artist)]);
  res.json({ artist: { artistCode: artist.code, username: artist.username, name: artist.name, listed: artist.listed }, artworks: works, requests: requests.counts, earnings });
});

artistDashboardRoutes.get("/profile", async (req, res) => res.json({ profile: await artists.getOwnProfile(req.auth.user.artistId) }));

artistDashboardRoutes.patch("/profile", async (req, res) => {
  const b = req.body && typeof req.body === "object" ? req.body : {};
  // Only these fields can be changed here. Contact details and status stay with FrameX.
  const changes = {};
  for (const key of ["name", "username", "bio", "experience", "city", "area", "state", "specialties", "mediums", "styles", "photo", "cover"]) if (b[key] !== undefined) changes[key] = b[key];
  for (const key of ["showArea", "customEnabled"]) if (b[key] !== undefined) changes[key] = Boolean(b[key]);
  res.json({ profile: await artists.updateProfile(req.auth.user.artistId, changes, who(req)) });
});

artistDashboardRoutes.post("/media", rateLimit("media", { windowMs: 10 * 60_000, max: 300 }), async (req, res) => {
  res.status(201).json({ media: await artists.receiveMedia(await me(req), req.auth.user, req) });
});

/* ---- Artworks ---- */

artistDashboardRoutes.get("/artworks", async (req, res) => {
  const { status } = validate(req.query, { status: v.enumOf(artworks.ARTWORK_STATUSES, { required: false }) });
  const artist = await me(req);
  res.json({ items: await artworks.listOwn(artist, { status }), counts: await artworks.ownCounts(artist), artTypes: artworks.ART_TYPES.map((id) => ({ id, name: artworks.ART_TYPE_NAMES[id] })) });
});

artistDashboardRoutes.get("/artworks/:id", async (req, res) => res.json({ artwork: await artworks.getOwn(await me(req), req.params.id) }));

artistDashboardRoutes.put("/artworks/:id", rateLimit("artwork-save", { windowMs: 60_000, max: 60 }), async (req, res) => {
  res.json({ artwork: await artworks.saveOwn(await me(req), req.params.id, req.body, who(req)) });
});

artistDashboardRoutes.post("/artworks/:id/status", async (req, res) => {
  const { status } = validate(req.body, { status: v.enumOf(["CANCELLED", "INACTIVE", "APPROVED", "PENDING_REVIEW"], { label: "Status" }) });
  res.json({ artwork: await artworks.setOwnStatus(await me(req), req.params.id, status, who(req)) });
});

/* ---- Custom painting price list ---- */

artistDashboardRoutes.get("/services", async (req, res) => res.json({ items: await paintings.listOwnServices(await me(req)) }));
artistDashboardRoutes.post("/services", async (req, res) => res.status(201).json({ service: await paintings.saveService(await me(req), null, req.body, who(req)) }));
artistDashboardRoutes.put("/services/:id", async (req, res) => res.json({ service: await paintings.saveService(await me(req), req.params.id, req.body, who(req)) }));
artistDashboardRoutes.delete("/services/:id", async (req, res) => {
  await paintings.removeService(await me(req), req.params.id);
  res.json({ ok: true });
});

/* ---- Custom painting requests ---- */

artistDashboardRoutes.get("/requests", async (req, res) => {
  const f = validate(req.query, { filter: v.enumOf(paintings.REQUEST_FILTERS, { required: false }), page: v.number({ min: 1, max: 100000, required: false }) });
  res.json(await paintings.listArtistRequests(await me(req), { filter: f.filter, page: f.page || 1 }));
});

artistDashboardRoutes.get("/requests/:number", async (req, res) => res.json({ request: await paintings.getArtistRequest(await me(req), req.params.number) }));

artistDashboardRoutes.post("/requests/:number/respond", async (req, res) => {
  const data = validate(req.body, { decision: v.enumOf(["ACCEPT", "DECLINE"], { label: "Decision" }), reason: v.string({ max: 300, label: "Reason" }) });
  res.json({ request: await paintings.respond(await me(req), req.params.number, { accept: data.decision === "ACCEPT", reason: data.reason }, who(req)) });
});

artistDashboardRoutes.post("/requests/:number/step", async (req, res) => {
  const data = validate(req.body, { step: v.enumOf(["start", "complete", "dispatch", "deliver"], { label: "Step" }), note: v.string({ max: 300, label: "Note" }) });
  res.json({ request: await paintings.artistStep(await me(req), req.params.number, data.step, { note: data.note }, who(req)) });
});

artistDashboardRoutes.post("/requests/:number/photos/:uploadId/link", rateLimit("file-link", { windowMs: 60_000, max: 120 }), async (req, res) => {
  res.json({ link: await paintings.artistPhotoLink(await me(req), req.params.number, req.params.uploadId, who(req)) });
});

/* ---- Orders of the artist's artworks (the same fulfilment steps shops use) ---- */

artistDashboardRoutes.get("/orders", async (req, res) => {
  const { filter, page } = validate(req.query, { filter: v.enumOf(["open", "done"], { required: false }), page: v.number({ min: 1, max: 100000, required: false }) });
  res.json(await shopOrders.listOrders(await me(req), { filter, page: page || 1 }));
});

artistDashboardRoutes.get("/orders/:orderNumber", async (req, res) => res.json({ order: await shopOrders.getOrder(await me(req), req.params.orderNumber) }));

artistDashboardRoutes.patch("/orders/:orderNumber/items/:itemId", async (req, res) => {
  if (!isUuid(req.params.itemId)) throw errors.notFound("That item isn't one of your items in this order.", "ORDER_ITEM_NOT_FOUND");
  const data = validate(req.body, { status: v.enumOf(FULFILMENT_STATUSES, { label: "Step" }), note: v.string({ max: 200, label: "Note" }) });
  res.json({ order: await shopOrders.setFulfilment(await me(req), req.params.orderNumber, req.params.itemId, data, who(req)) });
});

artistDashboardRoutes.get("/earnings", async (req, res) => res.json({ earnings: await paintings.artistEarnings(await me(req)) }));
