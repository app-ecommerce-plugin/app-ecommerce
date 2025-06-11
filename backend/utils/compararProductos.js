const { getEmbedding, cosineSimilarity } = require('./embeddings');

/* ------------------------------------------------------------------ */
/* 1. Coincidencia exacta por título (case-insensitive)                */
/* ------------------------------------------------------------------ */
function compararPorTitulo(productosTienda, productosExternos) {
  const resultados = [];

  productosTienda.forEach((p) => {
    if (!p || !p.title) return;

    const match = productosExternos.find(
      (e) =>
        e.title &&
        e.title.trim().toLowerCase() === p.title.trim().toLowerCase()
    );

    if (match) {
      resultados.push({
        tienda: p,
        externo: match,
        diferenciaPrecio: (p.price ?? 0) - (match.price ?? 0),
        metodo: 'title'
      });
    }
  });

  return resultados;
}

/* ------------------------------------------------------------------ */
/* 2. Coincidencia semántica (embeddings OpenAI)                       */
/* ------------------------------------------------------------------ */
async function compararPorEmbeddings(productosTienda, productosExternos) {
  const externosEmb = await Promise.all(
    productosExternos.map(async (e) => ({
      ...e,
      emb: await getEmbedding(`${e.title} ${e.description || ''}`)
    }))
  );

  const resultados = [];

  for (const p of productosTienda) {
    const embP = await getEmbedding(`${p.title} ${p.description || ''}`);

    let best = null;
    externosEmb.forEach((e) => {
      const sim = cosineSimilarity(embP, e.emb);
      if (!best || sim > best.similitud) best = { externo: e, similitud: sim };
    });

    if (best && best.similitud > 0.82) {
      resultados.push({
        tienda: p,
        externo: best.externo,
        similitud: best.similitud.toFixed(3),
        diferenciaPrecio: (p.price ?? 0) - (best.externo.price ?? 0),
        metodo: 'semantic'
      });
    }
  }

  return resultados;
}

module.exports = { compararPorTitulo, compararPorEmbeddings };