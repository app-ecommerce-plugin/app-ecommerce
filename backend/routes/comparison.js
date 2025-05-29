const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');

// GET /shopify/comparison?mode=title|semantic - Compara productos locales vs Shopify
router.get('/', async (req, res) => {
  const mode = req.query.mode || 'title';
  try {
    // Obtener productos seleccionados almacenados localmente (Redis)
    const data = await redisClient.get('selectedProducts');
    const localProducts = data ? JSON.parse(data) : [];

    // Obtener productos de Shopify mediante API
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
    if (!shopDomain || !accessToken) {
      return res.status(500).json({ error: 'Credenciales de Shopify no disponibles' });
    }
    const response = await axios.get(`https://${shopDomain}/admin/api/2023-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    const shopifyProducts = response.data.products || response.data;

    // Comparar según el modo indicado
    if (mode === 'title') {
      const matched = [];
      const notFound = [];
      localProducts.forEach(localProd => {
        const localTitle = localProd.title ? localProd.title.trim().toLowerCase() : '';
        let foundProd = null;
        if (Array.isArray(shopifyProducts)) {
          foundProd = shopifyProducts.find(p => p.title && localTitle && p.title.trim().toLowerCase() === localTitle);
        }
        if (foundProd) {
          // Producto encontrado en Shopify: agregar a lista de coincidencias
          matched.push({ local: localProd, shopify: foundProd });
        } else {
          // No encontrado: agregar a lista de no encontrados
          notFound.push(localProd);
        }
      });
      return res.json({ matched, notFound });
    } else if (mode === 'semantic') {
      // Stub para comparación semántica (no implementada)
      return res.json({
        matched: [],
        notFound: [],
        mensaje: 'Comparación semántica no implementada todavía.'
      });
    } else {
      // Modo no reconocido
      return res.status(400).json({ error: 'Modo de comparación no válido. Use "title" o "semantic".' });
    }
  } catch (error) {
    console.error('Error en la comparación de productos:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al comparar los productos' });
  }
});

module.exports = router;