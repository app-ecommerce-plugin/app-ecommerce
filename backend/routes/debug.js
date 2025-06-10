const express = require("express");
const router = express.Router();
const redisClient = require("../utils/redisClient");

router.get("/shopify/config", async (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({ error: "Falta el parámetro shop" });
  }

  try {
    const redisKey = `selectedProducts_${shop}`;
    const selectedProducts = await redisClient.get(redisKey);
    const accessToken = await redisClient.get(`accessToken_${shop}`);
    const shopifyShop = await redisClient.get("shopifyShop");

    res.json({
      shop,
      accessToken: accessToken || "MODO LOCAL (sin token)",
      selectedProducts: selectedProducts ? JSON.parse(selectedProducts) : [],
      shopifyShop: shopifyShop || null,
    });
  } catch (err) {
    console.error("Error en debug/config:", err.message);
    res.status(500).json({ error: "Error al obtener datos de configuración" });
  }
});

module.exports = router;
