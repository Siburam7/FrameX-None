/* ==========================================================================
   Location service.
   Real behaviour only: asks the browser for the visitor's position and
   computes great-circle distance from real coordinates. If a shop has no
   coordinates, no distance is shown — nothing is estimated or typed in.
   The visitor's position is kept in memory only (never stored).
   ========================================================================== */
(function (FrameX) {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;

  /** Haversine distance in km between two {latitude, longitude} points, or null. */
  function distanceKm(a, b) {
    const valid = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
    if (!valid(a) || !valid(b)) return null;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  function formatDistance(km) {
    if (km == null) return "";
    return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
  }

  let current = null;

  /** Resolves {latitude, longitude, accuracy}. Rejects with an Error whose `code` is "unsupported" | "denied" | "unavailable" | "timeout". */
  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        return reject(Object.assign(new Error("Geolocation unsupported"), { code: "unsupported" }));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
          resolve(current);
        },
        (err) => {
          const code = err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable";
          reject(Object.assign(new Error(err.message), { code }));
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  FrameX.location = { distanceKm, formatDistance, requestPosition, getCurrent: () => current };
})((window.FrameX = window.FrameX || {}));
