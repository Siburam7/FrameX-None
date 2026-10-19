/* ==========================================================================
   How the connection to PostgreSQL is encrypted (src/db/ssl.js), used by the
   server, "npm run db:backup" and "npm run db:restore".
   Run with "npm test" in backend/.

   Unit checks of the rule (a Neon connection string as it is copied, the
   DATABASE_SSL values, what the address says winning), then the real driver
   ("pg") against a stand-in database server on this computer that answers
   with a SELF-SIGNED certificate (made with openssl for this run only):
     - checked (the default): the driver refuses that server;
     - no-verify written out: the driver goes on (so the check is real);
     - not encrypted: no TLS is asked for at all.
   No real database is involved.
   ========================================================================== */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { describeConnection, pgConnection } from "../src/db/ssl.js";

const NEON = "postgresql://example_user:not-a-real%40pass%2Fword@db.example.invalid/exampledb?sslmode=require&channel_binding=require";

describe("the connection rule", () => {
  test("a Neon connection string as copied: encrypted, certificate checked; sslmode is applied here, the rest kept exactly", () => {
    const c = pgConnection(NEON, "require");
    assert.deepEqual([c.encrypted, c.verified, c.from, c.problem], [true, true, "url", null]);
    assert.deepEqual(c.ssl, { rejectUnauthorized: true });
    assert.equal(c.connectionString, "postgresql://example_user:not-a-real%40pass%2Fword@db.example.invalid/exampledb?channel_binding=require");
    assert.equal(pgConnection(NEON, "").verified, true, "the address alone is enough");
  });

  test("sslmode anywhere in the address is taken out cleanly", () => {
    const base = "postgresql://u:p@db.example.com:5432/app";
    assert.equal(pgConnection(base + "?sslmode=require").connectionString, base);
    assert.equal(pgConnection(base + "?options=endpoint%3Dep-x&sslmode=require&connect_timeout=10").connectionString, base + "?options=endpoint%3Dep-x&connect_timeout=10");
    assert.equal(pgConnection(base + "?connect_timeout=10&sslmode=verify-full").connectionString, base + "?connect_timeout=10");
    assert.equal(pgConnection(base + "?ssl=true").connectionString, base);
    assert.equal(pgConnection(base + "?ssl=true").verified, true);
  });

  test("an address without sslmode: DATABASE_SSL decides (require = encrypted and checked)", () => {
    const url = "postgresql://u:p@db.example.com/app";
    assert.deepEqual(pgConnection(url, "require").ssl, { rejectUnauthorized: true });
    assert.deepEqual(pgConnection(url, "verify-full").ssl, { rejectUnauthorized: true });
    assert.equal(pgConnection(url, "require").from, "setting");
    assert.deepEqual([pgConnection(url, "").encrypted, pgConnection(url, "").ssl], [false, false]);
  });

  test("turning the check off has to be written out, and is reported every time", () => {
    const set = pgConnection("postgresql://u:p@h/app", "no-verify");
    assert.deepEqual([set.encrypted, set.verified, set.ssl.rejectUnauthorized], [true, false, false]);
    assert.match(describeConnection(set).text, /NOT checked \(DATABASE_SSL=no-verify\)/);
    assert.equal(describeConnection(set).ok, false);
    const url = pgConnection("postgresql://u:p@h/app?sslmode=no-verify", "require");
    assert.equal(url.verified, false, "what the address says wins");
    assert.match(describeConnection(url).text, /sslmode=no-verify in DATABASE_URL/);
  });

  test("no encryption: fine on this computer, a warning in production", () => {
    const c = pgConnection("postgresql://u:p@h/app?sslmode=disable", "require");
    assert.deepEqual([c.encrypted, c.ssl], [false, false]);
    assert.equal(describeConnection(c, { production: true }).ok, false);
    assert.match(describeConnection(c, { production: true }).text, /NOT encrypted/);
    assert.equal(describeConnection(c, { production: false }).ok, true);
  });

  test("values this code does not understand are refused (the server does not start with them)", () => {
    assert.match(pgConnection("postgresql://u:p@h/app", "yes").problem, /DATABASE_SSL must be one of/);
    assert.match(pgConnection("postgresql://u:p@h/app?sslmode=sometimes").problem, /does not understand/);
    assert.equal(pgConnection(NEON, "require").problem, null);
  });

  test("the driver uses exactly these settings (the address no longer overrides them)", () => {
    for (const [url, setting, expected] of [
      [NEON, "require", true],
      ["postgresql://u:p@h/app", "require", true],
      ["postgresql://u:p@h/app", "no-verify", false],
      ["postgresql://u:p@h/app?sslmode=no-verify", "", false]
    ]) {
      const c = pgConnection(url, setting);
      const client = new pg.Client({ connectionString: c.connectionString, ssl: c.ssl });
      assert.equal(client.connectionParameters.ssl.rejectUnauthorized, expected, `${url} + ${setting}`);
    }
    const plain = pgConnection("postgresql://u:p@h/app", "");
    assert.equal(new pg.Client({ connectionString: plain.connectionString, ssl: plain.ssl }).connectionParameters.ssl, false);
  });
});

