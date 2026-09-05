const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById, addActivity } = require('../utils/store');
const MINI_DWN_ENDPOINT = (
  process.env.MINI_DWN_ENDPOINT ||
  `${process.env.MILAN_LIVE_DWN_BASE || 'https://milanlife.in'}/api/dwn`
).replace(/\/$/, '');

const router = express.Router();

const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function resolveAccount(req, users) {
  const byId = await supabaseDb
    .from('users')
    .select('id,email,name,did')
    .eq('id', req.userId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return {
      email: byId.data.email,
      user: {
        ...(users[byId.data.email] || {}),
        id: byId.data.id,
        email: byId.data.email,
        name: byId.data.name,
        did: byId.data.did
      }
    };
  }

  const email = String(req.userEmail || '').trim().toLowerCase();
  if (email) {
    const byEmail = await supabaseDb
      .from('users')
      .select('id,email,name,did')
      .eq('email', email)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return {
        email: byEmail.data.email,
        user: {
          ...(users[byEmail.data.email] || {}),
          id: byEmail.data.id,
          email: byEmail.data.email,
          name: byEmail.data.name,
          did: byEmail.data.did
        }
      };
    }
  }

  return null;
}

function profileRecordId(did) {
  return `profile-picture:${did}`;
}

function dataUrlToDwn(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const bytes = Buffer.from(base64, 'base64');

  if (!bytes.length) return null;
  if (bytes.length > 900000) {
    throw new Error('Use a profile picture under 900 KB.');
  }

  const encodedData = bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return { mime, bytes, encodedData };
}

