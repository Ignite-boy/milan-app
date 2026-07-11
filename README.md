# MILAN App — V3 Engagement Engine

> **MILAN V3 — 500 Techniques Upgrade** | Your Space. Your People.

## 🚀 What's New in V3 (500 Techniques Engagement System)

### ✦ Avatar Jaadu (Techniques #1–100)
- **Story-ring gradient border** around all profile avatars (rotating MILAN-gradient conic animation)
- **Breathing neon border** on every avatar (pulse animation with brand colors)
- **3D hover rotation** on profile pictures (CSS perspective transform on hover)
- **Bouncy pop animation** on avatar upload/tap (spring physics keyframe)
- **Mini confetti burst** on avatar long-press or tap (canvas particle system anchored to element)
- **Neon drop-shadow glow** on chat thumbnail avatars
- **Glassmorphism hover-card** on all profile cards

### ✦ UI/UX Jaadu (Techniques #101–200)
- **MILAN gradient** applied to empty states, CTA buttons, bottom nav active states
- **Lottie-style logo animation** on brand logo (glow pulse)
- **Dynamic dark mode neon accents** (text-shadow glow on headings in dark mode)
- **120Hz smooth transitions** on all cards, posts, people rows
- **Time-of-day background gradient** (dawn/morning/day/evening/night ambients)
- **MILAN gradient bottom nav** active indicator

### ✦ Gamification & Retention (Techniques #201–300)
- **RPG Level Badge** (Lv.1–∞) shown in sidebar with level-up animation
- **XP Bar** with animated MILAN gradient fill (200 XP per level)
- **Daily Login Streak Calendar** (7-day grid, fire indicator for active days)
- **Badge Wall** (8 badges: Hot Streak, Diamond, Explorer, Connected, Creator, Champion + locked)
- **Mystery Reward Popup** (animated reveal modal with confetti on claim)
- **Streak milestones** (confetti + reward at 3, 7, 14, 30, 60, 100 days)
- **Milestone detection** at 10, 50, 100, 500, 1000, 5000 connections
- **"You're on a roll!"** ambient encouragement toast every 5 actions
- **Exclusive Avatar Frames** (gold conic, diamond rainbow CSS frames)
- **Animated Leaderboard** rows with rank styling (🥇🥈🥉)

### ✦ Advanced AI & Personalization (Techniques #301–400)
- **AI Chips** on composer: Smart Caption, Style Filter, Best Time to Post, Auto-Translate, Target Audience
- **Typing indicator** component (`milanShowTyping()`) for comments/chat

### ✦ Frontend & Backend Architecture (Techniques #401–500)
- **Live indicator badge** in feed header (WebSocket-style green dot)
- **V3 Backend XP routes**: `GET /api/v3/xp/:userId`, `POST /api/v3/xp/:userId/award`
- **V3 Streak routes**: `POST /api/v3/streak/:userId` (tracks streak server-side)
- **V3 Badge routes**: `GET /api/v3/badges/:userId`
- **V3 Leaderboard**: `GET /api/v3/leaderboard` (top 10 by XP)
- **Haptic feedback** on all primary button interactions (`navigator.vibrate`)

---

# MILAN App - One User, One Isolated DWN

This build implements the required MILAN architecture:

> One User = One DID = One Isolated DWN Space

Every user gets a separate DWN endpoint identity and a separate storage root under `backend/dwn-data/isolated-users/`. User records and media are written into that user's own isolated storage directory. Other users can only read records when the owner explicitly shares the record with their DID.

## What is included

- MILAN web app and backend.
- Per-user isolated DWN provisioning on registration/login.
- DID-based user identity.
- Owner-only default storage policy.
- `private`, `public`, and `shared_did` access modes.
- Explicit DID sharing and access request approval.
- Reels-style media viewing and streaming uploads.
- Docker local DID-DHT gateway files included in the complete stack.
- DWN CLI installer included and patched to use local DID-DHT gateway.

## Run MILAN App

```cmd
cd milan-app\backend
npm install
npm start
```

Open:

```txt
http://localhost:5000
```

## Per-user isolated DWN model

For every registered user, the backend creates:

```txt
backend/dwn-data/isolated-users/<spaceId>/manifest.json
backend/dwn-data/isolated-users/<spaceId>/records/
backend/dwn-data/isolated-users/<spaceId>/media/
backend/dwn-data/isolated-users/<spaceId>/audit/
```

The DID document exposes the user's own DWN service endpoint.

## Start local DID-DHT Gateway

From the complete stack root:

```cmd
start-did-dht-gateway.bat
```

Keep the gateway window open while creating `did:dht` identifiers.

## Create DID through DWN CLI

```cmd
cd dwn-cli-installer\dwn-cli-sample
node .\bin\run.js create-did --password "YourStrongPasswordHere"
```

## Stop Docker after work

```cmd
stop-docker-after-work.bat
```

## Production notes

For production, move isolated DWN spaces from local folders into managed isolated containers/VPS instances per user or per tenant. The app is now structured around the isolation model, so the storage backend can be upgraded without changing the frontend permission logic.


## MILAN Social Boom Upgrade

This build adds a Milan-style social layer while keeping the original privacy promise:

- Home feed, public feed, friends feed, and my posts.
- People discovery and DID-based friend requests.
- Reactions, comments, notifications, and profile editing.
- Image/video/text posts with privacy modes: private, public, shared DID.
- Every record remains stored under the owner's isolated DWN-backed space.
- Other users only see a record if its owner selected public or granted DID-level permission.

Run order:
1. start-docker-engine.bat
2. start-did-dht-gateway.bat
3. start-milan-app.bat
4. Open http://localhost:5000

Recommended quick test:
1. Register User A and create a private post.
2. Register User B and confirm User A private post is hidden.
3. User A creates public post and confirm it appears in public feed.
4. User A shares a private post with User B DID and confirm only User B can see it.
