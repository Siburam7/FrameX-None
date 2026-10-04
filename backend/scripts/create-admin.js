/* ==========================================================================
   Create (or update) a FrameX admin account.

   Admins can't sign up on the website. They are created here, by someone with
   access to the server / database:

     npm run admin:create                 asks for name, email and password
     npm run admin:create -- --from-env   reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
                                          (for hosts without an interactive shell;
                                          remove the variables afterwards)

   The password is hashed before it is stored and is never printed.
   ========================================================================== */
import readline from "node:readline";
import { assertConfig } from "../src/config.js";
import { db, initDb } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { hashPassword } from "../src/lib/passwords.js";
import { newId } from "../src/lib/tokens.js";
import { normalizeEmail, v } from "../src/lib/validate.js";

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Show the question, then hide what is typed.
      rl._writeToOutput = (text) => rl.output.write(text.includes(question) ? question : "");
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function checkPassword(password) {
  const result = v.password()(password);
  if (result.error) return result.error;
  if (password.length < 12) return "Admin passwords need at least 12 characters.";
  return "";
}

async function main() {
  assertConfig();
  const fromEnv = process.argv.includes("--from-env");
  let name, email, password;

  if (fromEnv) {
    ({ ADMIN_NAME: name = "FrameX Admin", ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env);
    if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME).");
  } else {
    if (!process.stdin.isTTY) throw new Error("No interactive terminal. Use:  npm run admin:create -- --from-env");
    name = (await prompt("Admin name: ")).trim() || "FrameX Admin";
    email = await prompt("Admin email: ");
    password = await prompt("Password (12+ characters, letters and numbers): ", { hidden: true });
    const again = await prompt("Repeat password: ", { hidden: true });
    if (password !== again) throw new Error("The passwords don't match.");
  }

  email = normalizeEmail(email);
  const emailCheck = v.email()(email);
  if (emailCheck.error) throw new Error(emailCheck.error);
  const problem = checkPassword(password);
  if (problem) throw new Error(problem);

  await initDb();
  await migrate();
  const existing = (await db.query("SELECT id, role FROM users WHERE lower(email) = $1", [email])).rows[0];
  const passwordHash = await hashPassword(password);
  if (existing && existing.role !== "ADMIN") throw new Error("That email already belongs to a non-admin account. Use a different email.");
  if (existing) {
    await db.query("UPDATE users SET name = $2, password_hash = $3, status = 'ACTIVE', password_changed_at = now(), updated_at = now() WHERE id = $1", [existing.id, name, passwordHash]);
    await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [existing.id]);
    console.log(`Updated admin ${email} (password changed, other sessions signed out).`);
  } else {
    await db.query("INSERT INTO users (id, name, email, password_hash, role, status, password_changed_at) VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', now())", [newId(), name, email, passwordHash]);
    console.log(`Created admin ${email}. Log in on the website's login page, then open admin.html.`);
  }
  await db.close();
}

main().catch(async (error) => {
  console.error("Could not create the admin:", error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
