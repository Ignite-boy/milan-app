import { Redis } from '@upstash/redis';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';

let redisClient = null;
function getRedis(){
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url ||!token) return null;
  if(!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}
const LOCAL_FILE = path.join(os.tmpdir(), 'milan-users.json');
const DWN_FILE = path.join(process.cwd(), 'backend', 'dwn', 'database', 'users.json');
const readLocal = () => { try { return JSON.parse(fs.readFileSync(LOCAL_FILE,'utf8')); } catch { return {}; } };
const writeBoth = (o) => {
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(o)); } catch(e){ console.log('write tmp fail',e.message)}
  try { fs.mkdirSync(path.dirname(DWN_FILE), {recursive:true}); fs.writeFileSync(DWN_FILE, JSON.stringify(Object.values(o), null, 2)); } catch(e){ console.log('write dwn fail',e.message)}
};
const JWT = process.env.JWT_SECRET || 'milan_secret_2024';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method!== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const r = getRedis();
    const action = (req.body?.action || req.url.split('?')[0].split('/').pop() || '').toLowerCase();
    const { email, password, name } = req.body || {};
    if (!email ||!password) return res.status(400).json({ success: false, error: 'Email and password required' });
    const normalizedEmail = email.toLowerCase().trim();
    const userKey = `user:${normalizedEmail}`;

    if (action === 'register') {
      let exists = false;
      if (r) { const e = await r.get(userKey); exists =!!e; } else { exists =!!readLocal()[userKey]; }
      if (exists) return res.status(409).json({ success: false, error: 'User already exists, please login' });
      const did = `did:milan:${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
      const user = { email: normalizedEmail, name: name || email.split('@')[0], did, password, createdAt: new Date().toISOString() };
      if (r) await r.set(userKey, JSON.stringify(user));
      const db=readLocal(); db[userKey]=user; writeBoth(db);
      const token = jwt.sign({ email: user.email, did: user.did }, JWT, { expiresIn: '7d' });
      return res.status(200).json({ success: true, token, did: user.did, user: { email: user.email, name: user.name, did: user.did } });
    }
    let user = null;
    if (r) { const s = await r.get(userKey); user = s? (typeof s==='string'? JSON.parse(s):s):null; } else { user = readLocal()[userKey]||null; }
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.password!== password) return res.status(401).json({ success: false, error: 'Invalid password' });
    const token = jwt.sign({ email: user.email, did: user.did }, JWT, { expiresIn: '7d' });
    return res.status(200).json({ success: true, token, did: user.did, user: { email: user.email, name: user.name, did: user.did } });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
