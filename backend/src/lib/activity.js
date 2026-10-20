/* ==========================================================================
   Quiet times: the server stays awake, the database may sleep.
   A pinger (UptimeRobot) calls GET /api/ping every few minutes so the free
   host never puts the server to sleep. The database (Neon free plan: 100
   CU-hours a month) sleeps after 5 idle minutes only if nothing queries it,
   so while nobody uses the site the background jobs that use the database
   wait: the first visitor after a quiet time starts them again.
   ========================================================================== */
import { config } from "../config.js";

// Calls that are not a visitor: the pinger and the host's health check.
const NOT_A_VISIT = /^\/api\/(ping|health)\/?$/;

let lastVisit = Date.now(); // starting up counts as a visit (the start-up jobs run at once)
const waiting = new Map(); // name -> job that came due during a quiet time

const quietMs = () => config.quietAfterMinutes * 60 * 1000;
export const isQuiet = (now = Date.now()) => now - lastVisit > quietMs();

/** A visitor (or a payment gateway's webhook) arrived: jobs that waited run now, once each. */
export function markVisit(now = Date.now()) {
  lastVisit = now;
  if (!waiting.size) return;
  const jobs = [...waiting.values()];
  waiting.clear();
  for (const job of jobs) job();
}

/** The job, as a timer runs it: at once while the site is used, otherwise when the next visitor arrives. */
export function unlessQuiet(name, job) {
  return () => {
    if (!isQuiet()) return job();
    waiting.set(name, job);
  };
}

export function noteVisits(req, res, next) {
  if (!NOT_A_VISIT.test(req.path)) markVisit();
  next();
}

/** For tests: the jobs waiting for a visitor. */
export const waitingJobs = () => [...waiting.keys()];
