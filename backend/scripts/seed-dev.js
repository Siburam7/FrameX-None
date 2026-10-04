/* ==========================================================================
   DEVELOPMENT SEED DATA — never runs in production.

     npm run seed:dev            add the sample data (safe to run again)
     npm run seed:dev -- --reset remove the sample data first

   Creates clearly-marked demo records so every flow can be tried locally:
     - demo shops (is_demo = true, shown with a "Sample shop" label) placed at
       the centres of real Odisha towns, plus one inactive demo shop
     - a pending demo shop application
     - a demo customer, a demo shop login and a demo admin, each with a random
       password printed once below (nothing is hard-coded)
   Real shops are added by a FrameX admin through the admin dashboard.
   ========================================================================== */
import crypto from "node:crypto";
import { config } from "../src/config.js";
import { db, initDb } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { hashPassword } from "../src/lib/passwords.js";
import { newId } from "../src/lib/tokens.js";

if (config.isProd) {
  console.error("seed:dev is for development only and will not run with NODE_ENV=production.");
  process.exit(1);
}

// Town-centre coordinates (public map data), used only for demo shops.
const DEMO_SHOPS = [
  { name: "Demo Frames Dhenkanal", area: "Station Road", city: "Dhenkanal", state: "Odisha", postalCode: "759001", latitude: 20.6586, longitude: 85.5981, catalogRef: "shop-002", fulfilment: ["pickup", "shop_delivery"], active: true },
  { name: "Demo Frames Cuttack", area: "Buxi Bazaar", city: "Cuttack", state: "Odisha", postalCode: "753001", latitude: 20.4625, longitude: 85.883, catalogRef: "shop-003", fulfilment: ["pickup", "delivery_partner"], active: true },
  { name: "Demo Frames Bhubaneswar", area: "Master Canteen", city: "Bhubaneswar", state: "Odisha", postalCode: "751001", latitude: 20.2961, longitude: 85.8245, catalogRef: null, fulfilment: ["pickup"], active: true },
  { name: "Demo Frames Angul", area: "Amlapada", city: "Angul", state: "Odisha", postalCode: "759122", latitude: 20.84, longitude: 85.101, catalogRef: null, fulfilment: ["pickup"], active: true },
  { name: "Demo Frames Puri (inactive)", area: "Grand Road", city: "Puri", state: "Odisha", postalCode: "752001", latitude: 19.8135, longitude: 85.8312, catalogRef: null, fulfilment: ["pickup"], active: false }
];

const ACCOUNTS = {
  customer: { name: "Demo Customer", email: "customer@framex.test", role: "CUSTOMER" },
  shop: { name: "Demo Shop Owner", email: "shop@framex.test", role: "SHOP" },
  admin: { name: "Demo Admin", email: "admin@framex.test", role: "ADMIN" }
};

const randomPassword = () => crypto.randomBytes(9).toString("base64url") + "7a";

async function reset() {
  await db.tx(async (q) => {
    const demoUsers = "(SELECT id FROM users WHERE email LIKE '%@framex.test')";
    // Anything the demo accounts touched keeps existing, without the reference.
    await q.query(`DELETE FROM audit_logs WHERE actor_user_id IN ${demoUsers}`);
    await q.query(`DELETE FROM auth_tokens WHERE created_by IN ${demoUsers}`);
    await q.query(`UPDATE shops SET created_by = NULL WHERE created_by IN ${demoUsers}`);
    await q.query(`UPDATE shops SET approved_by = NULL WHERE approved_by IN ${demoUsers}`);
    await q.query(`UPDATE shop_applications SET reviewed_by = NULL WHERE reviewed_by IN ${demoUsers}`);
    await q.query("DELETE FROM users WHERE email LIKE '%@framex.test' OR shop_id IN (SELECT id FROM shops WHERE is_demo)");
    await q.query("UPDATE shop_applications SET shop_id = NULL WHERE shop_id IN (SELECT id FROM shops WHERE is_demo)");
    await q.query("DELETE FROM shop_applications WHERE email LIKE '%@framex.test'");
    await q.query("DELETE FROM shops WHERE is_demo");
  });
  console.log("Removed the demo data.");
}

async function main() {
  await initDb();
  await migrate();
  if (process.argv.includes("--reset")) await reset();

  const printed = [];
  let firstShop = null;
  for (const s of DEMO_SHOPS) {
    let row = (await db.query("SELECT id, shop_code FROM shops WHERE name = $1 AND is_demo", [s.name])).rows[0];
    if (!row) {
      const refTaken = s.catalogRef && (await db.query("SELECT 1 FROM shops WHERE catalog_ref = $1", [s.catalogRef])).rows.length;
      const code = "FRX-SHOP-" + (await db.query("SELECT nextval('shop_code_seq')::int AS n")).rows[0].n;
      row = (
        await db.query(
          `INSERT INTO shops (id, shop_code, catalog_ref, name, owner_name, description, area, city, state, postal_code, country, latitude, longitude,
                              approval_status, active_status, fulfilment, is_demo, approved_at)
           VALUES ($1, $2, $3, $4, 'Demo Owner', 'Sample shop for development. Not a real FrameX partner.', $5, $6, $7, $8, 'IN', $9, $10,
                   'APPROVED', $11, $12::jsonb, true, now()) RETURNING id, shop_code`,
          [newId(), code, refTaken ? null : s.catalogRef, s.name, s.area, s.city, s.state, s.postalCode, s.latitude, s.longitude, s.active ? "ACTIVE" : "INACTIVE", JSON.stringify(s.fulfilment)]
        )
      ).rows[0];
    }
    firstShop = firstShop || row;
  }

  for (const [key, a] of Object.entries(ACCOUNTS)) {
    const exists = (await db.query("SELECT 1 FROM users WHERE email = $1", [a.email])).rows.length;
    if (exists) continue;
    const password = randomPassword();
    await db.query("INSERT INTO users (id, name, email, password_hash, role, status, shop_id, password_changed_at) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, now())", [
      newId(),
      a.name,
      a.email,
      await hashPassword(password),
      a.role,
      key === "shop" ? firstShop.id : null
    ]);
    printed.push({ account: key, login: key === "shop" ? `${firstShop.shop_code}  (or ${a.email})` : a.email, password });
  }

  const hasApp = (await db.query("SELECT 1 FROM shop_applications WHERE email = 'applicant@framex.test'")).rows.length;
  if (!hasApp) {
    await db.query(
      `INSERT INTO shop_applications (id, shop_name, owner_name, phone, email, address, city, state, postal_code, business_details, message)
       VALUES ($1, 'Demo Application Frames', 'Demo Applicant', '+919000000001', 'applicant@framex.test', 'Demo Street 1', 'Dhenkanal', 'Odisha', '759001',
               'Sample application for development.', 'Please review.')`,
      [newId()]
    );
  }

  console.log(`Demo shops ready (${DEMO_SHOPS.length}, one inactive) and one pending demo application.`);
  if (printed.length) {
    console.log("\nDemo logins (development only; shown once, the passwords are random):");
    console.table(printed);
  } else console.log("Demo logins already exist. Run with --reset to recreate them and print new passwords.");
  await db.close();
}

main().catch(async (error) => {
  console.error("Seeding failed:", error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
