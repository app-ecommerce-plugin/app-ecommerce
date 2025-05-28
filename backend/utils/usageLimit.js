/**
 *  ʟɪᴍɪᴛᴀᴅᴏʀ ᴅᴇ ɢᴀsᴛᴏ – simplificado:
 *  guarda un contador en Redis y evita superar OPENAI_USAGE_LIMIT (USD) al mes.
 *  Para un control más estricto habría que consultar la API de OpenAI usage.
 */
const redisClient = require('./redisClient');

const LIMIT = parseFloat(process.env.OPENAI_USAGE_LIMIT || '10'); // USD

async function checkUsageLimit() {
  const key = `openai:usage:${new Date().getUTCFullYear()}-${new Date().getUTCMonth()}`;
  const used = parseFloat(await redisClient.get(key) || '0');

  if (used >= LIMIT) {
    throw new Error('🚨 Se alcanzó el límite mensual de gasto OpenAI');
  }

  // Simulación rápida: +0.002 USD por embedding
  await redisClient.set(key, (used + 0.002).toFixed(3));
}

module.exports = { checkUsageLimit };