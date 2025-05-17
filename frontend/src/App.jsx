import './App.css';
import ProductManager from './ProductManager';

function App() {
  const shopParam = new URLSearchParams(window.location.search).get('shop');

  return (
    <>
      <h1>Frontend conectado a Backend (Render)</h1>
      <ProductManager apiUrl={import.meta.env.VITE_API_URL} shop={shopParam} />
    </>
  );
}

export default App;