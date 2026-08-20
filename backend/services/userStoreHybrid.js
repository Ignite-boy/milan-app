const fs = require('fs');
const { redis } = require('./redisUserStore');

async function saveUsersHybrid(users, filePath){
  try{ fs.writeFileSync(filePath, JSON.stringify(users, null, 2)); }catch(e){}
  try{
    for(const [k,u] of Object.entries(users)){
      const email = u.email || k;
      await redis.hset('users', email, JSON.stringify(u));
    }
    console.log('? KV synced:', Object.keys(users).length);
  }catch(e){ console.log('KV sync skip:', e.message); }
}
module.exports = { saveUsersHybrid };
