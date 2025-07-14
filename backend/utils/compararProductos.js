// utils/compararProductos.js

/**
 * Compara listas de productos de la tienda y del JSON por título exacto.
 * @param {Array} storeProducts - Productos de la tienda Shopify.
 * @param {Array} competitorProducts - Productos del JSON de referencia.
 * @returns {Array} Resultado de la comparación.
 */
function compararProductos(storeProducts, competitorProducts) {
  const results = [];
  for (const storeProd of storeProducts) {
    const title = storeProd.title || "";
    const normalizedTitle = title.trim().toLowerCase();

    // Busca por título exacto en competencia
    const match = competitorProducts.find(
      (comp) =>
        comp.title && comp.title.trim().toLowerCase() === normalizedTitle
    );

    // Precio tienda: primer variant o field directo
    let storePrice = 0;
    if (storeProd.variants && storeProd.variants.length > 0) {
      storePrice = parseFloat(storeProd.variants[0].price);
    } else if (storeProd.price) {
      storePrice = parseFloat(storeProd.price);
    }

    if (match) {
      results.push({
        title,
        storePrice,
        competitorPrice: parseFloat(match.price),
        competitorSource: match.source || null,
        competitorUrl: match.url || null,
        currency: match.currency || null,
      });
    } else {
      results.push({
        title,
        storePrice,
        competitorPrice: null,
        competitorSource: null,
        competitorUrl: null,
        currency: null,
      });
    }
  }
  return results;
}

module.exports = compararProductos;