/* ==========================================================================
   Database access: PostgreSQL everywhere.
     DATABASE_URL set    -> a real PostgreSQL server through "pg" (production)
     DATABASE_URL empty  -> embedded PostgreSQL (PGlite) in backend/.data/pg,
                            so local development needs no database install
   Both speak the same SQL, so the rest of the code only uses:
     db.query(sql, params) -> { rows }
     db.tx(async (q) => { await q.query(...) })   one transaction
     db.exec(sql)                                  several statements, no params
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let impl = null;

async function connectPg() {
  const pg = (await import("pg")).default;
  // int8 (COUNT, sequences) as JavaScript numbers; our values stay far below 2^53.
  pg.types.setTypeParser(20, (v) => Number(v));
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl === "require" ? { rejectUnauthorized: false } : undefined,
    max: 10
  });
  await pool.query("SELECT 1");
  return {
    kind: "postgres",
    query: (text, params) => pool.query(text, params),
    exec: (text) => pool.query(text),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (t, p) => client.query(t, p), exec: (t) => client.query(t) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}

/**
 * The embedded database is a folder that only ONE process may open at a time.
 * A lock file stops e.g. "npm run seed:dev" from opening it while the server runs.
 */
function lockEmbedded() {
  const file = path.join(config.dataDir, "pg.lock");
  try {
    const pid = Number(fs.readFileSync(file, "utf8"));
    let alive = false;
    try {
      alive = pid > 0 && pid !== process.pid && (process.kill(pid, 0), true);
    } catch (error) {
      alive = error.code === "EPERM";
    }
    if (alive) throw Object.assign(new Error(`The local database is in use by another FrameX process (pid ${pid}). Stop the server first, then run this command again.`), { locked: true });
  } catch (error) {
    if (error.locked) throw error; // otherwise: no lock file, or a stale one
  }
  fs.writeFileSync(file, String(process.pid));
  const release = () => {
    try {
      if (Number(fs.readFileSync(file, "utf8")) === process.pid) fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  };
  process.on("exit", release);
  return release;
}

async function connectEmbedded() {
  const { PGlite } = await import("@electric-sql/pglite");
  let lite;
  let release = () => {};
  if (config.inMemory) lite = new PGlite(); // in memory
  else {
    const dir = path.join(config.dataDir, "pg");
    fs.mkdirSync(dir, { recursive: true });
    release = lockEmbedded();
    lite = new PGlite(dir);
  }
  await lite.waitReady;
  const shape = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    kind: "embedded",
    query: async (text, params) => shape(await lite.query(text, params)),
    exec: (text) => lite.exec(text),
    tx: (fn) => lite.transaction((t) => fn({ query: async (text, params) => shape(await t.query(text, params)), exec: (text) => t.exec(text) })),
    async close() {
      await lite.close();
      release();
    }
  };
}

export async function initDb() {
  if (!impl) impl = config.databaseUrl ? await connectPg() : await connectEmbedded();
  return impl;
}

const ready = () => {
  if (!impl) throw new Error("Database not initialised. Call initDb() first.");
  return impl;
};

export const db = {
  get kind() {
    return ready().kind;
  },
  query: (text, params) => ready().query(text, params),
  exec: (text) => ready().exec(text),
  tx: (fn) => ready().tx(fn),
  async close() {
    if (impl) await impl.close();
    impl = null;
  }
};
