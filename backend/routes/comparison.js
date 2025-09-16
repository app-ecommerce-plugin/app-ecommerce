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
const keyCompetitors = (shop) => `competitorsCatalog_${shop}`; // opcional: ingesta futura
const keySelected = (shop) => `selectedProducts_${shop}`; // selección guardada desde el frontend

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
 * GET /comparison
 * Query:
 *  - shop: string (req)
 *  - mode: title|exact|includes|fuzzy (opt, def=title)
 *  - only=selected => filtra por selección guardada en Redis (selectedProducts_<shop>)
 *  - ids=ID1,ID2,... => filtra por esos productId (números Shopify)
 */
router.get(
  "/comparison",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const mode = String(req.query.mode || "title");
      const token = await getAccessTokenAuto(shop);

      // 1) Productos propios
      let own = await fetchAllProducts(shop, token);

      // 1.a) Filtrado por ids explícitos
      if (req.query.ids) {
        const ids = String(req.query.ids)
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isFinite(n));
        if (ids.length) {
          const idSet = new Set(ids);
          own = own.filter((p) => idSet.has(p.id));
        }
      }

      // 1.b) Filtrado por selección guardada
      const onlySelected =
        String(req.query.only || "").toLowerCase() === "selected" ||
        req.query.selected === "1" ||
        req.query.only === "1";
      if (onlySelected) {
        const rawSel = await redis.get(keySelected(shop));
        if (rawSel) {
          try {
            const arr = JSON.parse(rawSel);
            const ids = Array.isArray(arr)
              ? arr.map((p) => Number(p.id)).filter(Number.isFinite)
              : [];
            if (ids.length) {
              const idSet = new Set(ids);
              own = own.filter((p) => idSet.has(p.id));
            } else {
              // sin ids válidos ⇒ lista vacía
              own = [];
            }
          } catch {
            own = [];
          }
        } else {
          own = [];
        }
      }

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
          for (const [ckey, cv] of idxComp.entries()) {
            if (ckey.includes(key) || key.includes(ckey)) {
              competitor = cv;
              match_method = "includes";
              score = 0.7;
              break;
            }
          }
        } else if (mode === "fuzzy") {
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

      res.json({
        shop,
        mode,
        filteredBy: onlySelected ? "selected" : req.query.ids ? "ids" : "none",
        items: rows,
      });
    } catch (err) {
      console.error("GET /comparison error:", err);
      res.status(500).json({ error: "No se pudo generar comparación" });
    }
  }
);

module.exports = router;