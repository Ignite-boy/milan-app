#!/usr/bin/env bash
# ============================================================
#  MILAN one-shot redeploy — hardened & self-healing (v2)
#  Run after uploading a new *.zip to your home folder.
#
#  Fixes it will handle automatically:
#   • Kills zombie node processes holding ports 5000/5001/5002
#   • Accepts a zip nested ANY number of levels deep (locates
#     backend/server.js and re-roots to a single ~/milan-app)
#   • Repairs an existing double-nested ~/milan-app/milan-app
#   • Preserves live data (.env, dwn/, real-dwn-engine, node_modules)
#   • Refuses to restart unless BOTH backend/package.json AND
#     frontend/index.html are present (no more ENOENT surprises)
# ============================================================
set -u
U="$HOME"; APP="$U/milan-app"; TMP="$U/_deploy_tmp"; PORT="${PORT:-5000}"
say(){ echo "[$(date '+%H:%M:%S')] $*"; }
die(){ say "❌ $*"; exit 1; }

# ── 0. Stop everything cleanly (frees the ports) ──────────────
say "🛑 stopping any running instances…"
pm2 delete milan >/dev/null 2>&1 || true
pkill -f "node .*server.js" 2>/dev/null || true
for p in 5000 5001 5002 "$PORT"; do
  pid="$(ss -ltnp 2>/dev/null | grep ":$p " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1)"
  [ -n "${pid:-}" ] && { say "  killing pid $pid on :$p"; kill -9 "$pid" 2>/dev/null || true; }
done
sleep 2

# ── 0b. Self-heal an already double-nested install ────────────
if [ -f "$APP/milan-app/backend/server.js" ] && [ ! -f "$APP/backend/server.js" ]; then
  say "🩹 detected double-nested ~/milan-app/milan-app — flattening"
  mv "$APP" "$U/_nested_tmp"
  mv "$U/_nested_tmp/milan-app" "$APP"
  rm -rf "$U/_nested_tmp"
fi

# ── 1. Locate newest zip ──────────────────────────────────────
ZIP="$(ls -t "$U"/*.zip 2>/dev/null | head -1)"
[ -n "$ZIP" ] || die "No .zip found in $U — upload the release zip first."
say "📦 using $ZIP"

rm -rf "$TMP"; mkdir -p "$TMP"
unzip -oq "$ZIP" -d "$TMP" || die "unzip failed (incomplete upload?)"

# ── 2. Re-root: find backend/server.js at ANY depth ───────────
SERVER_JS="$(find "$TMP" -path '*/backend/server.js' | head -1)"
[ -n "$SERVER_JS" ] || die "backend/server.js not found anywhere in the zip"
SRC="$(dirname "$(dirname "$SERVER_JS")")"     # the folder that CONTAINS backend/
[ -d "$SRC/backend" ] || die "resolved source has no backend/ — aborting"
[ -f "$SRC/frontend/index.html" ] || die "zip is missing frontend/index.html — aborting"
say "✅ app root in zip: $SRC"

# ── 3. Carry over live data from the current install ──────────
if [ -d "$APP" ]; then
  for k in backend/.env backend/dwn backend/real-dwn-engine backend/RESOLVERCACHE \
           backend/node_modules backend/data backend/logs; do
    if [ -e "$APP/$k" ]; then
      say "↻ preserving $k"
      rm -rf "${SRC:?}/$k"
      cp -a "$APP/$k" "$SRC/$k"
    fi
  done
fi

# ── 4. Atomic swap (single-nested guaranteed) ─────────────────
rm -rf "$U/milan-app.bak"
[ -d "$APP" ] && mv "$APP" "$U/milan-app.bak"
mv "$SRC" "$APP"
rm -rf "$TMP"
mkdir -p "$APP/backend/logs"

# ── 5. Verify layout BEFORE restarting ────────────────────────
[ -f "$APP/backend/package.json" ]  || die "package.json missing after swap"
[ -f "$APP/backend/server.js" ]     || die "server.js missing after swap"
[ -f "$APP/frontend/index.html" ]   || die "frontend/index.html missing after swap"
say "✅ layout verified: backend + frontend in place at $APP"

# ── 6. Install deps ───────────────────────────────────────────
say "📥 npm install…"
( cd "$APP/backend" && npm install --no-fund --no-audit --loglevel=error ) \
  || die "npm install failed"

# ── 7. Restart (systemd → pm2 → nohup) ────────────────────────
say "🔄 restarting…"
cd "$APP/backend" || die "cannot cd into backend"
if [ -d /run/systemd/system ] && systemctl list-unit-files 2>/dev/null | grep -q '^milan.service'; then
  sudo systemctl restart milan
else
  command -v pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null 2>&1
  if command -v pm2 >/dev/null 2>&1; then
    NODE_ENV=production pm2 start ecosystem.config.js 2>/dev/null || pm2 restart milan
    pm2 save >/dev/null 2>&1
  else
    NODE_ENV=production nohup node server.js > "$APP/backend/logs/app.log" 2>&1 &
  fi
fi

# ── 8. Health check ───────────────────────────────────────────
sleep 3
if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1 \
   || curl -fsS "http://localhost:$PORT/api/music/status" >/dev/null 2>&1; then
  say "✅ DONE — MILAN responding on :$PORT   (rollback copy: milan-app.bak)"
else
  say "⚠️  started but not answering on :$PORT yet — check:  pm2 logs milan  (or  tail $APP/backend/logs/app.log)"
fi
