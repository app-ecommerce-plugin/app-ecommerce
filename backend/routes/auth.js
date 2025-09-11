// routes/auth.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_REDIRECT_URI,
  SHOPIFY_SCOPES,
} = process.env;

// GET /shopify/auth/ping
router.get("/ping", (_, res) => res.send("OK: auth funcionando"));

// GET /shopify/auth/shopify?shop=mi-tienda.myshopify.com
router.get("/shopify", (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Falta el parámetro shop");

  const installUrl =
    `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}`;

  res.redirect(installUrl);
});

// GET /shopify/auth/shopify/callback
router.get("/shopify/callback", async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).send("Faltan parámetros");

  try {
    const { data } = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }
    );

    // 1) Guardar token
    await redisClient.set(`accessToken_${shop}`, data.access_token);

    // 2) Registrar la tienda en un SET global para jobs/ingestas programadas
    //    (idempotente: si ya existe, no se duplica)
    try {
      await redisClient.sAdd("shops", shop);
    } catch (e) {
      console.warn(
        `⚠️ No se pudo registrar la tienda en el set 'shops': ${e.message}`
      );
    }

    console.log(`✅ Token guardado y tienda registrada: ${shop}`);
    res.send(
      `✅ Autenticación completada para ${shop}. Puedes cerrar esta ventana.`
    );
  } catch (e) {
    console.error("❌ Error en callback OAuth:", e.message);
    res.status(500).send("Error al procesar la autenticación");
  }
});

// GET /shopify/auth/config?shop=mi-tienda.myshopify.com
router.get("/config", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta shop" });

  try {
    const selected = await redisClient.get(`selectedProducts_${shop}`);
    const token = await redisClient.get(`accessToken_${shop}`);
    const shopifyShop = await redisClient.get("shopifyShop");

    res.json({
      shop,
      accessToken: token || "MODO LOCAL (sin token)",
      selectedProducts: selected ? JSON.parse(selected) : [],
      shopifyShop: shopifyShop || null,
    });
  } catch (e) {
    res.status(500).json({ error: "Error al obtener datos de configuración" });
  }
});

module.exports = router;
