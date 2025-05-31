//backend/routes/products.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');

// GET /shopify/products - Obtiene la lista de productos desde Shopify
router.get('/', async (req, res) => {
  try {
    // Determinar dominio de la tienda y token de acceso
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

    // Verificar credenciales disponibles
    if (!shopDomain || !accessToken) {
      return res.status(500).json({ error: 'Credenciales de Shopify no disponibles' });
    }

    // Llamar a la API de Shopify para obtener productos
    const response = await axios.get(`https://${shopDomain}/admin/api/2023-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    const products = response.data.products || response.data;
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos de Shopify:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al obtener productos desde Shopify' });
  }
});

// POST /shopify/products/selected - Guarda en Redis los productos seleccionados por el usuario
router.post('/selected', async (req, res) => {
  try {
    const selectedProducts = req.body;
    if (!selectedProducts) {
      return res.status(400).json({ error: 'No se proporcionaron productos para guardar' });
    }
    // Almacenar la lista de productos seleccionados en Redis
    await redisClient.set('selectedProducts', JSON.stringify(selectedProducts));
    res.status(200).json({ message: 'Productos seleccionados guardados correctamente.' });
  } catch (error) {
    console.error('Error al guardar productos seleccionados:', error);
    res.status(500).json({ error: 'No se pudieron guardar los productos seleccionados' });
  }
});

// GET /shopify/products/selected - Recupera de Redis los productos seleccionados guardados
router.get('/selected', async (req, res) => {
  try {
    const data = await redisClient.get('selectedProducts');
    if (!data) {
      return res.json([]);  // Si no hay nada guardado, devolver lista vacía
    }
    const selectedProducts = JSON.parse(data);
    res.json(selectedProducts);
  } catch (error) {
    console.error('Error al obtener productos seleccionados:', error);
    res.status(500).json({ error: 'No se pudieron obtener los productos seleccionados' });
  }
});

module.exports = router;