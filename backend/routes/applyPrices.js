const express = require("express");
const fetch = require("node-fetch");
const redis = require("../utils/redisClient");
const router = express.Router();

// POST /shopify/prices/apply
// body: { shop, items: [{productId, variantId, newPrice}] }
router.post("/prices/apply", async (req, res) => {
  try {
    const { shop, items } = req.body || {};
    if (!shop || !Array.isArray(items))
      return res.status(400).json({ error: "Parámetros inválidos" });

    const token = await redis.get(`accessToken_${shop}`);
    if (!token) return res.status(401).json({ error: "Shop no autenticada" });

    const results = [];
    for (const it of items) {
      const body = {
        variant: { id: it.variantId, price: String(it.newPrice) },
      };
      const url = `https://${shop}/admin/api/2023-04/variants/${it.variantId}.json`;
      const r = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const ok = r.ok;
      results.push({ ...it, ok, status: r.status });
    }
    res.json({ updated: results });
  } catch (e) {
    console.error("apply prices error:", e.message);
    res.status(500).json({ error: "No se pudieron aplicar precios" });
  }
});

module.exports = router;