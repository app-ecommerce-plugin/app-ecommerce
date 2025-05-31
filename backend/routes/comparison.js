//backend/routes/comparison.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const redisClient = require('../utils/redisClient');
const { loadExternalData, compararPorTitulo, compararPorEmbeddings } = require('../utils/compararProductos');

// GET /shopify/compare?shop={shop}&otherShop={otherShop}&mode=title|semantic
router.get('/', async (req, res) => {
  const { shop, otherShop, mode = 'title' } = req.query;

  if (!shop || !otherShop) {
    return res.status(400).json({ error: 'Se requieren los parámetros "shop" y "otherShop".' });
  }

  try {
    // Recupera productos seleccionados de la tienda actual desde Redis
    const data = await redisClient.get(`shop:${shop}:selected_products`);
    const selectedProducts = data ? JSON.parse(data) : [];

    if (!selectedProducts.length) {
      return res.status(404).json({ error: 'No hay productos seleccionados para la tienda especificada.' });
    }

    // Productos externos desde archivo JSON (tienda secundaria)
    const externalProducts = await loadExternalData(otherShop);
    if (!externalProducts) {
      return res.status(404).json({ error: 'No se encontraron datos externos para la tienda especificada.' });
    }

    // Comparar según el modo indicado
    const resultados = mode === 'semantic'
      ? await compararPorEmbeddings(selectedProducts, externalProducts) // stub preparado
      : compararPorTitulo(selectedProducts, externalProducts);

    res.json({ mode, count: resultados.length, resultados });
  } catch (error) {
    console.error('Error al comparar productos:', error);
    res.status(500).json({ error: 'Error interno al comparar productos' });
  }
});

module.exports = router;