async function miniDwnProcess(target, message, encodedData) {
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${MINI_DWN_ENDPOINT}/json-rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer milan-v49-embedded-production-dwn-key'
        },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${Date.now()}-${attempt}`,
          method: 'dwn.processMessage',
          params: {
            target,
            message,
            ...(encodedData ? { encodedData } : {})
          }
        })
      });

      const contentType = String(
        response.headers.get('content-type') || ''
      ).toLowerCase();

      const raw = await response.text();

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        const preview = raw.replace(/\s+/g, ' ').slice(0, 220);
        throw new Error(
          `Mini-DWN returned non-JSON (${response.status}, ${contentType || 'no content-type'}): ${preview}`
        );
      }

      const reply = body?.result?.reply;
      const status = reply?.status?.code;

      // Retry only transient upstream failures.
      if ([408, 425, 429, 500, 502, 503, 504, 530].includes(response.status)) {
        if (attempt < maxAttempts) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterSeconds = Number(retryAfterHeader);

          const waitMs =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? Math.min(retryAfterSeconds * 1000, 10000)
              : Math.min(500 * (2 ** (attempt - 1)), 4000);

          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }

        throw new Error(
          `Mini-DWN HTTP ${response.status} after ${maxAttempts} attempts`
        );
      }

      if (!response.ok) {
        throw new Error(`Mini-DWN HTTP ${response.status}`);
      }

      if (status >= 400) {
        throw new Error(
          reply?.status?.detail || `Mini-DWN status ${status}`
        );
      }

      return reply || {};
    } catch (err) {
      lastError = err;

      const messageText = String(err?.message || err);

      const transient =
        /Mini-DWN HTTP (408|425|429|500|502|503|504|530)/.test(messageText) ||
        /timed out|aborted|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(messageText);

      if (!transient || attempt >= maxAttempts) {
        throw err;
      }

      const waitMs = Math.min(500 * (2 ** (attempt - 1)), 4000);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Mini-DWN request failed');
}

async function writeProfilePicture(did, dataUrl) {
  const parsed = dataUrlToDwn(dataUrl);
  if (!parsed) return null;

  const recordId = profileRecordId(did);

  const record = {
    id: recordId,
    dwnRecordId: recordId,
    owner: did,
    recipient: did,
    schema: 'milan-profile-picture',
    title: 'MILAN Profile Picture',
    dataFormat: parsed.mime,
    data: {
      kind: 'profile-picture',
      avatar: dataUrl
    },
    tags: ['profile-picture'],
    accessMode: 'private',
    isPublic: false,
    sharedWithDids: [],
    dateCreated: new Date().toISOString(),
    dateModified: new Date().toISOString()
  };

  const response = await fetch(
    'https://milanlife.in/api/dwn/records/write',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        spaceId: did,
        ownerDid: did,
        record
      })
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.accepted !== true) {
    throw new Error(
      body.error ||
      body.detail ||
      `Live DWN profile write failed: HTTP ${response.status}`
    );
  }

  return {
    recordId,
    mime: parsed.mime,
    dataSize: parsed.bytes.length,
    avatar: dataUrl,
    liveDwn: true
  };
}

async function readProfilePicture(did) {
  // The live V49 API currently exposes Records.Write for this
  // embedded DWN route, while profile.js already keeps the
  // verified avatar in the user's profile for immediate restore.
  return null;
}

async function readProfilePicture(did) {
  const recordId = profileRecordId(did);

  const message = {
    descriptor: {
      interface: 'Records',
      method: 'Read',
      recordId
    },
    authorization: {
      payload: 'e30',
      signatures: []
    }
  };

  const reply = await miniDwnProcess(did, message);

  if (reply.status?.code === 404) {
    return null;
  }

  if (reply.status?.code !== 200) {
    throw new Error(reply.status?.detail || 'Mini-DWN profile read failed');
  }

  const encodedData = reply.encodedData;
  if (!encodedData) return null;

  const mime = reply.record?.dataFormat || 'image/jpeg';

  const base64 = String(encodedData)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(encodedData).length / 4) * 4, '=');

  return {
    recordId,
    avatar: `data:${mime};base64,${base64}`
  };
}

router.get('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const dwnPicture = await readProfilePicture(found.user.did);

    return res.json({
      ...(found.user.profile || {}),
      ...(dwnPicture ? {
        avatar: dwnPicture.avatar,
        avatarRecordId: dwnPicture.recordId
      } : {})
    });
  } catch (error) {
    /*
     * Mini-DWN may be temporarily unavailable locally.
     * The profile itself remains the safe fallback so the
     * user's uploaded DP is not lost or hidden.
     */
    console.warn('[profile] Mini-DWN unavailable; using stored profile avatar:', error.message);

    return res.json({
      ...(found.user.profile || {}),
      avatar: found.user.profile?.avatar || '',
      avatarRecordId:
        found.user.profile?.avatarRecordId ||
        profileRecordId(found.user.did)
    });
  }
});

router.put('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  const {
    display_name,
    username,
    bio,
    website,
    avatar
  } = req.body || {};

  try {
    let dwnPicture = null;

    if (avatar && String(avatar).startsWith('data:image/')) {
      try {
        dwnPicture = await writeProfilePicture(found.user.did, avatar);
      } catch (dwnError) {
        /*
         * Keep the DP usable even when the local Mini-DWN
         * endpoint is offline. The avatar is still persisted
         * in the user's profile and can be synchronized later.
         */
        console.warn(
          '[profile] Mini-DWN write unavailable; keeping profile avatar:',
          dwnError.message
        );

        dwnPicture = {
          recordId: profileRecordId(found.user.did),
          avatar: String(avatar)
        };
      }
    } else {
      try {
        dwnPicture = await readProfilePicture(found.user.did);
      } catch (dwnError) {
        console.warn(
          '[profile] Mini-DWN read unavailable; using stored avatar:',
          dwnError.message
        );

        dwnPicture = {
          recordId: found.user.profile?.avatarRecordId ||
            profileRecordId(found.user.did),
          avatar: found.user.profile?.avatar || ''
        };
      }
    }

    const cleanName = String(display_name || '').trim().slice(0, 80);
    const cleanUsername = String(username || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .slice(0, 30);

    if (
      cleanUsername &&
      !/^[a-z0-9._]{3,30}$/.test(cleanUsername)
    ) {
      return res.status(400).json({
        error: 'Username must be 3–30 characters using letters, numbers, dot or underscore.'
      });
    }

    found.user.profile = {
      ...(found.user.profile || {}),
      display_name: cleanName,
      username: cleanUsername,
      bio: String(bio || '').trim().slice(0, 500),
      website: String(website || '').trim().slice(0, 200),
      avatar: dwnPicture?.avatar || '',
      avatarRecordId:
        dwnPicture?.recordId ||
        profileRecordId(found.user.did),
      updated_at: new Date().toISOString()
    };

    if (found.user.id && cleanName) {
      const { error: nameError } = await supabaseDb
        .from('users')
        .update({ name: cleanName })
        .eq('id', found.user.id);

      if (nameError) {
        throw new Error(
          'Profile name database update failed: ' +
          nameError.message
        );
      }
    }

    users[found.email] = found.user;
    writeJson(global.usersFile, users);
    addActivity(req.userId, 'profile.updated');

    return res.status(200).json(found.user.profile);
  } catch (error) {
    console.error('[profile] DWN write/read failed:', error.message);
    return res.status(502).json({
      error: 'Profile picture DWN save failed',
      detail: error.message
    });
  }
});

router.put('/settings', auth, (req, res) => {
  const users = readJson(global.usersFile);
  const found = findUserById(users, req.userId);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  found.user.settings = {
    ...(found.user.settings || {}),
    ...req.body,
    updated_at: new Date().toISOString()
  };

  users[found.email] = found.user;
  writeJson(global.usersFile, users);

  res.json(found.user.settings);
});

module.exports = router;
