// src/App.jsx
import "./App.css";
import ProductManager from "./ProductManager";
import RecommendationsReview from "./RecommendationsReview";
import Comparison from "./Comparison"; // ⬅️ NUEVO
import { useState } from "react";

function App() {
  const shopParam =
    new URLSearchParams(window.location.search).get("shop") || ""; // si viene vacío, mostramos aviso
  const apiUrl = import.meta.env.VITE_API_URL;

  const [debugData, setDebugData] = useState(null);
  const [debugError, setDebugError] = useState(null);
  const [reviewMsg, setReviewMsg] = useState("");

  const fetchDebugInfo = async () => {
    setReviewMsg("");
    try {
      const res = await fetch(
        `${apiUrl}/debug/shopify/config?shop=${encodeURIComponent(shopParam)}`
      );
      if (!res.ok) throw new Error("Error al obtener datos de debug");
      const data = await res.json();
      setDebugData(data);
      setDebugError(null);
    } catch (err) {
      setDebugError(err.message);
      setDebugData(null);
    }
  };

  // Genera y guarda recomendaciones pendientes en Redis
  const generarRevision = async () => {
    setDebugError(null);
    setDebugData(null);
    setReviewMsg("Generando recomendaciones…");
    try {
      const body = {
        shop: shopParam,
        mode: "auto", // auto|exact|includes|fuzzy|semantic
        undercutPct: 5, // % por debajo de la competencia (si aplica)
        minMarginPct: 3, // % de margen mínimo (si aplica)
      };

      const res = await fetch(`${apiUrl}/shopify/recommend/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(
          `No se pudo generar la revisión (${res.status}): ${t || "Error"}`
        );
      }

      const json = await res.json();
      const n = json?.pending?.items?.length ?? 0;
      setReviewMsg(
        `✅ Revisión generada: ${n} sugerencias pendientes. Revisa y aprueba abajo.`
      );
    } catch (err) {
      setReviewMsg("");
      setDebugError(err.message);
    }
  };

  if (!shopParam) {
    return (
      <div style={{ padding: "1.25rem" }}>
        <h1>Frontend conectado a Backend (Render)</h1>
        <p style={{ color: "#ffb703" }}>
          ⚠️ Falta el parámetro <code>?shop=tu-tienda.myshopify.com</code> en la
          URL.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1>Frontend conectado a Backend (Render)</h1>

      {/* Gestión de selección de productos */}
      <ProductManager apiUrl={apiUrl} shop={shopParam} />

      {/* Comparación con competencia (NUEVO) */}
      <Comparison apiUrl={apiUrl} shop={shopParam} />

      <hr />

      {/* Generar revisión de precios (pendientes) */}
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={generarRevision}>
          ⚙️ Generar recomendaciones (pendientes)
        </button>
        {reviewMsg && (
          <p style={{ marginTop: "0.5rem", color: "#8be28b" }}>{reviewMsg}</p>
        )}
      </div>

      {/* Panel de revisión/aprobación */}
      <RecommendationsReview apiUrl={apiUrl} shop={shopParam} />

      <hr />

      {/* Debug Redis */}
      <button onClick={fetchDebugInfo}>🧪 Ver configuración en Redis</button>
      {debugError && <p style={{ color: "red" }}>⚠️ {debugError}</p>}
      {debugData && (
        <pre
          style={{
            textAlign: "left",
            background: "#222",
            padding: "1rem",
            color: "lime",
          }}
        >
          {JSON.stringify(debugData, null, 2)}
        </pre>
      )}
    </>
  );
}

export default App;