/* ==========================================================================
   Platform settings a FrameX admin can change while the server runs.

   Every value has a default from the environment (config.js). A value saved
   here is kept in the database (platform_settings) and written into the same
   config object the rest of the backend already reads, so the checkout, the
   quotes and the painting flow need no second place to look.

   Only the settings listed in SPEC exist: an admin can't invent one.
   Secrets (keys, passwords) are never settings; they stay in the environment.
   ========================================================================== */
import { config } from "../config.js";
import { db } from "../db/index.js";
import { ACTIONS, audit } from "../lib/audit.js";
import { errors } from "../lib/errors.js";

const whole = (min, max) => (value) => (Number.isInteger(value) && value >= min && value <= max ? null : `Enter a whole number from ${min} to ${max}.`);
const percent = (min, max) => (value) => (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? null : `Enter a number from ${min} to ${max}.`);
const flag = (value) => (typeof value === "boolean" ? null : "Choose on or off.");
const couponCode = (value) => (typeof value === "string" && /^[A-Z0-9_-]{0,30}$/.test(value) ? null : "Enter a coupon code (letters and numbers), or leave it empty for no coupon.");

/* key -> { label, group, unit, check(value), get(), set(value) } */
const SPEC = {
  customPaintingAdvancePercent: {
    label: "Custom painting: advance payment",
    hint: "The part of a custom painting's price the customer pays before the artist starts. The rest is paid when the painting is finished. Applies to requests accepted from now on.",
    group: "Custom paintings",
    unit: "percent",
    check: whole(1, 99),
    get: () => config.paintings.advancePercent,
    set: (v) => (config.paintings.advancePercent = v)
  },
  giftWrapEnabled: { label: "Gift wrapping offered", group: "Gift wrapping", unit: "boolean", check: flag, get: () => config.checkout.giftWrap.enabled, set: (v) => (config.checkout.giftWrap.enabled = v) },
  giftWrapFee: { label: "Gift wrapping fee", group: "Gift wrapping", unit: "rupees", check: whole(0, 100000), get: () => config.checkout.giftWrap.fee, set: (v) => (config.checkout.giftWrap.fee = v) },
  codEnabled: { label: "Cash on Delivery offered", group: "Cash on Delivery", unit: "boolean", check: flag, get: () => config.checkout.cod.enabled, set: (v) => (config.checkout.cod.enabled = v) },
  codFee: { label: "Cash on Delivery fee", group: "Cash on Delivery", unit: "rupees", check: whole(0, 100000), get: () => config.checkout.cod.fee, set: (v) => (config.checkout.cod.fee = v) },
  shippingFee: { label: "Delivery fee", group: "Delivery and tax", unit: "rupees", check: whole(0, 100000), get: () => config.checkout.shippingFee, set: (v) => (config.checkout.shippingFee = v) },
  freeShippingAbove: {
    label: "Free delivery from",
    hint: "Orders of this value or more have no delivery fee. 0 = the delivery fee always applies.",
    group: "Delivery and tax",
    unit: "rupees",
    check: whole(0, 10000000),
    get: () => config.checkout.freeShippingAbove,
    set: (v) => (config.checkout.freeShippingAbove = v)
  },
  taxPercent: {
    label: "Tax added at checkout",
    hint: "Added on top of item prices. 0 = prices already include tax.",
    group: "Delivery and tax",
    unit: "percent",
    check: percent(0, 100),
    get: () => config.checkout.taxPercent,
    set: (v) => (config.checkout.taxPercent = v)
  },
  onlineDiscountPercent: {
    label: "Online payment discount",
    hint: "Taken off the items when the customer pays online (UPI, card, net banking). Not on Cash on Delivery. 0 = none.",
    group: "Delivery and tax",
    unit: "percent",
    check: percent(0, 20),
    get: () => config.checkout.onlineDiscountPercent,
    set: (v) => (config.checkout.onlineDiscountPercent = v)
  },
  listingMarkupPercent: {
    label: "Listing price: markup on the shop's price",
    hint: "A shop's product is listed at the shop's own price + this % + the delivery share for its box, rounded up to a price ending in 9. The shop always gets its own price. Everything 0 = off (the shop's price is the customer's price). Applies when a shop saves a product.",
    group: "Listing price of shops' products",
    unit: "percent",
    check: percent(0, 200),
    get: () => config.listing.markupPercent,
    set: (v) => (config.listing.markupPercent = v)
  },
  listingShareSmall: { label: "Delivery share: small box (longer side up to 12 inches)", group: "Listing price of shops' products", unit: "rupees", check: whole(0, 10000), get: () => config.listing.shares.small, set: (v) => (config.listing.shares.small = v) },
  listingShareMedium: { label: "Delivery share: medium box (up to 18 inches)", group: "Listing price of shops' products", unit: "rupees", check: whole(0, 10000), get: () => config.listing.shares.medium, set: (v) => (config.listing.shares.medium = v) },
  listingShareLarge: { label: "Delivery share: large box (over 18 inches)", group: "Listing price of shops' products", unit: "rupees", check: whole(0, 10000), get: () => config.listing.shares.large, set: (v) => (config.listing.shares.large = v) },
  commissionPercent: {
    label: "FrameX commission: shops",
    hint: "FrameX's share of each item a shop sells (not of delivery, gift wrap or tax). Taken from the shop's payout.",
    group: "Commission and payouts",
    unit: "percent",
    check: percent(0, 90),
    get: () => config.platform.commissionPercent,
    set: (v) => (config.platform.commissionPercent = v)
  },
  artistCommissionPercent: {
    label: "FrameX commission: artists",
    hint: "FrameX's share of each artwork and custom painting an artist sells. Taken from the artist's payout.",
    group: "Commission and payouts",
    unit: "percent",
    check: percent(0, 90),
    get: () => config.platform.artistCommissionPercent,
    set: (v) => (config.platform.artistCommissionPercent = v)
  },
  payoutFeePercent: {
    label: "Payout charge",
    hint: "Taken from every payout to a shop or an artist (after the commission). Shown to them on their Payouts page.",
    group: "Commission and payouts",
    unit: "percent",
    check: percent(0, 20),
    get: () => config.payouts.feePercent,
    set: (v) => (config.payouts.feePercent = v)
  },
  cartRemindersOn: {
    label: "Cart reminder emails",
    hint: "On: a customer who leaves items in the cart gets one email after the wait below (9 am to 9 pm only). Customers can turn these off for themselves.",
    group: "Cart reminders",
    unit: "boolean",
    check: flag,
    get: () => config.cartReminders.enabled,
    set: (v) => (config.cartReminders.enabled = v)
  },
  cartReminderHours: {
    label: "Send after the cart is left for",
    group: "Cart reminders",
    unit: "hours",
    check: whole(1, 168),
    get: () => config.cartReminders.hours,
    set: (v) => (config.cartReminders.hours = v)
  },
  cartReminderCoupon: {
    label: "Coupon in the email",
    hint: "A coupon code from Admin → Coupons. Shown only while the coupon works and the customer can still use it. Empty = no coupon.",
    group: "Cart reminders",
    unit: "text",
    check: couponCode,
    get: () => config.cartReminders.coupon,
    set: (v) => (config.cartReminders.coupon = v)
  },
  cartReminderDailyLimit: {
    label: "Most cart reminders a day",
    hint: "Keeps room in the free email allowance (300 a day) for login codes and order emails.",
    group: "Cart reminders",
    unit: "count",
    check: whole(0, 290),
    get: () => config.cartReminders.dailyLimit,
    set: (v) => (config.cartReminders.dailyLimit = v)
  },
  cartReminderWhatsappHours: {
    label: "On WhatsApp after the cart is left for",
    hint: "Only to customers who said yes to offers and reminders on WhatsApp (account page or the checkout tick). Switch: WhatsApp messages → \"WhatsApp: cart reminders\".",
    group: "Cart reminders",
    unit: "hours",
    check: whole(1, 72),
    get: () => config.cartReminders.whatsappHours,
    set: (v) => (config.cartReminders.whatsappHours = v)
  },
  cartReminderWhatsappDailyLimit: {
    label: "Most WhatsApp cart reminders a day",
    hint: "Each one is a paid WhatsApp marketing message.",
    group: "Cart reminders",
    unit: "count",
    check: whole(0, 1000),
    get: () => config.cartReminders.whatsappDailyLimit,
    set: (v) => (config.cartReminders.whatsappDailyLimit = v)
  },
  whatsappOrderUpdates: {
    label: "WhatsApp: order updates to customers",
    hint: "On: a customer who ticked \"order updates on WhatsApp\" at checkout gets placed, shipped, out for delivery, delivered, cancelled and refund news there too (about ₹0.25 a message). Needs the WhatsApp service (Fast2SMS) set up.",
    group: "WhatsApp messages",
    unit: "boolean",
    check: flag,
    get: () => config.whatsapp.orderUpdates,
    set: (v) => (config.whatsapp.orderUpdates = v)
  },
  whatsappSellerAlerts: {
    label: "WhatsApp: new orders to shops and artists",
    hint: "On: each shop and artist of a new order also hears about it on WhatsApp, on the number in their profile.",
    group: "WhatsApp messages",
    unit: "boolean",
    check: flag,
    get: () => config.whatsapp.sellerAlerts,
    set: (v) => (config.whatsapp.sellerAlerts = v)
  },
  whatsappAccountApproved: {
    label: "WhatsApp: \"approved\" to new shops and artists",
    hint: "On: a new shop or artist is told on WhatsApp that they are approved and that their setup link is in their email.",
    group: "WhatsApp messages",
    unit: "boolean",
    check: flag,
    get: () => config.whatsapp.accountApproved,
    set: (v) => (config.whatsapp.accountApproved = v)
  },
  whatsappLoginCodes: {
    label: "WhatsApp: login codes",
    hint: "On: a phone login code goes on WhatsApp first (template framex_login_code, \"Authentication\"); the customer can still ask for it by SMS. Turn it on only after Meta has approved the template.",
    group: "WhatsApp messages",
    unit: "boolean",
    check: flag,
    get: () => config.whatsapp.loginCodes,
    set: (v) => (config.whatsapp.loginCodes = v)
  },
  whatsappCartReminders: {
    label: "WhatsApp: cart reminders",
    hint: "On: a customer who said yes to WhatsApp offers gets one WhatsApp about a cart left for the time in Cart reminders (9 am to 9 pm). Template framex_cart_reminder (\"Marketing\"): turn it on only after Meta has approved it.",
    group: "WhatsApp messages",
    unit: "boolean",
    check: flag,
    get: () => config.whatsapp.cartReminders,
    set: (v) => (config.whatsapp.cartReminders = v)
  },
  productModeration: {
    label: "Shop products need FrameX approval",
    hint: "On: a shop's new product waits in Admin → Shop products until FrameX approves it. Products already on sale stay on sale.",
    group: "Shop products",
    unit: "boolean",
    check: flag,
    get: () => config.catalog.productModeration,
    set: (v) => (config.catalog.productModeration = v)
  }
};

