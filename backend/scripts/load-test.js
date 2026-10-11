/* ==========================================================================
   npm run load:test -- --url https://your-backend.example

   A load test of the FrameX backend: more and more pretend visitors browse at
   the same time (home page, shop, a product, the customer gallery, search),
   each one asking the backend for what a real page asks, then "reading" for a
   few seconds before the next page. After every step it says how fast the
   backend answered, so you can see where it starts to slow down. While it
   runs, open the website in your own browser and feel it yourself.

   It only READS public information: no account is made, nothing is ordered,
   nothing is written. It does make the server busy on purpose: run it when
   few customers are about, and stop it with Ctrl+C at any time.

   The backend lets one address make 300 requests a minute. A test from one
   computer reaches that long before the server is busy, so the server can be
   given a key that lets THIS test through that one limit (nothing else):
     1. npm run load:test -- --make-key      writes backend/.loadtest-key
     2. put its content in the host's settings as LOAD_TEST_KEY, redeploy
     3. run the test; afterwards REMOVE LOAD_TEST_KEY from the host again.
   Without the key the test still runs, and says so when the limit (not the
   server) is what stopped it.

   Options
     --url <address>       the backend (required), e.g. https://framex-api.onrender.com
     --steps 10,25,50,100  how many visitors at once, step by step
     --seconds 30          how long each step lasts
     --make-key            only create the key file, then stop
   ========================================================================== */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.join(here, "..", ".loadtest-key");
const args = process.argv.slice(2);
const option = (name, fallback = "") => {
  const at = args.indexOf("--" + name);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
};

if (args.includes("--make-key")) {
  if (fs.existsSync(KEY_FILE)) console.log(`The key file is already there: ${KEY_FILE}`);
  else {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(30).toString("base64url") + "\n", { mode: 0o600 });
    console.log(`Key written to ${KEY_FILE}`);
  }
  console.log("Open that file, copy its one line, and put it in the host's settings as LOAD_TEST_KEY (then redeploy).\nRemove LOAD_TEST_KEY from the host again when the test is done.");
  process.exit(0);
}

const base = option("url").replace(/\/+$/, "").replace(/\/api$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Say which backend to test:  npm run load:test -- --url https://framex-api.onrender.com");
  process.exit(1);
}
const steps = option("steps", "10,25,50,100").split(",").map((n) => Math.floor(Number(n))).filter((n) => n > 0 && n <= 1000);
const seconds = Math.min(300, Math.max(5, Number(option("seconds", "30")) || 30));
const key = (process.env.LOAD_TEST_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : "")).trim();

// What each kind of page asks the backend for (all at once, as a browser does).
const PAGES = [
  ["home", ["/config", "/catalog/shop-products", "/reviews/latest", "/artists?limit=4", "/shops?limit=3"]],
  ["shop", ["/config", "/catalog/shop-products", "/shops?limit=50"]],
  ["product", ["/config", "/catalog/shop-products", "/reviews?targetType=PRODUCT&targetId=p-005"]],
  ["gallery", ["/config", "/reviews/gallery"]],
  ["search", ["/config", "/search?q=frame"]]
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { Accept: "application/json", "X-FrameX-Client": "load-test", ...(key ? { "X-Load-Test": key } : {}) };

async function ask(pathname, into) {
  const started = performance.now();
  let kind = "failed";
  try {
    const response = await fetch(`${base}/api${pathname}`, { headers, signal: AbortSignal.timeout(30000) });
    await response.arrayBuffer();
    kind = response.status === 429 ? "limited" : response.status >= 500 ? "error" : "ok";
  } catch {
    kind = "failed"; // no answer within 30 seconds, or the connection dropped
  }
  const ms = performance.now() - started;
  into.requests.push(ms);
  into[kind] += 1;
  return ms;
}

async function visitor(until, into) {
  await sleep(Math.random() * 1500); // visitors don't all arrive in the same instant
  while (Date.now() < until && !into.stop) {
    const [, calls] = PAGES[Math.floor(Math.random() * PAGES.length)];
    const times = await Promise.all(calls.map((c) => ask(c, into)));
    into.pages.push(Math.max(...times)); // a page is ready when its slowest answer is in
    await sleep(2000 + Math.random() * 4000); // reading the page
  }
}

const at = (sorted, share) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0);
const secs = (ms) => (ms / 1000).toFixed(ms < 9950 ? 2 : 1) + " s";

