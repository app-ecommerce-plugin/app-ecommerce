import { useEffect, useState } from "react";

export default function RecommendationsReview({ shop }) {
  const [pending, setPending] = useState([]);
  const [prods, setProds] = useState([]);
  const [selected, setSelected] = useState({}); // variantId -> boolean
  const API = import.meta.env.VITE_BACKEND_URL; // ya lo usas en tu app

  async function load() {
    const p = await fetch(`${API}/shopify/recommend/pending?shop=${shop}`).then(
      (r) => r.json()
    );
    setPending(p.items || []);
    const pr = await fetch(`${API}/shopify/products?shop=${shop}`).then((r) =>
      r.json()
    );
    setProds(pr.products || []);
  }

  useEffect(() => {
    load();
  }, [shop]);

  function toMapByTitle(arr) {
    const m = new Map();
    for (const x of arr) m.set(x.title, x);
    return m;
  }

  const byTitle = toMapByTitle(prods);

  const rows = pending.map((p) => {
    const prod = byTitle.get(p.title);
    return {
      title: p.title,
      currentPrice: prod?.price ?? p.currentPrice,
      competitorPrice: p.competitorPrice,
      suggestedPrice: p.suggestedPrice,
      variantId: prod?.variantId,
    };
  });

  function toggle(vId) {
    setSelected((s) => ({ ...s, [vId]: !s[vId] }));
  }

  async function approve() {
    const items = rows
      .filter((r) => r.variantId && selected[r.variantId])
      .map((r) => ({
        variantId: r.variantId,
        newPrice: String(r.suggestedPrice),
        title: r.title,
      }));

    if (!items.length) return alert("Selecciona al menos un producto");

    const body = { shop, items };
    const resp = await fetch(`${API}/shopify/recommend/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

    alert(`Aplicados: ${resp.updated?.filter((x) => x.ok).length || 0}`);
    load();
  }

  async function reject(title) {
    await fetch(`${API}/shopify/recommend/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop, titles: [title] }),
    });
    load();
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl mb-2">Revisión de precios</h2>
      <button
        className="px-3 py-2 rounded bg-slate-700 text-white mb-3"
        onClick={load}
      >
        Recargar pendientes
      </button>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th></th>
            <th>Producto</th>
            <th>Actual</th>
            <th>Competencia</th>
            <th>Sugerido</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.title} className="border-b border-gray-800">
              <td>
                {r.variantId ? (
                  <input
                    type="checkbox"
                    checked={!!selected[r.variantId]}
                    onChange={() => toggle(r.variantId)}
                  />
                ) : (
                  <span title="Sin variantId">—</span>
                )}
              </td>
              <td>{r.title}</td>
              <td>{r.currentPrice}</td>
              <td>{r.competitorPrice}</td>
              <td>{r.suggestedPrice}</td>
              <td>
                <button
                  className="text-red-400 underline"
                  onClick={() => reject(r.title)}
                >
                  Rechazar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3">
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white"
          onClick={approve}
        >
          Aplicar seleccionados
        </button>
      </div>
    </div>
  );
}
