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
  return Array.isArray(data.products)
    ? data.products
    : Array.isArray(data)
    ? data
    : [];
}

// 1) intenta consolidado en Redis (competitors_<shop>)
// 2) fallback a ficheros locales en /external_data
async function loadCompetitors(shopDomain, other = null) {
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

  const base = path.join(__dirname, "..", "external_data");
  const candidates = other
    ? [path.join(base, `${other}.json`)]
    : [
        path.join(base, `${shopDomain}.competitors.json`),
        path.join(base, `${shopDomain}-competitors.json`),
        path.join(base, `${shopDomain}.json`), // último fallback
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
    } catch (_) {}
  }
  return [];
}

/* ----------------- Datos de tienda (siempre por TÍTULO) ----------------- */
async function getSelectedStoreProducts(shopDomain) {
  const key = `selectedProducts_${shopDomain}`;
  let seleccion = [];
  try {
    const raw = await redisClient.get(key);
    seleccion = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Redis selección err:", e.message);
  }
  if (!Array.isArray(seleccion) || !seleccion.length) return [];

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

  if (USE_LOCAL()) {
    const all = loadLocalProducts(shopDomain);
    return all
      .filter((p) => seleccion.includes(p.id))
      .map((p) => ({ title: p.title, price: Number(p.price) || 0 }));
  }

  const accessToken = await redisClient.get(`accessToken_${shopDomain}`);
  if (!accessToken) {
    const all = loadLocalProducts(shopDomain);
    return all
      .filter((p) => seleccion.includes(p.id))
      .map((p) => ({ title: p.title, price: Number(p.price) || 0 }));
  }

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
        match_method: "exact",
        score: 1,
      });
    }
  }
  return out;
}

// includes: elige el MÁS BARATO entre los candidatos
function match_includes(storeList, compList) {
  const compNorm = compList.map((c) => ({
    ...c,
    _k: norm(c.title),
    _price: Number(c.price) || 0,
  }));

  const out = [];
  for (const s of storeList) {
    const a = norm(s.title);
    const candidates = compNorm.filter(
      (x) => x._k === a || x._k.includes(a) || a.includes(x._k)
    );
    if (candidates.length) {
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
        match_method: "includes",
        score: 1,
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
        match_method: "fuzzy",
        score: +bestScore.toFixed(3),
      });
    }
  }
  return out;
}

async function match_semantic(storeList, compList, threshold = 0.8) {
  // Si no hay módulo o clave, no rompemos: devolvemos []
  if (!getEmbedding || !cosineSimilarity || !process.env.OPENAI_API_KEY)
    return [];
  try {
    // dedup títulos de competencia para ahorrar llamadas
    const seen = new Set();
    const compUnique = [];
    for (const c of compList) {
      const k = norm(c.title);
      if (!seen.has(k)) {
        seen.add(k);
        compUnique.push(c);
      }
    }

    // precálculo embeddings competencia
    const compEmb = [];
    for (const c of compUnique) {
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
          match_method: "semantic",
          score: +bestScore.toFixed(3),
        });
      }
    }
    return out;
  } catch (e) {
    console.warn("Semantic deshabilitado por error de embeddings:", e.message);
    return []; // degradamos silenciosamente
  }
}

/* ------- AUTO: exact → includes → fuzzy → semantic (si habilitado) ------- */
async function match_auto(
  storeList,
  compList,
  { fuzzyThreshold = 0.6, semanticThreshold = 0.8, allowSemantic = true } = {}
) {
  const out = [];

  const compMap = new Map(compList.map((c) => [norm(c.title), c]));
  const compNorm = compList.map((c) => ({
    ...c,
    _k: norm(c.title),
    _price: Number(c.price) || 0,
  }));

  // Prepara semantic SOLO si se pide y hay clave, pero sin romper si falla
  let semanticEnabled = false;
  let compEmb = null; // no lo usamos aquí: delegamos en match_semantic (que ya maneja errores)
  if (
    allowSemantic &&
    getEmbedding &&
    cosineSimilarity &&
    process.env.OPENAI_API_KEY === "true" // <- OJO: esto estaría mal; mejor usar !!process.env.OPENAI_API_KEY
  ) {
    semanticEnabled = true;
  }

  for (const s of storeList) {
    const tienda = { title: s.title, price: Number(s.price) || 0 };
    const key = norm(s.title);
    let externo = null,
      match_method = null,
      score = null;

    // exact
    const exactHit = compMap.get(key);
    if (exactHit) {
      externo = { title: exactHit.title, price: Number(exactHit.price) || 0 };
      match_method = "exact";
      score = 1;
    }

    // includes (el más barato)
    if (!externo) {
      const candidates = compNorm.filter(
        (x) => x._k === key || x._k.includes(key) || key.includes(x._k)
      );
      if (candidates.length) {
        const best = candidates.reduce(
          (min, x) => (x._price < min._price ? x : min),
          candidates[0]
        );
        externo = { title: best.title, price: best._price };
        match_method = "includes";
        score = 1;
      }
    }

    // fuzzy
    if (!externo) {
      let best = null,
        bestScore = 0;
      for (const c of compList) {
        const sc = jaccardTokens(s.title, c.title);
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      if (best && bestScore >= fuzzyThreshold) {
        externo = { title: best.title, price: Number(best.price) || 0 };
        match_method = "fuzzy";
        score = +bestScore.toFixed(3);
      }
    }

    // semantic (solo si está habilitado y las previas no han casado)
    if (!externo && allowSemantic) {
      try {
        const sem = await match_semantic([s], compList, semanticThreshold);
        if (sem.length) {
          externo = sem[0].externo;
          match_method = "semantic";
          score = sem[0].score ?? null;
        }
      } catch (e) {
        console.warn("Saltando semantic en AUTO por error:", e.message);
      }
    }

    if (externo) {
      out.push({
        tienda,
        externo,
        diferenciaPrecio: +(tienda.price - externo.price).toFixed(2),
        match_method,
        score,
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
  const storeList = await getSelectedStoreProducts(shopDomain);
  if (!storeList.length) return [];

  const compList = await loadCompetitors(shopDomain, other);
  if (!compList.length) return [];

  switch (mode) {
    case "exact":
      return match_exact(storeList, compList);
    case "includes":
      return match_includes(storeList, compList);
    case "fuzzy":
      return match_fuzzy(storeList, compList, threshold ?? 0.6);
    case "semantic":
      // IMPORTANTE: no romper si falta clave o hay error
      try {
        const t = Number(process.env.SEMANTIC_THRESHOLD || threshold || 0.8);
        return await match_semantic(storeList, compList, t);
      } catch (e) {
        console.warn("Modo semantic deshabilitado por error:", e.message);
        return []; // degradación silenciosa
      }
    case "auto": {
      const allowSemantic =
        process.env.ENABLE_SEMANTIC === "true" && !!process.env.OPENAI_API_KEY;
      const fuzzyThreshold = threshold ?? 0.6;
      const semanticThreshold = Number(process.env.SEMANTIC_THRESHOLD || 0.8);
      return await match_auto(storeList, compList, {
        fuzzyThreshold,
        semanticThreshold,
        allowSemantic,
      });
    }
    default:
      return match_exact(storeList, compList);
  }
}

module.exports = compararProductos;