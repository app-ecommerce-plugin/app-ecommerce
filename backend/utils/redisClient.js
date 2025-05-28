const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.error('🔴  Redis error', err));
client.on('ready', ()  => console.log('🟢  Redis connected'));

(async () => {
  try { await client.connect(); }
  catch (err) { console.error('Redis connect failed', err); }
})();

module.exports = client;