console.log(`\nFrameX load test\nBackend: ${base}\nSteps: ${steps.join(", ")} visitors at once, ${seconds} seconds each\nLimit key: ${key ? "sent with every request (the server lets the test through only if its LOAD_TEST_KEY is the same)" : "none (the server's limit of 300 requests a minute for one address applies)"}\n`);

// Wake the server first: a free host that was asleep needs most of a minute for its first answer.
process.stdout.write("Waking the backend … ");
const wake = performance.now();
let awake = false;
for (let i = 0; i < 4 && !awake; i++) {
  try {
    awake = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(90000) })).ok;
  } catch {
    /* try again */
  }
}
if (!awake) {
  console.log("no answer. Is the address right?");
  process.exit(1);
}
console.log(`answered after ${secs(performance.now() - wake)}.\n`);

console.log("visitors  pages   requests/s   page ready (half | most | slowest)   answers ok   limited  errors  no answer   how it feels");
const results = [];
for (const count of steps) {
  const into = { requests: [], pages: [], ok: 0, limited: 0, error: 0, failed: 0, stop: false };
  const until = Date.now() + seconds * 1000;
  await Promise.all(Array.from({ length: count }, () => visitor(until, into)));
  const pages = into.pages.sort((a, b) => a - b);
  const total = into.requests.length || 1;
  const bad = into.error + into.failed;
  const most = at(pages, 0.95);
  const feel = into.limited / total > 0.05 ? "stopped by the request limit, not by the server" : bad / total > 0.05 ? "FAILING: answers are missing" : most < 1500 ? "fast" : most < 4000 ? "slower, still usable" : most < 10000 ? "slow" : "very slow";
  results.push({ count, most, feel, limited: into.limited / total, bad: bad / total });
  console.log(
    `${String(count).padStart(8)}  ${String(pages.length).padStart(5)}   ${(total / seconds).toFixed(1).padStart(10)}   ${`${secs(at(pages, 0.5))} | ${secs(most)} | ${secs(pages[pages.length - 1] || 0)}`.padEnd(36)}   ${((into.ok / total) * 100).toFixed(0).padStart(9)}%   ${String(into.limited).padStart(7)}  ${String(into.error).padStart(6)}  ${String(into.failed).padStart(9)}   ${feel}`
  );
  if (into.limited / total > 0.05) {
    console.log(`\nThe test was stopped by the backend's own limit (300 requests a minute from one address), not by a busy server.\n${key ? "The key in backend/.loadtest-key is not the server's LOAD_TEST_KEY (or the server was not redeployed after it was set)." : "To test further: npm run load:test -- --make-key, put the key in the host's settings as LOAD_TEST_KEY, redeploy, and run again."}`);
    break;
  }
  if (bad / total > 0.3 || most > 15000) {
    console.log("\nStopping here: the server is past what it can carry, and there is no point in pushing it further.");
    break;
  }
  await sleep(4000); // let the server breathe between steps
}

const fine = results.filter((r) => r.limited <= 0.05 && r.bad <= 0.05 && r.most < 4000).map((r) => r.count);
const firstSlow = results.find((r) => r.limited <= 0.05 && (r.bad > 0.05 || r.most >= 4000));
console.log(`\nSummary: ${fine.length ? `usable up to ${Math.max(...fine)} visitors at once in this test` : "no step was comfortably usable"}${firstSlow ? `; from ${firstSlow.count} visitors it was ${firstSlow.feel}` : results.some((r) => r.limited > 0.05) ? "; the request limit ended the test before the server slowed down" : "; it did not slow down within these steps"}.`);
console.log("These visitors only browse. Logging in, uploading photos and paying are heavier and were not part of this test.");
if (key) console.log("\nREMEMBER: remove LOAD_TEST_KEY from the host's settings now that the test is done.");
