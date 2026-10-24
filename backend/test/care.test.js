/* ==========================================================================
   FrameX Care live chat (owner, 2026-10-24). Run with "npm test" in backend/.

   - an admin creates care logins (Admin -> Care team); a care person logs in
     with their email and can open only the care desk (/api/care);
   - "Connect with FrameX Care": nobody Available / outside the hours -> the
     customer is told at once; otherwise every Available care desk gets the
     request over its live connection;
   - the first care person to accept gets it; the customer sees their first
     name; messages and "typing…" go both ways at once, without emails;
   - ending, rating, cancelling, and a request nobody accepts in time;
   - switching a care login off logs it out.
   ========================================================================== */
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.EMAIL_PROVIDER = "dev";
process.env.SMS_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CORS_ORIGINS = "http://localhost:5500";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.PAYMENT_PROVIDER = "none";
process.env.ADMIN_NOTIFY_EMAIL = "support@framex.example";
process.env.CARE_HOURS = "0-24";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { db, initDb } = await import("../src/db/index.js");
const { migrate } = await import("../src/db/migrate.js");
const { devOutbox, clearDevOutbox } = await import("../src/lib/mailer.js");
const { hashPassword } = await import("../src/lib/passwords.js");
const { newId } = await import("../src/lib/tokens.js");
const { syncCatalog } = await import("../src/services/catalog-service.js");
const { emailsSettled } = await import("../src/services/order-service.js");
const { supportSettled } = await import("../src/services/support-service.js");

let server;
let base;
class Client {
  cookie = "";
  async request(method, url, body) {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "X-FrameX-Client": "test", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  get = (url) => this.request("GET", url);
  post = (url, body = {}) => this.request("POST", url, body);
  patch = (url, body = {}) => this.request("PATCH", url, body);

  /** Opens a live connection; next(type, test) waits for the next unseen event of that type. */
  async listen(path) {
    const ac = new AbortController();
    const res = await fetch(base + path, { headers: { Accept: "text/event-stream", ...(this.cookie ? { Cookie: this.cookie } : {}) }, signal: ac.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/event-stream/);
    const events = [];
    const wake = new Set();
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
            if (type && data) {
              events.push({ type: type[1], data: JSON.parse(data[1]) });
              wake.forEach((w) => w());
            }
          }
        }
      } catch {
        /* closed */
      }
    })();
    const next = (type, ok = () => true, ms = 4000) =>
      new Promise((resolve, reject) => {
        const look = () => {
          const e = events.find((x) => !x.used && x.type === type && ok(x.data));
          if (!e) return false;
          e.used = true;
          wake.delete(look);
          clearTimeout(timer);
          resolve(e.data);
          return true;
        };
        const timer = setTimeout(() => (wake.delete(look), reject(new Error(`no "${type}" event`))), ms);
        if (!look()) wake.add(look);
      });
    await next("ready");
    return { next, events, close: () => ac.abort() };
  }
}

const PASSWORD = "Sunrise-Frame-42";
const admin = new Client();
const asha = new Client();
const priya = new Client();
const rahul = new Client();
const S = {};
const settled = async () => {
  await supportSettled();
  await emailsSettled();
};
const mails = (to, subject) => devOutbox().filter((m) => m.to === to && (!subject || subject.test(m.subject)));
const streams = [];
const listen = async (c, path) => {
  const s = await c.listen(path);
  streams.push(s);
  return s;
};

