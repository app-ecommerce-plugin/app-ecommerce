const express     = require('express');
const axios       = require('axios');
const path        = require('path');
const fs          = require('fs/promises');
const redisClient = require('../utils/redisClient');

const router = express.Router();

/* ----------  Selección de productos ---------- */

/** Guarda IDs de productos seleccionados para la tienda */
router.post('/selected', async (req, res) => {
  const { shop, selectedProducts } = req.body;
  if (!shop || !Array.isArray(selectedProducts)) {
    return res
      .status(400)
      .json({ error: 'shop y selectedProducts requeridos' });
  }

  await redisClient.set(
    `shop:${shop}:selected_products`,
    JSON.stringify(selectedProducts),
    { EX: 86400 }
  );

  res.json({ ok: true, saved: selectedProducts.length });
});

/** Recupera la selección actual */
router.get('/selected', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'shop requerido' });

  const data = await redisClient.get(`shop:${shop}:selected_products`);
  res.json({ selectedProducts: data ? JSON.parse(data) : [] });
});

/* ----------  Listado de productos ---------- */
/**
 * GET /shopify/products
 * Si envías cabecera  X-Shopify-Token  ➜ consulta la API real de Shopify.
 * Si NO envías token (modo demo)       ➜ lee external_data/<shop>.json
 */
router.get('/products', async (req, res) => {
  const { shop } = req.query;
  const token    = req.headers['x-shopify-token'];

  if (!shop) return res.status(400).json({ error: 'shop requerido' });

  /* --- Modo producción: consulta Shopify --- */
  if (token) {
    try {
      const url = `https://${shop}/admin/api/2024-01/products.json?limit=250`;
      const { data } = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      return res.json(data.products || data); // según versión de API
    } catch (err) {
      console.error(err.response?.data || err.message);
      return res
        .status(502)
        .json({ error: 'Error consultando Shopify', details: err.message });
    }
  }

  /* --- Modo desarrollo/demo: lee JSON local --- */
  try {
    const file = path.join(__dirname, '..', 'external_data', `${shop}.json`);
    const raw  = await fs.readFile(file, 'utf8');
    return res.json(JSON.parse(raw));
  } catch {
    return res
      .status(404)
      .json({ error: 'Catálogo no encontrado para esta tienda' });
  }
});

module.exports = router;