require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const path = require('path');

// Configuración de Redis (compatible Render/Heroku/local)
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// App express
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy para Render/proxy
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesión
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax' }
}));

// Rutas API
app.use('/products', require('./routes/products'));
app.use('/comparison', require('./routes/comparison'));

// Ruta de prueba para saber si está vivo
app.get('/ping', (req, res) => res.send('pong'));

// Servir el frontend (si tienes build estático en /frontend/dist)
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
);

// Arranque del servidor
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});

module.exports = { redisClient };