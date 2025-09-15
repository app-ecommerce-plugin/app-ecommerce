// backend/utils/usageLimit.js
const redis = require("./redisClient");

const OPENAI_USAGE_LIMIT = Number(process.env.OPENAI_USAGE_LIMIT || "10"); // USD/mes
const USAGE_KEY = "openai_usage_usd_current_month";

// Estimación por embedding (ajustable). Si usas batching, reparte el coste por texto.
const EMB_COST_ESTIMATE_USD = Number(
  process.env.EMB_COST_ESTIMATE_USD || "0.0001"
);

// Mes actual YYYY-MM para particionar uso
function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function redisKey() {
  return `${USAGE_KEY}:${monthKey()}`;
}

async function getUsage() {
  const raw = await redis.get(redisKey());
  return raw ? Number(raw) : 0;
}

// Lanza error si, añadiendo 'amount', se supera el límite
async function checkUsageLimit(amount = EMB_COST_ESTIMATE_USD) {
  const used = await getUsage();
  if (used + amount > OPENAI_USAGE_LIMIT) {
    throw new Error(
      `Límite de uso de OpenAI excedido: ${used.toFixed(
        4
      )} USD / ${OPENAI_USAGE_LIMIT} USD`
    );
  }
}

async function addUsage(amount = EMB_COST_ESTIMATE_USD) {
  // Incremento simple (sin transacción, precisión suficiente para este caso)
  await redis.incrByFloat(redisKey(), amount);
  // Opcional: TTL al final de mes. Aquí no reducimos líneas; si deseas, añade una tarea mensual de reset.
}

module.exports = { checkUsageLimit, addUsage, getUsage, EMB_COST_ESTIMATE_USD };