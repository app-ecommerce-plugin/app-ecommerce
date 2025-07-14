import React from 'react';

function SelectedProducts({ selectedProducts, comparisonResults, onCompare, onRemoveProduct }) {
  if (!selectedProducts || selectedProducts.length === 0) {
    return <p>No has seleccionado productos para comparar.</p>;
  }

  const hasComparison = comparisonResults && comparisonResults.length > 0;

  return (
    <div>
      <h2>Productos seleccionados</h2>
      <ul>
        {selectedProducts.map((prod) => {
          const compData = hasComparison ? comparisonResults.find(c => c.title === prod.title) : null;
          const competitorPrice = compData ? compData.competitorPrice : null;
          return (
            <li key={prod.id}>
              {prod.title} – Tienda: {prod.variants?.[0]?.price || prod.price}€
              {competitorPrice != null
                ? <> | Competidor: {competitorPrice}€</>
                : <> | Competidor: No disponible</>}
              <button onClick={() => onRemoveProduct(prod.id)}>Quitar</button>
            </li>
          );
        })}
      </ul>
      {!hasComparison && (
        <button onClick={onCompare} disabled={selectedProducts.length === 0}>
          Comparar precios
        </button>
      )}
    </div>
  );
}

export default SelectedProducts;