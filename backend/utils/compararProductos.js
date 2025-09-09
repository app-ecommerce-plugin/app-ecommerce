// utils/compararProductos.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const redisClient = require("../utils/redisClient");

// (opcional) embeddings para modo "semantic"
let getEmbedding, cosineSimilarity;
try {
  ({ getEmbedding, cosineSimilarity } = require("../utils/embeddings"));
} catch (_) {
  // si no existe utils/embeddings.js, el modo semantic no estará disponible
}

/* ----------------- Helpers ----------------- */
const USE_LOCAL = () => process.env.USE_LOCAL_FILES === "true";

const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function loadLocalProducts(shopDomain) {
  const fp = path.join(__dirname, "..", "external_data", `${shopDomain}.json`);
  const raw = fs.readFileSync(fp, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data.products) ? data.products : [];
}

// Carga el catálogo de competencia (ahora asíncrona):
// 1) Intenta leer el consolidado en Redis: competitors_<shop>
// 2) Fallback a ficheros locales en /external_data
async function loadCompetitors(shopDomain, other = null) {
  // 1) Consolidado en Redis
  try {
    const raw = await redisClient.get(`competitors_${shopDomain}`);
    if (raw) {
      const obj = JSON.parse(raw);
      const items = Array.isArray(obj) ? obj : obj.items || [];
      if (Array.isArray(items) && items.length) return items;
    }
  } catch (e) {
    console.error("Error leyendo consolidado en Redis:", e.message);
  }

  // 2) Fallback a ficheros locales (lo que tenías antes, pero aceptando también arrays planos)
  const base = path.join(__dirname, "..", "external_data");
  const candidates = other
    ? [path.join(base, `${other}.json`)]
    : [
        path.join(base, `${shopDomain}.competitors.json`),
        path.join(base, `${shopDomain}-competitors.json`),
        path.join(base, `${shopDomain}.json`), // fallback
      ];

  for (const fp of candidates) {
    try {
      const raw = fs.readFileSync(fp, "utf8");
      const data = JSON.parse(raw);
      const arr = Array.isArray(data.products)
        ? data.products
        : Array.isArray(data)
        ? data
        : [];
      if (arr.length) return arr;
    } catch (_) {
      /* prueba el siguiente */
    }
  }

  return [];
}

/* ----------------- Datos de tienda (siempre por TÍTULO) ----------------- */
/**
 * Devuelve [{title, price}] de los productos seleccionados de la tienda.
 * - Si hay token y no forzamos local: obtiene desde Shopify (por ID de Shopify que tengamos guardado).
 * - Si estamos en local (o no hay token): resuelve desde JSON local.
 * - Siempre devuelve objetos con {title, price} y la comparación será por título.
 */
