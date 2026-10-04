/* ==========================================================================
   Place search (geocoding): "Dhenkanal" / "751001" -> coordinates.
   Used for (a) a customer's manual location when browser location is off and
   (b) the admin's "look up coordinates" helper, where the admin checks and
   confirms the result before it is saved. Nothing is ever stored unconfirmed.

   Provider: OpenStreetMap Nominatim (free, low volume). Its usage policy
   needs an identifying User-Agent and at most one request per second, so
   requests are queued and results cached. A paid provider (Google, Mapbox)
   can replace search() here without touching the rest of the code.
   ========================================================================== */
import { config } from "../config.js";

const cache = new Map(); // query -> { at, results }
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;
let queue = Promise.resolve();
let lastCall = 0;

export const geocoderEnabled = () => config.geocoder.provider === "nominatim";

async function nominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "in" }).toString();
  const wait = Math.max(0, 1100 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const response = await fetch(url, {
    headers: { "User-Agent": `FrameX/1.0 (${config.geocoder.contactEmail || "contact not set"})`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);
  const list = await response.json();
  return list
    .map((r) => {
      const a = r.address || {};
      return {
        label: r.display_name,
        latitude: Number(r.lat),
        longitude: Number(r.lon),
        kind: r.addresstype || r.type || "",
        city: a.city || a.town || a.village || a.county || "",
        state: a.state || "",
        postalCode: a.postcode || ""
      };
    })
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
}

/** Returns [{ label, latitude, longitude, kind, city, state, postalCode }]. Throws when the provider is unreachable. */
export async function searchPlaces(query) {
  const key = query.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const job = queue.then(() => nominatim(query));
  queue = job.catch(() => {});
  const results = await job;
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), results });
  return results;
}
