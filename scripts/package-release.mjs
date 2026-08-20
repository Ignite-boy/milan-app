#!/usr/bin/env node
/* ============================================================
   MILAN — clean production release packager
   Cross-platform (Node 16+). No dependencies.

   Builds a `milan-release/` staging folder containing ONLY the
   files needed to run MILAN in production, then (best-effort)
   compresses it to `milan-release.zip`.

   It DELETES NOTHING from your working copy — it only copies the
   shippable subset into a fresh folder. Safe and reversible.

   What it EXCLUDES (never shipped):
     • node_modules/            (reinstalled on the server)
     • .env  + any *.env        (secrets — ship .env.example only)
     • *.log, backend/logs/     (runtime logs)
     • backend/real-dwn-engine/ (REAL user DWN data)
     • backend/RESOLVERCACHE/   (runtime cache)
     • backend/dwn/             (live user database)
     • *.bak, *.last-good.bak   (database backups = user data)
     • *.zip, _deploy_tmp/, *.bak/ (build artifacts)
     • .git/, OS/editor cruft

   Usage:
     node package-release.mjs
     node package-release.mjs --include-docs   (keep the *.md docs)
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, "milan-release");
const ZIP = path.join(ROOT, "milan-release.zip");
const KEEP_DOCS = process.argv.includes("--include-docs");

/* Only this app is shipped (milan-web5 is a separate project). */
const SHIP_ROOTS = ["milan-app"];

/* Directory names skipped anywhere in the tree. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "real-dwn-engine", "RESOLVERCACHE", "dwn",
  "logs", "data", "_deploy_tmp", "milan-app.bak", ".cache", "dist",
]);

/* Dev/audit docs excluded unless --include-docs. */
const DEV_DOCS = new Set([
  "AUDIT_REPORT.md", "AUTO_DEPLOY.md", "MAIL_SETUP.md", "MILAN_V7_UPDATE_NOTES.md",
  "PERFORMANCE.md", "PERF_SEO_ADVANCED.md", "REAL_DWN_IMPLEMENTATION.md",
  "SEO_IMPLEMENTATION.md", "SEO_STRATEGY.md", "SETTINGS_GUIDE.md", "FEED_UI_PROMPT.md",
]);

function skipFile(name) {
  if (name === ".env" || name.endsWith(".env")) {
    return name !== ".env.example"; // keep the example, drop real envs
  }
  if (/\.log$/i.test(name)) return true;
  if (/\.(bak|seobak|orig|tmp)$/i.test(name)) return true;
  if (/\.last-good\.bak$/i.test(name)) return true;
  if (/~$/.test(name)) return true;
  if (/-snapshot.*\.json$/i.test(name)) return true;
  if (/\.zip$/i.test(name)) return true;
  if (name === ".DS_Store" || name === "Thumbs.db") return true;
  if (!KEEP_DOCS && DEV_DOCS.has(name)) return true;
  return false;
}

let copied = 0, bytes = 0, skipped = 0;

function walk(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) { skipped++; continue; }
      walk(src, dest);
    } else if (entry.isFile()) {
      if (skipFile(entry.name)) { skipped++; continue; }
      fs.copyFileSync(src, dest);
      copied++;
      bytes += fs.statSync(src).size;
    }
  }
}

function human(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

/* ── run ─────────────────────────────────────────────────── */
console.log("MILAN release packager\n----------------------");
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });

for (const r of SHIP_ROOTS) {
  const src = path.join(ROOT, r);
  if (!fs.existsSync(src)) { console.warn(`!  ${r} not found, skipping`); continue; }
  walk(src, path.join(OUT_DIR, r));
}

/* Guarantee an .env.example exists in the package. */
const envExample = path.join(OUT_DIR, "milan-app", "backend", ".env.example");
if (!fs.existsSync(envExample)) {
  fs.mkdirSync(path.dirname(envExample), { recursive: true });
  fs.writeFileSync(envExample,
    "# Copy to .env and fill in. NEVER commit the real .env.\n" +
    "PORT=5000\nRESEND_API_KEY=\nMAIL_FROM=\nMAIL_FROM_ADDRESS=\n" +
    "PUBLIC_BASE_URL=\nJWT_SECRET=\nMILAN_RAZORPAY_KEY_ID=\nRAZORPAY_KEY_SECRET=\n");
  console.log("+  wrote a starter backend/.env.example");
}

/* Safety scan: make sure no real secrets leaked into the package. */
let leaks = 0;
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name === ".env" && e.name !== ".env.example") { leaks++; console.error("LEAK:", p); }
  }
})(OUT_DIR);

console.log(`\nCopied : ${copied} files (${human(bytes)})`);
console.log(`Skipped: ${skipped} dirs/files (node_modules, secrets, logs, user data)`);
console.log(`Staged : ${OUT_DIR}`);
if (leaks) { console.error(`\n❌ ${leaks} .env file(s) leaked into the package — aborting zip.`); process.exit(1); }

/* Best-effort compression: prefer `zip`, fall back to `tar` (zip format). */
let zipped = false;
const tryZip = spawnSync("zip", ["-rq", ZIP, "milan-release"], { cwd: ROOT });
if (tryZip.status === 0) zipped = true;
if (!zipped) {
  const tryTar = spawnSync("tar", ["-a", "-c", "-f", ZIP, "milan-release"], { cwd: ROOT });
  if (tryTar.status === 0) zipped = true;
}

if (zipped && fs.existsSync(ZIP)) {
  console.log(`\n✅ Wrote ${path.basename(ZIP)} (${human(fs.statSync(ZIP).size)})`);
} else {
  console.log(`\nℹ️  Couldn't auto-zip (no zip/tar). Just zip the 'milan-release' folder manually.`);
}
console.log("\nNext: upload the zip to your server and run redeploy.sh");
