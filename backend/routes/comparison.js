// routes/comparison.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { cosineSimilarity, getEmbedding, getCachedEmbedding } = require('../utils/embeddings');

// Cargar datos externos de una tienda
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

// Comparar productos por título exacto
function matchExact(products1, products2) {
  const productos1Map = new Map(products1.map(p => [p.title, p]));
  const productos2Map = new Map(products2.map(p => [p.title, p]));

  const comunes = [];
  const soloEn1 = [];
  const soloEn2 = [];
  const comparaciones = [];

  for (const [title, p1] of productos1Map) {
    if (productos2Map.has(title)) {
      const p2 = productos2Map.get(title);
      comunes.push(title);
      comparaciones.push({ title, precio1: p1.price, precio2: p2.price });
    } else {
      soloEn1.push(title);
    }
  }

  for (const [title] of productos2Map) {
    if (!productos1Map.has(title)) {
      soloEn2.push(title);
    }
  }

  return { comunes, soloEn1, soloEn2, comparaciones };
}

// Comparar productos por similitud semántica usando embeddings
async function matchSemantic(products1, products2, threshold = 0.85) {
  const comparaciones = [];
  const matched2 = new Set();

  for (const p1 of products1) {
    const emb1 = await getCachedEmbedding(p1.title);
    let best = null;
    let bestSim = 0;
    for (const p2 of products2) {
      if (matched2.has(p2.title)) continue;
      const emb2 = await getCachedEmbedding(p2.title);
      const sim = cosineSimilarity(emb1, emb2);
      if (sim > bestSim) {
        best = p2;
        bestSim = sim;
      }
    }
    if (best && bestSim >= threshold) {
      matched2.add(best.title);
      comparaciones.push({
        title1: p1.title,
        title2: best.title,
        similarity: bestSim,
        precio1: p1.price,
        precio2: best.price
      });
    }
  }

  return comparaciones;
}

// Ruta principal de comparación
router.get('/shopify/compare', async (req, res) => {
  const { shop1, shop2, mode } = req.query;
  if (!shop1 || !shop2) return res.status(400).json({ error: 'Faltan parámetros shop1 o shop2' });

  const productos1 = loadExternalData(shop1);
  const productos2 = loadExternalData(shop2);

  if (!productos1 || !productos2) {
    return res.status(404).json({ error: 'No se encontraron datos para alguna tienda' });
  }

  try {
    if (mode === 'semantic') {
      const comparaciones = await matchSemantic(productos1, productos2);
      return res.json({ comparaciones });
    } else {
      const resultado = matchExact(productos1, productos2);
      return res.json(resultado);
    }
  } catch (err) {
    console.error('Error en comparación:', err);
    res.status(500).json({ error: 'Error interno en comparación' });
  }
});

module.exports = router;