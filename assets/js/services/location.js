/* ==========================================================================
   Location service.
   Real behaviour only. The visitor's position comes from the browser
   (navigator.geolocation, asked only after they press a button, or used at
   once when the visitor allowed it on an earlier visit) or from a place they
   typed in. It is kept for this browser tab only (sessionStorage), so the next
   page doesn't ask again; closing the tab forgets it. It is never saved by
   FrameX.

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

  const KEY = "framex.location.v1";
  // off = the visitor pressed "Clear location": this tab doesn't use the location again until they ask for it
  function keep({ off = false } = {}) {
    try {
      if (current) window.sessionStorage.setItem(KEY, JSON.stringify(current));
      else if (off) window.sessionStorage.setItem(KEY, JSON.stringify({ off: true }));
      else window.sessionStorage.removeItem(KEY);
    } catch (error) {
      /* storage blocked: it lasts for this page only */
    }
  }
  /** The location this tab already has (from an earlier page), or null. */
  function restore() {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
      if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) current = saved;
    } catch (error) {
      /* nothing kept */
    }
    return current;
  }
  /** "granted" | "prompt" | "denied", or null when the browser can't say. Asking this shows nothing to the visitor. */
  async function permission() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return null;
      return (await navigator.permissions.query({ name: "geolocation" })).state;
    } catch (error) {
      return null;
    }
  }

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
          keep();
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
    keep();
    return current;
  }

  FrameX.location = {
    distanceKm,
    formatDistance,
    requestPosition,
    setPlace,
    /** "Clear location": forgotten, and not used again in this tab until the visitor asks for it. */
    clear: () => {
      current = null;
      keep({ off: true });
    },
    /** Did the visitor clear the location in this tab? */
    cleared: () => {
      try {
        return Boolean((JSON.parse(window.sessionStorage.getItem(KEY) || "null") || {}).off);
      } catch (error) {
        return false;
      }
    },
    getCurrent: () => current,
    restore,
    permission,
  };
})((window.FrameX = window.FrameX || {}));