export const SETTING_KEYS = Object.keys(SPEC);

// What the environment said, kept so a setting can go back to it.
let defaults = null;
const rememberDefaults = () => (defaults = defaults || Object.fromEntries(SETTING_KEYS.map((k) => [k, SPEC[k].get()])));

/** Read the saved settings into config. Called once when the server starts (and by tests). */
export async function loadSettings() {
  rememberDefaults();
  for (const key of SETTING_KEYS) SPEC[key].set(defaults[key]);
  const { rows } = await db.query("SELECT key, value FROM platform_settings");
  for (const row of rows) {
    const spec = SPEC[row.key];
    // A value that no longer passes its check (an older version wrote it) is ignored, not trusted.
    if (spec && !spec.check(row.value)) spec.set(row.value);
  }
}

/** Every setting with its value now, the environment's default, and whether an admin changed it. */
export async function listSettings() {
  rememberDefaults();
  const saved = new Map((await db.query("SELECT key, updated_at FROM platform_settings")).rows.map((r) => [r.key, r.updated_at]));
  return SETTING_KEYS.map((key) => ({ key, label: SPEC[key].label, hint: SPEC[key].hint || "", group: SPEC[key].group, unit: SPEC[key].unit, value: SPEC[key].get(), default: defaults[key], changed: saved.has(key), updatedAt: saved.get(key) || null }));
}

