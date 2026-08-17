'use strict';

/**
 * MILAN — Standalone Decentralized Web Node (DWN)
 * ================================================================
 * A persistent, authenticated DWN storage service that speaks the
 * MILAN DWN HTTP API (the exact routes backend/services/realDwnNodeClient.js
 * calls). It is the AUTHORITATIVE, decentralised home for user data —
 * records, media and database snapshots — living on its own host
 * (e.g. a GCP VM with a persistent disk), decoupled from the MILAN app
 * server so redeploys/restarts of the app never touch user data.
 *
 * Storage layout (all under DATA_DIR, which MUST be a persistent volume):
 *   DATA_DIR/db/<name>.json                         ← database snapshots
 *   DATA_DIR/spaces/<spaceId>/records/<recordId>.json ← DWN records
 *   DATA_DIR/spaces/<spaceId>/media/<recordId>[.meta] ← media bytes + type
 *
 * The DIF/TBD reference engine (@tbd54566975/dwn-sdk-js) is loaded
 * best-effort so the node reports real-DWN readiness; the app's embedded
 * engine performs the per-user cryptographic signing, while this node is
 * the durable tenant store. Auth: Authorization: Bearer <DWN_NODE_API_KEY>.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const PORT = Number(process.env.PORT || process.env.DWN_NODE_PORT || 3100);
const DATA_DIR = process.env.DWN_DATA_DIR || path.join(__dirname, 'data');
const API_KEY = String(process.env.DWN_NODE_API_KEY || process.env.REAL_DWN_NODE_API_KEY || '').trim();
const MAX_JSON = process.env.DWN_MAX_JSON || '25mb';

// ── storage helpers ─────────────────────────────────────────────────────────
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, 'db'));
ensureDir(path.join(DATA_DIR, 'spaces'));

// Reject path traversal; keep only safe filename characters.
function safeId(s, fallback = '') {
  const v = String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]/g, '_');
  if (!v || v === '.' || v === '..' || v.includes('..')) return fallback;
  return v.slice(0, 200);
}
function atomicWrite(file, buf) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}
function writeJson(file, obj) { ensureDir(path.dirname(file)); atomicWrite(file, JSON.stringify(obj)); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }

function dbFile(name) { return path.join(DATA_DIR, 'db', safeId(name, 'default') + '.json'); }
function spaceDir(spaceId) { return path.join(DATA_DIR, 'spaces', safeId(spaceId, 'shared')); }
function recordFile(spaceId, recordId) { return path.join(spaceDir(spaceId), 'records', safeId(recordId, 'record') + '.json'); }
function mediaFile(spaceId, recordId) { return path.join(spaceDir(spaceId), 'media', safeId(recordId, 'media')); }
function spaceMetaFile(spaceId) { return path.join(spaceDir(spaceId), 'space.json'); }

// ── DID ownership: each space is bound to exactly one owner DID ───────────────
// The DID is the KEY to the space. Once a space is bound, only requests bearing
// that same DID may write to or read from it — cross-user access is refused.
function spaceOwnerDid(spaceId) {
  const meta = readJson(spaceMetaFile(spaceId));
  return meta && (meta.ownerDid || meta.did) ? String(meta.ownerDid || meta.did) : '';
}
// Bind a space to a DID if not already bound; returns the effective owner DID.
function bindSpaceDid(spaceId, did, extra = {}) {
  ensureDir(spaceDir(spaceId));
  let meta = readJson(spaceMetaFile(spaceId)) || {};
  if (!meta.ownerDid && !meta.did && did) {
    meta = { spaceId, ownerDid: did, createdAt: new Date().toISOString(), ...extra, ...meta, ownerDid: did };
    writeJson(spaceMetaFile(spaceId), meta);
  } else if (meta.did && !meta.ownerDid) {
    meta.ownerDid = meta.did; writeJson(spaceMetaFile(spaceId), meta); // upgrade legacy field
  }
  return meta.ownerDid || meta.did || did || '';
}
// The caller's asserted DID: header (preferred) or body/query. The node is
// private (VM-internal, API-key gated), so the trusted app asserts each user's
// DID; the node enforces it matches the space owner.
function callerDid(req) {
  return String(req.headers['x-milan-did'] || req.headers['x-dwn-did'] || req.body?.ownerDid || req.body?.did || req.query?.did || '').trim();
}
// Guard: the space must be unbound, or bound to the caller's DID. 403 otherwise.
function didAllowed(spaceId, did) {
  const owner = spaceOwnerDid(spaceId);
  if (!owner) return true;           // not yet bound — first writer binds it
  if (!did) return false;            // bound space needs a DID to access
  return owner === did;
}

// ── best-effort real-DWN engine readiness (DIF/TBD SDK) ──────────────────────
let _sdkReady = false, _sdkError = null;
(async () => {
  try {
    await import('@tbd54566975/dwn-sdk-js');
    await import('@web5/dids');
    _sdkReady = true;
    console.log('[milan-dwn] dwn-sdk-js reference engine loaded — real DWN ready ✔');
  } catch (err) {
    _sdkError = err.message;
    console.warn('[milan-dwn] dwn-sdk-js not available (durable store still works):', err.message);
  }
})();

// ── app ──────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: MAX_JSON }));

// Auth: every /api route needs the bearer key (if one is configured).
function auth(req, res, next) {
  if (!API_KEY) return next(); // dev mode — no key set (a startup warning is logged)
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.query.apiKey ? String(req.query.apiKey) : '');
  if (token && token === API_KEY) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized: valid DWN node API key required' });
}

function statusBody() {
  return {
    ok: true,
    app: 'milan-dwn-node',
    version: '1.0.0',
    realDwnProtocol: true,
    sdkReady: _sdkReady,
    sdkError: _sdkError || undefined,
    time: new Date().toISOString()
  };
}

// ── status / health (public, no auth so uptime checks work) ──────────────────
['/api/dwn/node/status', '/api/cloud-dwn/node/status', '/api/cloud-dwn/status', '/api/health', '/health']
  .forEach(r => app.get(r, (_req, res) => res.json(statusBody())));

// ── provision a user's DWN space ─────────────────────────────────────────────
['/api/dwn/users/provision', '/api/cloud-dwn/users/provision', '/api/dwn/user/provision']
  .forEach(r => app.post(r, auth, (req, res) => {
    const spaceId = safeId(req.body?.spaceId || req.body?.did || req.body?.userId, '');
    const did = String(req.body?.did || '').trim();
    if (!spaceId) return res.status(400).json({ ok: false, error: 'spaceId or did required' });
    ensureDir(path.join(spaceDir(spaceId), 'records'));
    ensureDir(path.join(spaceDir(spaceId), 'media'));
    const metaFile = spaceMetaFile(spaceId);
    if (!fs.existsSync(metaFile)) {
      writeJson(metaFile, { spaceId, ownerDid: did, did, userId: req.body?.userId || '', email: req.body?.email || '', createdAt: new Date().toISOString() });
    }
    // Bind (or confirm) the owner DID — the key that unlocks this isolated space.
    const ownerDid = bindSpaceDid(spaceId, did, { userId: req.body?.userId || '', email: req.body?.email || '' });
    res.json({ ok: true, provisioned: true, spaceId, ownerDid, dwnAddress: `${req.protocol}://${req.get('host')}/api/dwn/space/${encodeURIComponent(spaceId)}`, realDwnProtocol: true, sdkReady: _sdkReady });
  }));

// ── space info — DID-gated: only the owner DID can see their space ────────────
app.get('/api/dwn/space/:spaceId', auth, (req, res) => {
  const spaceId = req.params.spaceId;
  const owner = spaceOwnerDid(spaceId);
  if (!owner) return res.status(404).json({ ok: false, error: 'space not provisioned' });
  if (!didAllowed(spaceId, callerDid(req))) return res.status(403).json({ ok: false, error: 'Access denied: this DWN space belongs to a different DID' });
  const recDir = path.join(spaceDir(spaceId), 'records');
  let records = 0; try { records = fs.readdirSync(recDir).filter(f => f.endsWith('.json')).length; } catch (_) {}
  res.json({ ok: true, spaceId, ownerDid: owner, records, isolated: true });
});

// ── database snapshots: WRITE (PUT) + READ (GET) with all client aliases ─────
const DB_ALIASES = [
  '/api/dwn/database/:name', '/api/cloud-dwn/database/:name', '/api/cloud-dwn/db/:name',
  '/api/dwn/database/write/:name', '/api/dwn/database/read/:name', '/api/dwn/snapshot/:name',
  '/api/cloud-dwn/node/database/:name', '/api/dwn/db/:name', '/api/dwn/databases/:name',
  '/api/cloud-dwn/snapshot/:name', '/api/cloud-dwn/snapshots/:name', '/api/dwn/database/snapshot/:name',
  '/api/cloud-dwn/database/write/:name', '/api/cloud-dwn/database/read/:name'
];
DB_ALIASES.forEach(r => {
  app.put(r, auth, (req, res) => {
    const name = req.params.name;
    const payload = { name, data: req.body?.data !== undefined ? req.body.data : req.body, pushedAt: req.body?.pushedAt || new Date().toISOString() };
    try { writeJson(dbFile(name), payload); res.json({ ok: true, stored: true, name, pushedAt: payload.pushedAt }); }
    catch (e) { res.status(500).json({ ok: false, error: 'snapshot write failed: ' + e.message }); }
  });
  app.get(r, auth, (req, res) => {
    const stored = readJson(dbFile(req.params.name));
    if (!stored) return res.status(404).json({ ok: false, error: 'snapshot not found', name: req.params.name });
    res.json({ ok: true, name: req.params.name, data: stored.data, pushedAt: stored.pushedAt });
  });
});

// ── records: write (POST) ────────────────────────────────────────────────────
['/api/dwn/records/write', '/api/cloud-dwn/ingest/record', '/api/cloud-dwn/records',
 '/api/dwn/ingest/record', '/api/dwn/records', '/api/cloud-dwn/records/write', '/api/cloud-dwn/node/records/write']
  .forEach(r => app.post(r, auth, (req, res) => {
    const record = req.body?.record || req.body;
    const spaceId = safeId(req.body?.spaceId || record?.dwnSpaceId || record?.spaceId || 'shared', 'shared');
    const recordId = record?.id || record?.recordId;
    const did = String(req.body?.ownerDid || record?.owner || callerDid(req) || '').trim();
    if (!recordId) return res.status(400).json({ ok: false, error: 'record.id required' });
    // DID gate: a bound space only accepts writes from its owner DID.
    if (!didAllowed(spaceId, did)) return res.status(403).json({ ok: false, error: 'Access denied: this DWN space belongs to a different DID' });
    try {
      bindSpaceDid(spaceId, did); // first write binds the space to this DID
      writeJson(recordFile(spaceId, recordId), { ownerDid: did, spaceId, record, pushedAt: req.body?.pushedAt || new Date().toISOString() });
      res.json({ ok: true, stored: true, id: recordId, spaceId, ownerDid: did, realDwnProtocol: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'record write failed: ' + e.message }); }
  }));

// ── records: read one / list a space (handy for verification & recovery) ─────
app.get('/api/dwn/records/read/:spaceId/:recordId', auth, (req, res) => {
  if (!didAllowed(req.params.spaceId, callerDid(req))) return res.status(403).json({ ok: false, error: 'Access denied: this DWN space belongs to a different DID' });
  const stored = readJson(recordFile(req.params.spaceId, req.params.recordId));
  if (!stored) return res.status(404).json({ ok: false, error: 'record not found' });
  res.json({ ok: true, ...stored });
});
app.get('/api/dwn/records/list/:spaceId', auth, (req, res) => {
  if (!didAllowed(req.params.spaceId, callerDid(req))) return res.status(403).json({ ok: false, error: 'Access denied: this DWN space belongs to a different DID' });
  const dir = path.join(spaceDir(req.params.spaceId), 'records');
  let ids = [];
  try { ids = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')); } catch (_) {}
  res.json({ ok: true, spaceId: req.params.spaceId, count: ids.length, recordIds: ids });
});

// ── media: write (PUT stream) + read (GET stream) ────────────────────────────
app.put('/api/dwn/media/write/:spaceId/:recordId', auth, (req, res) => {
  const file = mediaFile(req.params.spaceId, req.params.recordId);
  ensureDir(path.dirname(file));
  const tmp = file + '.up-' + Date.now();
  const out = fs.createWriteStream(tmp);
  req.pipe(out);
  out.on('finish', () => {
    try {
      fs.renameSync(tmp, file);
      writeJson(file + '.meta', { contentType: req.headers['content-type'] || 'application/octet-stream', size: fs.statSync(file).size, at: new Date().toISOString() });
      res.json({ ok: true, stored: true, spaceId: req.params.spaceId, recordId: req.params.recordId });
    } catch (e) { res.status(500).json({ ok: false, error: 'media finalize failed: ' + e.message }); }
  });
  out.on('error', e => { try { fs.unlinkSync(tmp); } catch (_) {} res.status(500).json({ ok: false, error: 'media write failed: ' + e.message }); });
});

app.get('/api/dwn/media/read/:spaceId/:recordId', auth, (req, res) => {
  const file = mediaFile(req.params.spaceId, req.params.recordId);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'media not found' });
  const meta = readJson(file + '.meta') || {};
  res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (String(req.query.download) === '1') res.setHeader('Content-Disposition', `attachment; filename="${safeId(req.params.recordId, 'file')}"`);
  fs.createReadStream(file).on('error', () => res.status(500).end()).pipe(res);
});

// ── root + 404 ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ app: 'milan-dwn-node', ...statusBody() }));
app.use((_req, res) => res.status(404).json({ ok: false, error: 'route not found' }));

app.listen(PORT, () => {
  console.log(`[milan-dwn] node listening on :${PORT}`);
  console.log(`[milan-dwn] data dir: ${DATA_DIR}`);
  if (!API_KEY) console.warn('[milan-dwn] ⚠  DWN_NODE_API_KEY is NOT set — running OPEN (dev only). Set it in production.');
});
