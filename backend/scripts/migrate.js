/* Apply database migrations (the server also does this on start). */
import { assertConfig } from "../src/config.js";
import { db, initDb } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";

assertConfig();
await initDb();
await migrate({ log: console.log });
console.log(`Database is up to date (${db.kind}).`);
await db.close();
