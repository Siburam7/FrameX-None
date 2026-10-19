/* ==========================================================================
   A complete copy of the database in one file, and putting it back.
   (scripts/backup-db.js and scripts/restore-db.js; backup-live-db.bat)

   Backup
     - reads every table of the "public" schema in ONE read-only transaction
       (REPEATABLE READ), so the copy is one moment in time even while the
       site is in use, plus the sequences (order numbers, Shop IDs, …) and
       the list of migrations the database has;
     - only reads: nothing in the database is changed;
     - every value is kept as PostgreSQL's own text for it, so nothing is
       rounded (times keep their microseconds, amounts their decimals), and
       every table gets a fingerprint (SHA-256 of its rows);
     - the file is gzip-compressed, and locked with AES-256-GCM when a
       passphrase is given (the key comes from the passphrase through scrypt).
       It holds customer details: keep it private, and keep the passphrase:
       a locked backup can't be opened without it.

   Restore (into a NEW, EMPTY database only — never the live one)
     - refuses a database that already has rows in any table;
     - creates the tables with the migrations of this code (rows a migration
       adds itself, like the welcome coupon, are replaced by the backup's),
       then copies the rows in; foreign keys are taken off for the copy and
       put back after, which checks every link again (the tables refer to each
       other in circles: users ↔ shops ↔ shop applications, users ↔ artists);
     - sets the sequences, then reads every table back and compares its rows
       with the backup's fingerprint (and its number of rows).
   ========================================================================== */
import crypto from "node:crypto";
import zlib from "node:zlib";
import { migrate } from "./migrate.js";

const MAGIC = Buffer.from("FXDB");
const FORMAT = 1;
const SKIP = new Set(["schema_migrations"]); // made by the migrations themselves

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
const typeName = (type) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(type)) throw new Error(`Unexpected column type ${type}.`);
  return type;
};

// The same text for the same value on any server: times in UTC, floats exact.
async function sameText(q) {
  await q.query("SET LOCAL TimeZone TO 'UTC'");
  await q.query("SET LOCAL DateStyle TO 'ISO, MDY'");
  await q.query("SET LOCAL IntervalStyle TO 'postgres'");
  await q.query("SET LOCAL extra_float_digits TO 1");
}

