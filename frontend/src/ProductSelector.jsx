import { useEffect, useState } from 'react';

function ProductSelector() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const API_URL = import.meta.env.VITE_API_URL;

  const shopParam = new URLSearchParams(window.location.search).get('shop');

  useEffect(() => {
    fetch(`${API_URL}/shopify/products?shop=${shopParam}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
      })
      .catch(err => {
        setMessage('Error al cargar productos: ' + err.message);
      });
  }, []);

  const toggle = (productId) => {
    const updated = new Set(selected);
    updated.has(productId) ? updated.delete(productId) : updated.add(productId);
    setSelected(updated);
  };

  const guardar = async () => {
    try {
      const res = await fetch(`${API_URL}/shopify/seleted`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopParam,
          selected_products: Array.from(selected),
        }),
      });
      const msg = await res.text();
      setMessage(msg);
    } catch (err) {
      setMessage('Error al guardar: ' + err.message);
    }
  };

  return (
    <div>
      <h2>Selecciona productos para comparar</h2>
      {products.map(p => (
        <label key={p.id}>
          <input
            type="checkbox"
            checked={selected.has(p.id)}
            onChange={() => toggle(p.id)}
          />
          {p.title}
        </label>
      ))}
      <br />
      <button onClick={guardar}>Guardar selección</button>
      {message && <p>{message}</p>}
    </div>
  );
}

export default ProductSelector;