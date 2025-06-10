// ProductManager.jsx
import { useEffect, useState } from "react";

function ProductManager({ apiUrl, shop }) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState("");
  const [compareResult, setCompareResult] = useState(null);

  useEffect(() => {
    if (!shop) return;

    // Mensaje de backend
    fetch(`${apiUrl}/`)
      .then((res) => res.text())
      .then(setMessage)
      .catch((err) => setMessage(err.message));

    // Obtener productos
    fetch(`${apiUrl}/shopify/products?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setProducts(data.products || []))
      .catch(console.error);

    // Obtener productos seleccionados
    fetch(`${apiUrl}/shopify/products/selected?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => {
        const ids = (data.selectedProducts || []).map((p) => p.id ?? p);
        setSelected(ids);
      })
      .catch(console.warn);
  }, [apiUrl, shop]);

  const toggleSelection = (productId) => {
    const updated = selected.includes(productId)
      ? selected.filter((id) => id !== productId)
      : [...selected, productId];
    setSelected(updated);
  };

  const saveSelection = () => {
    fetch(`${apiUrl}/shopify/products/selected`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop, selectedProducts: selected }),
    })
      .then((res) =>
        res.ok ? alert("✅ Selección guardada") : alert("❌ Error al guardar")
      )
      .catch(console.error);
  };

  const compararPrecios = () => {
    const tiendaReferencia = prompt(
      "Introduce el dominio de la otra tienda a comparar (sin .myshopify.com)"
    );
    if (!tiendaReferencia) return;

    fetch(
      `${apiUrl}/shopify/compare?shop=${shop}&otherShop=${tiendaReferencia}.myshopify.com&mode=title`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.comparaciones && data.comparaciones.length > 0) {
          const resumen = data.comparaciones
            .map(
              (p) =>
                `${p.title}: ${p.tienda1}€ vs ${
                  p.tienda2 || "No encontrado"
                }€ → Δ ${p.diferencia || "n/a"}`
            )
            .join("\n");
          alert(`🛍️ Comparativa:\n\n${resumen}`);
        } else {
          alert("No se encontraron coincidencias entre productos.");
        }
        setCompareResult(data);
      })
      .catch((err) => alert("Error al comparar productos: " + err.message));
  };

  const limpiarComparacion = () => {
    setCompareResult(null);
  };

  return (
    <>
      <h2>🛒 Productos disponibles</h2>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggleSelection(p.id)}
            />
            {p.title}
          </li>
        ))}
      </ul>

      <button onClick={saveSelection}>💾 Guardar selección</button>
      <button onClick={compararPrecios}>📊 Comparar con otra tienda</button>

      <h2>✅ Productos seleccionados</h2>
      <ul>
        {selected.map((id) => {
          const product = products.find((p) => p.id === id);
          return <li key={id}>{product?.title || id}</li>;
        })}
      </ul>

      {compareResult && (
        <>
          <h2>🔎 Resultado de comparación</h2>
          <button onClick={limpiarComparacion}>🧹 Limpiar resultados</button>

          <h3>🟡 Comunes</h3>
          <ul>
            {compareResult.comunes.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>

          <h3>🔴 Solo en esta tienda</h3>
          <ul>
            {compareResult.soloEn1.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>

          <h3>🟢 Solo en la otra tienda</h3>
          <ul>
            {compareResult.soloEn2.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default ProductManager;
