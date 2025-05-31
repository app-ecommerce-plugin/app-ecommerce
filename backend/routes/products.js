const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');
const fs = require('fs/promises');
const path = require('path');

// GET /shopify/products?shop=... - Devuelve productos desde Shopify o JSON local
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    const shopDomain = shop;

    if (savedToken) {
      const response = await axios.get(`https://${shopDomain}/admin/api/2023-01/products.json`, {
        headers: {
          'X-Shopify-Access-Token': savedToken,
          'Content-Type': 'application/json'
        }
      });
      return res.json(response.data.products || []);
    } else {
      // Leer productos desde JSON local en backend/external_data/[shop].json
      const filePath = path.join(__dirname, '..', 'external_data', `${shop}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const products = JSON.parse(content);
      return res.json(products);
    }
  } catch (error) {
    console.error('Error al obtener productos:', error.message);
    return res.status(500).json({ error: 'No se pudieron obtener productos' });
  }
});

module.exports = router;