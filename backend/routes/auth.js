const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_REDIRECT_URI,
  SHOPIFY_SCOPES
} = process.env;

/* ---------------------------------------------------------------- */
/* GET /auth/shopify?shop=mi-tienda.myshopify.com                   */
/* Inicia la autenticación OAuth con Shopify                        */
/* ---------------------------------------------------------------- */
router.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Falta el parámetro shop');

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY
    }&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}`;

  res.redirect(installUrl);
});

/* ---------------------------------------------------------------- */
/* GET /auth/shopify/callback                                       */
/* Recibe el token OAuth y lo guarda en Redis                      */
/* ---------------------------------------------------------------- */
router.get('/shopify/callback', async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send('Faltan parámetros requeridos');
  }

  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const accessToken = tokenRes.data.access_token;

    await redisClient.set(`accessToken_${shop}`, accessToken);

    console.log(`✅ Token guardado para ${shop}`);
    res.send(`✅ Autenticación completada para ${shop}. Puedes cerrar esta ventana.`);
  } catch (err) {
    console.error('❌ Error en callback OAuth:', err.message);
    res.status(500).send('Error al procesar la autenticación');
  }
});

/* ---------------------------------------------------------------- */
/* GET /debug/shopify/config?shop=mi-tienda.myshopify.com          */
/* Devuelve info de prueba útil desde Redis                        */
/* ---------------------------------------------------------------- */
router.get('/config', async (req, res) => {
  const shop = req.query.shop;

  try {
    if (!shop) {
      return res.status(400).json({ error: 'Falta el parámetro shop' });
    }

    const selectedProducts = await redisClient.get(`selectedProducts_${shop}`);
    const shopifyShop = await redisClient.get('shopifyShop');
    const accessToken = await redisClient.get(`accessToken_${shop}`);

    res.json({
      shop,
      accessToken: accessToken || 'MODO LOCAL (sin token)',
      selectedProducts: selectedProducts ? JSON.parse(selectedProducts) : [],
      shopifyShop: shopifyShop || null
    });
  } catch (err) {
    console.error('Error en debug/config:', err.message);
    res.status(500).json({ error: 'Error al obtener datos de configuración' });
  }
});

module.exports = router;