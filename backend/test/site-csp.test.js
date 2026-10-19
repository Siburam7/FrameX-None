/* ==========================================================================
   The website's Content-Security-Policy (the <meta> in every page's <head>).
   Run with "npm test" in backend/.

   GitHub Pages can't send headers, so each page carries its policy itself.
   These checks keep it working when a page changes:
     - every page has the same policy, before any script or stylesheet;
     - every inline <script> of every page is allowed by its SHA-256 in that
       policy (edit an inline script and this test says which hash to add);
     - the API address the website calls (assets/js/config.js) is allowed;
     - nothing dangerous is allowed: no 'unsafe-inline' or 'unsafe-eval' for
       scripts, no plugins (object-src), no other <base>.
   ========================================================================== */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
// The tag may be wrapped over lines (an editor's formatter does that); the policy itself is compared without that
const policyOf = (html) => ((html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/) || [])[1] || "").replace(/\s+/g, " ").trim() || null;
const directives = (policy) => Object.fromEntries(policy.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([name, ...values]) => [name, values]));

describe("the website's Content-Security-Policy", () => {
  test("every page has it, the same everywhere, before any script or stylesheet", () => {
    assert.ok(pages.length >= 30, "the pages were found");
    const first = policyOf(read(pages[0]));
    for (const f of pages) {
      const html = read(f);
      const policy = policyOf(html);
      assert.ok(policy, `${f}: no Content-Security-Policy meta`);
      assert.equal(policy, first, `${f}: its policy differs from ${pages[0]}`);
      const at = html.indexOf('http-equiv="Content-Security-Policy"');
      for (const marker of ["<script", 'rel="stylesheet"']) {
        const before = html.indexOf(marker);
        assert.ok(before === -1 || at < before, `${f}: the policy must come before the first ${marker}`);
      }
    }
  });

  test("every inline script is allowed by its hash", () => {
    for (const f of pages) {
      const html = read(f);
      const scriptSrc = directives(policyOf(html))["script-src"];
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/type=["']application\/ld\+json["']/.test(m[1])) continue;
        const hash = `'sha256-${crypto.createHash("sha256").update(m[2]).digest("base64")}'`;
        assert.ok(scriptSrc.includes(hash), `${f}: an inline script changed. Add ${hash} to script-src in every page's policy (or move the script to a file).`);
      }
    }
  });

  test("the website's API address is allowed", () => {
    const config = fs.readFileSync(path.join(ROOT, "assets", "js", "config.js"), "utf8");
    const api = new URL(config.match(/PRODUCTION_API_URL = "([^"]+)"/)[1]).origin;
    const d = directives(policyOf(read("index.html")));
    for (const name of ["connect-src", "img-src", "media-src"]) assert.ok(d[name].includes(api), `${name} must allow ${api}`);
  });

  test("nothing dangerous is allowed", () => {
    const d = directives(policyOf(read("index.html")));
    assert.deepEqual(d["default-src"], ["'self'"]);
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "http:", "https:", "data:"]) assert.ok(!d["script-src"].includes(bad), `script-src must not allow ${bad}`);
    assert.deepEqual(d["object-src"], ["'none'"]);
    assert.deepEqual(d["base-uri"], ["'self'"]);
    assert.ok(!d["connect-src"].includes("*") && !d["connect-src"].includes("https:"), "connect-src lists its hosts");
  });
});
