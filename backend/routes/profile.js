const { realDwnEngine } = require('../services/realDwnEngine');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, writeJsonAndSync, findUserById, addActivity } = require('../utils/store');
const MINI_DWN_ENDPOINT = (
  process.env.MINI_DWN_ENDPOINT ||
  `${process.env.MILAN_LIVE_DWN_BASE || 'https://milan-app-pzhf.onrender.com'}/api/dwn`
).replace(/\/$/, '');

const router = express.Router();

const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function resolveAccount(req, users) {
  // Fast path: the authenticated email already maps to the local profile.
  // This avoids an unnecessary Supabase round-trip on every DP upload.
  const email = String(req.userEmail || '').trim().toLowerCase();
  const localUser = email ? users[email] : null;

  if (localUser && (!req.userId || !localUser.id || localUser.id === req.userId)) {
    return {
      email,
      user: {
        ...localUser,
        id: localUser.id || req.userId,
        email: localUser.email || email,
        did: localUser.did
      }
    };
  }

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

async function writeProfilePicture(did, dataUrl, user) {
  const parsed = dataUrlToDwn(dataUrl);
  if (!parsed) return null;

  if (!user?.dwn?.spaceId || !did) {
    throw new Error('User DWN space is unavailable.');
  }

  const recordId = profileRecordId(did);

  const result = await realDwnEngine.writeRecord(
    {
      spaceId: user.dwn.spaceId,
      rawSeedHex: user.raw_seed,
      knownDidUri: did
    },
    {
      id: recordId,
      title: 'MILAN Profile Picture',
      schema: 'profile-picture',
      access: 'private',
      dataFormat: parsed.mime,
      dateCreated: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      data: {
        type: 'profile-picture',
        avatar: dataUrl,
        ownerDid: did,
        spaceId: user.dwn.spaceId
      }
    }
  );

  if (!result?.ok) {
    throw new Error(
      result?.error ||
      result?.reason ||
      result?.detail ||
      'Persistent DWN profile-picture write failed.'
    );
  }

  return {
    avatar: dataUrl,
    recordId,
    dwnRecordId: result.dwnRecordId || recordId,
    spaceId: user.dwn.spaceId,
    persistedInDwn: true
  };
}

function queueProfilePictureSync(did, dataUrl, recordId) {
  // Deliberately do not await this. The API response can return as soon as
  // the local profile is safely persisted; Mini-DWN sync continues in-process.
  void writeProfilePicture(did, dataUrl)
    .then(() => {
      console.log('[profile] background DP sync complete:', recordId);
    })
    .catch(error => {
      console.warn('[profile] background DP sync pending/failed:', error.message);
    });
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

async function writeDurableProfileAvatar(email, avatar, recordId, did) {
  const { syncDatabaseSnapshot } = require('../services/cloudDwnRegistry');

  const result = await syncDatabaseSnapshot(
    profileAvatarSnapshotName(email),
    {
      avatar,
      recordId,
      ownerDid: did,
      updatedAt: new Date().toISOString()
    }
  );

  if (!result || result.ok === false) {
    throw new Error(
      result?.error ||
      result?.skipped ||
      'Durable profile avatar sync failed.'
    );
  }

  return result;
}

router.get('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  // The persisted profile avatar is the stable application value.
  // Mini-DWN is used for synchronization/verification, but a temporary
  // DWN outage must never make an already-saved DP disappear on reload.
  const persistedAvatar = String(
    found.user.profile?.avatar || ''
  ).trim();

  // Stable DP behavior:
  // an already-saved avatar must never disappear because a remote DWN
  // request is temporarily unavailable.
  if (persistedAvatar) {
    return res.json({
      ...(found.user.profile || {}),
      avatar: persistedAvatar,
      avatarRecordId:
        found.user.profile?.avatarRecordId ||
        profileRecordId(found.user.did),
      avatarSync: 'synced'
    });
  }

  try {
    const dwnPicture = await readProfilePicture(found.user.did);

    if (dwnPicture?.avatar) {
      // Keep the local profile in sync with the confirmed DWN value.
      found.user.profile = {
        ...(found.user.profile || {}),
        avatar: dwnPicture.avatar,
        avatarRecordId: dwnPicture.recordId,
        avatarSync: 'synced'
      };

      users[found.email] = found.user;

      try {
        writeJson(global.usersFile, users);
      } catch (error) {
        console.warn(
          '[profile] local profile avatar sync write failed:',
          error.message
        );
      }

      return res.json({
        ...(found.user.profile || {}),
        avatar: dwnPicture.avatar,
        avatarRecordId: dwnPicture.recordId,
        avatarSync: 'synced'
      });
    }
  } catch (error) {
    console.warn(
      '[profile] DWN profile picture read failed; using persisted avatar:',
      error.message
    );
  }

  return res.json({
    ...(found.user.profile || {}),
    avatar: persistedAvatar,
    avatarRecordId:
      found.user.profile?.avatarRecordId ||
      profileRecordId(found.user.did),
    avatarSync: persistedAvatar ? 'local-fallback' : 'missing'
  });
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
    let avatarSyncPending = false;

    if (avatar && String(avatar).startsWith('data:image/')) {
      // Validate the image synchronously, but NEVER block the API response
      // on the remote Mini-DWN write.
      const parsed = dataUrlToDwn(avatar);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid profile picture data.' });
      }

      dwnPicture = {
        recordId: profileRecordId(found.user.did),
        avatar: String(avatar),
        liveDwn: false
      };
      avatarSyncPending = true;
    } else {
      // Name/bio/settings saves do not need to wait for a remote DP read.
      dwnPicture = {
        recordId:
          found.user.profile?.avatarRecordId ||
          profileRecordId(found.user.did),
        avatar: found.user.profile?.avatar || ''
      };
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
      avatarSync:
        avatarSyncPending
          ? 'pending'
          : (found.user.profile?.avatarSync || 'synced'),
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

    // CRITICAL ORDER:
    // 1) Persist the actual DP to Mini-DWN first.
    // 2) Store the confirmed avatar in the user profile.
    // 3) Persist/sync users.json only after the DP is confirmed.
    if (avatarSyncPending) {
      const saved = await writeProfilePicture(
        found.user.did,
        String(avatar),
        found.user
      );

      if (!saved?.persistedInDwn) {
        throw new Error('DWN did not confirm the profile picture save.');
      }

      found.user.profile = {
        ...(found.user.profile || {}),
        avatar: saved.avatar,
        avatarRecordId: saved.dwnRecordId,
        avatarSync: 'synced',
        updated_at: new Date().toISOString()
      };
    }

    users[found.email] = found.user;


    // CRITICAL DP RULE:
    // The avatar is persisted locally immediately.
    // Remote DWN synchronization is best-effort/background only.
    writeJson(global.usersFile, users);

    void writeDurableProfileAvatar(
      found.email,
      found.user.profile?.avatar || '',
      found.user.profile?.avatarRecordId ||
        profileRecordId(found.user.did),
      found.user.did
    ).catch(error => {
      console.warn(
        '[profile] durable DP background sync failed:',
        error.message
      );
    });

    addActivity(req.userId, 'profile.updated');

    return res.status(200).json({
      ...found.user.profile,
      avatar: found.user.profile.avatar,
      avatarRecordId: found.user.profile.avatarRecordId,
      avatarSync: found.user.profile.avatarSync
    });
  } catch (error) {
    console.error('[profile] profile save failed:', error.message);
    return res.status(502).json({
      error: 'Profile save failed',
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
