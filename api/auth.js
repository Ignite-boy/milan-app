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
const JWT = process.env.JWT_SECRET;

if (!JWT) {
  console.warn('[auth] JWT_SECRET is not configured');
}

function makeDid() {
  return `did:milan:${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

async function readUsers() {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(AUTH_FILE);

  if (error) {
    const message = String(error.message || '');
    if (/not found|404|no such/i.test(message)) return {};
    throw error;
  }

  const text = await data.text();
  if (!text.trim()) return {};

  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

async function writeUsers(users) {
  const supabase = getSupabase();
  const body = JSON.stringify(users, null, 2);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(AUTH_FILE, body, {
      contentType: 'application/json',
      upsert: true,
    });

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
