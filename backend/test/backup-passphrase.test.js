/* ==========================================================================
   The backup's passphrase (src/db/backup.js, scripts/backup-db.js) and the
   restore's refusal of unlocked files (scripts/restore-db.js).
   Run with "npm test" in backend/.

   Unit checks of the rule, then the real scripts in their own processes on
   new temporary folders (a local test database, never DATABASE_URL):
     - an empty, whitespace-only or too short passphrase is refused BEFORE
       the database is opened: no database folder is created, no file is
       written;
     - a good one gives a locked file that opens with it;
     - the passphrase never appears in what the scripts print;
     - a restore refuses an unlocked file unless told otherwise.
   ========================================================================== */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { checkPassphrase, isLocked, makeBackup, MIN_PASSPHRASE, readBackup, readPassphrase } from "../src/db/backup.js";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOD = "  a long passphrase with spaces  ";
const temps = [];
const temp = (label) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `framex-${label}-`));
  temps.push(dir);
  return dir;
};
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** A script in its own process, on a local test database folder; never a DATABASE_URL. */
function run(script, args, env) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: BACKEND, encoding: "utf8", env: { ...process.env, NODE_ENV: "development", DATABASE_URL: "", BACKUP_PASSPHRASE: undefined, RESTORE_CONFIRM: undefined, RESTORE_ALLOW_UNLOCKED: undefined, ...env }, timeout: 120000 });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const clean = (env) => Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));

describe("the backup passphrase rule", () => {
  test("empty and whitespace-only passphrases are refused", () => {
    for (const p of ["", " ", "   \t  ", "\n", undefined, null])
      assert.throws(() => checkPassphrase(p), /A passphrase is required.*Nothing was read from the database and no file was written/, JSON.stringify(p));
  });

  test(`a passphrase shorter than ${MIN_PASSPHRASE} characters (spaces around it not counted) is refused`, () => {
    assert.throws(() => checkPassphrase("short"), /at least 10 characters/);
    assert.throws(() => checkPassphrase("   123456789   "), /at least 10 characters/);
  });

  test("two different passphrases are refused", () => {
    assert.throws(() => checkPassphrase(GOOD, GOOD.trim()), /not the same/);
    assert.throws(() => checkPassphrase(GOOD, "something else entirely"), /not the same/);
  });

  test("a good passphrase is kept exactly as typed", () => {
    assert.equal(checkPassphrase(GOOD, GOOD), GOOD);
    assert.equal(checkPassphrase("0123456789"), "0123456789");
  });

  test("asked in the window: an empty first answer stops at once; a mismatch is refused; a good one is returned", async () => {
    const asker = (answers) => {
      const asked = [];
      return { asked, ask: async (q) => (asked.push(q), answers.shift()) };
    };
    let a = asker([""]);
    await assert.rejects(readPassphrase({ env: {}, interactive: true, ask: a.ask }), /A passphrase is required/);
    assert.equal(a.asked.length, 1, "not asked a second time");
    a = asker(["    "]);
    await assert.rejects(readPassphrase({ env: {}, interactive: true, ask: a.ask }), /A passphrase is required/);
    a = asker([GOOD, GOOD + "x"]);
    await assert.rejects(readPassphrase({ env: {}, interactive: true, ask: a.ask }), /not the same/);
    a = asker([GOOD, GOOD]);
    assert.equal(await readPassphrase({ env: {}, interactive: true, ask: a.ask }), GOOD);
    assert.equal(a.asked.length, 2);
  });

  test("BACKUP_PASSPHRASE is checked the same way; with neither a window nor the variable it is refused", async () => {
    await assert.rejects(readPassphrase({ env: { BACKUP_PASSPHRASE: "" } }), /A passphrase is required/);
    await assert.rejects(readPassphrase({ env: { BACKUP_PASSPHRASE: "    " } }), /A passphrase is required/);
    assert.equal(await readPassphrase({ env: { BACKUP_PASSPHRASE: GOOD } }), GOOD);
    await assert.rejects(readPassphrase({ env: {}, interactive: false }), /No passphrase/);
  });
});

describe("npm run db:backup (the real script)", () => {
  for (const [label, value] of [
    ["empty", ""],
    ["whitespace-only", "   \t "],
    ["too short", "abc"]
  ])
    test(`passphrase ${label}: refused before the database is opened, no file written`, () => {
      const data = temp("backup-data");
      const out = path.join(temp("backup-out"), "files");
      const r = run("scripts/backup-db.js", ["--out", out], clean({ DATA_DIR: data, BACKUP_PASSPHRASE: value }));
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /Backup failed: .*Nothing was read from the database and no file was written/);
      assert.equal(fs.existsSync(path.join(data, "pg")), false, "the database was never opened");
      assert.equal(fs.existsSync(out), false, "no folder, no file");
    });

  test("no passphrase at all (no window, no variable): refused, nothing written", () => {
    const data = temp("backup-data");
    const out = path.join(temp("backup-out"), "files");
    const r = run("scripts/backup-db.js", ["--out", out], clean({ DATA_DIR: data }));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /No passphrase/);
    assert.deepEqual([fs.existsSync(path.join(data, "pg")), fs.existsSync(out)], [false, false]);
  });

  test("a good passphrase: one locked file that opens with it, and the passphrase is never printed", () => {
    const data = temp("backup-data");
    const out = temp("backup-out");
    assert.equal(run("scripts/migrate.js", [], { DATA_DIR: data }).code, 0, "a local test database with the tables");
    const r = run("scripts/backup-db.js", ["--out", out], { DATA_DIR: data, BACKUP_PASSPHRASE: GOOD });
    assert.equal(r.code, 0, r.out);
    assert.ok(!r.out.includes(GOOD.trim()), "the passphrase is not in the output");
    assert.match(r.out, /locked with your passphrase/);
    const files = fs.readdirSync(out);
    assert.equal(files.length, 1);
    assert.match(files[0], /^framex-db-local-\d{8}-\d{4}\.fxdb$/);
    const file = fs.readFileSync(path.join(out, files[0]));
    assert.equal(isLocked(file), true);
    assert.equal(file.includes(Buffer.from(GOOD.trim())), false);
    assert.throws(() => readBackup(file), (e) => e.needsPassphrase === true);
    assert.throws(() => readBackup(file, { passphrase: GOOD.trim() }), /Wrong passphrase/, "spaces around it are part of it");
    assert.ok(readBackup(file, { passphrase: GOOD }).header.tables.length > 30);
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(out, files[0])).mode & 0o777, 0o600);
  });
});

describe("npm run db:restore (the real script)", () => {
  test("an unlocked file is refused (it could have been made by anyone) and nothing is created", async () => {
    const lite = new PGlite();
    await lite.waitReady;
    await lite.exec("CREATE TABLE schema_migrations (version text PRIMARY KEY)");
    const shape = (r) => ({ rows: r.rows });
    const handle = { query: async (t, p) => shape(await lite.query(t, p)), tx: (fn) => lite.transaction((t) => fn({ query: async (x, p) => shape(await t.query(x, p)) })) };
    const { file } = await makeBackup(handle);
    await lite.close();
    assert.equal(isLocked(file), false);
    const name = path.join(temp("restore-in"), "unlocked.fxdb");
    fs.writeFileSync(name, file);
    const data = temp("restore-data");
    const r = run("scripts/restore-db.js", [name], { DATA_DIR: data, RESTORE_CONFIRM: "RESTORE" });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /not locked with a passphrase.*Nothing was changed/);
    assert.equal(fs.existsSync(path.join(data, "pg")), false);
  });
});
