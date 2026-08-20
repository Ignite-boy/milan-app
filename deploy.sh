#!/usr/bin/env bash
# MILAN auto-deploy script (runs on the VM).
# Triggered automatically by a systemd path-watcher whenever ~/milan-app.zip changes.
# Extracts the new zip, installs deps as the app user, and restarts the systemd service.
set -u
U="np7218468_gmail_com"          # <-- VM username (change if different)
H="/home/$U"
ZIP="$H/milan-app.zip"
LOG="$H/deploy.log"
exec >> "$LOG" 2>&1

echo "──────────────────────────────────────────"
echo "[$(date)] deploy triggered"
[ -f "$ZIP" ] || { echo "no zip at $ZIP — abort"; exit 0; }
sleep 5                          # let the upload finish writing

cd "$H" || exit 1
rm -rf _t; mkdir -p _t
if ! unzip -oq "$ZIP" -d _t; then echo "unzip failed (incomplete upload?) — abort"; rm -rf _t; exit 0; fi

SRC="$(dirname "$(dirname "$(find _t -path '*/backend/server.js' | head -1)")")"
[ -n "$SRC" ] && [ -d "$SRC/backend" ] || { echo "backend not found in zip — abort"; rm -rf _t; exit 0; }

rm -rf milan-app
mv "$SRC" milan-app
rm -rf _t
chown -R "$U:$U" "$H/milan-app"

echo "[$(date)] npm install…"
sudo -u "$U" bash -lc "cd '$H/milan-app/backend' && npm install --no-fund --no-audit --loglevel=error"

echo "[$(date)] restarting milan.service…"
systemctl restart milan
echo "[$(date)] ✅ deploy done"