/**
 * Change settings. `changes` is { key: value }; a value of null puts the
 * setting back to the environment's default.
 */
export async function updateSettings(changes, { actor, ip = null }) {
  rememberDefaults();
  const body = changes && typeof changes === "object" && !Array.isArray(changes) ? changes : {};
  const fields = {};
  const wanted = [];
  for (const [key, value] of Object.entries(body)) {
    const spec = SPEC[key];
    if (!spec) {
      fields[key] = "This setting doesn't exist.";
      continue;
    }
    if (value === null) wanted.push([key, null]);
    else if (spec.check(value)) fields[key] = spec.check(value);
    else wanted.push([key, value]);
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
  if (!wanted.length) return listSettings();
  await db.tx(async (q) => {
    for (const [key, value] of wanted) {
      if (value === null) await q.query("DELETE FROM platform_settings WHERE key = $1", [key]);
      else await q.query("INSERT INTO platform_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [key, JSON.stringify(value), actor.id]);
    }
    await audit(q, { actor, action: ACTIONS.SETTINGS_CHANGED, targetType: "settings", targetId: wanted.map(([k]) => k).join(","), metadata: Object.fromEntries(wanted), ip });
  });
  for (const [key, value] of wanted) SPEC[key].set(value === null ? defaults[key] : value);
  return listSettings();
}
