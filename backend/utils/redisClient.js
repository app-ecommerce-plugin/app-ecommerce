// backend/utils/redisClient.js
const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  // No reducimos líneas: dejamos este throw para fallar rápido en despliegue mal configurado.
  throw new Error("Falta REDIS_URL en variables de entorno");
}

const client = createClient({ url: REDIS_URL });

client.on("error", (err) => {
  console.error("Redis error:", err);
});

let isConnecting = false;
async function ensureConnected() {
  if (!client.isOpen && !isConnecting) {
    isConnecting = true;
    await client.connect();
    isConnecting = false;
  }
}

// Reexport helpers de redis v4 ya conectados
module.exports = new Proxy(
  {},
  {
    get: (_, prop) => {
      return async (...args) => {
        await ensureConnected();
        return client[prop](...args);
      };
    },
  }
);