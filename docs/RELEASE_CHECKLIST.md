# MILAN — Production Release Checklist

This is the **Phase 1 (packaging + secret hygiene)** deliverable. It does not
delete anything from your working copy; it gives you a clean, repeatable way to
ship MILAN without leaking secrets or live user data.

---

## ⚠️ Do this first — rotate the leaked secrets

Your real `milan-app/backend/.env` was bundled inside `milan-app.zip`. Anything
that ever shipped in that zip must be treated as **compromised** and rotated:

- **Resend API key** (`RESEND_API_KEY`) — revoke + regenerate in the Resend dashboard.
- **Gmail app password** (`SMTP_PASS`, if it was ever used) — revoke in your Google Account → App passwords.
- **YouTube Data API key** — regenerate in Google Cloud Console, and restrict it (HTTP referrer = your domain).
- **`JWT_SECRET`** (if present) — rotate it (note: rotating invalidates existing logins).

Rotating costs nothing and closes the leak. Skipping it leaves live keys exposed.

---

## Build a clean release package

From the project root:

```
node package-release.mjs
```

This creates:

- `milan-release/` — a staging folder with **only** shippable files
- `milan-release.zip` — the same, zipped (if `zip`/`tar` is available)

It **excludes**: `node_modules/`, the real `.env` (ships `.env.example`),
`*.log`, `backend/real-dwn-engine/` (real user DWN data), `backend/dwn/`
(live user DB), `backend/RESOLVERCACHE/`, `*.bak` backups, old `*.zip`s, and dev
audit docs. It aborts if a real `.env` ever slips into the package.

Keep the audit/dev `.md` docs? Run `node package-release.mjs --include-docs`.

---

## Deploy

1. Upload `milan-release.zip` to the server home folder.
2. Run `redeploy.sh` — it unzips, **preserves** the live `backend/.env`, `dwn/`,
   `real-dwn-engine/`, `RESOLVERCACHE/`, `node_modules/`, then `npm install` and restarts.

So your live secrets and user data live **only on the server**, never in the package. That is exactly the behaviour you want.

---

## What was changed in Phase 1

- `milan-app/.gitignore` — now also ignores `real-dwn-engine/`, `RESOLVERCACHE/`,
  `dwn/`, `*.bak`, `*.zip`, `backend/logs/`, deploy artifacts. (Previously these
  live-data dirs were **not** ignored.)
- `package-release.mjs` — new cross-platform clean packager (this is the safe
  replacement for hand-zipping the whole folder).
- `RELEASE_CHECKLIST.md` — this file.

## Reality check on the "15,975 files"

Only **303** files are real source. The rest is `node_modules` (×32 copies —
normal for Node) plus runtime/user data. Your source is **not** bloated; the old
zip was just packing things that should never be packed. The packager above fixes
that at the root.

---

## Reminder for `.env` (backend) — required keys

```
PORT=5000
RESEND_API_KEY=...            # email
MAIL_FROM, MAIL_FROM_ADDRESS, PUBLIC_BASE_URL
JWT_SECRET=...               # auth signing (use a long random string)
MILAN_RAZORPAY_KEY_ID=...    # Premium (live payments)
RAZORPAY_KEY_SECRET=...      # server-side only, never in frontend
```
