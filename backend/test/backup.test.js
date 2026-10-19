/* ==========================================================================
   The database backup (src/db/backup.js; npm run db:backup / db:restore).
   Run with "npm test" in backend/.

   Two in-memory PostgreSQL databases (PGlite): one with the real tables
   (every migration) and rows that link in circles like the live ones do
   (users ↔ shops ↔ shop applications, users ↔ artists ↔ artist
   applications), a time with microseconds, decimals, nested JSON and
   Hindi text; the backup of it is restored into the other, empty one, and
   the two are compared table by table with PostgreSQL's own JSON of every
   row (not with the backup's own fingerprints).
   ========================================================================== */
import crypto from "node:crypto";
import zlib from "node:zlib";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";

const { default: assert } = await import("node:assert/strict");
const { after, before, describe, test } = await import("node:test");
const { PGlite } = await import("@electric-sql/pglite");
const { migrate } = await import("../src/db/migrate.js");
const { makeBackup, readBackup, restoreBackup } = await import("../src/db/backup.js");

const opened = [];
/** A new, empty in-memory database with the { query, exec, tx } of db/index.js. */
async function freshDb() {
  const lite = new PGlite();
  await lite.waitReady;
  opened.push(lite);
  const shape = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    query: async (text, params) => shape(await lite.query(text, params)),
    exec: (text) => lite.exec(text),
    tx: (fn) => lite.transaction((t) => fn({ query: async (text, params) => shape(await t.query(text, params)), exec: (text) => t.exec(text) }))
  };
}

