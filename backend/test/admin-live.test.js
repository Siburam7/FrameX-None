/* ==========================================================================
   The admin panel, live (owner, 2026-11-09: "pura Admin page ko live kar doo").
   Run with "npm test". An open admin panel keeps GET /api/admin/stream; after a
   write that went through, it hears which area changed (no data); busy or
   private writes say nothing; only an admin can listen.
   ========================================================================== */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "dev";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { newId } = await import("../src/lib/tokens.js");
const { hashPassword } = await import("../src/lib/passwords.js");

let server;
let base;
const PASSWORD = "Sunrise-Frame-42";

class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of response.headers.getSetCookie()) this.cookie = /fx_session=;|Expires=Thu, 01 Jan 1970/i.test(c) ? "" : c.split(";")[0];
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, text };
  }
  get = (path) => this.request("GET", path);
  post = (path, body = {}) => this.request("POST", path, body);

  /** Opens a live connection and collects its events. */
  async listen(path) {
    const ac = new AbortController();
    const res = await fetch(base + path, { headers: { Accept: "text/event-stream", ...(this.cookie ? { Cookie: this.cookie } : {}) }, signal: ac.signal });
    if (res.status !== 200) return { status: res.status, close: () => ac.abort() };
    const events = [];
    (async () => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const type = /^event: (.*)$/m.exec(chunk);
            const data = /^data: (.*)$/m.exec(chunk);
            if (type && data) events.push({ type: type[1], data: JSON.parse(data[1]) });
          }
        }
      } catch {
        /* closed */
      }
    })();
    const wait = async (ok, ms = 3000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const e = events.find(ok);
        if (e) return e;
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    };
    await wait((e) => e.type === "ready");
    return { status: 200, events, wait, close: () => ac.abort() };
  }
}

before(async () => {
  await initDb();
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.query("INSERT INTO users (id, name, email, role, status, password_hash, password_changed_at) VALUES ($1, 'Admin', 'admin.live@example.com', 'ADMIN', 'ACTIVE', $2, now())", [newId(), await hashPassword(PASSWORD)]);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("the admin panel hears what changed", () => {
  const admin = new Client();
  let live;

  test("an admin opens the live connection; a customer can't", async () => {
    assert.equal((await admin.post("/api/auth/login", { identifier: "admin.live@example.com", password: PASSWORD })).status, 200);
    live = await admin.listen("/api/admin/stream");
    assert.equal(live.status, 200);
    const customer = new Client();
    assert.equal((await customer.post("/api/auth/signup", { name: "Ravi Das", email: "ravi.live@example.com", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
    const refused = await customer.listen("/api/admin/stream");
    assert.equal(refused.status, 403);
    refused.close();
  });

  test("a write that went through: the area's name, at once, and no data", async () => {
    const e = await live.wait((x) => x.type === "changed" && x.data.area === "auth");
    assert.ok(e, "the customer's sign-up was heard");
    assert.deepEqual(Object.keys(e.data), ["area"]);
    const visitor = new Client();
    const sent = await visitor.post("/api/contact", { name: "Meera", email: "meera.live@example.com", subject: "Bulk order", message: "Do you make 50 frames for an office?" });
    assert.ok(sent.status < 400, sent.text);
    assert.ok(await live.wait((x) => x.type === "changed" && x.data.area === "contact"), "the Contact message was heard");
  });

  test("busy, private or failed writes say nothing", async () => {
    const before = live.events.filter((x) => x.type === "changed").length;
    const someone = new Client();
    await someone.post("/api/auth/login", { identifier: "ravi.live@example.com", password: PASSWORD }); // a login
    await someone.post("/api/auth/login", { identifier: "nobody@example.com", password: "wrong-password-1" }); // refused
    await someone.post("/api/analytics/hit", { path: "/index.html" }); // visitor statistics
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(live.events.filter((x) => x.type === "changed").length, before);
    live.close();
  });
});
