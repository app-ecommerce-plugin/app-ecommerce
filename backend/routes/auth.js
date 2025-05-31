
const express = require('express');
const router = express.Router();
const redisClient = require('../utils/redisClient');

// GET /debug/shopify/config?shop=example.myshopify.com
router.get('/config', async (req, res) => {
  const shop = req.query.shop;

  try {
    if (!shop) {
      return res.status(400).json({ error: 'Falta el parámetro shop' });
    }

    const selectedProducts = await redisClient.get('selectedProducts');
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