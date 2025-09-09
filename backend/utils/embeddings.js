// utils/embeddings.js
const crypto = require("crypto");
const fetch = require("node-fetch"); // Node 18+ también tiene fetch global, pero así mantenemos homogeneidad
const redisClient = require("./redisClient");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
// TTL caché (segundos). 30 días por defecto.
const EMB_TTL_SECONDS = Number(
  process.env.EMB_TTL_SECONDS || 60 * 60 * 24 * 30
);

/** Normaliza texto para claves y para evitar duplicados triviales */
function norm(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Corta el texto para no enviar párrafos larguísimos al embedding (ahorro y límites) */
function truncateForEmbedding(s, maxChars = 512) {
  s = String(s || "");
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
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