async function describe(q) {
  const tables = (await q.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).rows.map((r) => r.table_name);
  const cols = (await q.query("SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows;
  const columns = new Map(tables.map((t) => [t, []]));
  for (const c of cols) if (columns.has(c.table_name)) columns.get(c.table_name).push({ name: c.column_name, type: c.udt_name });
  return { tables, columns };
}

/** Every row of a table as an array of texts (null stays null), in the columns' order. */
async function readRows(q, table, columns) {
  const list = columns.map((c) => `${ident(c.name)}::text AS ${ident(c.name)}`).join(", ");
  const rows = (await q.query(`SELECT ${list} FROM ${ident(table)}`)).rows;
  return rows.map((row) => columns.map((c) => row[c.name] ?? null));
}

/** A table's fingerprint: the same rows give the same one, whatever their order. */
function fingerprint(rows) {
  const lines = rows.map((r) => JSON.stringify(r)).sort();
  const hash = crypto.createHash("sha256");
  for (const line of lines) hash.update(line + "\n");
  return hash.digest("hex");
}

/* ---------------------------------------------------------------- The passphrase */

/** The shortest passphrase accepted for a backup file. */
export const MIN_PASSPHRASE = 10;
const NOTHING_DONE = "Nothing was read from the database and no file was written.";

/** A passphrase typed twice (or given once) -> the passphrase, exactly as typed. Throws when it can't lock a backup. */
export function checkPassphrase(first, again = first) {
  const p = typeof first === "string" ? first : "";
  if (!p.trim()) throw new Error(`A passphrase is required: a backup holds customer details and is always locked. ${NOTHING_DONE}`);
  if (p.trim().length < MIN_PASSPHRASE) throw new Error(`The passphrase must have at least ${MIN_PASSPHRASE} characters. ${NOTHING_DONE}`);
  if (again !== p) throw new Error(`The two passphrases are not the same. ${NOTHING_DONE}`);
  return p;
}

/**
 * The passphrase for "npm run db:backup", BEFORE the database is opened:
 * BACKUP_PASSPHRASE when set (checked the same way), else asked twice in the window (`ask(question)`; hidden),
 * else (no window, no variable) refused. An empty first answer is refused at once, without asking again.
 */
export async function readPassphrase({ env = process.env, interactive = false, ask } = {}) {
  if (env.BACKUP_PASSPHRASE !== undefined) return checkPassphrase(env.BACKUP_PASSPHRASE);
  if (!interactive || !ask) throw new Error(`No passphrase: run this in a window (it asks for one), or set BACKUP_PASSPHRASE. ${NOTHING_DONE}`);
  const first = await ask(`  Passphrase (at least ${MIN_PASSPHRASE} characters): `);
  checkPassphrase(first, first);
  return checkPassphrase(first, await ask("  The same passphrase again: "));
}

/** Is this backup file locked with a passphrase? */
export const isLocked = (file) => Buffer.isBuffer(file) && file.length > 6 && file.subarray(0, 4).equals(MAGIC) && file[5] === 1;

/* ---------------------------------------------------------------- Backup */

/** The whole database as one Buffer (the backup file). handle: { query, tx } as in db/index.js. */
export async function makeBackup(handle, { passphrase = "", label = "" } = {}) {
  const lines = [];
  const counts = {};
  let header;
  await handle.tx(async (q) => {
    await q.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await sameText(q);
    const { tables, columns } = await describe(q);
    const migrations = (await q.query("SELECT version FROM schema_migrations ORDER BY version")).rows.map((r) => r.version);
    const seqNames = (await q.query("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY 1")).rows.map((r) => r.sequence_name);
    const sequences = [];
    for (const name of seqNames) {
      const r = (await q.query(`SELECT last_value::text AS last_value, is_called FROM ${ident(name)}`)).rows[0];
      sequences.push({ name, lastValue: r.last_value, isCalled: r.is_called === true || r.is_called === "t" });
    }
    const body = [];
    const list = [];
    for (const t of tables) {
      if (SKIP.has(t)) continue;
      const cs = columns.get(t);
      const rows = await readRows(q, t, cs);
      counts[t] = rows.length;
      list.push({ name: t, columns: cs, rows: rows.length, sha256: fingerprint(rows) });
      body.push(JSON.stringify({ table: t }));
      for (const row of rows) body.push(JSON.stringify(row));
    }
    header = { format: "framex-db-backup", version: FORMAT, createdAt: new Date().toISOString(), label, migrations, sequences, tables: list };
    lines.push(JSON.stringify(header), ...body, JSON.stringify({ end: true, counts }));
  });
  const packed = zlib.gzipSync(Buffer.from(lines.join("\n") + "\n", "utf8"), { level: 9 });
  if (!passphrase) return { file: Buffer.concat([MAGIC, Buffer.from([FORMAT, 0]), packed]), header, counts };
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([cipher.update(packed), cipher.final()]);
  return { file: Buffer.concat([MAGIC, Buffer.from([FORMAT, 1]), salt, iv, cipher.getAuthTag(), sealed]), header, counts };
}

/** A backup file -> { header, tables: Map(name -> rows), counts }. Throws on a wrong passphrase or a damaged file. */
export function readBackup(file, { passphrase = "" } = {}) {
  if (!Buffer.isBuffer(file) || file.length < 6 || !file.subarray(0, 4).equals(MAGIC)) throw new Error("This is not a FrameX database backup.");
  if (file[4] !== FORMAT) throw new Error(`This backup is format ${file[4]}; this code reads format ${FORMAT}.`);
  let packed;
  if (file[5] === 1) {
    if (!passphrase) throw Object.assign(new Error("This backup is locked: give its passphrase."), { needsPassphrase: true });
    const salt = file.subarray(6, 22);
    const iv = file.subarray(22, 34);
    const tag = file.subarray(34, 50);
    const key = crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    try {
      packed = Buffer.concat([decipher.update(file.subarray(50)), decipher.final()]);
    } catch {
      throw new Error("Wrong passphrase, or the file was changed.");
    }
  } else packed = file.subarray(6);
  let lines;
  try {
    lines = zlib.gunzipSync(packed).toString("utf8").split("\n").filter(Boolean);
  } catch {
    throw new Error("The backup file is damaged (it can't be unpacked).");
  }
  const header = JSON.parse(lines[0]);
  if (header.format !== "framex-db-backup") throw new Error("This is not a FrameX database backup.");
  const tables = new Map();
  let current = null;
  let end = null;
  for (const line of lines.slice(1)) {
    const v = JSON.parse(line);
    if (Array.isArray(v)) current.push(v);
    else if (v.table) tables.set(v.table, (current = []));
    else if (v.end) end = v;
  }
  if (!end) throw new Error("The backup file is incomplete (it has no end).");
  for (const t of header.tables) {
    const rows = tables.get(t.name) || [];
    if (rows.length !== t.rows || fingerprint(rows) !== t.sha256) throw new Error(`The backup file is damaged: ${t.name} does not match its fingerprint.`);
  }
  return { header, tables, counts: end.counts };
}

/* ---------------------------------------------------------------- Restore */

/**
 * Put a backup into a NEW, EMPTY database. handle: { query, exec, tx } of that database.
 * -> { tables, rows, counts } after checking every table's rows against the backup's fingerprints.
 */
export async function restoreBackup(handle, file, { passphrase = "", log = () => {} } = {}) {
  const backup = readBackup(file, { passphrase });
  // 1. Empty only: a database with any rows is refused (so the live database can't be overwritten by mistake)
  const existing = (await handle.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).rows.map((r) => r.table_name);
  for (const t of existing) {
    if (SKIP.has(t)) continue;
    const n = (await handle.query(`SELECT count(*)::int AS n FROM ${ident(t)}`)).rows[0].n;
    if (n > 0) throw new Error(`This database is not empty (${t} has ${n} rows). Restore only into a new, empty database (one no FrameX server has started on).`);
  }
  // 2. The tables, from this code's migrations; the backup must not be newer than this code
  await migrate({ log, using: handle });
  const applied = new Set((await handle.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const unknown = backup.header.migrations.filter((m) => !applied.has(m));
  if (unknown.length) throw new Error(`The backup comes from newer code (migrations ${unknown.join(", ")}). Restore it with that code.`);
  const target = await describe(handle);
  const plan = backup.header.tables.map((t) => {
    const have = new Map((target.columns.get(t.name) || []).map((c) => [c.name, c]));
    if (!have.size) throw new Error(`This code has no table ${t.name}; restore the backup with the code it came from.`);
    // Columns both sides have (a newer code may have more; they take their defaults)
    const keep = t.columns.map((c, i) => ({ name: c.name, type: typeName(have.get(c.name)?.type || "text"), i })).filter((c) => have.has(c.name));
    return { ...t, keep, whole: keep.length === t.columns.length };
  });

  let total = 0;
  await handle.tx(async (q) => {
    await sameText(q);
    // 3. Foreign keys off for the copy (the tables refer to each other in circles), back on after (checks every link)
    const fks = (await q.query("SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace")).rows;
    for (const f of fks) await q.query(`ALTER TABLE ${f.tbl} DROP CONSTRAINT ${ident(f.conname)}`);
    for (const t of plan) {
      // Rows a migration added itself (the database was empty before step 2): the backup has the real ones
      const added = (await q.query(`SELECT count(*)::int AS n FROM ${ident(t.name)}`)).rows[0].n;
      if (added) {
        await q.query(`DELETE FROM ${ident(t.name)}`);
        log(`  ${t.name}: replaced the ${added} row(s) a migration adds with the backup's`);
      }
      const rows = backup.tables.get(t.name) || [];
      const size = Math.max(1, Math.floor(30000 / Math.max(1, t.keep.length)));
      for (let at = 0; at < rows.length; at += size) {
        const chunk = rows.slice(at, at + size);
        const params = [];
        // Each value goes in as text and is read by the column's own type, exactly as it was written out
        const values = chunk.map((row) => `(${t.keep.map((c) => {
          params.push(row[c.i]);
          return `$${params.length}::text::${c.type}`;
        }).join(", ")})`);
        await q.query(`INSERT INTO ${ident(t.name)} (${t.keep.map((c) => ident(c.name)).join(", ")}) VALUES ${values.join(", ")}`, params);
      }
      total += rows.length;
      log(`  ${t.name}: ${rows.length} rows`);
    }
    for (const f of fks) await q.query(`ALTER TABLE ${f.tbl} ADD CONSTRAINT ${ident(f.conname)} ${f.def}`);
    // 4. The sequences carry on where they were
    for (const s of backup.header.sequences) await q.query("SELECT setval($1::text::regclass, $2::text::bigint, $3)", [s.name, String(s.lastValue), s.isCalled]);
  });

  // 5. Read every table back: the same rows as the backup (its fingerprint), or at least as many when this code dropped a column
  const counts = {};
  await handle.tx(async (q) => {
    await sameText(q);
    for (const t of plan) {
      const rows = await readRows(q, t.name, t.keep);
      counts[t.name] = rows.length;
      if (rows.length !== t.rows) throw new Error(`After the restore ${t.name} has ${rows.length} rows; the backup has ${t.rows}.`);
      if (t.whole && fingerprint(rows) !== t.sha256) throw new Error(`After the restore ${t.name} does not match the backup's fingerprint.`);
    }
  });
  return { tables: plan.length, rows: total, counts, createdAt: backup.header.createdAt, exact: plan.every((t) => t.whole) };
}
