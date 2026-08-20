# MILAN — Real Per-User DWN Implementation

## What changed

MILAN now runs a **real Decentralized Web Node per user** using the official
DIF / TBD reference SDK (`@tbd54566975/dwn-sdk-js`) — not a JSON simulation.

> **1 user = 1 real cryptographic DID = 1 isolated real DWN node.**

### Before
- DIDs were fake (`did:key:z<random-base64>`), not spec-compliant.
- "DWN spaces" were plain JSON files in per-user folders.
- No real DWN protocol messages, no signing, no LevelDB.

### After
- **Real DIDs**: each user gets a genuine `did:key` (Ed25519) created and
  persisted by the engine. The DID stored on the user record is exactly the
  key that signs that user's DWN messages.
- **Real DWN nodes**: each user has a dedicated `Dwn` instance backed by
  isolated LevelDB stores (MessageStore / DataStore / EventLog /
  ResumableTaskStore) under their own `spaceId` directory.
- **Real protocol**: every record is written as a signed `RecordsWrite`
  (`dwn.processMessage(tenantDid, message)` → HTTP-equivalent status `202`),
  and is queryable via signed `RecordsQuery` (status `200`).

## Key files

| File | Role |
|------|------|
| `backend/services/realDwnEngine.js` | **New.** The real per-user DWN engine: opens/caches one node per `spaceId`, real DID resolution, signed write/query, status, graceful close. |
| `backend/utils/did.js` | `mintRealUserIdentity()` mints a real DID via the engine at registration (falls back to a unique legacy id if the SDK is unavailable). |
| `backend/services/cloudDwnRegistry.js` | `pushRecordToCloudDwn()` now also performs the real DWN-node write and attaches the cryptographic proof under `cloudDwn.sync.realNode`. Honors a pre-assigned `spaceId`. New `realUserDwnNodeStatus()`. |
| `backend/routes/auth.js` | Registration uses `mintRealUserIdentity()`. |
| `backend/routes/isolatedDwn.js` | `/api/isolated-dwn/my-server` now includes `realNode`; new `/api/isolated-dwn/real-node`. |
| `backend/server.js` | Logs engine status on boot; closes all user nodes gracefully on SIGTERM/SIGINT (LevelDB flush). |

## Guarantees

- **Non-breaking**: if `@tbd54566975/dwn-sdk-js` fails to load or a node fails
  to open, the engine returns a structured `{ ok:false, reason }` and the
  existing JSON persistence keeps the app fully working. No hard crash.
- **Stable identity**: a user's `spaceId` and real DID are fixed at
  registration and reused on every login/restart (the DID is loaded from a
  durable `portable-did.json` inside the node directory).
- **Isolation**: one user can never read another user's node; each node is a
  separate DWN tenant with its own signing key and its own LevelDB.

## Configuration

```
MILAN_REAL_DWN_ENGINE=true                      # on by default
MILAN_REAL_DWN_ENGINE_ROOT=/var/data/milan-dwn/real-dwn-engine   # optional
```

Defaults to `<cloud-dwn-root>/real-dwn-engine`, so on Render it lands on your
persistent disk automatically.

## Verify it

```
# Per-user real node health + proof:
GET /api/isolated-dwn/real-node   (Authorization: Bearer <token>)

# Full server view incl. real node:
GET /api/isolated-dwn/my-server
```

A successful record write attaches proof like:

```json
"realNode": {
  "ok": true,
  "status": 202,
  "dwnRecordId": "bafyrei...",
  "tenantDid": "did:key:z6Mk...",
  "spaceId": "milan-...."
}
```
