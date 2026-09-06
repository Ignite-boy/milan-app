import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

let redisClient = null;
let supabaseClient = null;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase configuration missing');
  if (!supabaseClient) supabaseClient = createClient(url, key);
  return supabaseClient;
}

const BUCKET = process.env.SUPABASE_BUCKET || 'milan-dwn-storage';
const AUTH_FILE = 'database/auth-users.json';
const USERS_FILE = 'database/users.json';
const JWT = process.env.JWT_SECRET;

if (!JWT) {
  console.warn('[auth] JWT_SECRET is not configured');
}

function makeDid() {
  return `did:milan:${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

async function readUsers() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .select('id,email,password_hash,name,did,created_at,updated_at');

  if (error) throw error;

  const users = {};
  for (const user of data || []) {
    if (user.email) users[String(user.email).toLowerCase()] = user;
  }

  return users;
}


async function writeUsers(users) {
  const supabase = getSupabase();

  const rows = Object.values(users || {}).map((user) => ({
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    name: user.name || user.email?.split('@')[0] || '',
    did: user.did || null,
  }));

  if (!rows.length) return;

  const { error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}


function signToken(user) {
  if (!JWT) throw new Error('JWT_SECRET is not configured in production');

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      did: user.did,
      tv: 0,
    },
    JWT,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Session restore endpoint used by /app on every load.
  if (req.method === 'GET') {
    try {
      const header = String(req.headers.authorization || '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) return res.status(401).json({ error: 'No token provided' });

      const decoded = jwt.verify(token, JWT);
      const users = await readUsers();
      const email = String(decoded.email || '').toLowerCase();
      const user = users[email];

      if (!user || (decoded.userId && user.id !== decoded.userId)) {
        return res.status(401).json({ error: 'Session user not found' });
      }

      return res.status(200).json({
        email: user.email,
        did: user.did,
        profile: {
          display_name: user.name || user.email.split('@')[0],
          bio: '',
          website: '',
          avatar: ''
        },
        settings: {},
        login_count: user.login_count || 0,
        created_at: user.created_at
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Method not allowed' });
  }

  try {
    const action = (
      req.body?.action ||
      req.url?.split('?')[0]?.split('/').pop() ||
      ''
    ).toLowerCase();

    const { email, password, name } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'Email and password required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res
        .status(400)
        .json({ success: false, error: 'Valid email required' });
    }

    if (String(password).length < 8) {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Password must be at least 8 characters',
        });
    }

    const redis = getRedis();
    const users = await readUsers();

    if (action === 'register') {
      if (users[normalizedEmail]) {
        return res.status(409).json({
          success: false,
          error: 'User already exists, please login',
        });
      }

      const user = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        name: String(name || '').trim() || normalizedEmail.split('@')[0],
        did: makeDid(),
        password_hash: await bcrypt.hash(String(password), 12),
        created_at: new Date().toISOString(),
      };

      users[normalizedEmail] = user;

      // Supabase is authoritative.
      await writeUsers(users);

      // Redis is only an optional cache.
      if (redis) {
        await redis.set(`user:${normalizedEmail}`, user);
      }

      const token = signToken(user);

      return res.status(201).json({
        success: true,
        token,
        did: user.did,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          did: user.did,
        },
      });
    }

    const user = users[normalizedEmail];

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: 'User not found' });
    }

    const valid = await bcrypt.compare(
      String(password),
      String(user.password_hash || '')
    );

    if (!valid) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid password' });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      token,
      did: user.did,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        did: user.did,
      },
    });
  } catch (err) {
    console.error('[auth] error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Authentication failed',
    });
  }
}
