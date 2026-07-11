<div align="center">

# MILAN

### Your Space. Your People.

**A privacy-first, decentralized social network where you own your data.**

[![Live](https://img.shields.io/badge/Live-milanlife.in-4f46e5?style=flat-square)](https://www.milanlife.in)
[![Platform](https://img.shields.io/badge/PWA-installable-10b981?style=flat-square)](https://www.milanlife.in)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-339933?style=flat-square)](https://nodejs.org)

🌐 **[https://www.milanlife.in](https://www.milanlife.in)** &nbsp;·&nbsp; 📦 **[github.com/Ignite-boy/milan-app](https://github.com/Ignite-boy/milan-app)**

</div>

---

## Overview

MILAN is a no-ads, no-tracking social platform built on decentralized identity. Instead of storing
everyone's data in one central database, MILAN gives each user their own isolated data space backed
by a **Decentralized Web Node (DWN)** and a **Decentralized Identifier (DID)**. Posts, media, and
connections stay under the owner's control — shared only when, and with whom, the owner chooses.

The app is a Progressive Web App (PWA): it installs to the home screen, works offline for its shell,
and delivers a native-like experience on mobile and desktop.

## The MILAN model

> **One User = One DID = One Isolated DWN Space**

Every account is provisioned a unique DID and a private storage root at registration. Records and
media are written only into that user's own space. Another user can read a record **only** when the
owner makes it public or explicitly grants access to their DID.

Each post carries one of three access modes:

| Mode | Who can see it |
|------|----------------|
| **private** | Only the owner |
| **public** | Everyone, via the public feed |
| **shared_did** | Only the specific DIDs the owner grants |

## Features

- **Decentralized identity & storage** — per-user isolated DWN, DID-based accounts
- **Social layer** — home / public / friends / my-posts feeds, DID-based friend requests,
  reactions, comments, notifications, saved posts, and profile editing
- **Rich media** — image, video, audio, and text posts with streaming uploads and reels-style playback
- **MILAN Music** — free song search and playback (Audius + YouTube) with true **background audio**
  that keeps playing when the app is minimized or the screen is locked
- **Realtime** — instant notification push over Server-Sent Events and WebSockets (no heavy polling)
- **Seamless, fast open** — the home feed paints instantly from a warm cache, then refreshes in the
  background; no login-screen flash
- **Engagement system** — XP, levels, streaks, badges, and a leaderboard

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 |
| Server | Express · `compression` · single-process (pm2 **fork** mode) |
| Authentication | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`, offloaded to `worker_threads`) |
| Identity & storage | `@tbd54566975/dwn-sdk-js` · `@web5/dids` · `@web5/crypto` |
| Realtime | Server-Sent Events + WebSocket (`ws`) |
| Media | `ffmpeg-static` · `ffprobe-static` · `yt-dlp` (audio stream proxy) |
| Email | `nodemailer` |
| Frontend | Vanilla HTML / CSS / JS Progressive Web App, served by the backend |

## Getting started

```bash
# 1. Clone
git clone https://github.com/Ignite-boy/milan-app.git
cd milan-app/backend

# 2. Install dependencies
npm install

# 3. Configure environment (see below), then start the server
npm start
```

The backend serves both the API and the web app on port `5000`. In production, MILAN is served at
**[https://www.milanlife.in](https://www.milanlife.in)** behind a reverse proxy.

### Environment variables

Copy `backend/.env.example` to `backend/.env` and set your values:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | **Required in production** — long random string that signs sessions |
| `YOUTUBE_API_KEY` | Optional — YouTube Data API for music search (keyless fallbacks work without it) |
| `RESEND_API_KEY`, `MAIL_*` | Email delivery (verification, login alerts) |
| `ADMIN_TOKEN` | Protects admin endpoints |

> `.env`, user data (`backend/dwn/`, `backend/real-dwn-engine/`), and `node_modules/` are
> git-ignored and must never be committed.

### Audio streaming dependency

Background music uses `yt-dlp` at `backend/bin/yt-dlp` (not tracked in git). On a fresh clone,
install it once:

```bash
mkdir -p backend/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o backend/bin/yt-dlp
chmod +x backend/bin/yt-dlp
```

## Project structure

```
milan-app/
├── backend/              Express server, APIs, and data stores
│   ├── server.js         App entry — serves the API + frontend/ (port 5000)
│   ├── routes/           auth, social, connections, music, profile, settings, …
│   ├── services/         livePush (SSE/WS), cryptoPool (worker bcrypt), DWN registry
│   ├── dwn/              Per-user isolated DWN spaces + JSON stores   (git-ignored)
│   └── real-dwn-engine/  Per-user real DWN nodes                      (git-ignored)
├── frontend/             PWA — app.html, music.html, service worker, assets
├── docs/                 Design, SEO, and release documentation
├── scripts/              Release / deploy tooling
└── deploy.sh             Server-side deploy script
```

## Deployment

Production runs under **pm2 in fork mode** (single process):

```bash
cd backend
NODE_ENV=production pm2 start ecosystem.config.js
pm2 save
```

> ⚠️ **Never use pm2 cluster mode.** MILAN's JSON stores and embedded LevelDB lock to a single
> process — multiple workers would corrupt data. To scale horizontally, migrate shared state to
> Redis / Postgres first.

The backend serves the frontend directly, so frontend changes go live immediately (no build step);
versioned assets use `?v=` cache-busters for safe cache invalidation.

## API overview

All endpoints are grouped under `/api`:

`auth` · `social` · `connections` · `requests` · `profile` · `settings` · `records` ·
`music` · `did` · `crypto` · `protocols` · `isolated-dwn` · `cloud-dwn` · `activity` ·
`security` · `admin` · `ai` · `backup` · `v3` (xp / streak / badges / leaderboard)

**Realtime:** Server-Sent Events at `/api/events` and WebSocket at `/ws?token=…`.

## License

Copyright © 2025–2026 **Nitesh Pandey** — MILAN ([milanlife.in](https://www.milanlife.in)).
See [LICENSE](LICENSE) for details.

---

<div align="center">
Built with privacy first. &nbsp;·&nbsp; <a href="https://www.milanlife.in">milanlife.in</a>
</div>
