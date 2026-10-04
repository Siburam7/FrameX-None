/* Random tokens (sessions, password reset, account setup).
   The raw token goes to the user once; the database only keeps an HMAC of it,
   so a leaked database can't be used to log in or reset passwords. */
import crypto from "node:crypto";
import { config } from "../config.js";

/** 256 bits of randomness, URL-safe. */
export const newToken = () => crypto.randomBytes(32).toString("base64url");

export const hashToken = (token) => crypto.createHmac("sha256", config.authSecret).update(String(token)).digest("hex");

export const newId = () => crypto.randomUUID();
