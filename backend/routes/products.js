// backend/routes/products.js

const express = require('express');
const router = express.Router();
const redisClient = require('../redis');

// Ruta para guardar productos seleccionados
router.post('/selected', async (req, res) => {
  const { shop, selectedProductIds } = req.body;
  if (!shop || !selectedProductIds) {
    return res.status(400).send('Shop y productos requeridos');
  }

  try {
    await redisClient.set(`shop:${shop}:selected_products`, JSON.stringify(selectedProductIds));
    res.status(200).send('Productos seleccionados guardados');
  } catch (err) {
    res.status(500).send('Error al guardar en Redis');
  }
});

// Ruta para obtener productos seleccionados
router.get('/selected', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Shop requerido');

  try {
    const data = await redisClient.get(`shop:${shop}:selected_products`);
    res.json({ selected: JSON.parse(data || '[]') });
  } catch (err) {
    res.status(500).send('Error al obtener productos de Redis');
  }
});

module.exports = router;