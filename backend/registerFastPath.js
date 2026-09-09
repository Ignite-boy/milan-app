'use strict';

// Runtime optimization for the production registration critical path.
// This is preloaded by the Render auth service before backend/server.js so the
// existing auth router can keep its public API while /register uses one
// Supabase round-trip instead of SELECT + INSERT.

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

        // Start the expensive password hash immediately while CPU-light DID data
        // is prepared. The hash worker is prewarmed at application boot.
        const passwordHashPromise = bcrypt.hash(password, 10);
        const { did } = generateDIDAndRawSeed();
        const spaceId = `milan-${id.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const passwordHash = await passwordHashPromise;

        // Exactly one authoritative Supabase write in the registration path.
        // The unique constraint on email handles duplicates without a preflight
        // SELECT round-trip.
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

        // Optional real-DWN identity work is strictly post-response and cannot
        // block account creation or make successful registration fail.
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

  console.log('[fast-register] optimized registration route installed');
}
