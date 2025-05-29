const { getEmbedding, cosineSimilarity } = require('./embeddings');

/**
 * Comparación básica:
 *   1. Intenta emparejar por ID (más fiable).
 *   2. Si no coincide por ID, compara el título (case-insensitive).
 *   Ignora entradas que no tengan título o id.
 */
function compararPorTitulo(productosTienda, productosExternos) {
  const resultados = [];

  productosTienda.forEach((p) => {
    if (!p) return; // seguridad contra null/undefined

    let match = null;

    // ─ Emparejar por ID ─
    if (p.id !== undefined) {
      match = productosExternos.find((e) => e.id === p.id);
    }

    // ─ Emparejar por título ─
    if (!match && p.title) {
      match = productosExternos.find(
        (e) => e.title && e.title.toLowerCase() === p.title.toLowerCase()
      );
    }

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