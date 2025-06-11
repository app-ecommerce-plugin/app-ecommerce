const express  = require('express');
const path     = require('path');
const fs       = require('fs/promises');
const redis    = require('../utils/redisClient');
const { compararPorTitulo } = require('../utils/compararProductos');

const router = express.Router();

/* GET /shopify/comparison?shop=<mi-tienda>.myshopify.com */
router.get('/', async (req, res) => {
  const { shop, mode = 'title' } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    /* 1. selección del comerciante */
    const rawSel = await redis.get(`selectedProducts_${shop}`);
    const seleccion = rawSel ? JSON.parse(rawSel) : [];

    /* 2. catálogo “competencia” = JSON local   external_data/<shop>.json */
    const file = path.join(__dirname, '..', 'external_data', `${shop}.json`);
    const data = JSON.parse(await fs.readFile(file, 'utf-8'));
    const competencia = data.products || [];

    /* 3. comparar */
    const comparaciones =
      mode === 'semantic'
        ? await compararPorEmbeddings(seleccion, competencia)
        : compararPorTitulo(seleccion, competencia);

    res.json({ comparaciones });
  } catch (e) {
    console.error('comparison:', e.message);
    res.status(500).json({ error: 'Error al comparar' });
  }
});

module.exports = router;