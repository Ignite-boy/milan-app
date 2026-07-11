# MILAN — Migration Plan: one production codebase under `milan-app`

_Decision: adopt the **Next.js** frontend (`milan-web5`) as MILAN's frontend, keep the
existing **Express + DWN backend**, and retire the standalone `milan-web5` folder._

---

## What was done in this step

- The entire Next.js app was relocated into **`milan-app/web/`** (source only — no
  `node_modules`/`.next`). `milan-app` is now the single repo: `backend/` (Express),
  `web/` (Next.js), and `frontend/` (the legacy vanilla UI, kept temporarily).
- **Fixed a real config bug:** `NEXT_PUBLIC_API_BASE` pointed at port **4000**, but the
  backend listens on **5000** (`backend/server.js`). Corrected in `web/.env.local.example`,
  and added `NEXT_PUBLIC_SITE_URL` (used by the SEO metadata/sitemap).
- Carried over the earlier optimizations (already inside `web/`): tuned `next.config.mjs`
  (AVIF/WebP, `optimizePackageImports`, prod console-strip, security headers), full SEO
  metadata, `robots.ts`, `sitemap.ts`, and the `useResource` race-condition fix.

> ⚠️ Not verified with a build: this checkout has no installed `node_modules`, so
> `next build` / typecheck could not run here. Run the verification steps below locally.

---

## Target structure (`milan-app/`)

```
milan-app/
  backend/        Express + DWN API (unchanged — the source of truth for data/auth)
  web/            Next.js 15 / React 19 frontend  ← the new production UI
    app/          App Router routes
    components/   UI + feature components
    lib/          api client, hooks, session, utils
  frontend/       LEGACY vanilla HTML/JS — keep until parity is reached, then delete
```

Recommended future cleanup inside `web/` (optional, matches the enterprise layout):
`features/`, `services/`, `hooks/`, `providers/`, `types/`, `constants/`.

---

## ⚠️ Critical reality: feature parity is NOT complete

The vanilla `frontend/` is far more feature-rich than `web5`. **Do not delete the
vanilla frontend until each item below is rebuilt in `web/`**, or you WILL lose features.

### Already in the Next.js app (`web/`)
Home, Feed (Facebook-style), Communities, Messages, Notifications, Premium (Razorpay
checkout), Profile, Settings, command palette, polished UI kit, session/auth via bearer token.

### Still ONLY in the vanilla `frontend/` — must be rebuilt in `web/`
| Feature / page | Vanilla file | Status in `web/` |
|---|---|---|
| Marketing landing | `index.html` | ❌ missing |
| About / Privacy / Terms | `about/privacy/terms.html` | ❌ missing |
| Admin panel | `admin-users.html` | ❌ missing |
| Music | `music.html` + `milan-youtube-feed.js` | ❌ missing |
| SEO content pages | `keywords.html`, `decentralized-social-media.html`, `private-social-network.html` | ❌ missing |
| Launch page | `launch.html` | ❌ missing |
| Password reset | `reset-password.html` | ❌ missing |
| Email verify | `verify-email.html` | ❌ missing |
| AI assistant | `milan-assistant.js` | ❌ missing |
| Creative mode / auto-upload | `milan-creative-mode.js`, `milan-auto-upload.js` | ❌ missing |
| DID / DWN management UI | inside `app.html` | ⚠️ partial |

All of these call backend routes that already exist (`/api/admin`, `/api/music`,
`/api/did`, `/api/launch`, `/api/auth`, …), so it's a UI rebuild, not new backend work.

---

## Cutover strategy (safe, incremental — no downtime)

1. **Run both in parallel during migration.** Backend on `:5000`, Next.js on `:3000`
   pointing at it via `NEXT_PUBLIC_API_BASE`. The live vanilla app keeps serving users.
2. **Rebuild the missing pages** (table above) in `web/`, one route at a time, verifying
   auth + data each time against the real backend.
3. **Reverse-proxy.** Put Next.js in front; proxy `/api/*` to Express (or run Express
   behind the same domain). Keep auth working (see auth note below).
4. **Flip traffic** to the Next.js app only once the parity checklist is 100% green.
5. **Delete `frontend/`** (the vanilla UI) and the top-level **`milan-web5/`** folder.
   Both are now redundant. (`milan-web5/` at the workspace root can be deleted now — its
   source already lives in `milan-app/web/`.)

### Auth note
Both apps use the same **bearer token** model against `/api/auth`, so login already works
from `web/`. For the SSR/RSC upgrade (and to stop XSS from reading the token), migrate the
token to an `httpOnly` cookie later — see `web/PERFORMANCE-AUDIT.md`.

---

## Dependencies
`web/package.json` is already clean: `next`, `react`, `react-dom`, `framer-motion`,
`lucide-react`, `clsx`, `tailwind-merge` + dev types/tailwind. No duplicates to remove.
The backend keeps its own `backend/package.json`. Two `package.json` files is correct here
(separate runtimes), not duplication.

---

## Verification (run locally — could not run in this environment)

```bash
# 1. Backend
cd milan-app/backend && npm install && npm start         # listens on :5000

# 2. Frontend (new)
cd milan-app/web && npm install
cp .env.local.example .env.local                          # already points to :5000
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript
npm run build         # production build must pass
npm start             # http://localhost:3000 — then run Lighthouse
```

Fix any type/lint/build error before flipping traffic. Test every auth flow, feed action,
and responsive breakpoint against the real backend.

---

## Definition of done
- [ ] Every vanilla feature in the table above rebuilt in `web/` and tested
- [ ] `npm run build` passes with no type/lint/console errors
- [ ] Auth, feed, posts, comments, likes, follow, chat, notifications, premium, admin all work from `web/`
- [ ] All breakpoints clean (mobile → ultrawide)
- [ ] `frontend/` (vanilla) and root `milan-web5/` deleted
- [ ] One repo: `milan-app/` = `backend/` + `web/`
