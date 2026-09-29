/* Helpers that turn shop data into display text. */
(function (FrameX) {
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function formatAddress(shop) {
    const a = shop.address || {};
    const first = [a.line1, a.area].filter(Boolean).join(", ");
    const second = [a.city, a.postalCode].filter(Boolean).join(" - ");
    return [first, second].filter(Boolean).join(", ") || "Address not added yet";
  }

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  /** true / false, or null when the shop has not published opening hours. */
  function isOpenNow(shop, now = new Date()) {
    if (!shop.openingHours) return null;
    const today = shop.openingHours[DAYS[now.getDay()]];
    if (!today) return false;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= toMinutes(today[0]) && minutes < toMinutes(today[1]);
  }

  FrameX.shopUtils = { formatAddress, isOpenNow };
})((window.FrameX = window.FrameX || {}));
