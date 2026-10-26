/* ==========================================================================
   "Continue with Google" / "Continue with Facebook" (owner, 2026-10-26).

   The website gets a proof from Google or Facebook and sends it here; this
   file checks that proof with Google / Facebook themselves and answers who
   the person is. Nothing the browser says about the person is believed.

     verifyGoogle(credential)  -> { sub, email, name }
       Google's ID token (a signed JWT from Google Identity Services). Its
       signature is checked against Google's public keys (fetched, cached as
       long as Google says), and it must be for FrameX's Client ID, issued by
       Google, not expired, with a verified email.
     verifyFacebook(accessToken) -> { id, email, name }
       Facebook's access token. Facebook is asked whether the token was made
       for FrameX's app (debug_token, with the app secret), then for the
       person's id, name and email (with appsecret_proof).

   GOOGLE_CLIENT_ID (not a secret) switches Google on; FACEBOOK_APP_ID and
   FACEBOOK_APP_SECRET (a secret: only in the server's settings) switch
   Facebook on. Without them the website shows no such button.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";
import { errors, HttpError } from "./errors.js";

const refused = (message = "We couldn't confirm that login. Please try again.") => errors.unauthorized(message, "SOCIAL_LOGIN_FAILED");
const unavailable = (who) => errors.notFound(`${who} login isn't switched on here.`, "SOCIAL_LOGIN_OFF");

/* ---------------------------------------------------------------- Google */

let keys = { at: 0, maxAge: 0, byKid: new Map() };
async function googleKeys(force = false) {
  if (!force && keys.byKid.size && Date.now() - keys.at < keys.maxAge) return keys.byKid;
  const response = await fetch(config.social.googleJwksUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Google keys: HTTP ${response.status}`);
  const body = await response.json();
  const byKid = new Map();
  for (const jwk of body.keys || []) if (jwk.kid && jwk.kty === "RSA") byKid.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
  const age = /max-age=(\d+)/.exec(response.headers.get("cache-control") || "");
  keys = { at: Date.now(), maxAge: Math.min(24 * 3600, age ? Number(age[1]) : 3600) * 1000, byKid };
  return byKid;
}

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export async function verifyGoogle(credential) {
  const clientId = config.social.googleClientId;
  if (!clientId) throw unavailable("Google");
  const parts = String(credential || "").split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw refused();
  let header;
  let claims;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    throw refused();
  }
  if (header.alg !== "RS256" || !header.kid) throw refused();
  let key;
  try {
    key = (await googleKeys()).get(header.kid) || (await googleKeys(true)).get(header.kid); // Google rotates its keys
  } catch (error) {
    console.error("[social] Google's keys couldn't be read:", error.message);
    throw new HttpError(503, "SOCIAL_LOGIN_UNAVAILABLE", "Google login can't be checked right now. Please try again in a minute.");
  }
  if (!key) throw refused();
  const signed = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  if (!signed) throw refused();
  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId;
  if (!audienceOk || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) throw refused();
  if (!(Number(claims.exp) > now - 60) || (claims.iat && Number(claims.iat) > now + 300)) throw refused("That Google login has expired. Please try again.");
  if (!claims.sub || !claims.email) throw refused();
  if (claims.email_verified !== true && claims.email_verified !== "true") throw refused("Your Google account's email isn't verified yet. Verify it with Google, or sign up with your email.");
  return { sub: String(claims.sub), email: String(claims.email), name: String(claims.name || claims.given_name || "") };
}

/* ---------------------------------------------------------------- Facebook */

async function graph(path, params) {
  const url = `${config.social.facebookGraphUrl}/${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body };
}

export async function verifyFacebook(accessToken) {
  const { facebookAppId: appId, facebookAppSecret: secret } = config.social;
  if (!appId || !secret) throw unavailable("Facebook");
  const token = String(accessToken || "");
  if (token.length < 20 || token.length > 2000 || /\s/.test(token)) throw refused();
  let check;
  let me;
  try {
    // Was this token made for FrameX's own app? (A token from another app must not log anyone in here.)
    check = await graph("debug_token", { input_token: token, access_token: `${appId}|${secret}` });
    if (!check.ok || !check.body.data || check.body.data.is_valid !== true || String(check.body.data.app_id) !== String(appId)) throw refused();
    const proof = crypto.createHmac("sha256", secret).update(token).digest("hex");
    me = await graph("me", { fields: "id,name,email", access_token: token, appsecret_proof: proof });
  } catch (error) {
    if (error.status) throw error;
    console.error("[social] Facebook couldn't be reached:", error.message);
    throw new HttpError(503, "SOCIAL_LOGIN_UNAVAILABLE", "Facebook login can't be checked right now. Please try again in a minute.");
  }
  if (!me.ok || !me.body.id || String(me.body.id) !== String(check.body.data.user_id)) throw refused();
  if (!me.body.email) throw refused("Facebook didn't share an email address. Allow your email when Facebook asks, or sign up with your email.");
  return { id: String(me.body.id), email: String(me.body.email), name: String(me.body.name || "") };
}

/** What the website may know: which buttons to show (no secret). */
export const socialStatus = () => ({
  google: config.social.googleClientId || null,
  facebook: config.social.facebookAppId && config.social.facebookAppSecret ? config.social.facebookAppId : null
});

/** Tests only: forget Google's cached keys. */
export const _resetKeys = () => (keys = { at: 0, maxAge: 0, byKid: new Map() });
