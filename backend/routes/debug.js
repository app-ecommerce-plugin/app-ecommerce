// backend/routes/debug.js
const express = require("express");
const redis = require("../utils/redisClient");
const { validateShopParam } = require("../middleware/shopValidation");

const router = express.Router();

const tokenKey = (shop) => `accessToken_${shop}`;
const keyPending = (shop) => `pendingRecommendations_${shop}`;
const keyHistory = (shop) => `recommendHistory_${shop}`;
const shopsSetKey = "shops";

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

    const resp = {
      shop,
      token: {
        exists: !!encToken,
        // NO devolvemos el token ni lo desciframos
        cipherLength: encToken ? encToken.length : 0,
      },
      registeredInSet: !!inShops,
      pending: {
        exists: !!pending,
        items: pending?.items?.length || 0,
        createdAt: pending?.createdAt || null,
        ttlSeconds: await redis.ttl(keyPending(shop)).catch(() => -2),
      },
      history: {
        length: historyLen || 0,
      },
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
      },
    };

    res.json(resp);
  } catch (err) {
    console.error("DEBUG config error:", err);
    res.status(500).json({ error: "No se pudo obtener info de debug" });
  }
});

module.exports = router;