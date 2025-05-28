const { getEmbedding, cosineSimilarity } = require('./embeddings');

/** 1. Comparación simple por coincidencia en título */
function compararPorTitulo(productosTienda, productosExternos) {
  const resultados = [];

  productosTienda.forEach((p) => {
    const match = productosExternos.find((e) =>
      e.title.toLowerCase() === p.title.toLowerCase()
    );
    if (match) {
      resultados.push({
        tienda: p,
        externo: match,
        diferenciaPrecio: p.price - match.price,
        metodo: 'title'
      });
    }
  });

  return resultados;
}

/** 2. Comparación semántica con embeddings */
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
        diferenciaPrecio: p.price - best.externo.price,
        metodo: 'semantic'
      });
    }
  }

  return resultados;
}

module.exports = { compararPorTitulo, compararPorEmbeddings };