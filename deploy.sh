#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MILAN auto-deploy script (runs on the VM).
# Triggered whenever ~/milan-app.zip changes. Extracts the new build, PRESERVES
# live data + secrets, installs deps, and restarts the pm2 process.
#
# SAFETY (why this script is careful):
#   • User data (backend/dwn, backend/real-dwn-engine), secrets (backend/.env),
#     and the yt-dlp binary (backend/bin) are GIT-IGNORED, so a fresh zip does
#     NOT contain them. They are carried over from the running install instead
#     of being destroyed — otherwise every deploy would wipe all users + break
#     auth + break music.
#   • The previous install is backed up (timestamped) before swap, so a bad
#     deploy can be rolled back.
#   • The app runs under pm2 (fork mode), NOT systemd — restart via pm2.
# ─────────────────────────────────────────────────────────────────────────────
set -u
U="np7218468_gmail_com"          # VM / app username
H="/home/$U"
APP="$H/milan-app"
ZIP="$H/milan-app.zip"
LOG="$H/deploy.log"
exec >> "$LOG" 2>&1

# Paths carried over from the live install into every new build (persistent state).
PRESERVE=( "backend/.env" "backend/dwn" "backend/real-dwn-engine" "backend/bin" "backend/RESOLVERCACHE" "backend/logs" )

echo "──────────────────────────────────────────"
echo "[$(date)] deploy triggered"
[ -f "$ZIP" ] || { echo "no zip at $ZIP — abort"; exit 0; }
sleep 5                          # let the upload finish writing

cd "$H" || { echo "cannot cd $H — abort"; exit 1; }

# 1) Extract the new build into a temp dir.
rm -rf _t; mkdir -p _t
if ! unzip -oq "$ZIP" -d _t; then echo "unzip failed (incomplete upload?) — abort"; rm -rf _t; exit 0; fi

# 2) Locate the app root inside the zip (the dir that contains backend/server.js).
SRC="$(dirname "$(dirname "$(find _t -path '*/backend/server.js' | head -1)")")"
[ -n "$SRC" ] && [ -d "$SRC/backend" ] || { echo "backend not found in zip — abort"; rm -rf _t; exit 0; }

# 3) Carry persistent data + secrets from the CURRENT install into the NEW build,
#    so they survive the swap. (Only if a current install exists.)
if [ -d "$APP" ]; then
  echo "[$(date)] preserving live data + secrets into new build…"
  for p in "${PRESERVE[@]}"; do
    if [ -e "$APP/$p" ]; then
      mkdir -p "$SRC/$(dirname "$p")"
      rm -rf "${SRC:?}/$p"
      cp -a "$APP/$p" "$SRC/$p" && echo "   • preserved $p"
    fi
  done
fi

# 4) Back up the current install (timestamped) for rollback, keep the last 3.
if [ -d "$APP" ]; then
  BK="$H/milan-app.bak-$(date +%Y%m%d-%H%M%S)"
  mv "$APP" "$BK" && echo "[$(date)] previous install backed up -> $BK"
  ls -dt "$H"/milan-app.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
fi

# 5) Swap in the new build.
mv "$SRC" "$APP"
rm -rf _t
chown -R "$U:$U" "$APP"

# 6) Install backend dependencies (abort restart if this fails, so we don't
#    restart a broken build).
echo "[$(date)] npm install…"
if ! sudo -u "$U" bash -lc "cd '$APP/backend' && npm install --no-fund --no-audit --loglevel=error"; then
  echo "[$(date)] ❌ npm install failed — restart skipped. Roll back with the newest milan-app.bak-* if needed."
  exit 1
fi

# 7) Restart the live app under pm2 (as the app user). Fall back to starting it
#    from ecosystem.config.js if the process is not registered yet.
echo "[$(date)] restarting pm2 process 'milan'…"
sudo -u "$U" bash -lc "cd '$APP/backend' && (pm2 restart milan --update-env || NODE_ENV=production pm2 start ecosystem.config.js) && pm2 save" \
  && echo "[$(date)] ✅ deploy done" \
  || echo "[$(date)] ⚠️ pm2 restart failed — check 'pm2 ls' / 'pm2 logs milan'"
