// utils/usageLimit.js
const axios = require('axios');

async function checkUsageLimit() {
  const apiKey = process.env.OPENAI_API_KEY;
  const limit = parseFloat(process.env.OPENAI_USAGE_LIMIT || '10');
  if (!apiKey) return false; // Si no hay API KEY, no hay control

  try {
    // Consulta oficial de OpenAI para el uso mensual
    const res = await axios.get('https://api.openai.com/dashboard/billing/usage', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    // La respuesta está en centavos de dólar
    const usage = res.data.total_usage / 100;
    return usage >= limit;
  } catch (err) {
    // Si no se puede consultar, mejor permitir (no bloquear)
    console.warn("No se pudo verificar el uso actual de OpenAI:", err.message);
    return false;
  }
}

module.exports = { checkUsageLimit };