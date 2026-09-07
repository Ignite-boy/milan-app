'use strict';

// Preserve a locally persisted profile photo when startup hydration receives
// an older/stale users.json snapshot from the remote DWN.
const store = require('../utils/store');

const originalHydrate = store.hydrateFilesFromRealDwn;
const originalReadJson = store.readJson;
const originalAtomicWriteJson = store.atomicWriteJson;

store.hydrateFilesFromRealDwn = async function hydrateWithAvatarPreservation(files = []) {
  const usersFile = global.usersFile;
  let localAvatars = {};

  try {
    if (usersFile) {
      const before = originalReadJson(usersFile, {});
      for (const [email, user] of Object.entries(before || {})) {
        const avatar = String(user?.profile?.avatar || '').trim();
        if (email && avatar) localAvatars[email] = avatar;
      }
    }
  } catch (error) {
    console.warn('[avatar-hydration-guard] pre-hydration read failed:', error.message);
  }

  const result = await originalHydrate(files);

  if (!usersFile || !Object.keys(localAvatars).length) return result;

  try {
    const hydrated = originalReadJson(usersFile, {});
    let changed = false;

    for (const [email, avatar] of Object.entries(localAvatars)) {
      const user = hydrated?.[email];
      if (!user) continue;

      const current = String(user?.profile?.avatar || '').trim();
      if (!current || current !== avatar) {
        hydrated[email] = {
          ...user,
          profile: {
            ...(user.profile || {}),
            avatar,
            avatarSync: user.profile?.avatarSync || 'persisted'
          }
        };
        changed = true;
      }
    }

    if (changed) {
      originalAtomicWriteJson(usersFile, hydrated);
      console.log('[avatar-hydration-guard] preserved persisted profile photos across DWN hydration');
    }
  } catch (error) {
    console.warn('[avatar-hydration-guard] post-hydration merge failed:', error.message);
  }

  return result;
};
