// utils/compararProductos.js
const fs = require('fs');
const path = require('path');
const { cosineSimilarity, getCachedEmbedding } = require('./embeddings');

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

async function compararPorEmbeddings(shopifyProducts, externalProducts, threshold = 0.85) {
  const comparaciones = [];
  const matched = new Set();

  for (const p1 of shopifyProducts) {
    const emb1 = await getCachedEmbedding(p1.title);
    if (!emb1) continue;
    let best = null;
    let bestSim = 0;

    for (const p2 of externalProducts) {
      if (matched.has(p2.title)) continue;
      const emb2 = await getCachedEmbedding(p2.title);
      if (!emb2) continue;
      const sim = cosineSimilarity(emb1, emb2);

      if (sim > bestSim) {
        best = p2;
        bestSim = sim;
      }
    }

    if (best && bestSim >= threshold) {
      matched.add(best.title);
      comparaciones.push({
        title1: p1.title,
        title2: best.title,
        similarity: bestSim,
        precioShopify: p1.price,
        precioExterno: best.price,
        diferencia: +(p1.price - best.price).toFixed(2)
      });
    }
  }

  return comparaciones;
}

module.exports = {
  loadExternalData,
  compararPorTitulo,
  compararPorEmbeddings
};