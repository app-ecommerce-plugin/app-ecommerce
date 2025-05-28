const express     = require('express');
const axios       = require('axios');
const redisClient = require('../utils/redisClient');

const router = express.Router();

/** Guarda IDs de productos seleccionados para la tienda */
router.post('/selected', async (req, res) => {
  const { shop, selectedProducts } = req.body;
  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: 'shop y selectedProducts requeridos' });
  }

  await redisClient.set(
    `shop:${shop}:selected_products`,
    JSON.stringify(selectedProducts),
    { EX: 86400 }
  );

  res.json({ ok: true, saved: selectedProducts.length });
});

/** Recupera selección actual */
router.get('/selected', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'shop requerido' });

  const data = await redisClient.get(`shop:${shop}:selected_products`);
  res.json({ selectedProducts: data ? JSON.parse(data) : [] });
});

/** (Opcional) trae productos Shopify – token debe estar en sesión o header */
router.get('/products', async (req, res) => {
  const { shop } = req.query;
  const token = req.headers['x-shopify-token'];
  if (!shop || !token) return res.status(400).json({ error: 'shop y token requeridos' });

  try {
    const url = `https://${shop}/admin/api/2024-01/products.json?limit=250`;
    const { data } = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    res.json(data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(502).json({ error: 'Error consultando Shopify' });
  }
});

module.exports = router;