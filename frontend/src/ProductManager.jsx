// frontend/src/ProductManager.jsx
import { useEffect, useState } from "react";

export default function ProductManager({ apiUrl, shop }) {
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState({}); // id -> bool

  // Notificaciones 3s
  useEffect(() => {
    if (notif) {
      const t = setTimeout(() => setNotif(null), 3000);
      return () => clearTimeout(t);
    }
  }, [notif]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}/shopify/products?shop=${encodeURIComponent(shop)}`
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`GET /products ${res.status}: ${txt}`);
      }
      const data = await res.json();
      const list = Array.isArray(data.products) ? data.products : [];
      setProducts(list);

      const raw = localStorage.getItem(`sel:${shop}`);
      if (raw) setSelected(JSON.parse(raw));
    } catch (e) {
      console.error(e);
      setNotif({ text: "Error cargando productos", error: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop]);

  const allIds = products.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected[id]);

  function toggleOne(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const next = {};
      for (const id of allIds) next[id] = true;
      setSelected(next);
    }
  }

  async function saveSelection() {
    const productIds = Object.entries(selected)
      .filter(([_, v]) => v)
      .map(([k]) => Number(k));

    if (!productIds.length) {
      setNotif({ text: "Selecciona al menos un producto", error: true });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/shopify/products/selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, productIds }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`POST /products/selected ${res.status}: ${txt}`);
      }
      const data = await res.json();
      setNotif({ text: `Guardados: ${data.count} productos`, error: false });
      localStorage.setItem(`sel:${shop}`, JSON.stringify(selected));
    } catch (e) {
      console.error(e);
      setNotif({ text: "Error al guardar", error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 border border-gray-700 rounded">
      <h3 className="text-xl mb-2">Productos disponibles</h3>

      {notif && (
        <div
          className={`${
            notif.error ? "bg-red-600" : "bg-green-600"
          } text-white p-2 mb-3`}
        >
          {notif.text}
        </div>
      )}

      <div className="mb-2">
        <button
          className="px-3 py-2 rounded bg-slate-700 text-white mr-2"
          onClick={load}
          disabled={loading}
        >
          Recargar
        </button>
        <button
          className="px-3 py-2 rounded bg-emerald-600 text-white"
          onClick={saveSelection}
          disabled={loading}
        >
          Guardar selección
        </button>
      </div>

      {loading && <div className="my-2">Cargando...</div>}

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th style={{ width: 40 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={loading || products.length === 0}
              />
            </th>
            <th>Producto</th>
            <th>Precio</th>
            <th>VariantId</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-800">
              <td>
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={() => toggleOne(p.id)}
                  disabled={loading}
                />
              </td>
              <td>{p.title}</td>
              <td>{p.price ?? "—"}</td>
              <td>{p.variantId ?? "—"}</td>
            </tr>
          ))}
          {products.length === 0 && !loading && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-400">
                No hay productos o la tienda no está autorizada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}