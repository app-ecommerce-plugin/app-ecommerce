// utils/embeddings.js
const axios = require('axios');
const crypto = require('crypto');
const { checkUsageLimit } = require('./usageLimit');

const apiKey = process.env.OPENAI_API_KEY;
const cache = new Map();

async function getEmbedding(text) {
  if (!apiKey) throw new Error("No hay clave OPENAI_API_KEY configurada");
  if (await checkUsageLimit()) {
    throw new Error("🚨 Se ha alcanzado el límite mensual de gasto en la API de OpenAI");
  }

  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (cache.has(hash)) return cache.get(hash);

  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    { input: text, model: 'text-embedding-ada-002' },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const embedding = response.data.data[0].embedding;
  cache.set(hash, embedding);
  return embedding;
}

function cosineSimilarity(vec1, vec2) {
  const dot = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
  const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
  return dot / (norm1 * norm2);
}

async function getCachedEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (cache.has(hash)) return cache.get(hash);
  const emb = await getEmbedding(text);
  cache.set(hash, emb);
  return emb;
}

module.exports = { getEmbedding, getCachedEmbedding, cosineSimilarity };