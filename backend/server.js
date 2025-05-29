require('dotenv').config();  // Carga variables de entorno desde .env si existe

const express = require('express');
const cors = require('cors');

const productsRoutes = require('./routes/products');
const comparisonRoutes = require('./routes/comparison');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de CORS y parsing de JSON
app.use(cors());  // Permite peticiones de cualquier origen (ajustable según dominio del frontend)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));  // (Opcional) parsea formularios URL-encoded

// Montar rutas bajo el prefijo /shopify
app.use('/shopify/products', productsRoutes);
app.use('/shopify/comparison', comparisonRoutes);
app.use('/shopify/auth', authRoutes);

// Ruta base (opcional) para verificar funcionamiento
app.get('/', (req, res) => {
  res.send('Backend de Shopify activo');
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});