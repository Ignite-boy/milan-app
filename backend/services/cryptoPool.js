'use strict';

/**
 * Password hashing via worker_threads.
 * Drop-in async replacements for bcrypt.hash / bcrypt.compare that run in a
 * dedicated worker so the main event loop never pays the ~100-300ms bcrypt
 * CPU cost. Hash format stays bcryptjs — existing password_hash values keep
 * working unchanged.
 * Resilient: if the worker dies or stalls (>8s), falls back to inline
 * bcryptjs for that call and respawns the worker.
 */

const path = require('path');
const bcrypt = require('bcryptjs'); // inline fallback

let worker = null;
let seq = 0;
const pending = new Map(); // id -> { resolve, timer, task }

function spawn() {
  const { Worker } = require('worker_threads');
  worker = new Worker(path.join(__dirname, 'cryptoWorker.js'));
  worker.unref();
  worker.on('message', (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.r);
    else p.resolve(inline(p.task)); // worker-side error: fall back inline
  });
  const die = () => {
    worker = null;
    for (const [id, p] of pending) {
      pending.delete(id);
      clearTimeout(p.timer);
      p.resolve(inline(p.task));
    }
  };
  worker.on('error', die);
  worker.on('exit', die);
}

function inline(task) {
  return task.op === 'hash' ? bcrypt.hash(task.a, task.b) : bcrypt.compare(task.a, task.b);
}

function run(task) {
  try {
    if (!worker) spawn();
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        resolve(inline(task)); // stalled: don't block the login on the worker
      }, 8000);
      pending.set(id, { resolve, timer, task });
      worker.postMessage({ id, ...task });
    });
  } catch (_) {
    return inline(task);
  }
}

module.exports = {
  hash: (password, rounds) => run({ op: 'hash', a: password, b: rounds }),
  compare: (password, hash) => run({ op: 'compare', a: password, b: hash })
};
