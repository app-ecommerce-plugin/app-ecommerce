// backend/routes/recommend.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const redisClient = require("../utils/redisClient");

const compararProductos = require("../utils/compararProductos"); // ya lo tienes
const priceEngine = require("../engine/priceEngine"); // motor de sugerencias

// Helpers Redis keys
const keyPending = (shop) => `pendingRecommendations_${shop}`;
const keyHistory = (shop) => `recommendHistory_${shop}`;
const tokenKey = (shop) => `accessToken_${shop}`;

// ---------- Shopify apply price (directo) ----------
async function applyPricesToShopify(shop, items) {
  const token = await redisClient.get(tokenKey(shop));
  if (!token) throw new Error(`No hay token para ${shop}`);

  const results = [];
  for (const it of items) {
    const variantId = String(it.variantId);
    const newPrice = String(it.newPrice);
    try {
      const url = `https://${shop}/admin/api/2023-04/variants/${variantId}.json`;
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variant: { id: variantId, price: newPrice } }),
      });
      results.push({
        variantId,
        newPrice,
        ok: resp.ok,
        status: resp.status,
      });
    } catch (e) {
      results.push({
        variantId,
        newPrice,
        ok: false,
        status: 0,
        error: e.message,
      });
    }
  }
  return results;
}

// ---------- 0) Calcular (runtime, sin persistir) ----------
router.get("/recommend", async (req, res) => {
  try {
    const shop = req.query.shop;
    const mode = req.query.mode || "auto";
    const undercutPct = req.query.undercutPct
      ? Number(req.query.undercutPct)
      : 0;
    const minMarginPct = req.query.minMarginPct
      ? Number(req.query.minMarginPct)
      : 0;

    if (!shop) return res.status(400).json({ error: "Falta shop" });

    const matches = await compararProductos(shop, { mode });
    const recommendations = priceEngine(matches, { undercutPct, minMarginPct });

    res.json({ recommendations });
  } catch (err) {
    console.error("Error recommend:", err);
    res.status(500).json({ error: "No se pudo calcular recomendaciones" });
  }
});

// ---------- 1) review: calcular y GUARDAR como pendientes ----------
router.post("/recommend/review", async (req, res) => {
  try {
    const {
      shop,
      mode = "auto",
      undercutPct = 0,
      minMarginPct = 0,
    } = req.body || {};
    if (!shop) return res.status(400).json({ error: "Falta shop" });

    const matches = await compararProductos(shop, { mode });
    const recommendations = priceEngine(matches, { undercutPct, minMarginPct });

    const pending = {
      shop,
      createdAt: Date.now(),
      mode,
      undercutPct,
      minMarginPct,
      items: recommendations.map((r) => ({
        title: r.title,
        currentPrice: r.currentPrice,
        competitorPrice: r.competitorPrice,
        suggestedPrice: r.suggestedPrice,
        match_method: r.match_method,
        score: r.score,
        // El front resolverá variantId con /shopify/products (unir por title)
        // o si ya los tienes guardados en selección, puedes añadirlo aquí.
      })),
    };

    await redisClient.set(keyPending(shop), JSON.stringify(pending), {
      EX: 60 * 60 * 4,
    }); // 4h
    res.json({ success: true, pending });
  } catch (err) {
    console.error("Error review:", err);
    res.status(500).json({ error: "No se pudo generar revisión" });
  }
});

// ---------- 2) pending: leer pendientes ----------
router.get("/recommend/pending", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) return res.status(400).json({ error: "Falta shop" });
    const raw = await redisClient.get(keyPending(shop));
    const pending = raw ? JSON.parse(raw) : { shop, items: [] };
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: "No se pudo leer pendientes" });
  }
});

// ---------- 3) approve: aplicar subset seleccionado ----------
router.post("/recommend/approve", async (req, res) => {
  try {
    const { shop, items } = req.body || {};
    if (!shop || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Parámetros inválidos" });
    }
    // items: [{variantId, newPrice, title?}]

    // aplicar
    const results = await applyPricesToShopify(shop, items);

    // limpiar aplicados del pending + guardar en history
    const rawPend = await redisClient.get(keyPending(shop));
    const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

    const appliedVariantIds = new Set(items.map((i) => String(i.variantId)));
    pending.items = (pending.items || []).filter((p) => {
      // si el front añadió variantId a cada pendiente, puedes filtrarlo por title o variantId
      if (p.variantId) return !appliedVariantIds.has(String(p.variantId));
      // fallback: si no hay variantId en pending, filtramos por título
      const matchTitle = items.find((i) => i.title && i.title === p.title);
      return !matchTitle;
    });

    await redisClient.set(keyPending(shop), JSON.stringify(pending), {
      EX: 60 * 60 * 4,
    });

    const entry = { ts: Date.now(), action: "approve", items: results };
    await redisClient.lPush(keyHistory(shop), JSON.stringify(entry));
    await redisClient.lTrim(keyHistory(shop), 0, 199); // guarda últimas 200 acciones

    res.json({ updated: results });
  } catch (err) {
    console.error("Error approve:", err);
    res.status(500).json({ error: "No se pudo aprobar/aplicar" });
  }
});

// ---------- 4) reject: descartar subset ----------
router.post("/recommend/reject", async (req, res) => {
  try {
    const { shop, variantIds = [], titles = [] } = req.body || {};
    if (!shop || (!variantIds.length && !titles.length)) {
      return res.status(400).json({ error: "Parámetros inválidos" });
    }

    const rawPend = await redisClient.get(keyPending(shop));
    const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

    const ids = new Set(variantIds.map(String));
    const tts = new Set(titles);

    pending.items = (pending.items || []).filter((p) => {
      if (p.variantId && ids.size) return !ids.has(String(p.variantId));
      if (tts.size) return !tts.has(p.title);
      return true;
    });

    await redisClient.set(keyPending(shop), JSON.stringify(pending), {
      EX: 60 * 60 * 4,
    });

    const entry = { ts: Date.now(), action: "reject", variantIds, titles };
    await redisClient.lPush(keyHistory(shop), JSON.stringify(entry));
    await redisClient.lTrim(keyHistory(shop), 0, 199);

    res.json({ success: true, pendingCount: pending.items.length });
  } catch (err) {
    console.error("Error reject:", err);
    res.status(500).json({ error: "No se pudo rechazar" });
  }
});

// ---------- 5) history: últimas acciones ----------
router.get("/recommend/history", async (req, res) => {
  try {
    const { shop, limit = 50 } = req.query;
    if (!shop) return res.status(400).json({ error: "Falta shop" });
    const arr = await redisClient.lRange(
      keyHistory(shop),
      0,
      Number(limit) - 1
    );
    const items = arr
      .map((x) => {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "No se pudo leer historial" });
  }
});

module.exports = router;
