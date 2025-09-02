// routes/comparison.js
const express = require('express');
const router = express.Router();

// Import correcto: el módulo exporta la función por defecto
const compararProductos = require('../utils/compararProductos');

// Handler común para admitir tanto "/" como "/comparar"
async function handleCompare(req, res) {
  try {
    const shopDomain = req.query.shop || req.session?.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ error: 'Falta el parámetro "shop"' });
    }

    // (opcional) modo: title|exact|loose (por ahora no se usa, comparamos por título normalizado)
    const mode = (req.query.mode || 'title').toLowerCase();

    const resultados = await compararProductos(shopDomain, { mode });
    // El frontend espera { comparaciones: [...] }
    return res.status(200).json({ comparaciones: resultados });
  } catch (error) {
    console.error('Error al comparar productos:', error);
    return res
      .status(500)
      .json({ error: 'Error interno al comparar productos', detalles: error.message });
  }
}

// Soportar ambas rutas para ser compatible con el frontend actual
router.get('/', handleCompare);
router.get('/comparar', handleCompare);

router.get('/ping', (req, res) => res.send('OK: comparison funcionando'));

module.exports = router;