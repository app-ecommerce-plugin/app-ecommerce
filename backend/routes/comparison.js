const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const redisClient = require('../utils/redisClient');

// GET /shopify/compare?shop=...&otherShop=...&mode=title|semantic
router.get('/', async (req, res) => {
  const { shop, otherShop, mode = 'title' } = req.query;
  if (!shop || !otherShop) {
    return res.status(400).json({ error: 'Faltan parámetros "shop" y/o "otherShop".' });
  }

  try {
    const selectedStr = await redisClient.get(`shop:${shop}:selected_products`);
    const selected = selectedStr ? JSON.parse(selectedStr) : [];

    const otherPath = path.join(__dirname, '..', 'external_data', `${otherShop}.json`);
    if (!fs.existsSync(otherPath)) {
      return res.status(404).json({ error: `Archivo de tienda no encontrado: ${otherShop}.json` });
    }

    const rawOther = fs.readFileSync(otherPath);
    const otherProducts = JSON.parse(rawOther).products || [];

    if (mode === 'title') {
      const matched = [];
      const notFound = [];

      selected.forEach(localProd => {
        const match = otherProducts.find(p => p.title.trim().toLowerCase() === localProd.title.trim().toLowerCase());
        if (match) {
          matched.push({ local: localProd, remote: match });
        } else {
          notFound.push(localProd);
        }
      });

      res.json({ matched, notFound });
    } else if (mode === 'semantic') {
      res.json({
        matched: [],
        notFound: selected,
        message: 'Comparación semántica aún no implementada.'
      });
    } else {
      res.status(400).json({ error: 'Modo inválido: usar "title" o "semantic".' });
    }
  } catch (err) {
    console.error('Error en comparación:', err);
    res.status(500).json({ error: 'Error interno en comparación de productos.' });
  }
});

module.exports = router;
