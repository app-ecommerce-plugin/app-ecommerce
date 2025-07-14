function compararPorTitulo(storeProducts, competitorProducts, seleccion) {
  const seleccionSet = new Set(seleccion.map((s) => s.id));
  const resultados = [];

  storeProducts.forEach((prodTienda) => {
    if (!seleccionSet.has(prodTienda.id)) return;

    const match = competitorProducts.find(
      (prodComp) =>
        prodComp.title.trim().toLowerCase() ===
        prodTienda.title.trim().toLowerCase()
    );

    if (match) {
      resultados.push({
        title: prodTienda.title,
        storePrice: prodTienda.variants?.[0]?.price || null,
        competitorPrice: match.price,
        diferenciaPrecio:
          parseFloat(prodTienda.variants?.[0]?.price || 0) -
          parseFloat(match.price || 0),
      });
    }
  });

  return resultados;
}

module.exports = { compararPorTitulo };
