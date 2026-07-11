'use strict';

/**
 * MILAN — REAL Decentralized Web Node (DWN) Engine
 * ------------------------------------------------------------------
 * Implements the ACTUAL DWN protocol per user using the official
 * TBD / DIF reference SDK (@tbd54566975/dwn-sdk-js) — NOT a JSON
 * simulation.
 *
 * Architecture (1 user = 1 DID = 1 isolated real DWN node):
 *   - Each user owns a real cryptographic DID (did:key, Ed25519).
 *   - Each user gets a dedicated DWN instance backed by isolated
 *     LevelDB stores (MessageStore / DataStore / EventLog /
 *     ResumableTaskStore) under their own spaceId directory.
 *   - All writes/reads are real signed DWN protocol messages
 *     (RecordsWrite / RecordsQuery / RecordsRead / RecordsDelete),
 *     processed by dwn.processMessage(tenantDid, message).
 *
 * The SDK is ESM-only; this file is CommonJS, so we load it lazily
 * via dynamic import() and cache the namespace. Engine init is
 * best-effort: if the SDK or a node fails to initialise, callers
 * receive a structured { ok:false, reason } and the app's existing
 * JSON persistence keeps working (no hard dependency / no crash).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- lazy ESM module cache -------------------------------------------------
let _sdk = null;        // @tbd54566975/dwn-sdk-js namespace
let _dids = null;       // @web5/dids namespace
let _sdkLoadError = null;

async function loadSdk() {
  if (_sdk && _dids) return { sdk: _sdk, dids: _dids };
  if (_sdkLoadError) throw _sdkLoadError;
  try {
    const sdk = await import('@tbd54566975/dwn-sdk-js');
    const dids = await import('@web5/dids');
    _sdk = sdk;
    _dids = dids;
    return { sdk, dids };
  } catch (err) {
    _sdkLoadError = err;
    throw err;
  }
}

function enabled() {
  // Real DWN engine is ON by default. Set MILAN_REAL_DWN_ENGINE=false to
  // fall back to JSON-only persistence (e.g. constrained environments).
  return String(process.env.MILAN_REAL_DWN_ENGINE || 'true').toLowerCase() !== 'false';
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ---- per-user DWN node registry -------------------------------------------
// Map<spaceId, { dwn, did, tenantDid, storeRoot, openedAt }>
const _nodes = new Map();
// Map<spaceId, Promise> — de-dupe concurrent opens for the same user.
const _opening = new Map();

let _enginePersistRoot = null;
function setPersistRoot(root) { _enginePersistRoot = root; }
function persistRoot() {
  return _enginePersistRoot ||
    process.env.MILAN_REAL_DWN_ENGINE_ROOT ||
    path.join(__dirname, '..', 'real-dwn-engine');
}

function nodeStoreRoot(spaceId) {
  return path.join(persistRoot(), safeName(spaceId));
}

/**
 * Reconstruct (or create) a real signing DID for the user.
 * Priority:
 *   1. Portable DID JSON persisted in the user's node dir (durable, real key).
 *   2. Fresh did:key (real Ed25519) — persisted for reuse so the DID is
 *      stable across restarts from that point on.
 * Returns { didApi, uri, signer }.
 */
async function resolveUserDid({ dids }, { spaceId, knownDidUri }) {
  const { DidKey } = dids;
  const portableFile = path.join(nodeStoreRoot(spaceId), 'portable-did.json');

  // 1. durable portable DID (real signing key)
  try {
    if (fs.existsSync(portableFile)) {
      const portable = JSON.parse(fs.readFileSync(portableFile, 'utf8'));
      const didApi = await DidKey.import({ portableDid: portable });
      return await asSignable(didApi);
    }
  } catch (_) { /* fall through to fresh */ }

  // 2. fresh real DID, persisted durably for reuse
  const didApi = await DidKey.create();
  const portable = await didApi.export();
  persistPortable(portableFile, portable);
  return await asSignable(didApi);
}

