// backend/routes/comparison.js
const express = require("express");
const fetch = require("node-fetch");
const redis = require("../utils/redisClient");
const { validateShopParam } = require("../middleware/shopValidation");
const { ensureShopAccess } = require("../middleware/ensureShopAccess");
const { getAccessTokenAuto } = require("../utils/crypto");

const router = express.Router();

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

const keyPending = (shop) => `pendingRecommendations_${shop}`;
const keyCompetitors = (shop) => `competitorsCatalog_${shop}`; // opcional: si en el futuro ingestamos

function normalizeTitle(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLinkHeader(link) {
  if (!link) return {};
  const parts = link.split(",");
  const out = {};
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

async function fetchAllProducts(shop, token) {
  let url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
  const products = [];

  while (url) {
    const resp = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify products error ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    products.push(...(data.products || []));
    const link = resp.headers.get("link");
    const parsed = parseLinkHeader(link);
    url = parsed.next || null;
  }

  return products.map((p) => {
    const v = (p.variants && p.variants[0]) || {};
    return {
      id: p.id,
      title: p.title,
      price: v.price ? Number(v.price) : null,
      variantId: v.id || null,
    };
  });
}

// ---- Ping
router.get("/comparison/ping", (_req, res) =>
  res.json({ ok: true, service: "comparison" })
);

/**
 * GET /comparison?shop=...&mode=title|exact|includes|fuzzy
 * Fuente de competencia:
 *  - Redis competitorsCatalog_<shop> (si existe)  => [{title, price}, ...]
 *  - Redis pendingRecommendations_<shop>          => items de review (title, competitorPrice)
 */
router.get(
  "/comparison",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const mode = String(req.query.mode || "title"); // title|exact|includes|fuzzy
      const token = await getAccessTokenAuto(shop);

      // 1) Productos propios
      const own = await fetchAllProducts(shop, token);

      // 2) Fuente de competencia
      let competitors = [];
      const rawC = await redis.get(keyCompetitors(shop));
      if (rawC) {
        try {
          const j = JSON.parse(rawC);
          if (Array.isArray(j)) {
            competitors = j
              .filter((x) => x && x.title)
              .map((x) => ({
                title: String(x.title),
                price: Number(x.price) || null,
              }));
          }
        } catch {}
      }
      if (competitors.length === 0) {
        const rawP = await redis.get(keyPending(shop));
        if (rawP) {
          try {
            const pend = JSON.parse(rawP);
            const items = Array.isArray(pend?.items) ? pend.items : [];
            competitors = items.map((it) => ({
              title: String(it.title),
              price: Number(it.competitorPrice) || null,
            }));
          } catch {}
        }
      }

      // 3) Índices por título
      const idxOwn = new Map();
      for (const p of own) idxOwn.set(normalizeTitle(p.title), p);

      const idxComp = new Map();
      for (const c of competitors) idxComp.set(normalizeTitle(c.title), c);

      // 4) Matching
      const rows = [];
      for (const p of own) {
        const key = normalizeTitle(p.title);
        let competitor = null;
        let match_method = "none";
        let score = 0;

        if (idxComp.has(key)) {
          competitor = idxComp.get(key);
          match_method = mode === "exact" ? "exact" : "title";
          score = 1;
        } else if (mode === "includes") {
          // búsqueda simple por inclusión
          for (const [ckey, cv] of idxComp.entries()) {
            if (ckey.includes(key) || key.includes(ckey)) {
              competitor = cv;
              match_method = "includes";
              score = 0.7;
              break;
            }
          }
        } else if (mode === "fuzzy") {
          // fuzzy minimalista: intersección de tokens
          const ownTokens = new Set(key.split(" "));
          let best = null;
          let bestScore = 0;
          for (const [ckey, cv] of idxComp.entries()) {
            const cTok = new Set(ckey.split(" "));
            let inter = 0;
            for (const t of ownTokens) if (cTok.has(t)) inter++;
            const s = inter / Math.max(ownTokens.size, 1);
            if (s > bestScore) {
              bestScore = s;
              best = cv;
            }
          }
          if (best && bestScore >= 0.5) {
            competitor = best;
            match_method = "fuzzy";
            score = Number(bestScore.toFixed(2));
          }
        }

        rows.push({
          title: p.title,
          currentPrice: p.price,
          competitorPrice: competitor?.price ?? null,
          match_method,
          score,
          variantId: p.variantId || null,
        });
      }

      res.json({ shop, mode, items: rows });
    } catch (err) {
      console.error("GET /comparison error:", err);
      res.status(500).json({ error: "No se pudo generar comparación" });
    }
  }
);

module.exports = router;