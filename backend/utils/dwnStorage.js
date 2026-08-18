const { createClient } = require('@supabase/supabase-js');
const BUCKET = process.env.SUPABASE_BUCKET || 'milan-dwn-storage';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
console.log('✅ DWN: Supabase Permanent Active');
async function uploadToDWN(spaceId, fileName, fileBuffer) {
  const path = `${spaceId}/${fileName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, { upsert: true });
  if (error) throw error;
  return path;
}
async function downloadFromDWN(spaceId, fileName) {
  const path = `${spaceId}/${fileName}`;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
module.exports = { uploadToDWN, downloadFromDWN, supabase };