/** Every table as PostgreSQL's own JSON of each row, sorted: two databases with the same rows give the same. */
async function dump(handle) {
  const tables = (await handle.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY 1")).rows.map((r) => r.table_name);
  const out = {};
  for (const t of tables) out[t] = (await handle.query(`SELECT to_jsonb(x)::text AS j FROM "${t}" x`)).rows.map((r) => r.j).sort();
  return out;
}

const id = () => crypto.randomUUID();
const PASS = "a long passphrase for the test only";
const ADMIN = id();
const SHOP_APP = id();
const SHOP = id();
const ARTIST_APP = id();
const ARTIST = id();
const CUSTOMER = id();
const CUSTOMER_NAME = 'Asha "Didi" Verma — आशा 🖼️';

let source;
let unlocked;
let locked;

before(async () => {
  source = await freshDb();
  await migrate({ using: source });
  const q = (text, params) => source.query(text, params);
  await q("INSERT INTO users (id, name, email, role) VALUES ($1, 'Admin', 'admin@example.com', 'ADMIN')", [ADMIN]);
  // users ↔ shops ↔ shop_applications: each refers to the other
  await q("INSERT INTO shop_applications (id, shop_name, owner_name, phone, email, address, city, state, postal_code, status, reviewed_by, reviewed_at) VALUES ($1, 'Lake Frames', 'Ravi', '9000000001', 'ravi@example.com', '1 Lake Road', 'Dhenkanal', 'Odisha', '759001', 'APPROVED', $2, now())", [SHOP_APP, ADMIN]);
  await q("INSERT INTO shops (id, shop_code, name, city, state, postal_code, latitude, longitude, approval_status, active_status, fulfilment, opening_hours, application_id, created_by, approved_by, approved_at) VALUES ($1, 'FRX-SHOP-' || nextval('shop_code_seq'), 'Lake Frames', 'Dhenkanal', 'Odisha', '759001', 20.659812345678901, 85.596123456789012, 'APPROVED', 'ACTIVE', '[\"pickup\", \"delivery\"]', '{\"mon\": [\"10:00\", \"20:00\"], \"note\": \"बंद रविवार\"}', $2, $3, $3, now())", [SHOP, SHOP_APP, ADMIN]);
  await q("UPDATE shop_applications SET shop_id = $1 WHERE id = $2", [SHOP, SHOP_APP]);
  await q("INSERT INTO users (id, name, email, role, shop_id) VALUES ($1, 'Ravi', 'ravi@example.com', 'SHOP', $2)", [id(), SHOP]);
  // users ↔ artists ↔ artist_applications
  await q("INSERT INTO artist_applications (id, name, email, phone, city, state, status, reviewed_by) VALUES ($1, 'Meera', 'meera@example.com', '9000000002', 'Cuttack', 'Odisha', 'APPROVED', $2)", [ARTIST_APP, ADMIN]);
  await q("INSERT INTO artists (id, artist_code, username, name, city, state, specialties, application_id, created_by) VALUES ($1, 'FRX-ART-' || nextval('artist_code_seq'), 'meera', 'Meera', 'Cuttack', 'Odisha', '[\"Pattachitra\", \"ପଟ୍ଟଚିତ୍ର\"]', $2, $3)", [ARTIST, ARTIST_APP, ADMIN]);
  await q("UPDATE artist_applications SET artist_id = $1 WHERE id = $2", [ARTIST, ARTIST_APP]);
  await q("INSERT INTO users (id, name, email, role, artist_id) VALUES ($1, 'Meera', 'meera@example.com', 'ARTIST', $2)", [id(), ARTIST]);
  // A time with microseconds, quotes, Hindi and an emoji
  await q("INSERT INTO users (id, name, email, phone, role, created_at) VALUES ($1, $2, 'asha@example.com', NULL, 'CUSTOMER', '2026-10-18 10:11:12.123456+05:30')", [CUSTOMER, CUSTOMER_NAME]);
  // Decimals (numeric) and a payout that adds up
  await q("INSERT INTO payouts (id, payout_number, shop_id, sales, online_sales, extras, commission_percent, commission, fee_percent, fee, amount, method, account_hint, reference, paid_by) VALUES ($1, 'PO-' || nextval('payout_number_seq'), $2, 1000, 1000, 0, 12.50, 125, 2.25, 18, 857, 'UPI', 'ra•••@okaxis', 'UTR123', $3)", [id(), SHOP, ADMIN]);
  // The welcome coupon is added by a migration; the admin switched it off. A second, admin-made coupon.
  await q("UPDATE coupons SET active = false WHERE code = 'XUSE10'");
  await q("INSERT INTO coupons (code, title, percent_off, min_order, ends_at) VALUES ('DIWALI20', 'Diwali 20% off', 20, 999, '2026-11-05 23:59:59.999999+05:30')");
  await q("INSERT INTO platform_settings (key, value, updated_by) VALUES ('commission', '{\"platform\": 10.5, \"nested\": {\"list\": [1, \"two\", null, true]}}', $1)", [ADMIN]);
  // Order numbers used up by orders that are not here any more: the restore must not give them out again
  await q("SELECT nextval('order_number_seq'), nextval('order_number_seq')");

  unlocked = await makeBackup(source, { label: "test" });
  locked = await makeBackup(source, { passphrase: PASS, label: "test" });
});

after(async () => {
  for (const lite of opened) await lite.close().catch(() => {});
});

describe("Backup file", () => {
  test("holds every table with its rows, the migrations and the sequences", async () => {
    assert.equal(unlocked.file.subarray(0, 4).toString(), "FXDB");
    const { header, tables } = readBackup(unlocked.file);
    const migrations = (await source.query("SELECT version FROM schema_migrations ORDER BY 1")).rows.map((r) => r.version);
    assert.deepEqual(header.migrations, migrations);
    const real = await dump(source);
    assert.deepEqual(header.tables.map((t) => t.name).sort(), Object.keys(real).sort());
    for (const t of header.tables) assert.equal(tables.get(t.name).length, real[t.name].length, t.name);
    assert.equal(unlocked.counts.users, 4);
    assert.equal(unlocked.counts.coupons, 2);
    const seq = Object.fromEntries(header.sequences.map((s) => [s.name, s]));
    assert.equal(seq.order_number_seq.lastValue, "100002");
    assert.equal(seq.order_number_seq.isCalled, true);
    assert.equal(seq.shop_code_seq.lastValue, "1001");
  });

  test("making a backup changes nothing in the database", async () => {
    const before = await dump(source);
    const seqBefore = (await source.query("SELECT last_value FROM order_number_seq")).rows[0].last_value;
    const again = await makeBackup(source);
    assert.deepEqual(await dump(source), before);
    assert.equal((await source.query("SELECT last_value FROM order_number_seq")).rows[0].last_value, seqBefore);
    assert.deepEqual(again.header.tables.map((t) => t.sha256), unlocked.header.tables.map((t) => t.sha256));
  });

  test("a locked backup needs its passphrase; a wrong one or a changed byte is refused", () => {
    assert.equal(locked.file[5], 1);
    assert.throws(() => readBackup(locked.file), (e) => e.needsPassphrase === true);
    assert.throws(() => readBackup(locked.file, { passphrase: "not it" }), /Wrong passphrase/);
    const changed = Buffer.from(locked.file);
    changed[changed.length - 10] ^= 1;
    assert.throws(() => readBackup(changed, { passphrase: PASS }), /Wrong passphrase, or the file was changed/);
    const open = readBackup(locked.file, { passphrase: PASS });
    assert.deepEqual(open.header.tables.map((t) => t.sha256), unlocked.header.tables.map((t) => t.sha256));
    // Nothing readable inside a locked file
    assert.equal(locked.file.includes(Buffer.from("asha@example.com")), false);
    assert.equal(locked.file.includes(Buffer.from("users")), false);
  });

  test("a damaged or foreign file is refused", () => {
    assert.throws(() => readBackup(Buffer.from("not a backup at all")), /not a FrameX database backup/);
    assert.throws(() => readBackup(unlocked.file.subarray(0, unlocked.file.length - 40)), /damaged|incomplete/);
    // One value changed inside a (re-packed) file: its table no longer matches the fingerprint
    const text = zlib.gunzipSync(unlocked.file.subarray(6)).toString("utf8");
    assert.ok(text.includes("asha@example.com"));
    const tampered = Buffer.concat([unlocked.file.subarray(0, 6), zlib.gzipSync(Buffer.from(text.replace("asha@example.com", "usha@example.com")))]);
    assert.throws(() => readBackup(tampered), /users does not match its fingerprint/);
  });
});

describe("Restore", () => {
  let target;

  test("into an empty database: the same rows, links and sequences", async () => {
    target = await freshDb();
    const result = await restoreBackup(target, locked.file, { passphrase: PASS });
    assert.equal(result.exact, true);
    assert.equal(result.rows, Object.values(unlocked.counts).reduce((a, b) => a + b, 0));
    // Compared with PostgreSQL's own JSON of every row, independent of the backup's fingerprints
    assert.deepEqual(await dump(target), await dump(source));
    // Values that a JavaScript round trip would change
    const asha = (await target.query("SELECT name, phone, created_at = '2026-10-18 10:11:12.123456+05:30'::timestamptz AS exact FROM users WHERE id = $1", [CUSTOMER])).rows[0];
    assert.deepEqual(asha, { name: CUSTOMER_NAME, phone: null, exact: true });
    const payout = (await target.query("SELECT commission_percent::text AS c, fee_percent::text AS f FROM payouts")).rows[0];
    assert.deepEqual(payout, { c: "12.50", f: "2.25" });
    const shop = (await target.query("SELECT latitude, opening_hours FROM shops")).rows[0];
    assert.equal(shop.latitude, 20.659812345678901);
    assert.deepEqual(shop.opening_hours, { mon: ["10:00", "20:00"], note: "बंद रविवार" });
    // The backup's coupon (switched off), not the one the migration adds
    assert.equal((await target.query("SELECT active FROM coupons WHERE code = 'XUSE10'")).rows[0].active, false);
  });

  test("every link is back and checked", async () => {
    const fks = "SELECT conname FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY 1";
    assert.deepEqual((await target.query(fks)).rows, (await source.query(fks)).rows);
    await assert.rejects(target.query("INSERT INTO users (id, name, email, role, shop_id) VALUES ($1, 'X', 'x@example.com', 'SHOP', $2)", [id(), id()]), /foreign key/);
    // A CHECK rule is back too (a SHOP user needs a shop)
    await assert.rejects(target.query("INSERT INTO users (id, name, email, role) VALUES ($1, 'Y', 'y@example.com', 'SHOP')", [id()]), /users_shop_role/);
  });

  test("the sequences carry on: no order number or Shop ID is given out twice", async () => {
    for (const s of ["order_number_seq", "shop_code_seq", "artist_code_seq", "payout_number_seq", "painting_request_seq"]) {
      const a = (await source.query(`SELECT nextval('${s}') AS n`)).rows[0].n;
      const b = (await target.query(`SELECT nextval('${s}') AS n`)).rows[0].n;
      assert.equal(Number(b), Number(a), s);
    }
  });

  test("a database that has rows is refused and left as it was", async () => {
    const before = await dump(target);
    await assert.rejects(restoreBackup(target, unlocked.file), /not empty/);
    assert.deepEqual(await dump(target), before);
    await assert.rejects(restoreBackup(source, unlocked.file), /not empty/);
  });

  test("a database a FrameX server already started on (the migrations' own rows) is refused", async () => {
    const started = await freshDb();
    await migrate({ using: started });
    await assert.rejects(restoreBackup(started, unlocked.file), /not empty \(coupons has 1 rows\)/);
  });

  test("a backup from newer code is refused", async () => {
    const newer = await freshDb();
    await migrate({ using: newer });
    await newer.query("INSERT INTO schema_migrations (version) VALUES ('999_future.sql')");
    const { file } = await makeBackup(newer);
    await assert.rejects(restoreBackup(await freshDb(), file), /newer code \(migrations 999_future\.sql\)/);
  });
});
