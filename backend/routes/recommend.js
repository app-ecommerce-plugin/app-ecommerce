// backend/routes/recommend.js
const express = require("express");
const fetch = require("node-fetch");
const Joi = require("joi");

const redis = require("../utils/redisClient");
const { validateShopParam } = require("../middleware/shopValidation");
const {
  ensureShopAccess,
  tokenKey,
} = require("../middleware/ensureShopAccess");
const { decrypt } = require("../utils/crypto");

const compararProductos = require("../utils/compararProductos");
const priceEngine = require("../engine/priceEngine");

const router = express.Router();

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

const keyPending = (shop) => `pendingRecommendations_${shop}`;
const keyHistory = (shop) => `recommendHistory_${shop}`;

// ---- helpers
async function getDecryptedToken(shop) {
  const enc = await redis.get(tokenKey(shop));
  if (!enc) throw new Error("Token no encontrado");
  return decrypt(enc);
}

async function applyPricesToShopify(shop, items) {
  const token = await getDecryptedToken(shop);
  const results = [];
  for (const it of items) {
    const variantId = String(it.variantId);
    const newPrice = String(it.newPrice);
    try {
      const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/variants/${variantId}.json`;
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variant: { id: variantId, price: newPrice } }),
      });
      const ok = resp.ok;
      const status = resp.status;
      let errorText = null;
      if (!ok) {
        errorText = await resp.text().catch(() => null);
      }
      results.push({
        variantId,
        newPrice,
        title: it.title,
        ok,
        status,
        error: errorText,
      });
    } catch (e) {
      results.push({
        variantId,
        newPrice,
        title: it.title,
        ok: false,
        status: 0,
        error: e.message,
      });
    }
  }
  return results;
}

// ---- schemas
const reviewSchema = Joi.object({
  shop: Joi.string().required(),
  mode: Joi.string()
    .valid("auto", "exact", "includes", "fuzzy", "semantic")
    .default("auto"),
  undercutPct: Joi.number().min(0).max(90).default(5),
  minMarginPct: Joi.number().min(0).max(90).default(3),
});

const approveSchema = Joi.object({
  shop: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        variantId: Joi.alternatives(Joi.string(), Joi.number()).required(),
        newPrice: Joi.alternatives(Joi.string(), Joi.number()).required(),
        title: Joi.string().allow(""),
      })
    )
    .min(1)
    .required(),
});

const rejectSchema = Joi.object({
  shop: Joi.string().required(),
  variantIds: Joi.array()
    .items(Joi.alternatives(Joi.string(), Joi.number()))
    .default([]),
  titles: Joi.array().items(Joi.string()).default([]),
});

// ---- 0) calcular en vivo (sin persistir)
router.get(
  "/recommend",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const mode = req.query.mode || "auto";
      const undercutPct = req.query.undercutPct
        ? Number(req.query.undercutPct)
        : 5;
      const minMarginPct = req.query.minMarginPct
        ? Number(req.query.minMarginPct)
        : 3;
      const matches = await compararProductos(shop, { mode });
      const recommendations = priceEngine(matches, {
        undercutPct,
        minMarginPct,
      });
      res.json({ recommendations });
    } catch (err) {
      console.error("GET /recommend error:", err);
      res.status(500).json({ error: "No se pudo calcular recomendaciones" });
    }
  }
);

// ---- 1) review: calcular y guardar pendientes (TTL)
router.post("/recommend/review", async (req, res) => {
  try {
    const { error, value } = reviewSchema.validate(req.body);
    if (error) return res.status(400).json({ error: "Body inválido" });
    const { shop, mode, undercutPct, minMarginPct } = value;

    // Asegura acceso a la tienda
    const tokenExists = await redis.get(tokenKey(shop));
    if (!tokenExists)
      return res.status(401).json({ error: "Tienda no autorizada" });

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
      })),
    };

    await redis.set(keyPending(shop), JSON.stringify(pending), {
      EX: 60 * 60 * 4,
    }); // 4h
    res.json({ success: true, pending });
  } catch (err) {
    console.error("POST /recommend/review error:", err);
    res.status(500).json({ error: "No se pudo generar revisión" });
  }
});

// ---- 2) leer pendientes
router.get(
  "/recommend/pending",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const raw = await redis.get(keyPending(shop));
      const pending = raw ? JSON.parse(raw) : { shop, items: [] };
      res.json(pending);
    } catch (err) {
      res.status(500).json({ error: "No se pudo leer pendientes" });
    }
  }
);

// ---- 3) aprobar (aplica precios + transacción para mutar pendientes/historial)
router.post("/recommend/approve", async (req, res) => {
  try {
    const { error, value } = approveSchema.validate(req.body);
    if (error) return res.status(400).json({ error: "Body inválido" });
    const { shop, items } = value;

    const tokenExists = await redis.get(tokenKey(shop));
    if (!tokenExists)
      return res.status(401).json({ error: "Tienda no autorizada" });

    // 1) aplicar precios
    const results = await applyPricesToShopify(shop, items);

    // 2) transaccion Redis para limpiar pendientes + push historial
    let attempts = 0;
    while (attempts < 4) {
      attempts++;
      await redis.watch(keyPending(shop));
      const rawPend = await redis.get(keyPending(shop));
      const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

      const successIds = new Set(
        results.filter((r) => r.ok).map((r) => String(r.variantId))
      );
      pending.items = (pending.items || []).filter((p) => {
        if (p.variantId) return !successIds.has(String(p.variantId));
        return !results.find((r) => r.ok && r.title === p.title);
      });

      const entry = { ts: Date.now(), action: "approve", items: results };
      const multi = redis.multi();
      multi.set(keyPending(shop), JSON.stringify(pending), { EX: 60 * 60 * 4 });
      multi.lPush(keyHistory(shop), JSON.stringify(entry));
      multi.lTrim(keyHistory(shop), 0, 199);
      const done = await multi.exec();
      if (done !== null) break; // éxito; si null, hubo modificación concurrente y reintenta
    }

    res.json({ updated: results });
  } catch (err) {
    console.error("POST /recommend/approve error:", err);
    res.status(500).json({ error: "No se pudo aprobar/aplicar" });
  }
});

// ---- 4) rechazar (transacción Redis)
router.post("/recommend/reject", async (req, res) => {
  try {
    const { error, value } = rejectSchema.validate(req.body);
    if (error) return res.status(400).json({ error: "Body inválido" });
    const { shop, variantIds, titles } = value;

    const tokenExists = await redis.get(tokenKey(shop));
    if (!tokenExists)
      return res.status(401).json({ error: "Tienda no autorizada" });

    let attempts = 0;
    while (attempts < 4) {
      attempts++;
      await redis.watch(keyPending(shop));
      const rawPend = await redis.get(keyPending(shop));
      const pending = rawPend ? JSON.parse(rawPend) : { items: [] };

      pending.items = (pending.items || []).filter((p) => {
        const byVar =
          p.variantId && variantIds.length
            ? !variantIds.map(String).includes(String(p.variantId))
            : true;
        const byTitle = titles.length ? !titles.includes(p.title) : true;
        return byVar && byTitle;
      });

      const entry = { ts: Date.now(), action: "reject", variantIds, titles };
      const multi = redis.multi();
      multi.set(keyPending(shop), JSON.stringify(pending), { EX: 60 * 60 * 4 });
      multi.lPush(keyHistory(shop), JSON.stringify(entry));
      multi.lTrim(keyHistory(shop), 0, 199);
      const done = await multi.exec();
      if (done !== null) break;
    }

    const leftRaw = await redis.get(keyPending(shop));
    const left = leftRaw ? JSON.parse(leftRaw).items.length : 0;
    res.json({ success: true, pendingCount: left });
  } catch (err) {
    console.error("POST /recommend/reject error:", err);
    res.status(500).json({ error: "No se pudo rechazar" });
  }
});

// ---- 5) historial
router.get(
  "/recommend/history",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const arr = await redis.lRange(keyHistory(shop), 0, limit - 1);
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
  }
);

module.exports = router;