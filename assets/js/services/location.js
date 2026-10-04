/* ==========================================================================
   Location service.
   Real behaviour only. The visitor's position comes from the browser
   (navigator.geolocation, asked only after they press a button) or from a
   place they typed in. It is kept in memory for this page only, never stored.

   With the FrameX backend connected, distances are calculated by the backend
   from each shop's stored coordinates. distanceKm() below is only used by the
   catalogue-file fallback, and shows nothing when a shop has no coordinates.
   ========================================================================== */
(function (FrameX) {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;

  /** Haversine distance in km between two {latitude, longitude} points, or null. */
  function distanceKm(a, b) {
    const valid = (p) =>
      p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
    if (!valid(a) || !valid(b)) return null;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.latitude)) *
        Math.cos(toRad(b.latitude)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  function formatDistance(km) {
    if (km == null) return "";
    return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
  }

  // { latitude, longitude, accuracy, source: "device" | "place", label }
  let current = null;

  /**
   * Ask the browser for the device's position. Call only from a click.
   * Resolves the location; rejects with an Error whose `code` is
   * "unsupported" | "insecure" | "denied" | "unavailable" | "timeout".
   */
  function requestPosition() {
    return new Promise((resolve, reject) => {
      const fail = (code, message) =>
        reject(Object.assign(new Error(message || code), { code }));
      if (!("geolocation" in navigator)) return fail("unsupported");
      // Browsers only share location on https:// (or localhost).
      if (window.isSecureContext === false) return fail("insecure");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          current = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: "device",
            label: "your location",
          };
          resolve(current);
        },
        (err) =>
          fail(
            err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable",
            err.message,
          ),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    });
  }

  /** Use a place the visitor typed in (found by place search). It is approximate, and labelled so. */
  function setPlace(place) {
    current = {
      latitude: place.latitude,
      longitude: place.longitude,
      accuracy: null,
      source: "place",
      label: place.label,
    };
    return current;
  }

  FrameX.location = {
    distanceKm,
    formatDistance,
    requestPosition,
    setPlace,
    clear: () => (current = null),
    getCurrent: () => current,
  };
})((window.FrameX = window.FrameX || {}));