async function getSelectedStoreProducts(shopDomain) {
  // leemos selección desde Redis (puede ser [{id,title,price}] o bien IDs)
  const key = `selectedProducts_${shopDomain}`;
  let seleccion = [];
  try {
    const raw = await redisClient.get(key);
    seleccion = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Redis selección err:", e.message);
  }
  if (!Array.isArray(seleccion) || !seleccion.length) return [];

  // Si tenemos ya objetos con título/precio, basta con usarlos
  if (
    typeof seleccion[0] === "object" &&
    seleccion[0] &&
    "title" in seleccion[0]
  ) {
    return seleccion.map((p) => ({
      title: p.title,
      price: Number(p.price) || 0,
    }));
  }

  // Si vinieran IDs "locales", resolvemos por JSON local
  if (USE_LOCAL()) {
    const all = loadLocalProducts(shopDomain);
    return all
      .filter((p) => seleccion.includes(p.id))
      .map((p) => ({ title: p.title, price: Number(p.price) || 0 }));
  }

  // Si hay token Shopify y vinieran IDs de Shopify, los resolvemos por API
  const accessToken = await redisClient.get(`accessToken_${shopDomain}`);
  if (!accessToken) {
    // sin token: último recurso → JSON local
    const all = loadLocalProducts(shopDomain);
    return all
      .filter((p) => seleccion.includes(p.id))
      .map((p) => ({ title: p.title, price: Number(p.price) || 0 }));
  }

  // IDs de Shopify → consultar API
  const productos = [];
  for (const id of seleccion) {
    try {
      const url = `https://${shopDomain}/admin/api/2023-04/products/${id}.json`;
      const resp = await fetch(url, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const p = data.product;
      const price = p?.variants?.[0]?.price ?? 0;
      productos.push({ title: p.title, price: Number(price) || 0 });
    } catch (e) {
      console.error("Shopify product err:", id, e.message);
    }
  }
  return productos;
}

/* ----------------- Estrategias de matching por NOMBRE ----------------- */
function match_exact(storeList, compList) {
  const compMap = new Map();
  for (const c of compList) compMap.set(norm(c.title), c);

  const out = [];
  for (const s of storeList) {
    const k = norm(s.title);
    const hit = compMap.get(k);
    if (hit) {
      const tienda = { title: s.title, price: Number(s.price) || 0 };
      const externo = { title: hit.title, price: Number(hit.price) || 0 };
      out.push({
        tienda,
        externo,
        diferenciaPrecio: +(tienda.price - externo.price).toFixed(2),
      });
    }
  }
  return out;
}

function match_includes(storeList, compList) {
  const compNorm = compList.map((c) => ({
    ...c,
    _k: norm(c.title),
    _price: Number(c.price) || 0,
  }));

  const out = [];
  for (const s of storeList) {
    const a = norm(s.title);

    // candidatos: igualdad o inclusión en ambas direcciones
    const candidates = compNorm.filter(
      (x) => x._k === a || x._k.includes(a) || a.includes(x._k)
    );

    if (candidates.length) {
      // elige SIEMPRE el más barato si hay varios
      const best = candidates.reduce(
        (min, x) => (x._price < min._price ? x : min),
        candidates[0]
      );
      const tienda = { title: s.title, price: Number(s.price) || 0 };
      const externo = { title: best.title, price: best._price };
      out.push({
        tienda,
        externo,
        diferenciaPrecio: +(tienda.price - externo.price).toFixed(2),
      });
    }
  }
  return out;
}

function jaccardTokens(a, b) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}

function match_fuzzy(storeList, compList, threshold = 0.6) {
  const out = [];
  for (const s of storeList) {
    let best = null,
      bestScore = 0;
    for (const c of compList) {
      const score = jaccardTokens(s.title, c.title);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= threshold) {
      const tienda = { title: s.title, price: Number(s.price) || 0 };
      const externo = { title: best.title, price: Number(best.price) || 0 };
      out.push({
        tienda,
        externo,
        diferenciaPrecio: +(tienda.price - externo.price).toFixed(2),
        score: +bestScore.toFixed(3),
      });
    }
  }
  return out;
}

async function match_semantic(storeList, compList, threshold = 0.8) {
  if (!getEmbedding || !cosineSimilarity) {
    throw new Error(
      "Modo semantic no disponible: falta utils/embeddings.js o OPENAI_API_KEY"
    );
  }
  // embeddings + caché Redis (lo hace getEmbedding)
  const compEmb = [];
  for (const c of compList) {
    compEmb.push({ c, emb: await getEmbedding(c.title) });
  }

  const out = [];
  for (const s of storeList) {
    const embS = await getEmbedding(s.title);
    let best = null,
      bestScore = -1;
    for (const { c, emb } of compEmb) {
      const score = cosineSimilarity(embS, emb);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= threshold) {
      const tienda = { title: s.title, price: Number(s.price) || 0 };
      const externo = { title: best.title, price: Number(best.price) || 0 };
      out.push({
        tienda,
        externo,
        diferenciaPrecio: +(tienda.price - externo.price).toFixed(2),
        score: +bestScore.toFixed(3),
      });
    }
  }
  return out;
}

/* ----------------- Orquestador ----------------- */
async function compararProductos(
  shopDomain,
  { mode = "exact", threshold, other = null } = {}
) {
  // 1) datos tienda (siempre {title,price})
  const storeList = await getSelectedStoreProducts(shopDomain);
  if (!storeList.length) return [];

  // 2) datos competencia
  // AHORA (asíncrona)
  const compList = await loadCompetitors(shopDomain, other);
  if (!compList.length) return [];

  // 3) matching por NOMBRE
  switch (mode) {
    case "exact":
      return match_exact(storeList, compList);
    case "includes":
      return match_includes(storeList, compList);
    case "fuzzy":
      return match_fuzzy(storeList, compList, threshold ?? 0.6);
    case "semantic":
      return await match_semantic(storeList, compList, threshold ?? 0.8);
    default:
      return match_exact(storeList, compList);
  }
}

module.exports = compararProductos;
