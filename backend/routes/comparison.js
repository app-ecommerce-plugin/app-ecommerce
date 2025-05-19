const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();
const { createClient } = require('redis');

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

// Cargar datos externos de prueba desde JSON
function loadExternalData(shop) {
  const filePath = path.join(__dirname, '..', 'external_data', `${shop}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error leyendo archivo ${filePath}:`, err);
    return null;
  }
}

// Comparar por título exacto entre productos seleccionados (de Shopify) y externos
function compararPorTitulo(shopifyProducts, externalProducts) {
  const externosMap = new Map(externalProducts.map(p => [p.title, p]));
  const comunes = [];
  const soloEnShopify = [];
  const soloEnExterno = [...externosMap.keys()];
  const comparaciones = [];

  for (const p of shopifyProducts) {
    const externo = externosMap.get(p.title);
    if (externo) {
      comunes.push(p.title);
      comparaciones.push({
        title: p.title,
        precioShopify: p.price,
        precioExterno: externo.price,
        diferencia: +(p.price - externo.price).toFixed(2)
      });
      soloEnExterno.splice(soloEnExterno.indexOf(p.title), 1);
    } else {
      soloEnShopify.push(p.title);
    }
  }

  return { comunes, soloEnShopify, soloEnExterno, comparaciones };
}

// Endpoint de comparación contra lista externa
router.get('/compare', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    // 1. Obtener IDs seleccionados desde Redis
    const redisKey = `shop:${shop}:config`;
    const raw = await redisClient.hGet(redisKey, 'selected_products');
    const selectedIds = raw ? JSON.parse(raw) : [];

    // 2. Obtener token OAuth desde Redis
    const accessToken = await redisClient.hGet(redisKey, 'accessToken');
    if (!accessToken) return res.status(401).json({ error: 'Falta token de acceso OAuth' });

    // 3. Obtener productos desde Shopify
    const response = await axios.get(`https://${shop}/admin/api/2023-10/products.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    const todosProductos = response.data.products || [];

    // 4. Filtrar los seleccionados
    const seleccionados = todosProductos
      .filter(p => selectedIds.includes(p.id))
      .map(p => ({ title: p.title, price: parseFloat(p.variants[0].price) }));

    // 5. Cargar datos externos
    const externos = loadExternalData(shop);
    if (!externos) return res.status(404).json({ error: 'No se encontraron datos externos para esta tienda' });

    // 6. Comparar
    const resultado = compararPorTitulo(seleccionados, externos);
    res.json(resultado);

  } catch (err) {
    console.error('Error comparando productos:', err);
    res.status(500).json({ error: 'Error interno al comparar productos.' });
  }
});

module.exports = router;