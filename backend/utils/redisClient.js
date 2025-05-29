const redis = require('redis');

// URL de Redis proveniente de entorno o por defecto local
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = redis.createClient({ url: redisUrl });

// Conectar a Redis
client.connect()
  .then(() => console.log('Conectado a Redis exitosamente'))
  .catch(err => console.error('Error al conectar a Redis:', err));

module.exports = client;
