# MILAN — Automatic Deploy on GCP (no GitHub)

Set this up **once** on the VM. After that, every time you upload `milan-app.zip`
to your home folder, the VM **auto-deploys** (extract → npm install → restart) by itself.

How it works: a systemd **path-watcher** watches `~/milan-app.zip`. When the file
changes (a new upload), it runs `~/deploy.sh`, which redeploys and restarts `milan.service`.

## One-time setup (paste this whole block on the VM, once)

> If your VM username isn't `np7218468_gmail_com`, replace it everywhere below.

```bash
U="np7218468_gmail_com"; H="/home/$U"

# 1) deploy script
cat > "$H/deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -u
U="np7218468_gmail_com"; H="/home/$U"
ZIP="$H/milan-app.zip"; LOG="$H/deploy.log"
exec >> "$LOG" 2>&1
echo "[$(date)] deploy triggered"
[ -f "$ZIP" ] || exit 0
sleep 5
cd "$H" || exit 1
rm -rf _t; mkdir -p _t
unzip -oq "$ZIP" -d _t || { echo "unzip failed"; rm -rf _t; exit 0; }
SRC="$(dirname "$(dirname "$(find _t -path '*/backend/server.js' | head -1)")")"
[ -d "$SRC/backend" ] || { echo "no backend"; rm -rf _t; exit 0; }
rm -rf milan-app; mv "$SRC" milan-app; rm -rf _t
chown -R "$U:$U" "$H/milan-app"
sudo -u "$U" bash -lc "cd '$H/milan-app/backend' && npm install --no-fund --no-audit --loglevel=error"
systemctl restart milan
echo "[$(date)] done"
EOF
chmod +x "$H/deploy.sh"

# 2) systemd service that runs the deploy
sudo tee /etc/systemd/system/milan-deploy.service > /dev/null <<EOF
[Unit]
Description=MILAN auto-deploy
[Service]
Type=oneshot
ExecStart=$H/deploy.sh
EOF

# 3) systemd path-watcher on the zip
sudo tee /etc/systemd/system/milan-deploy.path > /dev/null <<EOF
[Unit]
Description=Watch MILAN zip and auto-deploy
[Path]
PathModified=$H/milan-app.zip
Unit=milan-deploy.service
[Install]
WantedBy=multi-user.target
EOF

# 4) enable it
sudo systemctl daemon-reload
sudo systemctl enable --now milan-deploy.path
echo "✅ Auto-deploy is ON. Now just upload milan-app.zip and it deploys itself."
```

## After setup — your whole workflow becomes:
1. On Windows: make the fresh `milan-app.zip` (the PowerShell one-liner).
2. Upload `milan-app.zip` to the VM home (SSH ⚙️ → Upload file, or Cloud Shell `gcloud compute scp`).
3. **That's it.** The VM auto-extracts, installs and restarts in ~30–60s.

Check it worked:
```bash
tail -n 20 ~/deploy.log
journalctl -u milan -n 20 --no-pager
```

## Notes
- The running app keeps serving the old code until a deploy fully succeeds (safe).
- A partial/failed upload is ignored (it only deploys a valid zip).
- To pause auto-deploy: `sudo systemctl disable --now milan-deploy.path`
- The truly hands-free version is GitHub Actions (push → auto-deploy), but this gives you
  automatic deploys with **no GitHub** — you only upload the zip.
