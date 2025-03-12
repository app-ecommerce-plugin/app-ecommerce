require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS
app.use(cors({
  origin: process.env.FRONTEND_URL, // SE DEBE CONFIGURAR EN .env
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true
}));

// Configurar Redis para sesiones
const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.connect().catch(console.error);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET, // SE DEBE CONFIGURAR EN .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // CAMBIAR A FALSE SI PRUEBAS LOCALMENTE SIN HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
}));

// Middleware para CORS (Extra, por si acaso)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL); // SE DEBE CONFIGURAR EN .env
  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando correctamente en Render');
});

// OAuth Shopify
app.get('/auth/shopify', (req, res) => {
  const shop = req.query.shop;
  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const state = Math.random().toString(36).substring(2);

  req.session.state = state;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  res.redirect(installUrl);
});

// Callback OAuth Shopify
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

    res.send('OAuth completado con éxito!');
  } catch (error) {
    res.status(500).send(`Error en OAuth: ${error.message}`);
  }
});

// Servidor activo
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});