const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const redisClient = require('../utils/redisClient');

// Función para verificar la autenticidad del callback
function verifyHmac(query) {
  const { hmac, ...params } = query;
  const message = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const hash = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  return hash === hmac;
}

// Iniciar autenticación OAuth
router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Falta parámetro "shop".');

  const redirectUri = `${process.env.HOST}/shopify/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_products&redirect_uri=${redirectUri}&state=random_string&grant_options[]=per-user`;

  res.redirect(installUrl);
});

// Callback OAuth
router.get('/callback', async (req, res) => {
  const shop = req.query.shop;
  if (!verifyHmac(req.query)) return res.status(403).send('HMAC inválido');

  // En producción, se intercambia código por token
  const accessToken = 'dummy_access_token';
  await redisClient.set(`accessToken_${shop}`, accessToken);
  await redisClient.set('shopifyShop', shop);

  res.send('Autenticación completada.');
});

module.exports = router;
