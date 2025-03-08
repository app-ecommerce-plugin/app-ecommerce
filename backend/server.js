const express = require('express');
const session = require('express-session');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de sesión
app.use(session({
  secret: 'secreto_para_sesion',
  resave: false,
  saveUninitialized: true
}));

// Inicia autenticación OAuth
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

// Callback OAuth
app.get('/auth/shopify/callback', async (req, res) => {
  const { shop, code, state } = req.query;

  if (state !== req.session.state) {
    return res.status(403).send('Request origin cannot be verified');
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
    res.status(500).send('Error en OAuth');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
