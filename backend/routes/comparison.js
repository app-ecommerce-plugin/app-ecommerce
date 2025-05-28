// routes/comparison.js
const express = require('express');
const router = express.Router();
const { getSelectedProducts } = require('../utils/redisClient');
const { loadExternalData, compararPorTitulo, compararPorEmbeddings } = require('../utils/compararProductos');

// Nuevo endpoint: comparar con datos externos
router.get('/compare', async (req, res) => {
  const { shop, mode } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    const seleccionados = await getSelectedProducts(shop);
    const externos = loadExternalData(shop);

    if (!externos) {
      return res.status(404).json({ error: 'No se encontraron datos externos para esta tienda' });
    }

    if (mode === 'semantic') {
      const resultado = await compararPorEmbeddings(seleccionados, externos);
      return res.json({ mode: 'semantic', resultado });
    } else {
      const resultado = compararPorTitulo(seleccionados, externos);
      return res.json({ mode: 'exact', ...resultado });
    }
  } catch (err) {
    console.error('Error comparando productos:', err);
    res.status(500).json({ error: 'Error interno al comparar productos.' });
  }
});

module.exports = router;