/* ==========================================================================
   Input validation. Every API handler reads its input through validate():
   only the fields named in the spec are kept (so a client can't smuggle in
   "role", "status" or "shopId"), each is trimmed, checked and normalised.

     const data = validate(req.body, { name: v.string({ min: 2, max: 80 }), email: v.email() });
   Throws 422 VALIDATION_ERROR with { fields: { name: "..." } } on failure.
   ========================================================================== */
import { errors } from "./errors.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Passwords people actually use; rejected regardless of length.
const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "welcome123", "framex123", "abc12345", "11111111", "00000000"]);

/** "98765 43210" -> "+919876543210"; "+91 98765-43210" -> "+919876543210". */
export function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return "+91" + digits; // Indian mobile
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  return null;
}

export const normalizeEmail = (input) => String(input || "").trim().toLowerCase();

const str = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

export const v = {
  string({ min = 0, max = 500, label = "This field", pattern = null, patternMessage = "" } = {}) {
    return (value) => {
      const s = str(value);
      if (!s) return { error: min > 0 ? `${label} is required.` : null, value: "" };
      if (s.length < min) return { error: `${label} must be at least ${min} characters.` };
      if (s.length > max) return { error: `${label} must be ${max} characters or fewer.` };
      if (pattern && !pattern.test(s)) return { error: patternMessage || `${label} is not valid.` };
      return { value: s };
    };
  },
  email({ required = true } = {}) {
    return (value) => {
      const s = normalizeEmail(value);
      if (!s) return { error: required ? "Email is required." : null, value: "" };
      if (s.length > 254 || !EMAIL.test(s)) return { error: "Enter a valid email address." };
      return { value: s };
    };
  },
  phone({ required = false } = {}) {
    return (value) => {
      const s = str(value);
      if (!s) return { error: required ? "Phone number is required." : null, value: "" };
      const normalized = normalizePhone(s);
      if (!normalized) return { error: "Enter a valid phone number (10 digits, or with country code)." };
      return { value: normalized };
    };
  },
  /** New passwords: 8–128 characters with a letter and a number, not a common password. */
  password() {
    return (value) => {
      const s = typeof value === "string" ? value : "";
      if (!s) return { error: "Password is required." };
      if (s.length < 8) return { error: "Use at least 8 characters." };
      if (s.length > 128) return { error: "Use 128 characters or fewer." };
      if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return { error: "Include at least one letter and one number." };
      if (COMMON.has(s.toLowerCase())) return { error: "That password is too common. Choose another." };
      return { value: s };
    };
  },
  /** An existing password being checked (no strength rules, never trimmed). */
  secret({ label = "Password" } = {}) {
    return (value) => (typeof value === "string" && value.length && value.length <= 256 ? { value } : { error: `${label} is required.` });
  },
  enumOf(options, { required = true, label = "This field" } = {}) {
    return (value) => {
      const s = str(value);
      if (!s) return { error: required ? `${label} is required.` : null, value: "" };
      return options.includes(s) ? { value: s } : { error: `${label} must be one of: ${options.join(", ")}.` };
    };
  },
  number({ min = -Infinity, max = Infinity, required = true, label = "This field" } = {}) {
    return (value) => {
      if (value === undefined || value === null || value === "") return { error: required ? `${label} is required.` : null, value: null };
      const n = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
      if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
      return { value: n };
    };
  },
  boolean({ fallback = false } = {}) {
    return (value) => ({ value: value === undefined || value === null || value === "" ? fallback : value === true || value === "true" || value === 1 || value === "1" });
  },
  /** List of allowed string values (e.g. fulfilment methods). */
  listOf(options, { label = "This field" } = {}) {
    return (value) => {
      if (value === undefined || value === null) return { value: undefined };
      if (!Array.isArray(value)) return { error: `${label} must be a list.` };
      const bad = value.find((x) => !options.includes(x));
      return bad !== undefined ? { error: `${label} contains an unknown value.` } : { value: Array.from(new Set(value)) };
    };
  },
  /** Only validates when the field is present (for PATCH). */
  optional(rule) {
    return Object.assign((value) => (value === undefined ? { value: undefined, skip: true } : rule(value)), { optional: true });
  }
};

export function validate(input, spec) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  const fields = {};
  for (const [key, rule] of Object.entries(spec)) {
    const result = rule(body[key]);
    if (result.error) fields[key] = result.error;
    else if (!result.skip) out[key] = result.value;
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
  return out;
}

export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