const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
describe("the real driver against a database server with a self-signed certificate", { skip: openssl.status === 0 ? false : "openssl is not installed here" }, () => {
  let server;
  let port;
  let dir;
  const seen = [];
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "framex-tls-"));
    const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);
    const key = fs.readFileSync(path.join(dir, "key.pem"));
    const cert = fs.readFileSync(path.join(dir, "cert.pem"));
    // A stand-in PostgreSQL server: says yes to TLS, shows its self-signed certificate, then notes what the client did
    server = net.createServer((socket) => {
      socket.once("data", (first) => {
        const sslRequest = first.length >= 8 && first.readInt32BE(4) === 80877103;
        if (!sslRequest) {
          seen.push("plain startup (no TLS asked for)");
          return socket.destroy();
        }
        socket.write("S");
        const secure = new tls.TLSSocket(socket, { isServer: true, key, cert });
        secure.on("secure", () => seen.push("TLS accepted by the client"));
        secure.once("data", () => {
          seen.push("startup sent over TLS");
          secure.destroy();
        });
        secure.on("error", () => seen.push("TLS refused by the client"));
      });
      socket.on("error", () => {});
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;
  });
  after(() => {
    server && server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const connect = async (url, setting) => {
    seen.length = 0;
    const c = pgConnection(url.replace("PORT", port), setting);
    const client = new pg.Client({ connectionString: c.connectionString, ssl: c.ssl, connectionTimeoutMillis: 5000 });
    const error = await client.connect().then(() => null, (e) => e);
    await client.end().catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    return { error: error ? error.message : "", seen: [...seen] };
  };

  test("checked (Neon-style address, or DATABASE_SSL=require): the driver refuses the self-signed certificate", async () => {
    for (const [url, setting] of [
      ["postgresql://u:p@localhost:PORT/app?sslmode=require&channel_binding=require", ""],
      ["postgresql://u:p@localhost:PORT/app", "require"]
    ]) {
      const r = await connect(url, setting);
      assert.match(r.error, /self[- ]signed certificate/i, `${url} + ${setting}: ${r.error}`);
      assert.ok(!r.seen.includes("startup sent over TLS"), "nothing (no password) was sent to that server");
    }
  });

  test("no-verify written out: the driver accepts it (so the check above is real)", async () => {
    const r = await connect("postgresql://u:p@localhost:PORT/app", "no-verify");
    assert.ok(r.seen.includes("TLS accepted by the client") && r.seen.includes("startup sent over TLS"), JSON.stringify(r));
  });

  test("not encrypted: no TLS is asked for", async () => {
    const r = await connect("postgresql://u:p@localhost:PORT/app?sslmode=disable", "");
    assert.deepEqual(r.seen, ["plain startup (no TLS asked for)"]);
  });
});
