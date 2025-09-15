import { useEffect, useState } from "react";

export default function RecommendationsReview({ shop }) {
  const [pending, setPending] = useState([]);
  const [prods, setProds] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const API = import.meta.env.VITE_BACKEND_URL;

  async function load() {
    setLoading(true);
    const p = await fetch(`${API}/shopify/recommend/pending?shop=${shop}`).then(
      (r) => r.json()
    );
    setPending(p.items || []);
    const pr = await fetch(`${API}/shopify/products?shop=${shop}`).then((r) =>
      r.json()
    );
    setProds(pr.products || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [shop]);

  // Ocultar notificación después de 3 segundos
  useEffect(() => {
    if (notif) {
      const timer = setTimeout(() => setNotif(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notif]);

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

  const selectableIds = rows.filter((r) => r.variantId).map((r) => r.variantId);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected[id]);

  function toggle(vId) {
    setSelected((s) => ({ ...s, [vId]: !s[vId] }));
  }

  function toggleAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const newSelected = {};
      for (const vId of selectableIds) {
        newSelected[vId] = true;
      }
      setSelected(newSelected);
    }
  }

  async function approve() {
    const items = rows
      .filter((r) => r.variantId && selected[r.variantId])
      .map((r) => ({
        variantId: r.variantId,
        newPrice: String(r.suggestedPrice),
        title: r.title,
      }));

    if (!items.length) {
      setNotif({ text: "Selecciona al menos un producto", error: true });
      return;
    }

    setLoading(true);
    const body = { shop, items };
    const resp = await fetch(`${API}/shopify/recommend/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

    setNotif({
      text: `Aplicados: ${resp.updated?.filter((x) => x.ok).length || 0}`,
      error: false,
    });
    load();
  }

  async function reject(title) {
    setLoading(true);
    await fetch(`${API}/shopify/recommend/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop, titles: [title] }),
    });
    setNotif({ text: "Recomendación rechazada", error: false });
    load();
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl mb-2">Revisión de precios</h2>
      <button
        className="px-3 py-2 rounded bg-slate-700 text-white mb-3"
        onClick={load}
        disabled={loading}
      >
        Recargar pendientes
      </button>

      {loading && <div className="text-center my-2">Cargando...</div>}

      {notif && (
        <div
          className={`${
            notif.error ? "bg-red-600" : "bg-green-600"
          } text-white p-2 mb-3`}
        >
          {notif.text}
        </div>
      )}

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                disabled={loading}
                onChange={toggleAll}
              />
            </th>
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
                    disabled={loading}
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
                  disabled={loading}
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
          disabled={loading}
        >
          Aplicar seleccionados
        </button>
      </div>
    </div>
  );
}