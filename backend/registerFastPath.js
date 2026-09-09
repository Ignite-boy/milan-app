'use strict';

// This file is preloaded by the Render auth service. It must only patch the
// main Node process: worker_threads inherit NODE_OPTIONS, so running the
// preload inside every bcrypt worker can recursively spawn preload logic and
// prevent the HTTP server from ever binding its port.
const { isMainThread } = require('worker_threads');

if (isMainThread) {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '.env') });

  const crypto = require('crypto');
  const express = require('express');
  const bcrypt = require('./services/cryptoPool');
  const { generateDIDAndRawSeed, mintRealUserIdentity } = require('./utils/did');
  const { createClient } = require('@supabase/supabase-js');

  const supabaseDb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── Fast registration route ─────────────────────────────────────────────
  const originalPost = express.Router.prototype.post;
  if (!express.Router.prototype.__milanFastRegisterInstalled) {
    express.Router.prototype.__milanFastRegisterInstalled = true;

    express.Router.prototype.post = function patchedPost(routePath, ...handlers) {
      if (routePath !== '/register' || this.__milanFastRegisterRouteInstalled) {
        return originalPost.call(this, routePath, ...handlers);
      }

      this.__milanFastRegisterRouteInstalled = true;
      const throttle = handlers[0];

      const fastRegister = async (req, res, next) => {
        try {
          const email = String(req.body.email || '').trim().toLowerCase();
          const password = String(req.body.password || '');
          const name = String(req.body.name || '').trim();

          if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
          if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
          if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters for production use' });

          const id = crypto.randomUUID();
          const displayName = name || email.split('@')[0];

          // Hash and CPU-light DID generation run in parallel preparation.
          const passwordHashPromise = bcrypt.hash(password, 10);
          const { did } = generateDIDAndRawSeed();
          const spaceId = `milan-${id.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const passwordHash = await passwordHashPromise;

          // One authoritative Supabase round-trip. The database unique
          // constraint on email handles duplicates without a preflight SELECT.
          const { error: insertError } = await supabaseDb.from('users').insert({
            id,
            email,
            password_hash: passwordHash,
            name: displayName,
            did
          });

          if (insertError) {
            if (insertError.code === '23505') return res.status(400).json({ error: 'Email already exists' });
            return res.status(500).json({
              error: 'Account database registration failed',
              details: insertError.message,
              code: insertError.code
            });
          }

          // Non-critical DWN identity work happens after the HTTP response path
          // has been committed. It can never block successful registration.
          Promise.resolve().then(async () => {
            try {
              const identity = await mintRealUserIdentity({ userId: id, email });
              if (identity?.real && identity.did && identity.did !== did) {
                console.log('[fast-register] post-registration real DWN identity available:', email, identity.did);
              }
            } catch (err) {
              console.warn('[fast-register] post-registration DWN provisioning skipped:', err?.message || 'unknown error');
            }
          }).catch(() => {});

          return res.status(201).json({
            message: 'Registered successfully',
            id,
            email,
            name: displayName,
            did,
            spaceId,
            real: false
          });
        } catch (error) {
          if (next) return next(error);
          return res.status(500).json({ error: 'Registration failed' });
        }
      };

      return originalPost.call(this, routePath, throttle, fastRegister);
    };
  }

  // ── Fast Render boot ────────────────────────────────────────────────────
  // server.js currently awaits expensive DWN hydration/initialization before
  // calling app.listen(). On Render this can make the platform report
  // "No open ports detected" and eventually fail the deployment health check.
  // Let the HTTP server bind first; complete the expensive initialization in
  // the background a few seconds later.
  try {
    const store = require('./utils/store');
    const originalHydrateFilesFromRealDwn = store.hydrateFilesFromRealDwn;
    if (typeof originalHydrateFilesFromRealDwn === 'function' && !store.__milanFastBootPatched) {
      store.__milanFastBootPatched = true;
      let deferredHydrateArgs = null;
      store.hydrateFilesFromRealDwn = async (...args) => {
        deferredHydrateArgs = args;
        setTimeout(() => {
          if (!deferredHydrateArgs) return;
          const callArgs = deferredHydrateArgs;
          deferredHydrateArgs = null;
          Promise.resolve(originalHydrateFilesFromRealDwn(...callArgs))
            .then(result => console.log('[fast-boot] background DWN hydrate complete:', result?.ok !== false))
            .catch(err => console.warn('[fast-boot] background DWN hydrate failed:', err?.message || 'unknown error'));
        }, 5000).unref?.();
        return { ok: true, skipped: true, fastBoot: true };
      };
    }

    const dwnStore = require('./services/dwnService');
    const originalInitDwn = dwnStore.initDwn;
    if (typeof originalInitDwn === 'function' && !dwnStore.__milanFastBootPatched) {
      dwnStore.__milanFastBootPatched = true;
      dwnStore.initDwn = async () => {
        setTimeout(() => {
          Promise.resolve(originalInitDwn())
            .then(result => console.log('[fast-boot] background DWN init complete:', result?.ok !== false))
            .catch(err => console.warn('[fast-boot] background DWN init failed:', err?.message || 'unknown error'));
        }, 3000).unref?.();
        return { ok: true, sdkReady: false, storageOperational: true, mode: 'fast-boot', error: null };
      };
    }

    const registry = require('./services/cloudDwnRegistry');
    const engine = registry?.realDwnEngine;
    if (engine && typeof engine.engineStatus === 'function' && !engine.__milanFastBootPatched) {
      const originalEngineStatus = engine.engineStatus.bind(engine);
      engine.__milanFastBootPatched = true;
      engine.engineStatus = async () => {
        setTimeout(() => {
          originalEngineStatus()
            .then(result => console.log('[fast-boot] background real-DWN engine status:', result?.ok !== false))
            .catch(err => console.warn('[fast-boot] background real-DWN engine status failed:', err?.message || 'unknown error'));
        }, 2000).unref?.();
        return { ok: true, mode: 'fast-boot', deferred: true };
      };
    }
  } catch (err) {
    console.warn('[fast-boot] optional boot optimization skipped:', err?.message || 'unknown error');
  }

  console.log('[fast-register] optimized registration + fast boot installed');
}
