# MILAN — Decentralized Social Space

> **Your Space. Your People.** — a privacy-first, decentralized social network where you own your data.

🌐 **Live:** [https://milanlife.in](https://milanlife.in)
📦 **Repository:** [github.com/Ignite-boy/milan-app](https://github.com/Ignite-boy/milan-app)

MILAN is a no-ads, no-tracking social platform built on decentralized identity. Every user gets
their own isolated data space backed by a Decentralized Web Node (DWN) and a Decentralized
Identifier (DID) — so posts, media, and connections stay under the owner's control instead of a
central database.

---

## Core idea

> **One User = One DID = One Isolated DWN Space**

On registration each user is provisioned a unique DID and a private storage root. Records and media
are written into that user's own isolated space. Another user can only read a record when the owner
explicitly makes it `public` or shares it with that user's DID.

Access modes for every post:

- **private** — visible only to the owner
- **public** — visible in the public feed
- **shared_did** — visible only to specific DIDs the owner grants

---

## Features

- **Decentralized identity** — DID + per-user isolated DWN storage (`@web5/dids`, `dwn-sdk-js`)
- **Social layer** — home / public / friends / my-posts feeds, DID-based friend requests,
  reactions, comments, notifications, saved posts, profile editing
- **Media posts** — image / video / audio / text with streaming uploads and reels-style playback
- **MILAN Music** — free music search + player (Audius + YouTube) with real **background audio**
  that keeps playing when the app is minimized or the screen is locked
- **Live updates** — instant notification push over Server-Sent Events (`/api/events`) and
  WebSocket (`/ws`), so the app refreshes without heavy polling
- **PWA** — installable app with a service worker, offline fallback, and a mobile-optimized UI
- **Fast, seamless login** — the home feed opens instantly from a warm cache, then refreshes in
  the background (no login-screen flash)
- **Gamification (V3)** — XP, levels, streaks, badges, and a leaderboard
  (`/api/v3/xp`, `/api/v3/streak`, `/api/v3/badges`, `/api/v3/leaderboard`)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (tested on v22) |
| Server | Express, `compression`, single-process (pm2 **fork** mode) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`, run in `worker_threads`) |
| Identity / storage | `@tbd54566975/dwn-sdk-js`, `@web5/dids`, `@web5/crypto` |
| Realtime | Server-Sent Events + WebSocket (`ws`) |
| Media | `ffmpeg-static`, `ffprobe-static`, `yt-dlp` (audio proxy) |
| Email | `nodemailer` |
| Frontend | Vanilla HTML/CSS/JS PWA (served statically by the backend) |

---

## Getting started

```bash
# 1. Clone
git clone https://github.com/Ignite-boy/milan-app.git
cd milan-app/backend

# 2. Install dependencies
npm install

# 3. Configure environment (see below), then start
npm start
```

Open **http://localhost:5000**

### Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in your values. Key settings:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | **Required in production** — long random string used to sign sessions |
| `YOUTUBE_API_KEY` | Optional — enables the YouTube Data API for music search (keyless fallbacks work without it) |
| `RESEND_API_KEY`, `MAIL_*` | Email delivery (verification, login alerts) |
| `ADMIN_TOKEN` | Guards admin endpoints |

> `.env`, user data (`backend/dwn/`, `backend/real-dwn-engine/`), and `node_modules/` are
> git-ignored and must never be committed.

### Audio streaming dependency

Background music streaming uses `yt-dlp` at `backend/bin/yt-dlp` (not tracked in git). On a fresh
clone, install it once:

```bash
mkdir -p backend/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o backend/bin/yt-dlp
chmod +x backend/bin/yt-dlp
```

---

## Project structure

```
milan-app/
├── backend/            Express server + APIs + data stores
│   ├── server.js       App entry (port 5000; serves frontend/ statically)
│   ├── routes/         auth, social, connections, music, profile, settings, …
│   ├── services/       livePush (SSE/WS), cryptoPool (worker bcrypt), DWN registry
│   ├── dwn/            Per-user isolated DWN spaces + JSON stores  (git-ignored)
│   └── real-dwn-engine/ Per-user real DWN nodes                    (git-ignored)
├── frontend/           PWA — app.html, music.html, service worker, assets
├── docs/               Design, SEO, and release documentation
├── scripts/            Release / deploy tooling
└── deploy.sh           Server-side deploy script
```

---

## Deployment

The production instance runs under **pm2 in fork mode** (single process):

```bash
cd backend
NODE_ENV=production pm2 start ecosystem.config.js
pm2 save
```

> ⚠️ **Never run pm2 cluster mode.** MILAN's JSON stores and the embedded LevelDB lock to a single
> process — multiple workers would corrupt data. To scale horizontally, move shared state to
> Redis/Postgres first.

The backend serves the frontend directly, so a frontend change is live immediately (no build step);
versioned assets use `?v=` cache-busters.

---

## API overview

Grouped under `/api`:

`auth` · `social` · `connections` · `requests` · `profile` · `settings` · `records` ·
`music` · `did` · `crypto` · `protocols` · `isolated-dwn` · `cloud-dwn` · `activity` ·
`security` · `admin` · `ai` · `backup` · `v3` (xp / streak / badges / leaderboard)

Realtime: `GET /api/events` (SSE) and `GET /ws?token=…` (WebSocket).

---

## License

See [LICENSE](LICENSE).
