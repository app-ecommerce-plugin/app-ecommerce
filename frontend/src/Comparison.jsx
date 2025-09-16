// frontend/src/Comparison.jsx
import { useEffect, useMemo, useState } from "react";

export default function Comparison({ apiUrl, shop }) {
  const [mode, setMode] = useState("title"); // title | includes | fuzzy
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const modes = useMemo(
    () => [
      { value: "title", label: "Coincidencia por título (exacta)" },
      { value: "includes", label: "Inclusión (título contiene…)" },
      { value: "fuzzy", label: "Coincidencia difusa (tokens)" },
    ],
    []
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const url = `${apiUrl}/shopify/comparison?shop=${encodeURIComponent(
        shop
      )}&mode=${encodeURIComponent(mode)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`GET /comparison ${res.status}: ${t}`);
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error(e);
      setErr(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, mode]);

  return (
    <div className="p-4 border border-gray-700 rounded mt-8">
      <h3 className="text-2xl font-semibold mb-2">
        Comparación con competencia
      </h3>
      <p className="text-gray-300 mb-3">
        Muestra el precio actual de tu catálogo frente a la fuente de
        competencia disponible (pendientes recientes o catálogo de competidores
        si existe en Redis).
      </p>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-sm text-gray-300">Modo:</label>
        <select
          className="bg-slate-800 text-white px-2 py-1 rounded"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={loading}
        >
          {modes.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <button
          className="px-3 py-2 rounded bg-slate-700 text-white"
          onClick={load}
          disabled={loading}
          title="Recargar comparación"
        >
          Recargar
        </button>

        {loading && <span className="ml-2 text-sm">Cargando…</span>}
        {err && <span className="ml-2 text-sm text-red-400">⚠️ {err}</span>}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-700">
              <th className="py-2 pr-4">Producto</th>
              <th className="py-2 pr-4">Actual</th>
              <th className="py-2 pr-4">Competencia</th>
              <th className="py-2 pr-4">Método</th>
              <th className="py-2 pr-4">Score</th>
              <th className="py-2 pr-4">VariantId</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const worse =
                Number.isFinite(r.currentPrice) &&
                Number.isFinite(r.competitorPrice)
                  ? r.currentPrice > r.competitorPrice
                  : false;
              return (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-2 pr-4">{r.title}</td>
                  <td className="py-2 pr-4">{r.currentPrice ?? "—"}</td>
                  <td
                    className={`py-2 pr-4 ${worse ? "text-amber-300" : ""}`}
                    title={
                      worse ? "Tu precio está por encima de la competencia" : ""
                    }
                  >
                    {r.competitorPrice ?? "—"}
                  </td>
                  <td className="py-2 pr-4">{r.match_method || "—"}</td>
                  <td className="py-2 pr-4">{r.score ?? "—"}</td>
                  <td className="py-2 pr-4">{r.variantId ?? "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-400">
                  No hay datos de comparación disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}