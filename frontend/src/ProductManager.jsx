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
    const competidor = prompt(
      "Dominio (sin .json) del archivo competidor en external_data"
    ); // escribe:  tienda-prueba-multiusuario.myshopify.com
    if (!competidor) return;

    fetch(`${apiUrl}/shopify/compare?shop=${shop}&other=${tiendaRef}.myshopify.com`)
      .then((r) => r.json())
      .then((data) => {
        if (data.comparaciones?.length) {
          const resumen = data.comparaciones
            .map(
              (c) =>
                `${c.tienda.title}\n  Tu: ${c.tienda.price}€  ` +
                `Otro: ${c.externo.price}€  ` +
                `Δ ${c.diferenciaPrecio.toFixed(2)}€`
            )
            .join("\n");
          alert("Comparación:\n\n" + resumen);
        } else {
          alert("Sin coincidencias.");
        }
      })
      .catch((err) => alert("Error: " + err.message));
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
