const express = require("express");
const router = express.Router();
const redisClient = require("../utils/redisClient");

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES;

/* -------------------------------------------------------------------------- */
/* GET /shopify/auth?shop=example.myshopify.com                               */
/* Redirige al login OAuth de Shopify                                         */
/* -------------------------------------------------------------------------- */
router.get("/", (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Falta el parámetro "shop"');
  }

  const state = Math.random().toString(36).substring(2);
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${SHOPIFY_REDIRECT_URI}&state=${state}`;

  res.redirect(installUrl);
});

/* -------------------------------------------------------------------------- */
/* GET /shopify/auth/callback                                                 */
/* Recibe el token y lo guarda en Redis                                      */
/* -------------------------------------------------------------------------- */
router.get("/callback", async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send('Faltan parámetros "shop" o "code"');
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).send("Error al obtener access token");
    }

    // Guardar token en Redis
    await redisClient.set(`accessToken_${shop}`, tokenData.access_token);
    await redisClient.set(`shopifyShop`, shop);

    res.send("✅ Autenticación completada. Puedes cerrar esta pestaña.");
  } catch (err) {
    console.error("Error en /auth/callback:", err.message);
    res.status(500).send("Error al procesar autenticación");
  }
});

/* -------------------------------------------------------------------------- */
/* GET /debug/shopify/config?shop=example.myshopify.com                       */
/* Devuelve configuración básica para debug                                  */
/* -------------------------------------------------------------------------- */
router.get("/config", async (req, res) => {
  const shop = req.query.shop;

  try {
    if (!shop) {
      return res.status(400).json({ error: "Falta el parámetro shop" });
    }

    const selectedProducts = await redisClient.get("selectedProducts");
    const shopifyShop = await redisClient.get("shopifyShop");
    const accessToken = await redisClient.get(`accessToken_${shop}`);

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

const axios = require("axios");

router.get("/shopify/callback", async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send("Faltan parámetros necesarios (shop, code)");
  }

  try {
    const accessTokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }
    );

    const accessToken = accessTokenResponse.data.access_token;

    // Guardar el token en Redis con la clave específica para esa tienda
    await redisClient.set(`accessToken_${shop}`, accessToken);
    await redisClient.set("shopifyShop", shop);

    res.send(
      "✅ Autenticación completada correctamente. Puedes cerrar esta ventana."
    );
  } catch (err) {
    console.error("Error en callback de Shopify:", err.message);
    res.status(500).send("❌ Error al obtener el token de acceso de Shopify");
  }
});

module.exports = router;
