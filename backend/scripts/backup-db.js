/* ==========================================================================
   Copy the whole database into one file (src/db/backup.js). Only reads.

     npm run db:backup                    the database in DATABASE_URL (or the local one)
     npm run db:backup -- --out <folder>  where the file goes
                                          (default: a "FrameX-backups" folder next to the project)

   The live database: double-click backup-live-db.bat in the project folder.

   Passphrase: asked for twice (nothing shows while you type), or BACKUP_PASSPHRASE.
   Required, at least 10 characters: every file is locked (AES-256-GCM). Without
   a good passphrase the database is not even opened.
   The file holds customer details: keep it private, and keep the passphrase,
   a locked backup can't be opened without it. The connection string is never
   printed or written anywhere.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { makeBackup, readPassphrase } from "../src/db/backup.js";
import { db, initDb } from "../src/db/index.js";

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => rl.output.write(text.includes(question) ? question : "");
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};

async function main() {
  const live = Boolean(config.databaseUrl);
  const out = path.resolve(arg("--out") || path.join(PROJECT, "..", "FrameX-backups"));
  // The passphrase first: without a good one the database is never opened and nothing is written
  if (process.env.BACKUP_PASSPHRASE === undefined && process.stdin.isTTY) console.log("A passphrase locks the backup file. Keep it safe: the file can't be opened without it.");
  const passphrase = await readPassphrase({ interactive: Boolean(process.stdin.isTTY), ask: (q) => prompt(q, { hidden: true }) });
  await initDb();
  console.log(`Reading the ${live ? "database in DATABASE_URL" : "local database"} (read-only)…`);
  const { file, header } = await makeBackup(db, { passphrase, label: live ? "live" : "local" });
  await db.close();
  // Owner only where the system has such modes (Linux, macOS); on Windows the folder's own permissions apply
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  // This computer's own date and time (the file's header keeps the exact moment in UTC)
  const at = new Date(header.createdAt);
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;
  const name = path.join(out, `framex-db-${live ? "live" : "local"}-${stamp}.fxdb`);
  fs.writeFileSync(name, file, { flag: "wx", mode: 0o600 });
  const rows = header.tables.reduce((n, t) => n + t.rows, 0);
  console.log(`Saved ${name}`);
  console.log(`  ${header.tables.length} tables, ${rows} rows, ${(file.length / 1024).toFixed(0)} KB, locked with your passphrase; migrations up to ${header.migrations.at(-1)}`);
  for (const t of header.tables) if (t.rows) console.log(`  ${t.name.padEnd(26)} ${t.rows}`);
}

main().catch((error) => {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
});
