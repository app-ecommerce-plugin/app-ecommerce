const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const redisClient = require('../utils/redisClient');

// GET /shopify/products - Devuelve productos simulados desde archivo JSON
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro "shop".' });

  try {
    const filePath = path.join(__dirname, '..', 'external_data', `${shop}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Archivo de tienda no encontrado: ${shop}.json` });
    }

    const rawData = fs.readFileSync(filePath);
    const jsonData = JSON.parse(rawData);
    res.json(jsonData.products || []);
  } catch (err) {
    console.error('Error al leer archivo JSON:', err);
    res.status(500).json({ error: 'Error al cargar productos de prueba.' });
  }
});

// POST /shopify/products/selected - Guarda selección de productos
router.post('/selected', async (req, res) => {
  const { shop, selectedProducts } = req.body;
  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
  }

  await redisClient.set(`shop:${shop}:selected_products`, JSON.stringify(selectedProducts));
  res.json({ success: true });
});

module.exports = router;
