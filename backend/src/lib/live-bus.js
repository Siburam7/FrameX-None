/* ==========================================================================
   Live connections for the FrameX Care chat (owner, 2026-10-24).

   The website keeps one open request ("server-sent events") while a customer
   waits for or talks to FrameX Care, and while a care person has the care desk
   open. Anything new (a message, "typing…", someone accepted, the chat ended)
   is pushed down those connections at once — no page asks every second, and
   the database isn't woken up for it.

   This lives in the server's memory: one Render instance serves everyone. If
   a connection drops, the page connects again and reloads the chat, so nothing
   is lost (every message is in the database).

     openStream(req, res)                 turn a request into an event stream
     addCustomer(userId, res)             -> remove()
     addStaff(user, res, available)       -> remove()
     toCustomer(userId, type, data)
     toStaff(type, data, { only })        all connected care people, or only one user id
     setAvailable(userId, on)             their "Available / Away" switch, for open desks
     staffOnline()                        how many care people are Available with their desk open
     customerOnline(userId)
   ========================================================================== */
const customers = new Map(); // userId -> Set<res>
const staff = new Map(); // userId -> { name, available, conns: Set<res> }
const PING_MS = 25_000;

function send(res, type, data) {
  try {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    /* the connection is closing; its "close" handler removes it */
  }
}

/** Headers and keep-alive for an event stream. Returns a function to call when the stream is set up. */
export function openStream(req, res, register) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  const remove = register(res);
  send(res, "ready", { at: new Date().toISOString() });
  // A comment every 25 seconds keeps proxies from closing a quiet connection.
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (error) {
      /* closing */
    }
  }, PING_MS);
  req.on("close", () => {
    clearInterval(ping);
    remove();
  });
}

export function addCustomer(userId, res) {
  if (!customers.has(userId)) customers.set(userId, new Set());
  customers.get(userId).add(res);
  return () => {
    const set = customers.get(userId);
    if (!set) return;
    set.delete(res);
    if (!set.size) customers.delete(userId);
  };
}

export function addStaff(user, res, available) {
  if (!staff.has(user.id)) staff.set(user.id, { name: user.name, available, conns: new Set() });
  const entry = staff.get(user.id);
  entry.available = available;
  entry.conns.add(res);
  return () => {
    entry.conns.delete(res);
    if (!entry.conns.size) staff.delete(user.id);
  };
}

export function toCustomer(userId, type, data) {
  const set = customers.get(userId);
  if (set) for (const res of set) send(res, type, data);
}

export function toStaff(type, data, { only = null } = {}) {
  for (const [id, entry] of staff) if (!only || id === only) for (const res of entry.conns) send(res, type, data);
}

export function setAvailable(userId, on) {
  const entry = staff.get(userId);
  if (entry) entry.available = on;
}

export const staffOnline = () => [...staff.values()].filter((s) => s.available).length;
export const customerOnline = (userId) => customers.has(userId);

/* ---------------------------------------------------------------- The admin panel, live (owner, 2026-11-09)
   "pura Admin page ko live kar doo": an open admin panel keeps one connection; after any change that went through
   (a write answered below 400: an order, a payment webhook, an application, a review, an admin's own action in
   another tab…) it is told which area changed — only the area's name, no data — and loads its screen again.
   Busy, repetitive or private writes (visitor statistics, the cart, photo uploads, "typing…", logins) say nothing. */
const admins = new Set(); // res

export function addAdmin(res) {
  admins.add(res);
  return () => admins.delete(res);
}

export function toAdmins(type, data) {
  for (const res of admins) send(res, type, data);
}

const QUIET =
  /^\/api\/(analytics|uploads|files|cart|notifications|designs|ping)(\/|$)|^\/api\/support\/typing|^\/api\/care\/(typing|presence|threads\/[^/]+\/typing)|^\/api\/auth\/(login|logout|code\/send|recovery|token-info|reset-password|set-password|change-password)/;

/** Express middleware: after a successful write, tell the open admin panels which area changed. */
export function adminLiveSignal(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    if (res.statusCode >= 400 || !admins.size) return;
    const path = String(req.originalUrl || "").split("?")[0];
    if (!path.startsWith("/api/") || QUIET.test(path)) return;
    toAdmins("changed", { area: path.split("/")[2] || "" });
  });
  next();
}

/** Tests: forget every connection. */
export function resetLiveBus() {
  customers.clear();
  staff.clear();
  admins.clear();
}
