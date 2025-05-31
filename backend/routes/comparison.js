
const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');
const fs = require('fs');
const path = require('path');

// GET /shopify/compare?mode=title&shop=example.myshopify.com
router.get('/', async (req, res) => {
  const mode = req.query.mode || 'title';
  const shop = req.query.shop;

  try {
    if (!shop) {
      return res.status(400).json({ error: 'Falta el parámetro shop' });
    }

    // Obtener productos seleccionados desde Redis
    const selectedData = await redisClient.get('selectedProducts');
    const localProducts = selectedData ? JSON.parse(selectedData) : [];

    // Determinar si hay credenciales de Shopify disponibles
    let shopDomain = process.env.SHOPIFY_SHOP;
    let accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    const savedShop = await redisClient.get('shopifyShop');
    if (savedShop) {
      const savedToken = await redisClient.get(`accessToken_${savedShop}`);
      if (savedToken) {
        shopDomain = savedShop;
        accessToken = savedToken;
      }
    }

    let shopifyProducts = [];

    if (accessToken && shopDomain) {
      // Modo real: cargar desde Shopify API
      const response = await axios.get(`https://${shopDomain}/admin/api/2023-01/products.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
      shopifyProducts = response.data.products || [];
    } else {
      // Modo local: cargar desde archivo backend/external_data/<shop>.json
      const filePath = path.resolve(__dirname, `../external_data/${shop}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Archivo local no encontrado para ${shop}` });
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      shopifyProducts = JSON.parse(raw);
    }

    // Comparación simple por título
    const matched = [];
    const notFound = [];

    localProducts.forEach(localProd => {
      const localTitle = localProd.title?.trim().toLowerCase();
      const found = shopifyProducts.find(p => p.title?.trim().toLowerCase() === localTitle);
      if (found) {
        matched.push({ local: localProd, shopify: found });
      } else {
        notFound.push(localProd);
      }
    });

    res.json({ matched, notFound });

  } catch (error) {
    console.error('Error en comparación:', error.message || error);
    res.status(500).json({ error: 'Error al comparar productos' });
  }
});

module.exports = router;