
const express = require('express');
const router = express.Router();
const redisClient = require('../utils/redisClient');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// GET /shopify/products?shop=example.myshopify.com
router.get('/', async (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({ error: 'Falta el parámetro shop' });
  }

  try {
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

    let products = [];

    if (accessToken && shopDomain) {
      const response = await axios.get(`https://${shopDomain}/admin/api/2023-01/products.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
      products = response.data.products || [];
    } else {
      const filePath = path.resolve(__dirname, `../external_data/${shop}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Archivo local no encontrado para ${shop}` });
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      products = JSON.parse(raw);
    }

    res.json(products);
  } catch (err) {
    console.error('Error al obtener productos:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los productos' });
  }
});

// POST /shopify/products/selected
router.post('/selected', async (req, res) => {
  try {
    await redisClient.set('selectedProducts', JSON.stringify(req.body));
    res.json({ message: 'Selección guardada en Redis' });
  } catch (err) {
    console.error('Error al guardar selección:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la selección' });
  }
});

// GET /shopify/products/selected
router.get('/selected', async (req, res) => {
  try {
    const data = await redisClient.get('selectedProducts');
    const selected = data ? JSON.parse(data) : [];
    res.json(selected);
  } catch (err) {
    console.error('Error al obtener selección:', err.message);
    res.status(500).json({ error: 'No se pudo recuperar la selección' });
  }
});

module.exports = router;