before(async () => {
  await initDb();
  await migrate();
  await syncCatalog();
  await db.query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Siburam Admin', 'admin@framex.example', $2, 'ADMIN', 'ACTIVE')", [newId(), await hashPassword(PASSWORD)]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await admin.post("/api/auth/login", { identifier: "admin@framex.example", password: PASSWORD })).status, 200);
  assert.equal((await asha.post("/api/auth/signup", { name: "Asha Verma", email: "asha.care@example.com", phone: "9876500081", password: PASSWORD, confirmPassword: PASSWORD })).status, 201);
  const home = (await asha.post("/api/addresses", { fullName: "Asha Verma", phone: "98765 00081", line1: "12 Lake View Road", line2: "", landmark: "", city: "Dhenkanal", state: "Odisha", postalCode: "759001" })).json.address.id;
  assert.equal((await asha.post("/api/cart/items", { productId: "p-017", quantity: 1 })).status, 201);
  const quote = (await asha.get(`/api/checkout/quote?addressId=${home}&paymentMethod=COD`)).json.quote;
  const r = await asha.post("/api/checkout/orders", { addressId: home, paymentMethod: "COD", expectedTotal: quote.total, idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201, r.text);
  S.order = r.json.order.orderNumber;
  await settled();
  clearDevOutbox();
});

after(async () => {
  streams.forEach((s) => s.close());
  await settled();
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await db.close();
});

describe("FrameX Care: the care team", () => {
  test("only an admin makes care logins; the email must be new; the password must be strong", async () => {
    assert.equal((await asha.post("/api/admin/care-team", { name: "Priya", email: "priya.care@example.com", password: PASSWORD })).status, 403);
    assert.equal((await admin.post("/api/admin/care-team", { name: "Priya", email: "priya.care@example.com", password: "short" })).status, 422);
    assert.equal((await admin.post("/api/admin/care-team", { name: "Priya", email: "asha.care@example.com", password: PASSWORD })).status, 409, "a customer's email can't be reused");
    const r = await admin.post("/api/admin/care-team", { name: "Priya", email: "priya.care@example.com", password: PASSWORD });
    assert.equal(r.status, 201, r.text);
    assert.equal((await admin.post("/api/admin/care-team", { name: "Rahul Das", email: "rahul.care@example.com", password: PASSWORD })).status, 201);
    const team = (await admin.get("/api/admin/care-team")).json.items;
    assert.deepEqual(team.map((m) => [m.name, m.active]), [["Priya", true], ["Rahul Das", true]]);
    S.rahulId = team[1].id;
    const { rows } = await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'CARE_STAFF_CREATED'");
    assert.equal(rows[0].n, 2);
  });

  test("a care person logs in with their email and opens the care desk and the orders, nothing else", async () => {
    const r = await priya.post("/api/auth/login", { identifier: "priya.care@example.com", password: PASSWORD });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.user.role, "CARE");
    assert.equal((await rahul.post("/api/auth/login", { identifier: "rahul.care@example.com", password: PASSWORD })).status, 200);
    assert.equal((await priya.get("/api/care/queue")).status, 200);
    assert.equal((await priya.get("/api/admin/overview")).status, 403, "no admin panel");
    assert.equal((await priya.get("/api/admin/orders")).status, 200, "orders: yes (owner, 2026-10-24)");
    assert.equal((await priya.get("/api/admin/payouts")).status, 403, "no payouts");
    assert.equal((await priya.get("/api/support")).status, 403, "the customer chat isn't theirs");
    assert.equal((await asha.get("/api/care/queue")).status, 403, "customers can't open the care desk");
    assert.equal((await admin.get("/api/care/queue")).status, 200, "admins can use the care desk too");
  });
});

