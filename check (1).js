const IORedis = require('ioredis');

// Use environment variable instead of hardcoding credentials
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

(async () => {
  try {
    const keys = await redis.keys('user:*');
    console.log('TOTAL USERS:', keys.length);
    
    if (keys.length > 0) {
      console.log('Sample keys (first 5):', keys.slice(0, 5));
      console.log('Sample user data:', await redis.hgetall(keys[0]));
    } else {
      console.log('No users found in database');
    }
  } catch (error) {
    console.error('Error checking database:', error.message);
  } finally {
    await redis.disconnect();
  }
})();