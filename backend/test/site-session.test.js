/* ==========================================================================
   How the website keeps a login (assets/js/config.js, assets/js/api/client.js).
   Run with "npm test" in backend/.

   The real files run in a small stand-in "window" for different addresses:
     - cookie (httpOnly, no page script can read it) when the API is on the
       page's own site: this computer, or shopframex.in + api.shopframex.in;
     - bearer token (kept in localStorage) when the API is on another site,
       as today: shopframex.in + framex-api.onrender.com;
     - in cookie mode a token left by an earlier bearer-mode visit is removed
       from the browser's storage; in bearer mode it is kept.
   And the API address of the custom domain is already allowed by every
   page's Content-Security-Policy, so switching is one line in config.js.
   ========================================================================== */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG = fs.readFileSync(path.join(ROOT, "assets/js/config.js"), "utf8");
const CLIENT = fs.readFileSync(path.join(ROOT, "assets/js/api/client.js"), "utf8");
const TOKEN_KEY = "framex.session.v1";

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

/** Runs config.js (with PRODUCTION_API_URL = api) and client.js for a page at `page`. */
function load(page, api = null, kept = {}) {
  const url = new URL(page);
  const local = storage(kept);
  const session = storage();
  const window = { location: { hostname: url.hostname, port: url.port, href: url.href, origin: url.origin }, localStorage: local, sessionStorage: session, addEventListener() {} };
  window.window = window;
  const context = vm.createContext({ window, localStorage: local, sessionStorage: session, URL, setTimeout, clearTimeout, console });
  const config = api ? CONFIG.replace(/const PRODUCTION_API_URL = "[^"]*";/, `const PRODUCTION_API_URL = "${api}";`) : CONFIG;
  assert.ok(!api || config.includes(`const PRODUCTION_API_URL = "${api}";`), "PRODUCTION_API_URL was found in config.js");
  vm.runInContext(config, context);
  vm.runInContext(CLIENT, context);
  return { backend: window.FrameX.config.backend, local, session };
}

describe("how the website keeps a login", () => {
  test("today: shopframex.in and its API on onrender.com are different sites: a bearer token", () => {
    const real = (CONFIG.match(/const PRODUCTION_API_URL = "([^"]*)";/) || [])[1];
    assert.equal(real, "https://framex-api.onrender.com/api", "config.js is unchanged for the live site");
    for (const page of ["https://shopframex.in/", "https://www.shopframex.in/login.html"]) assert.equal(load(page).backend.session, "bearer", page);
  });

  test("the API on the site's own domain (api.shopframex.in): the httpOnly cookie", () => {
    for (const page of ["https://shopframex.in/", "https://www.shopframex.in/checkout.html"]) {
      const { backend } = load(page, "https://api.shopframex.in/api");
      assert.deepEqual([backend.session, backend.url], ["cookie", "https://api.shopframex.in/api"], page);
    }
  });

  test("this computer: the cookie, as before", () => {
    assert.equal(load("http://localhost:5500/index.html").backend.session, "cookie");
    assert.equal(load("http://127.0.0.1:5500/index.html").backend.session, "cookie");
    assert.deepEqual([load("http://localhost:4000/").backend.url, load("http://localhost:4000/").backend.session], ["/api", "cookie"]);
  });

  test("other sites that only look alike are not the same site", () => {
    for (const [page, api] of [
      ["https://shopframex.in/", "https://api.shopframex.in.evil.example/api"],
      ["https://shopframex.in/", "https://notshopframex.in/api"],
      ["https://siburam7.github.io/FrameX-None/", "https://framex-api.onrender.com/api"],
      ["https://shopframex.in/", "https://framex-api.onrender.com/api"]
    ])
      assert.equal(load(page, api).backend.session, "bearer", `${page} + ${api}`);
  });

  test("in cookie mode a token from an earlier visit is removed from the browser; in bearer mode it is kept", () => {
    const cookie = load("https://shopframex.in/", "https://api.shopframex.in/api", { [TOKEN_KEY]: "old-token-from-bearer-mode" });
    assert.equal(cookie.local.getItem(TOKEN_KEY), null);
    const bearer = load("https://shopframex.in/", null, { [TOKEN_KEY]: "a-token" });
    assert.equal(bearer.local.getItem(TOKEN_KEY), "a-token");
  });

  test("the session cookie as the LIVE server sets it: httpOnly, Secure, SameSite=Lax, only for /api, only for the API's own host", () => {
    // The real lib/security.js in a separate process with production settings (made-up values, nothing is connected)
    const script = `
      const { setSessionCookie, clearSessionCookie } = await import("./src/lib/security.js");
      const seen = [];
      const res = { cookie: (name, value, o) => seen.push({ name, value, ...o }), clearCookie: (name, o) => seen.push({ name, cleared: true, ...o }) };
      setSessionCookie(res, "a-made-up-token", new Date(Date.now() + 86400000));
      clearSessionCookie(res);
      console.log(JSON.stringify(seen.map(({ expires, ...o }) => o)));`;
    const env = { ...process.env, NODE_ENV: "production", AUTH_SECRET: "x".repeat(64), DATABASE_URL: "postgres://made-up@127.0.0.1:9/none", COOKIE_SAMESITE: "", COOKIE_SECURE: "", COOKIE_DOMAIN: "" };
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: path.join(ROOT, "backend"), env, encoding: "utf8" });
    const [set, cleared] = JSON.parse(out.trim().split("\n").pop());
    assert.deepEqual(set, { name: "fx_session", value: "a-made-up-token", httpOnly: true, secure: true, sameSite: "lax", path: "/api" });
    assert.equal("domain" in set, false, "no Domain attribute: the cookie goes only to the API's own host, never to other subdomains");
    assert.deepEqual(cleared, { name: "fx_session", cleared: true, httpOnly: true, secure: true, sameSite: "lax", path: "/api" }, "logging out clears the same cookie");
  });

  test("every page's Content-Security-Policy already allows the API at api.shopframex.in", () => {
    const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
    for (const page of pages) {
      const policy = (fs.readFileSync(path.join(ROOT, page), "utf8").match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/) || [])[1] || "";
      for (const d of ["connect-src", "img-src", "media-src"]) assert.ok(new RegExp(`${d} [^;]*https://api\\.shopframex\\.in( |;|$)`).test(policy), `${page}: ${d}`);
    }
  });
});
