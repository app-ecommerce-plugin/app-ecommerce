const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs/promises');
const redis = require('../utils/redisClient');
const { compararPorTitulo, compararPorEmbeddings } = require('../utils/compararProductos');
const axios = require('axios');

const USE_LOCAL_FILES = process.env.USE_LOCAL_FILES === 'true';

/* GET /shopify/comparison?shop=mi-tienda.myshopify.com&mode=title */
router.get('/', async (req, res) => {
  const { shop, mode = 'title' } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    /* 1. Obtener selección del comerciante desde Redis */
    const rawSel = await redis.get(`selectedProducts_${shop}`);
    const seleccion = rawSel ? JSON.parse(rawSel) : [];

    /* 2. Obtener catálogo externo (competencia) */
    let competencia = [];

    if (USE_LOCAL_FILES) {
      const file = path.join(__dirname, '..', 'external_data', `${shop}.json`);
      const data = JSON.parse(await fs.readFile(file, 'utf-8'));
      competencia = data.products || [];
    } else {
      // Obtener token
      const token = await redis.get(`accessToken_${shop}`);
      if (!token) {
        return res.status(403).json({ error: `No hay token para ${shop}` });
      }

      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json`,
        {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        }
      );

      competencia = (response.data.products || []).map(p => ({
        id: p.id,
        title: p.title,
        price: parseFloat(p.variants?.[0]?.price || 0),
        currency: 'EUR',
        source: shop,
        url: `https://${shop}/products/${p.handle || ''}`
      }));
    }

    /* 3. Comparación */
    const comparaciones = mode === 'semantic'
      ? await compararPorEmbeddings(seleccion, competencia)
      : compararPorTitulo(seleccion, competencia);

    res.json({ comparaciones });
  } catch (e) {
    console.error('comparison:', e.message);
    res.status(500).json({ error: 'Error al comparar' });
  }
});

module.exports = router;