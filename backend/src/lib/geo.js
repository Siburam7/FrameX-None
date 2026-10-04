/* ==========================================================================
   Geography helpers for the nearby-shop search.
   Distances are great-circle (straight-line) distances computed by the
   database with the Haversine formula from each shop's stored coordinates.
   ========================================================================== */
export const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEGREE_LAT = 111.32;

/** Haversine distance in km as an SQL expression; $lat / $lng are parameter placeholders. */
export const haversineSql = (latParam, lngParam, latCol = "latitude", lngCol = "longitude") =>
  `(${EARTH_RADIUS_KM} * 2 * asin(least(1, sqrt(
      power(sin(radians(${latCol} - ${latParam}) / 2), 2) +
      cos(radians(${latParam})) * cos(radians(${latCol})) * power(sin(radians(${lngCol} - ${lngParam}) / 2), 2)
    ))))`;

/**
 * Latitude / longitude box that contains every point within radiusKm.
 * The database uses it with the (latitude, longitude) index to discard far-away
 * shops before the exact distance is calculated. lng is null when the box
 * wraps the poles / date line (then only latitude is pre-filtered).
 */
export function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = cos > 0.01 ? radiusKm / (KM_PER_DEGREE_LAT * cos) : 180;
  const minLng = lng - dLng;
  const maxLng = lng + dLng;
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    lng: minLng < -180 || maxLng > 180 ? null : { min: minLng, max: maxLng }
  };
}

/** Same formula in JavaScript (used by tests to check the database's answers). */
export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
