require('dotenv').config();
const Redis = require('ioredis');

// NO TLS - seedha URL
const redis = new Redis(process.env.KV_URL_REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  retryStrategy(times){ if(times>2) return null; return 200; }
});

redis.on('connect', ()=> console.log('Redis connecting...'));
redis.on('ready', ()=> console.log('Redis ready!'));

async function saveLoginEmail(email, extra={}){
  const data = { email, ...extra, loginAt: new Date().toISOString() };
  await redis.hset('users', email, JSON.stringify(data));
  return data;
}
async function getAllLogins(){
  const all = await redis.hgetall('users');
  return Object.keys(all);
}
module.exports = { saveLoginEmail, getAllLogins, redis };
