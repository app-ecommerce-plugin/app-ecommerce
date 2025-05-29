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
        const res = await fetch(`${API_URL}/shopify/selected?shop=${shopParam}`, {
          credentials: 'include',
        });
        const data = await res.json();
        setSelectedIds(data.selected || []);
      } catch (err) {
        setMessage('Error al obtener selección: ' + err.message);
      }
    };

    fetchSelected();
  }, []);

  useEffect(() => {
    if (!selectedIds.length) return;

    fetch(`${API_URL}/shopify/products?shop=${shopParam}`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        const filtered = data.products.filter(p => selectedIds.includes(p.id));
        setProducts(filtered);
      })
      .catch(err => {
        setMessage('Error al cargar productos seleccionados: ' + err.message);
      });
  }, [selectedIds]);

  return (
    <div>
      <h2>Productos seleccionados</h2>
      {message && <p>{message}</p>}
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