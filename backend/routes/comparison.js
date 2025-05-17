const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('redis');
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

router.get('/shopify/compare', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Shop faltante" });

  const redisKey = `shop:${shop}:config`;
  const accessToken = await redisClient.hGet(redisKey, 'accessToken');
  const selected = await redisClient.hGet(redisKey, 'selected_products');

  if (!accessToken || !selected) {
    return res.status(404).json({ error: "No hay datos almacenados para esta tienda" });
  }

  const selectedIds = JSON.parse(selected);
  try {
    const response = await axios.get(`https://${shop}/admin/api/2023-10/products.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    const ownProducts = response.data.products.filter(p =>
      selectedIds.includes(p.id)
    );

    const comparison = ownProducts.map(p => ({
      id: p.id,
      title: p.title,
      ownPrice: parseFloat(p.variants[0]?.price || 0),
      competitorPrice: parseFloat(p.variants[0]?.price || 0) * (0.9 + Math.random() * 0.2)
    }));

    res.json({ comparison });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo productos para comparar" });
  }
});

module.exports = router;