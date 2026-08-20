const fs = require('fs');
const path = require('path');
const { supabase } = require('./dwnStorage');

const BUCKET = process.env.SUPABASE_BUCKET || 'milan-dwn-storage';
const PREFIX = 'database';

async function pushDatabaseSnapshot(name, data) {
  const filePath = `${PREFIX}/${name}`;
  const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8');

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/json',
      upsert: true
    });

  if (error) throw error;

  return {
    ok: true,
    backend: 'supabase-storage',
    bucket: BUCKET,
    path: filePath,
    syncedAt: new Date().toISOString()
  };
}

async function pullDatabaseSnapshot(name) {
  const filePath = `${PREFIX}/${name}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(filePath);

  if (error) {
    if (/not found|404/i.test(error.message || '')) {
      return { ok: true, missing: true, data: {} };
    }
    throw error;
  }

  const text = await data.text();
  const parsed = JSON.parse(text);

  return {
    ok: true,
    backend: 'supabase-storage',
    bucket: BUCKET,
    path: filePath,
    data: parsed
  };
}

module.exports = {
  pushDatabaseSnapshot,
  pullDatabaseSnapshot
};
