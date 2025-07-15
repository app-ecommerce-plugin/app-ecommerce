import { useEffect, useState } from 'react';

function SelectedProducts() {
  const [selected, setSelected] = useState([]); // objetos con { id, title }
  const [message, setMessage] = useState('');
  const API_URL = import.meta.env.VITE_API_URL;

  const shopParam = new URLSearchParams(window.location.search).get('shop');

  useEffect(() => {
    const fetchSelected = async () => {
      try {
        const res = await fetch(`${API_URL}/shopify/products/selected?shop=${shopParam}`);
        const data = await res.json();
        setSelected(data.selectedProducts || []);
      } catch (err) {
        setMessage('❌ Error al obtener selección: ' + err.message);
      }
    };

    fetchSelected();
  }, [API_URL, shopParam]);

  return (
    <div>
      <h2>✅ Productos seleccionados</h2>
      {message && <p style={{ color: 'red' }}>{message}</p>}
      {selected.length === 0 && <p>No hay productos seleccionados.</p>}
      <ul>
        {selected.map(p => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default SelectedProducts;