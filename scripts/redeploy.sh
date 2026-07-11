#!/usr/bin/env bash
# =============================================================================
#  MILAN — one-shot redeploy (hardened & self-healing)
# =============================================================================
#  Run after uploading a new release *.zip to your home folder.
#
#  What it handles automatically:
#    • Stops any running instance and frees ports 5000/5001/5002
#    • Accepts a zip nested at ANY depth (locates backend/server.js, re-roots
#      to a single ~/milan-app) and repairs a double-nested install
#    • PRESERVES live state across deploys: .env, user data (dwn,
#      real-dwn-engine), RESOLVERCACHE, the yt-dlp binary (bin), node_modules
#    • Refuses to restart unless backend + frontend are both present
#    • Restarts under pm2 (the production process manager), with a nohup
#      fallback, then health-checks the app
#    • Keeps timestamped backups (last 3) for rollback
# =============================================================================
set -uo pipefail

U="$HOME"
APP="$U/milan-app"
TMP="$U/_deploy_tmp"
PORT="${PORT:-5000}"

# Live state carried from the current install into every new build. These are
# git-ignored (not in the zip), so they MUST be preserved or each deploy would
# wipe all users, secrets, and break music streaming.
PRESERVE=(
  backend/.env
  backend/dwn
  backend/real-dwn-engine
  backend/RESOLVERCACHE
  backend/bin
  backend/node_modules
  backend/data
  backend/logs
)

say()  { echo "[$(date '+%H:%M:%S')] $*"; }
die()  { say "❌ $*"; exit 1; }

# ── 1. Stop everything cleanly (frees the ports) ─────────────────────────────
say "🛑 stopping any running instance…"
pm2 delete milan >/dev/null 2>&1 || true
pkill -f "node .*server.js" 2>/dev/null || true
for p in 5000 5001 5002 "$PORT"; do
  pid="$(ss -ltnp 2>/dev/null | grep ":$p " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1)"
  [ -n "${pid:-}" ] && { say "  killing pid $pid on :$p"; kill -9 "$pid" 2>/dev/null || true; }
done
sleep 2

# ── 2. Self-heal an already double-nested install ────────────────────────────
if [ -f "$APP/milan-app/backend/server.js" ] && [ ! -f "$APP/backend/server.js" ]; then
  say "🩹 flattening double-nested ~/milan-app/milan-app"
  mv "$APP" "$U/_nested_tmp"
  mv "$U/_nested_tmp/milan-app" "$APP"
  rm -rf "$U/_nested_tmp"
fi

# ── 3. Locate the newest uploaded zip ────────────────────────────────────────
ZIP="$(ls -t "$U"/*.zip 2>/dev/null | head -1)"
[ -n "$ZIP" ] || die "No .zip found in $U — upload the release zip first."
say "📦 using $ZIP"

rm -rf "$TMP"; mkdir -p "$TMP"
unzip -oq "$ZIP" -d "$TMP" || die "unzip failed (incomplete upload?)"

# ── 4. Re-root: find backend/server.js at ANY depth ──────────────────────────
SERVER_JS="$(find "$TMP" -path '*/backend/server.js' | head -1)"
[ -n "$SERVER_JS" ] || die "backend/server.js not found anywhere in the zip"
SRC="$(dirname "$(dirname "$SERVER_JS")")"            # folder that contains backend/
[ -d "$SRC/backend" ]            || die "resolved source has no backend/ — aborting"
[ -f "$SRC/frontend/index.html" ] || die "zip is missing frontend/index.html — aborting"
say "✅ app root in zip: $SRC"

# ── 5. Carry over live state from the current install ────────────────────────
if [ -d "$APP" ]; then
  for k in "${PRESERVE[@]}"; do
    if [ -e "$APP/$k" ]; then
      say "↻ preserving $k"
      mkdir -p "$SRC/$(dirname "$k")"
      rm -rf "${SRC:?}/$k"
      cp -a "$APP/$k" "$SRC/$k"
    fi
  done
fi

# ── 6. Atomic swap, with a timestamped backup (keep last 3) ──────────────────
if [ -d "$APP" ]; then
  BK="$U/milan-app.bak-$(date +%Y%m%d-%H%M%S)"
  mv "$APP" "$BK" && say "🗄  previous install backed up → $BK"
  ls -dt "$U"/milan-app.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
fi
mv "$SRC" "$APP"
rm -rf "$TMP"
mkdir -p "$APP/backend/logs"

# ── 7. Verify layout BEFORE restarting ───────────────────────────────────────
[ -f "$APP/backend/package.json" ] || die "package.json missing after swap"
[ -f "$APP/backend/server.js" ]    || die "server.js missing after swap"
[ -f "$APP/frontend/index.html" ]  || die "frontend/index.html missing after swap"
say "✅ layout verified: backend + frontend in place"

# ── 8. Install dependencies (abort on failure — never restart a broken build) ─
say "📥 npm install…"
( cd "$APP/backend" && npm install --no-fund --no-audit --loglevel=error ) \
  || die "npm install failed — previous build preserved in the newest backup"

# ── 9. Restart under pm2 (production process manager) ────────────────────────
say "🔄 restarting…"
cd "$APP/backend" || die "cannot cd into backend"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null 2>&1 || true
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart milan --update-env 2>/dev/null \
    || NODE_ENV=production pm2 start ecosystem.config.js
  pm2 save >/dev/null 2>&1 || true
else
  say "⚠️  pm2 unavailable — falling back to nohup"
  NODE_ENV=production nohup node server.js > "$APP/backend/logs/app.log" 2>&1 &
fi

# ── 10. Health check ─────────────────────────────────────────────────────────
sleep 3
if curl -fsS "http://localhost:$PORT/"                >/dev/null 2>&1 \
   || curl -fsS "http://localhost:$PORT/api/music/status" >/dev/null 2>&1; then
  say "✅ DONE — MILAN is responding on :$PORT"
else
  say "⚠️  started but not answering on :$PORT yet — check:  pm2 logs milan"
  say "    (or:  tail -f $APP/backend/logs/app.log)"
fi
