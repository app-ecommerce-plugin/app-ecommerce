// backend/utils/embeddings.js
const fetch = require("node-fetch");
const crypto = require("crypto");
const redis = require("./redisClient");
const {
  checkUsageLimit,
  addUsage,
  EMB_COST_ESTIMATE_USD,
} = require("./usageLimit");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const EMB_TTL_SECONDS = Number(
  process.env.EMB_TTL_SECONDS || String(60 * 60 * 24 * 30)
); // 30 días

function normalizeText(s) {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashKey(model, text) {
  const h = crypto.createHash("sha256");
  h.update(model + "::" + text);
  return h.digest("hex");
}

function embCacheKey(model, hash) {
  return `emb:${model}:${hash}`;
}

async function getEmbedding(text) {
  if (!OPENAI_API_KEY) throw new Error("No hay OPENAI_API_KEY configurada");
  // Normalizar y truncar (ahorro de tokens)
  const norm = normalizeText(text).slice(0, 512);
  const h = hashKey(OPENAI_EMBEDDING_MODEL, norm);
  const rkey = embCacheKey(OPENAI_EMBEDDING_MODEL, h);

  // 1) cache
  const cached = await redis.get(rkey);
  if (cached) {
    try {
      const arr = JSON.parse(cached);
      if (Array.isArray(arr)) return arr;
    } catch {
      // sigue a pedir
    }
  }

  // 2) control de cuota antes de llamar
  await checkUsageLimit(EMB_COST_ESTIMATE_USD);

  // 3) llamada a OpenAI
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: norm,
      model: OPENAI_EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const t = await response.text().catch(() => "");
    throw new Error(`OpenAI embeddings error ${response.status}: ${t}`);
  }

  const data = await response.json();
  const vector = data && data.data && data.data[0] && data.data[0].embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Respuesta de OpenAI inválida (sin embedding)");
  }

  // 4) registrar uso y cachear
  await addUsage(EMB_COST_ESTIMATE_USD);
  await redis.set(rkey, JSON.stringify(vector), { EX: EMB_TTL_SECONDS });
  return vector;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

module.exports = { getEmbedding, cosineSimilarity, normalizeText };