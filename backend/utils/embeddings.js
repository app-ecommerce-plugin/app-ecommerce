// backend/utils/embeddings.js
const fetch = require("node-fetch");
const { checkUsageLimit } = require("./usageLimit");
const openaiApiKey = process.env.OPENAI_API_KEY;

async function getEmbedding(text) {
  // Verificar cuota antes de llamar a OpenAI
  await checkUsageLimit();
  if (!openaiApiKey) {
    throw new Error("No hay API Key de OpenAI configurada");
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({ input: text, model: "text-embedding-ada-002" }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  const data = await response.json();
  return data.data[0]?.embedding || [];
}

/** Producto punto y norma para coseno */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return -1;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : -1;
}

/** Llama al endpoint de OpenAI con caché Redis */
async function getEmbedding(rawText) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  const text = truncateForEmbedding(norm(rawText));
  const key = `emb:${OPENAI_EMBEDDING_MODEL}:${sha256(text)}`;

  // 1) cache
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      const arr = JSON.parse(cached);
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {
    console.error("Redis get emb err:", e.message);
  }

  // 2) llamada a OpenAI
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenAI embeddings HTTP ${resp.status} - ${body}`);
  }

  const data = await resp.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Embedding inválido");

  // 3) guarda en caché
  try {
    await redisClient.set(key, JSON.stringify(vec), { EX: EMB_TTL_SECONDS });
  } catch (e) {
    console.error("Redis set emb err:", e.message);
  }

  return vec;
}

module.exports = { getEmbedding, cosineSimilarity };