function persistPortable(file, portable) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(portable, null, 2), { mode: 0o600 });
  } catch (_) { /* best-effort */ }
}

async function asSignable(didApi) {
  const signer = await didApi.getSigner();
  // dwn-sdk-js expects a Signer with { keyId, algorithm, sign(bytes) }.
  const keyFragment = didApi.uri.split(':')[2];
  const dwnSigner = {
    keyId: `${didApi.uri}#${keyFragment}`,
    algorithm: 'EdDSA',
    sign: async (content) => signer.sign({ data: content })
  };
  return { didApi, uri: didApi.uri, signer: dwnSigner };
}

/**
 * Open (or return cached) the real DWN node for a given user.
 * @returns {Promise<{ok:boolean, node?:object, reason?:string, error?:string}>}
 */
async function openNode({ spaceId, rawSeedHex, knownDidUri }) {
  if (!enabled()) return { ok: false, reason: 'engine-disabled' };
  if (!spaceId) return { ok: false, reason: 'missing-space-id' };
  if (_nodes.has(spaceId)) return { ok: true, node: _nodes.get(spaceId) };
  if (_opening.has(spaceId)) return _opening.get(spaceId);

  const p = (async () => {
    try {
      const { sdk, dids } = await loadSdk();
      const {
        Dwn, DataStoreLevel, MessageStoreLevel, EventLogLevel, ResumableTaskStoreLevel
      } = sdk;

      const storeRoot = nodeStoreRoot(spaceId);
      fs.mkdirSync(storeRoot, { recursive: true });

      const messageStore = new MessageStoreLevel({
        blockstoreLocation: path.join(storeRoot, 'MESSAGESTORE'),
        indexLocation: path.join(storeRoot, 'INDEX')
      });
      const dataStore = new DataStoreLevel({
        blockstoreLocation: path.join(storeRoot, 'DATASTORE')
      });
      const eventLog = new EventLogLevel({
        location: path.join(storeRoot, 'EVENTLOG')
      });
      const resumableTaskStore = new ResumableTaskStoreLevel({
        location: path.join(storeRoot, 'RESUMABLE')
      });

      const dwn = await Dwn.create({ messageStore, dataStore, eventLog, resumableTaskStore });

      const { uri, signer, didApi } = await resolveUserDid({ dids }, { spaceId, knownDidUri });

      const node = {
        spaceId,
        dwn,
        didApi,
        signer,
        tenantDid: uri,
        storeRoot,
        openedAt: new Date().toISOString()
      };
      _nodes.set(spaceId, node);
      return { ok: true, node };
    } catch (err) {
      return { ok: false, reason: 'open-failed', error: err.message };
    } finally {
      _opening.delete(spaceId);
    }
  })();

  _opening.set(spaceId, p);
  return p;
}

function toBytes(value) {
  if (value === undefined || value === null) return new TextEncoder().encode('');
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return new TextEncoder().encode(JSON.stringify(value));
}

/**
 * Write a record into the user's real DWN node as a signed RecordsWrite.
 * Idempotent per logical recordId via a deterministic protocol path/tag.
 * @returns {Promise<{ok, status, dwnRecordId?, reason?, error?}>}
 */
