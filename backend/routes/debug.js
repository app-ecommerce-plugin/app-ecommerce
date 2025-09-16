// backend/routes/debug.js
const express = require("express");
const fetch = require("node-fetch");
const redis = require("../utils/redisClient");
const { validateShopParam } = require("../middleware/shopValidation");
const { tokenKey } = require("../middleware/ensureShopAccess");
const { decrypt } = require("../utils/crypto");

const router = express.Router();

const shopsSetKey = "shops";
const keyPending = (shop) => `pendingRecommendations_${shop}`;
const keyHistory = (shop) => `recommendHistory_${shop}`;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

// Helpers
async function getTokenFlexible(shop) {
  const enc = await redis.get(tokenKey(shop));
  if (!enc) throw new Error("Token no encontrado");
  try {
    const j = JSON.parse(enc);
    if (j && j.iv && j.data && j.tag) {
      return decrypt(enc);
    }
  } catch {}
  return enc; // texto plano legacy
}

router.get("/shopify/config", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const [
      encToken,
      inShops,
      pendingRaw,
      historyLen,
      openaiLimit,
      openaiMonthUsage,
    ] = await Promise.all([
      redis.get(tokenKey(shop)),
      redis.sIsMember(shopsSetKey, shop),
      redis.get(keyPending(shop)),
      redis.lLen(keyHistory(shop)),
      Promise.resolve(Number(process.env.OPENAI_USAGE_LIMIT || "10")),
      (async () => {
        const d = new Date();
        const mk = `openai_usage_usd_current_month:${d.getUTCFullYear()}-${String(
          d.getUTCMonth() + 1
        ).padStart(2, "0")}`;
        const v = await redis.get(mk);
        return v ? Number(v) : 0;
      })(),
    ]);

    let pending = null;
    try {
      pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    } catch {
      pending = null;
    }

    res.json({
      shop,
      token: {
        exists: !!encToken,
        cipherLength: encToken ? encToken.length : 0,
      },
      registeredInSet: !!inShops,
      pending: {
        exists: !!pending,
        items: pending?.items?.length || 0,
        createdAt: pending?.createdAt || null,
        ttlSeconds: await redis.ttl(keyPending(shop)).catch(() => -2),
      },
      history: { length: historyLen || 0 },
      openai: {
        limitUSD: openaiLimit,
        currentMonthUSD: Number.isFinite(openaiMonthUsage)
          ? openaiMonthUsage
          : 0,
      },
      env: {
        SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
        SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
        SHOPIFY_REDIRECT_URI: !!process.env.SHOPIFY_REDIRECT_URI,
        REDIS_URL: !!process.env.REDIS_URL,
        ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
        CRON_SECRET: !!process.env.CRON_SECRET,
        SHOPIFY_API_VERSION,
      },
    });
  } catch (err) {
    console.error("DEBUG config error:", err);
    res.status(500).json({ error: "No se pudo obtener info de debug" });
  }
});

// Scopes reales del token
router.get("/shopify/scopes", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const token = await getTokenFlexible(shop);
    const url = `https://${shop}/admin/oauth/access_scopes.json`;
    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    const txt = await r.text();
    let json = null;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    res.json({ ok: r.ok, status: r.status, body: json || txt });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Conteo de productos
router.get("/shopify/products/count", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const token = await getTokenFlexible(shop);
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products/count.json`;
    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    const txt = await r.text();
    let json = null;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    const count = json && typeof json.count === "number" ? json.count : null;
    res.json({
      ok: r.ok,
      status: r.status,
      count,
      raw: count === null ? json || txt : undefined,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Página de productos (normalizada)
router.get("/shopify/products/page", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const limit = Math.max(1, Math.min(250, Number(req.query.limit) || 1));
    const token = await getTokenFlexible(shop);
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${limit}`;
    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    const txt = await r.text();
    let json = null;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    const products = json?.products || [];
    const items = products.map((p) => {
      const v = (p.variants && p.variants[0]) || {};
      return {
        id: p.id,
        title: p.title,
        price: v.price ? Number(v.price) : null,
        variantId: v.id || null,
      };
    });
    res.json({ ok: r.ok, status: r.status, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;