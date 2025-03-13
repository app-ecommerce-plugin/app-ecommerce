require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS correctamente configurado
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true
}));

// Configuración de Redis
const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.connect()
  .then(() => console.log('Conectado a Redis correctamente'))
  .catch(err => console.error('Error al conectar Redis:', err));

// Sesiones con Redis (correctamente configuradas)
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
}));

// Middleware adicional (opcional pero seguro)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Endpoint básico para comprobar servidor activo
app.get('/', (req, res) => {
  res.send('Servidor funcionando correctamente en Render');
});

// Endpoint para verificar sesión OAuth (opcional pero útil)
app.get('/auth/check', (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).send('OAuth no realizado o token perdido.');
  }
  res.send(`OAuth activo, tienda: ${req.session.shop}`);
});

// Endpoint OAuth Shopify (URL correcta)
app.get('/auth/shopify', (req, res) => {
  const shop = req.query.shop;

  if (!shop) return res.status(400).send('Se requiere el parámetro "shop"');

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;

  const state = crypto.randomBytes(16).toString('hex');
  req.session.state = state;

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

  res.redirect(authUrl);
});

// Callback OAuth Shopify con URL correcta (endpoint completo y funcional)
app.get('/auth/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;

  if (state !== req.session.state) {
    return res.status(403).send('No se puede verificar el origen de la solicitud');
  }

  const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
  const payload = {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code,
  };

  try {
    const response = await axios.post(accessTokenRequestUrl, payload);
    req.session.accessToken = response.data.access_token;
    req.session.shop = shop;

    res.redirect(`${process.env.FRONTEND_URL}?shop=${shop}&auth=success`);
  } catch (error) {
    res.status(500).send(`Error en OAuth: ${error.message}`);
  }
});

// Endpoint para obtener productos de prueba desde Shopify (para comprobar conexión OAuth)
app.get('/shopify/products', async (req, res) => {
  if (!req.session.accessToken || !req.session.shop) {
    return res.status(401).send('No autorizado: OAuth aún no se ha completado.');
  }

  try {
    const response = await axios.get(`https://${req.session.shop}/admin/api/2023-10/products.json`, {
      headers: {
        'X-Shopify-Access-Token': req.session.accessToken,
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).send(`Error obteniendo productos: ${error.message}`);
  }
});

// Iniciar servidor Express correctamente configurado para Render
app.listen(PORT, () => {
  console.log(`Servidor corriendo correctamente en puerto ${PORT}`);
});