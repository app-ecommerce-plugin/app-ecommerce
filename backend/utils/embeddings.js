const crypto  = require('crypto');
const { Configuration, OpenAIApi } = require('openai');
const redisClient = require('./redisClient');
const { checkUsageLimit } = require('./usageLimit');

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

/* ----------  Helpers  ---------- */
const cacheKey = (txt) =>
  'emb:' + crypto.createHash('sha256').update(txt).digest('hex');

/* Obtiene embedding (con caché Redis) */
async function getEmbedding(text) {
  const key = cacheKey(text);
  const cached = await redisClient.get(key);
  if (cached) return JSON.parse(cached);

  await checkUsageLimit(); // lanza error si se supera el límite

  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  const vector = data.data[0].embedding;

  await redisClient.set(key, JSON.stringify(vector), { EX: 86400 });
  return vector;
}

/* Similitud coseno entre dos vectores */
function cosineSimilarity(a, b) {
  const dot   = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA  = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB  = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

module.exports = { getEmbedding, cosineSimilarity };