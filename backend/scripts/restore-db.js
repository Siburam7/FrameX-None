/* ==========================================================================
   Put a backup file (npm run db:backup) into a NEW, EMPTY database.

     DATABASE_URL=<a new, empty database> npm run db:restore -- <file>
     DATA_DIR=<a new, empty folder>        npm run db:restore -- <file>   (a local test copy)

   It refuses a database that already has rows in any table, so the live
   database can't be overwritten by mistake. Use it to test that a backup
   works (restore into a new Neon branch or a local folder), or to rebuild
   after a disaster. After the copy it reads every table back and compares it
   with the backup, row for row. Asks you to type RESTORE first.
   ========================================================================== */
import fs from "node:fs";
import readline from "node:readline";
import { config } from "../src/config.js";
import { isLocked, readBackup, restoreBackup } from "../src/db/backup.js";
import { describeConnection, pgConnection } from "../src/db/ssl.js";
import { db, initDb } from "../src/db/index.js";

/** "server <host>, database <name>" from a connection string: never the user name or the password. */
function where(url) {
  try {
    const u = new URL(url);
    return `server ${u.hostname}, database ${decodeURIComponent(u.pathname.replace(/^\//, "")) || "(default)"}`;
  } catch {
    return "an address that could not be read";
  }
}

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

async function main() {
  const fileName = process.argv[2];
  if (!fileName || !fs.existsSync(fileName)) throw new Error("Give the backup file: npm run db:restore -- <file>");
  const file = fs.readFileSync(fileName);
  // Every backup made by db:backup is locked. An unlocked one was made some other way (or by anyone, without the passphrase).
  if (!isLocked(file) && process.env.RESTORE_ALLOW_UNLOCKED !== "yes") throw new Error("This backup is not locked with a passphrase, so it can't be told apart from a file anyone could have made. Nothing was changed. (To restore it anyway: RESTORE_ALLOW_UNLOCKED=yes.)");
  let passphrase = process.env.BACKUP_PASSPHRASE || "";
  try {
    readBackup(file, { passphrase });
  } catch (error) {
    if (!error.needsPassphrase) throw error;
    passphrase = await prompt("Passphrase of the backup: ", { hidden: true });
  }
  const { header } = readBackup(file, { passphrase });
  console.log(`Backup of ${header.createdAt} (${header.label || "?"}): ${header.tables.length} tables, ${header.tables.reduce((n, t) => n + t.rows, 0)} rows.`);
  console.log(`Target: ${config.databaseUrl ? `the database in DATABASE_URL (${where(config.databaseUrl)}; ${describeConnection(pgConnection(config.databaseUrl, config.databaseSsl), { production: true }).text})` : `the local folder ${config.dataDir}`}. It must be NEW and EMPTY.`);
  if (process.env.RESTORE_CONFIRM !== "RESTORE" && (await prompt('Type RESTORE to continue: ')) !== "RESTORE") throw new Error("Not confirmed. Nothing was changed.");
  await initDb();
  const result = await restoreBackup(db, file, { passphrase, log: (m) => console.log(m) });
  await db.close();
  console.log(`Restored ${result.rows} rows into ${result.tables} tables; ${result.exact ? "every table was read back and matches the backup row for row" : "every table has the backup's number of rows (this code dropped a column, so not every table could be compared row for row)"}.`);
}

main().catch(async (error) => {
  console.error(`Restore failed: ${error.message}`);
  await db.close().catch(() => {});
  process.exit(1);
});
