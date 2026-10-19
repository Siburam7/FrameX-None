/* ==========================================================================
   How the connection to a PostgreSQL server (DATABASE_URL) is encrypted.
   Used by db/index.js, so the server, "npm run db:backup" and "npm run
   db:restore" all connect the same way.

   The server's certificate is CHECKED (chain and host name) whenever the
   connection is encrypted. Turning the check off has to be written out
   (DATABASE_SSL=no-verify, or sslmode=no-verify in DATABASE_URL), and the
   start-up log, "npm run doctor" and the backup say so every time.

     DATABASE_SSL           in the URL (wins)      encrypted   certificate
     require / verify-full  sslmode=require …      yes         checked
     no-verify              sslmode=no-verify      yes         NOT checked
     (empty)                (none)                 no          -
                            sslmode=disable        no          -

   A Neon connection string works as it is copied (…?sslmode=require&
   channel_binding=require): encrypted, certificate checked. The sslmode part
   is taken out of the address and applied here, so the driver uses exactly
   these settings (and does not print its own warning about sslmode names).
   ========================================================================== */

const VERIFY = new Set(["require", "verify-full", "verify-ca", "prefer", "true", "1"]);

/** DATABASE_SSL values this code understands ("" = not set). */
export const SSL_SETTINGS = ["", "require", "verify-full", "no-verify"];

/**
 * -> { connectionString, ssl, encrypted, verified, from, problem }
 *    connectionString  the address for the driver (sslmode / ssl taken out)
 *    ssl               the driver's ssl option (false = not encrypted)
 *    from              "url" | "setting" | "none": what decided it
 *    problem           a value this code does not understand (the server refuses to start)
 */
export function pgConnection(url, setting = "") {
  const text = String(url || "");
  const query = text.includes("?") ? text.slice(text.indexOf("?") + 1) : "";
  const params = new Map(
    query
      .split("&")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return i < 0 ? [p, ""] : [decodeURIComponent(p.slice(0, i)), decodeURIComponent(p.slice(i + 1))];
      })
  );
  const wanted = String(setting || "").trim().toLowerCase();
  let problem = SSL_SETTINGS.includes(wanted) ? null : `DATABASE_SSL must be one of: require, verify-full, no-verify (or empty), not "${setting}".`;

  // What the address asks for wins (that is how libpq and the driver read it)
  let mode = null;
  let from = "none";
  if (params.has("sslmode")) {
    mode = params.get("sslmode").toLowerCase();
    from = "url";
  } else if (params.has("ssl")) {
    mode = ["true", "1"].includes(params.get("ssl").toLowerCase()) ? "require" : "disable";
    from = "url";
  } else if (wanted) {
    mode = wanted;
    from = "setting";
  }
  if (from === "url" && !VERIFY.has(mode) && !["disable", "no-verify", "allow"].includes(mode)) problem = problem || `DATABASE_URL has sslmode=${mode}, which this code does not understand.`;

  // The address without sslmode / ssl (every other part, password and options included, stays exactly as written)
  const stripped = from === "url" ? text.replace(/([?&])(sslmode|ssl)=[^&]*(&|$)/g, (m, before, name, after) => (after ? before : "")).replace(/[?&]$/, "") : text;

  const encrypted = mode !== null && mode !== "disable" && mode !== "allow";
  const verified = encrypted && mode !== "no-verify";
  return { connectionString: stripped, ssl: encrypted ? { rejectUnauthorized: verified } : false, encrypted, verified, from, problem };
}

/** One line for the start-up log and the doctor: how the database connection is protected. */
export function describeConnection(c, { production = false } = {}) {
  if (c.verified) return { ok: true, text: "encrypted, the server's certificate is checked" };
  if (c.encrypted) return { ok: false, text: `encrypted, but the server's certificate is NOT checked (${c.from === "url" ? "sslmode=no-verify in DATABASE_URL" : "DATABASE_SSL=no-verify"}): someone on the network path could pose as the database` };
  return { ok: !production, text: production ? "NOT encrypted (set DATABASE_SSL=require, or use the address with ?sslmode=require)" : "not encrypted (fine for a database on this computer)" };
}
