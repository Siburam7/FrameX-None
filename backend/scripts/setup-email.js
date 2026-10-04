/* ==========================================================================
   Set up real email sending from a Gmail account.

     npm run email:setup

   Asks for the Gmail address and a Google "App Password", checks them with
   Gmail, sends a test message, and only then saves them to backend/.env
   (which is never committed to Git). Restart the backend afterwards.

   Why an App Password: Google does not let programs log in with the normal
   Gmail password. An App Password is a 16-letter password made for one app.
     1. Turn on 2-Step Verification: https://myaccount.google.com/security
     2. Create an App Password:      https://myaccount.google.com/apppasswords
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import nodemailer from "nodemailer";
import { BACKEND_ROOT } from "../src/config.js";
import { explainMailError, messages } from "../src/lib/mailer.js";

const ENV_FILE = path.join(BACKEND_ROOT, ".env");

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => rl.output.write(text.includes(question) ? question : "");
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/** Set KEY=value lines in backend/.env, keeping everything else in the file. */
function saveEnv(values) {
  let lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : ["# FrameX backend settings. Never commit this file.", ""];
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${/[\s#<>"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value}`;
    const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
  }
  fs.writeFileSync(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
}

async function main() {
  const fromEnv = process.argv.includes("--from-env"); // for scripted setups: GMAIL_USER + GMAIL_APP_PASSWORD
  let user, pass;
  if (fromEnv) {
    user = (process.env.GMAIL_USER || "").trim();
    pass = process.env.GMAIL_APP_PASSWORD || "";
  } else {
    if (!process.stdin.isTTY) throw new Error("No interactive terminal. Run this in a normal terminal window.");
    console.log("\nSend FrameX emails from Gmail\n-----------------------------");
    console.log("You need a Google App Password (16 letters). The normal Gmail password will not work.");
    console.log("  1. Turn on 2-Step Verification:  https://myaccount.google.com/security");
    console.log("  2. Create an App Password:       https://myaccount.google.com/apppasswords\n");
    user = await prompt("Gmail address to send from: ");
    pass = await prompt("App Password (typing is hidden): ", { hidden: true });
  }
  pass = pass.replace(/\s+/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(user)) throw new Error("That doesn't look like an email address.");
  if (pass.length < 16) throw new Error("An App Password has 16 letters. The normal Gmail password does not work here.");

  console.log("Checking the login with Gmail…");
  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  try {
    await transport.verify();
  } catch (error) {
    throw new Error(explainMailError(error));
  }
  console.log("Login accepted. Sending a test message to " + user + "…");
  const test = messages.test();
  await transport.sendMail({ from: `FrameX <${user}>`, to: user, subject: test.subject, text: test.text, html: test.html });

  saveEnv({ EMAIL_PROVIDER: "gmail", GMAIL_USER: user, GMAIL_APP_PASSWORD: pass, EMAIL_FROM: `FrameX <${user}>` });
  console.log("\nDone. Saved to backend/.env (this file stays on your computer; Git ignores it).");
  console.log("Check the inbox of " + user + " for the test message.");
  console.log("Now restart the backend (close its window and start it again). Password-reset emails will be sent for real.\n");
}

main().catch((error) => {
  console.error("\nEmail was NOT set up: " + (error.message || error));
  console.error("Nothing was saved. Fix the problem above and run this again.\n");
  process.exit(1);
});
