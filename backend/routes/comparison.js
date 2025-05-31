const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');
const fs = require('fs/promises');
const path = require('path');

// GET /shopify/compare?shop=...&mode=title|semantic
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  const mode = req.query.mode || 'title';
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    const selected = await redisClient.get('selectedProducts');
    const selectedProducts = selected ? JSON.parse(selected) : [];

    let shopifyProducts = [];
    if (savedToken) {
      const response = await axios.get(`https://${shop}/admin/api/2023-01/products.json`, {
        headers: {
          'X-Shopify-Access-Token': savedToken,
          'Content-Type': 'application/json'
        }
      });
      shopifyProducts = response.data.products || [];
    } else {
      const filePath = path.join(__dirname, '..', 'external_data', `${shop}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      shopifyProducts = JSON.parse(content);
    }

    if (mode === 'title') {
      const matched = [];
      const notFound = [];

      selectedProducts.forEach(local => {
        const match = shopifyProducts.find(prod =>
          prod.title?.trim().toLowerCase() === local.title?.trim().toLowerCase()
        );
        if (match) {
          matched.push({ local, shopify: match });
        } else {
          notFound.push(local);
        }
      });

      return res.json({ matched, notFound });
    } else if (mode === 'semantic') {
      return res.json({
        matched: [],
        notFound: [],
        mensaje: 'Comparación semántica no implementada'
      });
    } else {
      return res.status(400).json({ error: 'Modo no válido' });
    }
  } catch (err) {
    console.error('Error al comparar:', err.message);
    return res.status(500).json({ error: 'Error al comparar productos' });
  }
});

module.exports = router;