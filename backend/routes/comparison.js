const express = require('express');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs/promises');
const redis   = require('../utils/redisClient');
const { compararPorTitulo } = require('../utils/compararProductos');

const router = express.Router();

/**
 * GET /shopify/compare?shop=tiendaA.myshopify.com
 *                      &other=tiendaB.myshopify.com
 *                      &mode=title|semantic
 */
router.get('/', async (req, res) => {
  const { shop, other, mode = 'title' } = req.query;
  if (!shop || !other)
    return res.status(400).json({ error: 'Faltan parámetros shop y other' });

  try {
    /* 1) productos seleccionados por el comerciante ------------------ */
    const rawSel  = await redis.get(`selectedProducts_${shop}`);
    const selList = rawSel ? JSON.parse(rawSel) : [];          // [{id,title},…]

    /* 2) catálogo del competidor (API Shopify o JSON local) --------- */
    let catalogoCompetidor = [];

    const otherToken = await redis.get(`accessToken_${other}`);
    if (otherToken) {
      // --- API Shopify real ---
      const resp = await axios.get(
        `https://${other}/admin/api/2023-01/products.json`,
        { headers: { 'X-Shopify-Access-Token': otherToken } }
      );
      catalogoCompetidor = resp.data.products.map(p => ({
        title:  p.title,
        price:  Number(p.variants?.[0]?.price ?? 0),
        source: other
      }));
    } else {
      // --- fallback JSON local ---
      const filePath = path.join(
        __dirname,
        '..',
        'external_data',
        `${other}.json`
      );
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      catalogoCompetidor = data.products || [];
    }

    /* 3) comparación -------------------------------------------------- */
    const resultado =
      mode === 'semantic'
        ? await compararPorEmbeddings(selList, catalogoCompetidor)
        : compararPorTitulo(selList, catalogoCompetidor);

    res.json({ comparaciones: resultado });
  } catch (e) {
    console.error('compare:', e.message);
    res.status(500).json({ error: 'Error al comparar productos' });
  }
});

module.exports = router;