require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
app.use(cors());


const app = express();
const PORT = process.env.PORT;

// Middleware para sesiones (ya estaba correcto)
app.use(session({
  secret: process.env.SESSION_SECRET || 'CAMBIA_ESTE_SECRETO_EN_PRODUCCION',
  resave: false,
  saveUninitialized: true
}));

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando correctamente en Render');
});

// OAuth inicio (ya estaba correcto)
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

// Callback OAuth adaptado (mínimo cambio)
app.get('/auth/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;

  if (state !== req.session.state) {
    return res.status(403).send('Request origin cannot be verified');
  }

  const payload = {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code,
  };

  try {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, payload);
    req.session.accessToken = response.data.access_token;
    req.session.shop = shop;

    res.send('OAuth completado con éxito!');
  } catch (error) {
    res.status(500).send(`Error en OAuth: ${error.message}`);
  }
});

// Servidor activo
app.get('/', (req, res) => {
  res.send('Servidor Shopify activo!');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});