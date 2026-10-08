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
  commissionPercent: {
    label: "FrameX commission",
    hint: "FrameX's share of a sale. Recorded for reports only: payouts to shops and artists are not automated.",
    group: "Platform",
    unit: "percent",
    check: percent(0, 90),
    get: () => config.platform.commissionPercent,
    set: (v) => (config.platform.commissionPercent = v)
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
