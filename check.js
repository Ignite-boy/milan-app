const IORedis = require('ioredis');
const redis = new IORedis('redis://default:pcbtfJsK8i6ye3v8pnaJMwS9frOyZvig@opalescent-demure-peachish-90970.db.redis.io:15691');
(async () => {
  const keys = await redis.keys('user:*');
  console.log('TOTAL USERS:', keys.length);
  console.log(keys);
  if(keys.length>0) console.log('sample:', await redis.hgetall(keys[0]));
  redis.disconnect();
})();
