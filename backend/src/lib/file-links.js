/* ==========================================================================
   Signed links to private files (customer photos).

   A customer photo has no public address. Someone who is allowed to see it
   (the customer, FrameX staff, the shop that makes the order) asks the API for
   a link; the API checks who is asking and answers with an address like
     /api/files/<token>
   The token names the file and when the link stops working, and is signed with
   the server's secret, so it can't be changed or made up. It works for a few
   minutes (UPLOAD_LINK_SECONDS) and for that one file only.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../config.js";

const sign = (payload) => crypto.createHmac("sha256", config.authSecret).update("framex-file-link:" + payload).digest("base64url");

/**
 * A link token for one upload.
 *   download: true = the browser saves the file, false = it may show it
 * -> { token, expiresAt }
 */
export function makeFileToken(uploadId, { download = true, seconds = config.uploads.linkSeconds } = {}) {
  const expires = Math.floor(Date.now() / 1000) + seconds;
  const payload = Buffer.from(JSON.stringify({ u: uploadId, e: expires, d: download ? 1 : 0 })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expires * 1000).toISOString() };
}

/** -> { uploadId, download } for a genuine, unexpired token; otherwise null. */
export function readFileToken(token) {
  const [payload, signature, ...rest] = String(token || "").split(".");
  if (!payload || !signature || rest.length) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.u !== "string" || !Number.isFinite(data.e) || data.e * 1000 < Date.now()) return null;
    return { uploadId: data.u, download: data.d !== 0 };
  } catch {
    return null;
  }
}
