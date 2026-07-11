'use strict';
// worker_threads worker: runs bcryptjs off the main event loop.
// bcryptjs is pure JS — a hash at cost 10 burns ~100-300ms of CPU, which on
// the main thread would stall every other request while someone logs in.
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', async (t) => {
  try {
    const r = t.op === 'hash'
      ? await bcrypt.hash(t.a, t.b)
      : await bcrypt.compare(t.a, t.b);
    parentPort.postMessage({ id: t.id, ok: true, r });
  } catch (e) {
    parentPort.postMessage({ id: t.id, ok: false, e: String(e && e.message || e) });
  }
});