describe("FrameX Care: connecting", () => {
  test("nobody Available: the customer is told at once (nothing waits)", async () => {
    const r = await asha.post("/api/support/live", { question: "Where is my order?", orderNumber: S.order, topic: "order" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.live.state, r.json.live.reason], ["NOBODY", "BUSY"]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM support_threads WHERE live_state IS NOT NULL")).rows[0].n, 0);
    assert.equal((await new Client().get("/api/config")).json.care.online, false);
  });

  test("outside the team's hours: told at once, with the hours", async () => {
    const keep = config.care.hours;
    config.care.hours = { from: 10, to: 10 }; // never open
    const r = await asha.post("/api/support/live", { question: "Hi" });
    config.care.hours = keep;
    assert.deepEqual([r.json.live.state, r.json.live.reason], ["NOBODY", "HOURS"]);
  });

  test("Available care people get the request; the first to accept gets it; the customer sees the first name", async () => {
    S.priyaDesk = await listen(priya, "/api/care/stream");
    S.rahulDesk = await listen(rahul, "/api/care/stream");
    assert.equal((await priya.post("/api/care/presence", { available: true })).json.available, true);
    assert.equal((await rahul.post("/api/care/presence", { available: true })).status, 200);
    assert.equal((await new Client().get("/api/config")).json.care.online, true);
    S.ashaChat = await listen(asha, "/api/support/stream");

    const r = await asha.post("/api/support/live", { question: "Where is my order?", orderNumber: S.order, topic: "order" });
    assert.equal(r.json.live.state, "WAITING", r.text);
    assert.equal(r.json.thread.live.state, "WAITING");
    S.thread = r.json.thread.id;
    const req1 = await S.priyaDesk.next("request");
    await S.rahulDesk.next("request");
    assert.deepEqual([req1.threadId, req1.customer.name, req1.question, req1.orderNumber], [S.thread, "Asha V.", "Where is my order?", S.order]);
    // asking again doesn't make a second request
    assert.equal((await asha.post("/api/support/live", { question: "again" })).json.live.state, "WAITING");
    const q = (await priya.get("/api/care/queue")).json;
    assert.equal(q.waiting.length, 1);
    assert.equal(q.status.available, true);

    // both press Accept at the same moment
    const [a, b] = await Promise.all([priya.post(`/api/care/threads/${S.thread}/accept`), rahul.post(`/api/care/threads/${S.thread}/accept`)]);
    const ok = [a, b].filter((x) => x.status === 200);
    const refused = [a, b].filter((x) => x.status === 409);
    assert.equal(ok.length, 1, `${a.status} ${b.status}`);
    assert.equal(refused.length, 1);
    assert.match(refused[0].json.error.message, /already accepted this chat/);
    S.agent = a.status === 200 ? { c: priya, desk: S.priyaDesk, name: "Priya" } : { c: rahul, desk: S.rahulDesk, name: "Rahul" };
    S.other = S.agent.c === priya ? { c: rahul, desk: S.rahulDesk } : { c: priya, desk: S.priyaDesk };

    const live = await S.ashaChat.next("live", (d) => d.state === "LIVE");
    assert.equal(live.agentName, S.agent.name, "first name only");
    const mine = (await asha.get("/api/support")).json.thread;
    assert.equal(mine.live.state, "LIVE");
    assert.equal(mine.live.agentName, S.agent.name);
    assert.deepEqual(mine.messages.filter((m) => m.from === "system").map((m) => m.body), [`${S.agent.name} joined the chat`]);
    assert.equal((await S.agent.c.get("/api/care/queue")).json.mine.length, 1);
    assert.equal((await S.other.c.get("/api/care/queue")).json.others.length, 1);
  });
});

describe("FrameX Care: talking", () => {
  test("messages and typing go both ways at once, without emails", async () => {
    await asha.post("/api/support/typing");
    assert.equal((await S.agent.desk.next("typing")).threadId, S.thread);
    assert.equal((await asha.post("/api/support/messages", { body: "Can it reach before Sunday?" })).status, 201);
    const got = await S.agent.desk.next("message", (d) => d.message.body === "Can it reach before Sunday?");
    assert.equal(got.message.from, "customer");
    await assert.rejects(S.other.desk.next("message", () => true, 400), "the other care person isn't sent the messages");

    await S.agent.c.post(`/api/care/threads/${S.thread}/typing`);
    assert.equal((await S.ashaChat.next("typing")).name, S.agent.name);
    const reply = await S.agent.c.post(`/api/care/threads/${S.thread}/reply`, { body: "Yes, it will reach on Saturday." });
    assert.equal(reply.status, 200, reply.text);
    const m = await S.ashaChat.next("message");
    assert.deepEqual([m.message.from, m.message.name, m.message.body], ["framex", S.agent.name, "Yes, it will reach on Saturday."]);
    await settled();
    assert.equal(mails("support@framex.example").length, 0, "no alert email while live");
    assert.equal(mails("asha.care@example.com").length, 0, "no reply email while the customer has the chat open");
  });

  test("the care person ends it: the customer is told, the conversation closes, and can be rated", async () => {
    const r = await S.agent.c.post(`/api/care/threads/${S.thread}/end`);
    assert.equal(r.status, 200, r.text);
    assert.equal((await S.ashaChat.next("live", (d) => d.state === "ENDED")).by, "staff");
    const t = (await asha.get("/api/support")).json.thread;
    assert.deepEqual([t.status, t.live.state], ["CLOSED", "ENDED"]);
    assert.equal(t.messages.at(-1).body, `${S.agent.name} ended the chat`);
    assert.equal((await asha.post("/api/support/live/rate", { rating: "up" })).json.thread.rating, 1);
    assert.equal((await S.agent.c.post(`/api/care/threads/${S.thread}/end`)).status, 409, "already ended");
  });

  test("a customer can stop waiting", async () => {
    const r = await asha.post("/api/support/live", { question: "Sizes & prices" });
    assert.equal(r.json.live.state, "WAITING");
    assert.notEqual(r.json.thread.id, S.thread, "a new conversation after the closed one");
    await S.priyaDesk.next("request");
    const c = await asha.post("/api/support/live/cancel");
    assert.equal(c.json.thread.live, null);
    await S.priyaDesk.next("queue", (d) => d.state === "CANCELLED");
    assert.equal((await priya.get("/api/care/queue")).json.waiting.length, 0);
  });

  test("nobody accepts in time: MISSED; the customer leaves a message, which emails FrameX as before", async () => {
    const r = await asha.post("/api/support/live", { question: "Gift wrap" });
    assert.equal(r.json.live.state, "WAITING");
    await db.query("UPDATE support_threads SET live_requested_at = now() - interval '3 minutes' WHERE id = $1", [r.json.thread.id]);
    const t = (await asha.get("/api/support")).json.thread;
    assert.equal(t.live.state, "MISSED");
    await S.ashaChat.next("live", (d) => d.state === "MISSED");
    assert.equal((await priya.post(`/api/care/threads/${t.id}/accept`)).status, 409, "too late to accept");
    assert.equal((await asha.post("/api/support/messages", { body: "Please wrap it as a gift." })).status, 201);
    await settled();
    assert.equal(mails("support@framex.example", /New chat message/).length, 1);
    assert.equal((await priya.get("/api/care/queue")).json.messages.some((x) => x.id === t.id), true, "it is under messages left");
  });

  test("an answer to a message left is emailed to the customer when they aren't in a live chat, with the care person's name", async () => {
    S.ashaChat.close();
    await new Promise((r) => setTimeout(r, 100));
    const t = (await asha.get("/api/support")).json.thread;
    assert.equal((await priya.post(`/api/care/threads/${t.id}/reply`, { body: "Done, it will be gift wrapped." })).status, 200);
    await settled();
    const sent = mails("asha.care@example.com", /FrameX Care replied/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Priya from FrameX Care replied/);
    const mine = (await asha.get("/api/support")).json.thread;
    assert.equal(mine.messages.at(-1).name, "Priya");
  });
});

describe("FrameX Care: switching a login off", () => {
  test("Away, then switched off: no requests, and logged out at once", async () => {
    assert.equal((await rahul.post("/api/care/presence", { available: false })).json.available, false);
    const r = await admin.patch(`/api/admin/care-team/${S.rahulId}`, { active: false });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.items.find((m) => m.id === S.rahulId).active, false);
    assert.equal((await rahul.get("/api/care/queue")).status, 401);
    assert.equal((await rahul.post("/api/auth/login", { identifier: "rahul.care@example.com", password: PASSWORD })).status >= 400, true);
    assert.equal((await admin.patch(`/api/admin/care-team/${S.rahulId}`, { active: true, name: "Rahul" })).json.items.find((m) => m.id === S.rahulId).name, "Rahul");
  });
});
