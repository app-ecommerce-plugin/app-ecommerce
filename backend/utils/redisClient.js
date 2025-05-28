// backend/utils/redisClient.js
const { createClient } = require("redis");

const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient
  .connect()
  .then(() => console.log("Conectado a Redis correctamente"))
  .catch((err) => console.error("Error al conectar Redis:", err));

module.exports = redisClient;