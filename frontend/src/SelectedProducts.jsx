import { useEffect, useState } from 'react';

function SelectedProducts() {
  const [selectedIds, setSelectedIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const API_URL = import.meta.env.VITE_API_URL;

  const shopParam = new URLSearchParams(window.location.search).get('shop');

  useEffect(() => {
    const fetchSelected = async () => {
      try {
        const res = await fetch(`${API_URL}/shopify/products/selected?shop=${shopParam}`);
        const data = await res.json();
        setSelectedIds(data.selectedProducts || []);
      } catch (err) {
        setMessage('❌ Error al obtener selección: ' + err.message);
      }
    };

    fetchSelected();
  }, [API_URL, shopParam]);

  useEffect(() => {
    if (!selectedIds.length) return;

    fetch(`${API_URL}/shopify/products?shop=${shopParam}`)
      .then(res => res.json())
      .then(data => {
        // Si backend devuelve { products: [...] }
        const list = data.products || data;
        const filtered = list.filter(p => selectedIds.includes(p.id));
        setProducts(filtered);
      })
      .catch(err => {
        setMessage('❌ Error al cargar productos seleccionados: ' + err.message);
      });
  }, [selectedIds, API_URL, shopParam]);

  return (
    <div>
      <h2>✅ Productos seleccionados</h2>
      {message && <p style={{ color: 'red' }}>{message}</p>}
      {products.length === 0 && <p>No hay productos seleccionados.</p>}
      <ul>
        {products.map(p => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default SelectedProducts;
