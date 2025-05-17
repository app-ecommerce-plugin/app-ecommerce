import './App.css';
import ProductManager from './ProductManager';
import { useState } from 'react';

function App() {
  const shopParam = new URLSearchParams(window.location.search).get('shop');
  const apiUrl = import.meta.env.VITE_API_URL;
  const [debugData, setDebugData] = useState(null);
  const [debugError, setDebugError] = useState(null);

  const fetchDebugInfo = async () => {
    try {
      const res = await fetch(`${apiUrl}/debug/shopify/config?shop=${shopParam}`);
      if (!res.ok) throw new Error('Error al obtener datos de debug');
      const data = await res.json();
      setDebugData(data);
      setDebugError(null);
    } catch (err) {
      setDebugError(err.message);
      setDebugData(null);
    }
  };

  return (
    <>
      <h1>Frontend conectado a Backend (Render)</h1>
      <ProductManager apiUrl={apiUrl} shop={shopParam} />

      <hr />
      <button onClick={fetchDebugInfo}>🧪 Ver configuración en Redis</button>

      {debugError && <p style={{ color: 'red' }}>⚠️ {debugError}</p>}
      {debugData && (
        <pre style={{ textAlign: 'left', background: '#222', padding: '1rem', color: 'lime' }}>
          {JSON.stringify(debugData, null, 2)}
        </pre>
      )}
    </>
  );
}

export default App;
