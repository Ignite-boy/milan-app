#!/usr/bin/env node
/* =============================================================================
   MILAN — clean production release packager
   Cross-platform (Node 16+). Zero dependencies.

   Builds a `milan-release/` staging folder containing ONLY the files needed to
   run MILAN in production, then (best-effort) compresses it to
   `milan-release.zip` next to the project, ready to upload and deploy.

   It DELETES NOTHING from your working copy — it only copies the shippable
   subset into a fresh folder. Safe and reversible.

   Excluded (never shipped):
     • node_modules/            (reinstalled on the server)
     • backend/bin/             (yt-dlp binary — installed/preserved on server)
     • .env and any .env.* / *.env / *.pem / *.key  (secrets)
     • backend/dwn/, backend/real-dwn-engine/, RESOLVERCACHE/  (live user data)
     • *.log, logs/, *.bak, *-snapshot*.json  (runtime / backups)
     • *.zip / *.tar.gz, .git/, OS & editor cruft

   Usage:
     node scripts/package-release.mjs
     node scripts/package-release.mjs --include-docs   (keep the docs/ *.md)
   ============================================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// The script lives at <app>/scripts/ — resolve the real app root from there.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT   = path.resolve(SCRIPT_DIR, "..");        // e.g. ~/milan-app
const APP_NAME   = path.basename(APP_ROOT);              // "milan-app"
const PARENT     = path.resolve(APP_ROOT, "..");         // OUTSIDE the tree we copy

// Output lives OUTSIDE the app folder so the staging copy can never include
// itself. The zip lands next to the project, ready to upload.
const OUT_DIR = path.join(PARENT, "milan-release");
const STAGE   = path.join(OUT_DIR, APP_NAME);            // milan-release/milan-app
const ZIP     = path.join(PARENT, "milan-release.zip");
const TGZ     = path.join(PARENT, "milan-release.tar.gz");

const KEEP_DOCS = process.argv.includes("--include-docs");

// Directory names skipped anywhere in the tree.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dwn", "real-dwn-engine", "RESOLVERCACHE",
  "bin", "logs", "data", "uploads", "_deploy_tmp", ".cache", "dist",
  "milan-release",
]);

// Dev/audit docs excluded unless --include-docs.
const DEV_DOCS = new Set([
  "AUDIT_REPORT.md", "AUTO_DEPLOY.md", "MAIL_SETUP.md", "MILAN_V7_UPDATE_NOTES.md",
  "PERFORMANCE.md", "PERF_SEO_ADVANCED.md", "REAL_DWN_IMPLEMENTATION.md",
  "SEO_IMPLEMENTATION.md", "SEO_STRATEGY.md", "SETTINGS_GUIDE.md", "FEED_UI_PROMPT.md",
]);

// Single source of truth for "this file is a secret" — used by BOTH the copy
// filter and the post-build leak scan, so the two can never disagree.
function isSecretFile(name) {
  if (name === ".env.example" || name === ".env.local.example") return false;
  if (name === ".env" || name.startsWith(".env.")) return true;   // .env, .env.local, .env.prod…
  if (name.endsWith(".env")) return true;                         // prod.env
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;            // certificates / private keys
  return false;
}

function skipFile(name) {
  if (isSecretFile(name)) return true;
  if (/\.log$/i.test(name)) return true;
  if (/\.(bak|orig|tmp|swp)$/i.test(name)) return true;
  if (/-snapshot.*\.json$/i.test(name)) return true;
  if (/\.(zip|tar|gz|tgz)$/i.test(name)) return true;
  if (/~$/.test(name)) return true;
  if (name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini") return true;
  if (!KEEP_DOCS && DEV_DOCS.has(name)) return true;
  return false;
}

let copied = 0, bytes = 0, skipped = 0;

function walk(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    // Defensive: never descend into the output/zip even if it lands in-tree.
    if (src === OUT_DIR || src === ZIP || src === TGZ) { skipped++; continue; }
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
    // symlinks and other types are intentionally ignored
  }
}

function human(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

/* ── run ──────────────────────────────────────────────────────────────────── */
console.log("MILAN release packager\n----------------------");

if (!fs.existsSync(path.join(APP_ROOT, "backend", "server.js"))) {
  console.error(`❌ ${APP_ROOT} does not look like the MILAN app (backend/server.js missing).`);
  process.exit(1);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
fs.rmSync(TGZ, { force: true });

walk(APP_ROOT, STAGE);

// Guarantee a backend/.env.example exists in the package (template only).
const envExample = path.join(STAGE, "backend", ".env.example");
if (!fs.existsSync(envExample)) {
  fs.mkdirSync(path.dirname(envExample), { recursive: true });
  fs.writeFileSync(envExample,
    "# Copy to .env and fill in. NEVER commit the real .env.\n" +
    "PORT=5000\n" +
    "NODE_ENV=production\n" +
    "JWT_SECRET=\n" +
    "ADMIN_TOKEN=\n" +
    "YOUTUBE_API_KEY=\n" +
    "RESEND_API_KEY=\n" +
    "MAIL_FROM=\n" +
    "MAIL_FROM_ADDRESS=\n" +
    "PUBLIC_BASE_URL=https://www.milanlife.in\n");
  console.log("+  wrote a starter backend/.env.example");
}

// Safety scan: make sure no real secret leaked into the package.
let leaks = 0;
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    if (isSecretFile(e.name)) { leaks++; console.error("LEAK:", p); }
  }
})(OUT_DIR);

console.log(`\nCopied : ${copied} files (${human(bytes)})`);
console.log(`Skipped: ${skipped} dirs/files (node_modules, bin, secrets, logs, user data)`);
console.log(`Staged : ${STAGE}`);

if (leaks) {
  console.error(`\n❌ ${leaks} secret file(s) leaked into the package — aborting before archiving.`);
  process.exit(1);
}

// Compress (best-effort): prefer real `zip`; else fall back to a real `.tar.gz`.
let archive = null;
if (spawnSync("zip", ["-rq", ZIP, APP_NAME], { cwd: OUT_DIR }).status === 0 && fs.existsSync(ZIP)) {
  archive = ZIP;
} else if (spawnSync("tar", ["-czf", TGZ, APP_NAME], { cwd: OUT_DIR }).status === 0 && fs.existsSync(TGZ)) {
  archive = TGZ;
}

if (archive) {
  console.log(`\n✅ Wrote ${path.basename(archive)} (${human(fs.statSync(archive).size)})`);
  console.log(`\nNext: upload ${path.basename(archive)} to your server and run scripts/redeploy.sh`);
} else {
  console.log(`\nℹ️  No zip/tar available — compress the '${STAGE}' folder manually.`);
}
