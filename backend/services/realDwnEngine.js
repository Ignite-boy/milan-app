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

let _sdk = null;
let _dids = null;
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
  return String(process.env.MILAN_REAL_DWN_ENGINE || 'true').toLowerCase() !== 'false';
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

const _nodes = new Map();
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

async function resolveUserDid({ dids }, { spaceId, knownDidUri }) {
  const { DidKey } = dids;
  const portableFile = path.join(nodeStoreRoot(spaceId), 'portable-did.json');

  try {
    if (fs.existsSync(portableFile)) {
      const portable = JSON.parse(fs.readFileSync(portableFile, 'utf8'));
      const didApi = await DidKey.import({ portableDid: portable });
      if (knownDidUri && didApi.uri !== knownDidUri) {
        throw new Error(`Persisted DWN DID mismatch: expected ${knownDidUri}, found ${didApi.uri}`);
      }
      return await asSignable(didApi);
    }
  } catch (err) {
    if (knownDidUri && /Persisted DWN DID mismatch:/.test(err.message)) throw err;
  }

  // A user-backed DWN must never silently receive a replacement DID.
  // Without the original portable identity, fail closed instead of
  // creating a new tenant and making the user's existing records orphaned.
  if (knownDidUri) {
    throw new Error('Persisted DWN identity is unavailable for the known user DID.');
  }

  const didApi = await DidKey.create();
  const portable = await didApi.export();
  persistPortable(portableFile, portable);
  return await asSignable(didApi);
}

function persistPortable(file, portable) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(portable, null, 2), { mode: 0o600 });
  } catch (_) {}
}

async function asSignable(didApi) {
  const signer = await didApi.getSigner();
  const keyFragment = didApi.uri.split(':')[2];
  const dwnSigner = {
    keyId: `${didApi.uri}#${keyFragment}`,
    algorithm: 'EdDSA',
    sign: async (content) => signer.sign({ data: content })
  };
  return { didApi, uri: didApi.uri, signer: dwnSigner };
}

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
      const { uri, signer, didApi } = await resolveUserDid({ dids }, { spaceId, rawSeedHex, knownDidUri });

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

    const writeOptions = {
      signer: node.signer,
      dataFormat: 'application/json',
      schema: `https://milanlife.in/schemas/${safeName(record.schema || 'record')}`,
      data: bytes,
      tags: record.id ? { milanRecordId: String(record.id) } : undefined
    };

    if (record.id) writeOptions.recordId = String(record.id);

    const rw = await RecordsWrite.create(writeOptions);
    const res = await node.dwn.processMessage(node.tenantDid, rw.message, {
      dataStream: DataStream.fromBytes(bytes)
    });

    const status = res.status && res.status.code;
    return {
      ok: status === 202 || status === 200,
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

async function readRecord({ spaceId, rawSeedHex, knownDidUri }, recordId) {
  const opened = await openNode({ spaceId, rawSeedHex, knownDidUri });
  if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
  if (!recordId) return { ok: false, reason: 'missing-record-id' };

  try {
    const { sdk } = await loadSdk();
    const { RecordsRead, DataStream } = sdk;
    const { node } = opened;

    const read = await RecordsRead.create({
      signer: node.signer,
      filter: { recordId: String(recordId) }
    });

    const response = await node.dwn.processMessage(node.tenantDid, read.message);
    if (response?.status?.code !== 200) {
      return {
        ok: false,
        status: response?.status?.code,
        detail: response?.status?.detail
      };
    }

    const entry = response.entry;
    if (!entry) return { ok: false, status: 404, reason: 'record-not-found' };

    let bytes = null;
    if (entry.encodedData) {
      const base64 = String(entry.encodedData)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(String(entry.encodedData).length / 4) * 4, '=');
      bytes = Buffer.from(base64, 'base64');
    } else if (entry.data) {
      bytes = Buffer.from(await DataStream.toBytes(entry.data));
    }

    if (!bytes || !bytes.length) {
      return { ok: false, reason: 'record-data-empty' };
    }

    return {
      ok: true,
      status: 200,
      recordId: String(recordId),
      descriptor: entry.descriptor || {},
      data: bytes
    };
  } catch (err) {
    return { ok: false, reason: 'read-failed', error: err.message };
  }
}

async function queryRecords({ spaceId, rawSeedHex, knownDidUri }, filter = {}) {
  const opened = await openNode({ spaceId, rawSeedHex, knownDidUri });
  if (!opened.ok) return { ok: false, reason: opened.reason, error: opened.error };
  const { node } = opened;
  try {
    const { sdk } = await loadSdk();
    const { RecordsQuery } = sdk;
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
  readRecord,
  queryRecords,
  nodeStatus,
  closeNode,
  closeAll,
  engineStatus
};
