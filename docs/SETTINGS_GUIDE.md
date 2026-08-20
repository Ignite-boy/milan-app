# MILAN Settings Hub — Facebook-style, decentralized

A complete settings system at **`/settings`**. Every preference is stored in the user's
own DWN-synced account record — there is no central settings database.

## Sections
- **Account** — display name, username (unique), bio, website, language; shows email + DID.
- **Privacy** — profile visibility, default post audience, who can friend-request / message
  you, searchable-by-email, activity status, appear-in-discovery.
- **Notifications** — per-channel email + push toggles. `emailLoginAlerts` is honoured by the
  login-alert email built earlier.
- **Security & login**
  - Change password (verifies current; bumps token version → signs out other devices).
  - **Two-factor authentication (TOTP)** — works with Google Authenticator / Authy /
    1Password. Setup returns a secret + `otpauth://` URI; enabling returns 8 one-time
    **recovery codes** (only their hashes are stored). Verified against RFC 6238 test vectors.
  - **Where you're logged in** — recent sign-in history (time, IP, device).
  - **Sign out of all other sessions** — bumps `tokenVersion`; old JWTs are rejected.
- **Blocking** — block/unblock by DID or email.
- **Your data** — download a JSON export, deactivate (reactivate on next login),
  or permanently delete (password-confirmed) with central-index purge.

## API (all require `Authorization: Bearer <token>`)
```
GET    /api/settings
PUT    /api/settings/account
PUT    /api/settings/privacy
PUT    /api/settings/notifications
POST   /api/settings/security/password           { currentPassword, newPassword }
POST   /api/settings/security/2fa/init           -> { secret, otpauthUrl }
POST   /api/settings/security/2fa/enable         { code } -> { recoveryCodes }
POST   /api/settings/security/2fa/disable        { password }
GET    /api/settings/security/sessions
POST   /api/settings/security/logout-all
GET    /api/settings/blocking
POST   /api/settings/blocking                    { did | email }
DELETE /api/settings/blocking/:didOrEmail
GET    /api/settings/data/export
POST   /api/settings/account/deactivate
POST   /api/settings/account/delete              { password }
```

## How sessions / 2FA tie into login
- Login now issues a JWT containing `tv` (token version). The auth middleware rejects a
  token whose `tv` no longer matches the user (after password change / "sign out everywhere"),
  and blocks deactivated accounts. Old tokens without `tv` keep working (backward compatible).
- If 2FA is enabled, `POST /api/auth/login` returns `401 { twoFactorRequired: true }` until a
  valid `code` (or one-time `recoveryCode`) is supplied alongside email + password.

## New files / touched
- `backend/utils/totp.js` (new) — dependency-free TOTP + Base32.
- `backend/routes/settings.js` (new) — all settings endpoints.
- `backend/middleware/auth.js` — tokenVersion + deactivation enforcement (cached).
- `backend/routes/auth.js` — login embeds `tv`, enforces 2FA, reactivates, honours alert pref.
- `backend/server.js` — mounts `/api/settings`, serves `/settings`.
- `frontend/settings.html` (new) — the UI.

## Roadmap (remaining Facebook-style chunks, building next)
1. ✅ Settings hub (this)
2. ⏳ Stories + Reels + Saved collections
3. ⏳ Groups, Pages & Events
4. ⏳ Messenger (real-time decentralized chat)