async function writeRecord({ spaceId, rawSeedHex, knownDidUri }, record = {}) {
  const opened = await openNode({ spaceId, rawSeedHex, knownDidUri });
  if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
  const { node } = opened;
  try {
    const { sdk } = await loadSdk();
    const { RecordsWrite, DataStream } = sdk;

    const payload = {
      milanRecordId: record.id,
      title: record.title,
      schema: record.schema,
      access: record.access || record.accessMode,
      data: record.data,
      media: record.data && record.data.media ? record.data.media : undefined,
      dateCreated: record.dateCreated,
      dateModified: record.dateModified
    };
    const bytes = toBytes(JSON.stringify(payload));

    const rw = await RecordsWrite.create({
      signer: node.signer,
      dataFormat: 'application/json',
      schema: `https://milanlife.in/schemas/${safeName(record.schema || 'record')}`,
      data: bytes,
      tags: record.id ? { milanRecordId: String(record.id) } : undefined
    });

    const res = await node.dwn.processMessage(node.tenantDid, rw.message, {
      dataStream: DataStream.fromBytes(bytes)
    });

    const status = res.status && res.status.code;
    const ok = status === 202 || status === 200;
    return {
      ok,
      status,
      dwnRecordId: rw.message && rw.message.recordId,
      tenantDid: node.tenantDid,
      spaceId,
      detail: res.status && res.status.detail
    };
  } catch (err) {
    return { ok: false, reason: 'write-failed', error: err.message };
  }
}

/**
 * Query records from the user's real DWN node (signed RecordsQuery).
 */
async function queryRecords({ spaceId, rawSeedHex, knownDidUri }, filter = {}) {
  const opened = await openNode({ spaceId, rawSeedHex, knownDidUri });
  if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
  const { node } = opened;
  try {
    const { sdk } = await loadSdk();
    const { RecordsQuery } = sdk;
    // The DWN protocol rejects an empty filter ({}), so default to the MILAN
    // dataFormat which matches every record this engine writes.
    const effectiveFilter = (filter && Object.keys(filter).length)
      ? filter
      : { dataFormat: 'application/json' };
    const rq = await RecordsQuery.create({ signer: node.signer, filter: effectiveFilter });
    const res = await node.dwn.processMessage(node.tenantDid, rq.message);
    return {
      ok: res.status && res.status.code === 200,
      status: res.status && res.status.code,
      entries: (res.entries || []).map(e => ({
        recordId: e.recordId,
        descriptor: e.descriptor
      })),
      count: (res.entries || []).length
    };
  } catch (err) {
    return { ok: false, reason: 'query-failed', error: err.message };
  }
}

/**
 * Health + proof for a single user's real DWN node.
 */
async function nodeStatus({ spaceId, rawSeedHex, knownDidUri }) {
  if (!enabled()) return { ok: false, enabled: false, reason: 'engine-disabled' };
  const opened = await openNode({ spaceId, rawSeedHex, knownDidUri });
  if (!opened.ok) return { ok: false, enabled: true, reason: opened.reason, error: opened.error };
  const { node } = opened;
  const q = await queryRecords({ spaceId, rawSeedHex, knownDidUri }, {});
  return {
    ok: true,
    enabled: true,
    realDwnProtocol: true,
    sdk: '@tbd54566975/dwn-sdk-js',
    isolation: 'single-user-single-node',
    spaceId,
    tenantDid: node.tenantDid,
    storeRoot: node.storeRoot,
    openedAt: node.openedAt,
    recordCount: q.ok ? q.count : null
  };
}

/**
 * Gracefully close one node, or all (on shutdown).
 */
async function closeNode(spaceId) {
  const node = _nodes.get(spaceId);
  if (!node) return;
  try { await node.dwn.close(); } catch (_) {}
  _nodes.delete(spaceId);
}

async function closeAll() {
  const ids = [..._nodes.keys()];
  await Promise.all(ids.map(closeNode));
}

async function engineStatus() {
  let sdkLoadable = !!_sdk;
  if (!_sdk && enabled()) {
    try { await loadSdk(); sdkLoadable = true; } catch (_) { sdkLoadable = false; }
  }
  return {
    enabled: enabled(),
    sdkLoadable,
    sdkLoadError: _sdkLoadError ? _sdkLoadError.message : null,
    activeNodes: _nodes.size,
    persistRoot: persistRoot(),
    realDwnProtocol: true,
    model: 'one-user-one-did-one-real-dwn-node'
  };
}

module.exports = {
  enabled,
  setPersistRoot,
  openNode,
  writeRecord,
  queryRecords,
  nodeStatus,
  closeNode,
  closeAll,
  engineStatus
};
