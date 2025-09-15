// backend/routes/recommend.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const redisClient = require("../utils/redisClient");

const compararProductos = require("../utils/compararProductos");
const priceEngine = require("../engine/priceEngine");

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
        // El front resolverá variantId con /shopify/products
      })),
    };

    await redisClient.set(keyPending(shop), JSON.stringify(pending), {
      EX: 60 * 60 * 4,
    }); // 4h TTL
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
    // items: [{ variantId, newPrice, title }]

    // Aplicar precios en Shopify
    const results = await applyPricesToShopify(shop, items);

    // Remover del pending aquellos aplicados exitosamente y registrar en historial
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      await redisClient.watch(keyPending(shop));
      const rawPend = await redisClient.get(keyPending(shop));
      const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

      // Filtrar del pending los items aplicados con éxito (ok true)
      const successItems = results.filter((r) => r.ok);
      if (successItems.length) {
        const appliedIds = new Set(
          successItems.map((r) => String(r.variantId))
        );
        pending.items = (pending.items || []).filter((p) => {
          if (p.variantId) {
            return !appliedIds.has(String(p.variantId));
          }
          // Si pending no tenía variantId, filtrar por título
          return !successItems.find((it) => it.title === p.title);
        });
      }

      // Preparar entrada de historial
      const entry = { ts: Date.now(), action: "approve", items: results };
      const multi = redisClient.multi();
      multi.set(keyPending(shop), JSON.stringify(pending), { EX: 60 * 60 * 4 });
      multi.lPush(keyHistory(shop), JSON.stringify(entry));
      multi.lTrim(keyHistory(shop), 0, 199);
      const execRes = await multi.exec();
      if (execRes === null) {
        // Si ocurrió una modificación concurrente, reintentar
        continue;
      }
      // Éxito: salir del bucle
      break;
    }

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

    // Remover del pending los ítems indicados y registrar en historial
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      await redisClient.watch(keyPending(shop));
      const rawPend = await redisClient.get(keyPending(shop));
      const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

      pending.items = (pending.items || []).filter((p) => {
        if (p.variantId && variantIds.length) {
          return !variantIds.map(String).includes(String(p.variantId));
        }
        if (titles.length) {
          return !titles.includes(p.title);
        }
        return true;
      });

      const entry = { ts: Date.now(), action: "reject", variantIds, titles };
      const multi = redisClient.multi();
      multi.set(keyPending(shop), JSON.stringify(pending), { EX: 60 * 60 * 4 });
      multi.lPush(keyHistory(shop), JSON.stringify(entry));
      multi.lTrim(keyHistory(shop), 0, 199);
      const execRes = await multi.exec();
      if (execRes === null) {
        continue; // reintentar si hubo cambio concurrente
      }
      break;
    }

    res.json({
      success: true,
      pendingCount: (await redisClient.get(keyPending(shop)))
        ? JSON.parse(await redisClient.get(keyPending(shop))).items.length
        : 0,
    });
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