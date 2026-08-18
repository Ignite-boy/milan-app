import { Redis } from '@upstash/redis';
import jwt from 'jsonwebtoken';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { action, email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const userKey = user:;

    if (action === 'register') {
      const existing = await redis.get(userKey);
      if (existing) {
        return res.status(409).json({ success: false, error: 'User already exists, please login' });
      }
      const did = did:milan:;
      const user = { email: email.toLowerCase(), name: name || email.split('@')[0], did, password, createdAt: new Date().toISOString() };
      await redis.set(userKey, JSON.stringify(user));
      const token = jwt.sign({ email: user.email, did: user.did }, process.env.JWT_SECRET || 'milan-super-secret-2026-change-me-xyz123', { expiresIn: '7d' });
      return res.status(200).json({ success: true, token, did: user.did, user: { email: user.email, name: user.name, did: user.did } });
    }

    // login
    const stored = await redis.get(userKey);
    if (!stored) {
      return res.status(404).json({ success: false, error: 'User not found, please register first' });
    }
    const user = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (user.password !== password) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    const token = jwt.sign({ email: user.email, did: user.did }, process.env.JWT_SECRET || 'milan-super-secret-2026-change-me-xyz123', { expiresIn: '7d' });
    return res.status(200).json({ success: true, token, did: user.did, user: { email: user.email, name: user.name, did: user.did } });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
