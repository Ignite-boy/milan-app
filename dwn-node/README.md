# MILAN — Standalone Decentralized Web Node (DWN)

A real, persistent DWN storage service that speaks MILAN's DWN HTTP API and runs
**independently of the app** — so user data (records, media, database snapshots)
lives in its own node with its own disk, decoupled from app restarts/redeploys.

It uses the DIF/TBD reference engine (`@tbd54566975/dwn-sdk-js`) and is the
authoritative, durable home for each user's DWN space. The MILAN app's embedded
engine does the per-user cryptographic signing; this node is the durable store
the app pushes to and reads back from.

> The app already knows how to use this node — `backend/services/realDwnNodeClient.js`
> calls these exact routes. It stays on its safe fallback until you point it here.

---

## What it exposes (all under `Authorization: Bearer <DWN_NODE_API_KEY>`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET  | `/health`, `/api/dwn/node/status` | Liveness + real-DWN readiness (public) |
| POST | `/api/dwn/users/provision` | Provision a user's DWN space |
| PUT/GET | `/api/dwn/database/:name` | Database snapshots (users.json, …) |
| POST | `/api/dwn/records/write` | Store a DWN record |
| GET  | `/api/dwn/records/read/:spaceId/:recordId` | Read a record |
| PUT  | `/api/dwn/media/write/:spaceId/:recordId` | Upload media bytes |
| GET  | `/api/dwn/media/read/:spaceId/:recordId` | Stream media bytes |

Data is stored under `DWN_DATA_DIR` (default `/data`), which **must be a
persistent volume**.

---

## Deploy on GCP (automated)

### One-time VM prep (SSH into the VM)
```bash
# Docker (skip if already installed)
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker $USER      # then log out/in once so `docker` works without sudo

# Persistent data directory for the node
sudo mkdir -p /opt/milan-dwn-data && sudo chown $USER /opt/milan-dwn-data
```

### Add ONE GitHub secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- **`DWN_NODE_API_KEY`** = a long random string (e.g. `openssl rand -hex 24`).
  Keep it — you'll put the same value in the app's `.env` below.

(`VM_HOST`, `VM_USER`, `VM_SSH_KEY_B64` are already set from the app deploy.)

### Deploy
Push any change under `dwn-node/**`, or run the **“Deploy DWN Node”** workflow
manually (Actions tab → Run workflow). It builds the image and runs the
container bound to **`127.0.0.1:3100`** (localhost only — not exposed to the
internet), with `/opt/milan-dwn-data` as its persistent disk.

---

## Point MILAN at the node (final wiring)

On the VM, add to `backend/.env` (never commit it):
```
REAL_DWN_NODE_ENDPOINT=http://127.0.0.1:3100
REAL_DWN_NODE_API_KEY=<the same DWN_NODE_API_KEY you set as a secret>
```
Then restart the app:
```bash
pm2 restart milan --update-env
```

Verify from the app side:
```bash
curl -s http://127.0.0.1:3100/health
pm2 logs milan --lines 50   # look for real-DWN sync lines on register/login
```

> **Safe rollout:** MILAN falls back gracefully if the node is unreachable, so
> you can set the endpoint, watch the logs, and remove it again if anything looks
> off — registration/login never break on DWN issues.

---

## Local run (for testing)
```bash
cd dwn-node
npm install
DWN_NODE_API_KEY=dev-key DWN_DATA_DIR=./data npm start
curl -s http://localhost:3100/health
```

## Moving to a dedicated VM later
Run the same container on a separate GCP VM, then set
`REAL_DWN_NODE_ENDPOINT=http://<that-vm-private-ip>:3100` (keep it on the private
network, or front it with HTTPS via nginx + a subdomain like `dwn.milanlife.in`).
Everything else stays identical.
