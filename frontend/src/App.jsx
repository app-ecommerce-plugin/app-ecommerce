import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/`)
      .then(res => res.text())
      .then(setMessage)
      .catch(err => setMessage(err.message));
  }, []);

  return (
    <>
      <h1>Frontend conectado a Backend (Render)</h1>
      <p>Respuesta del backend: {message}</p>
    </>
  );
}

export default App;