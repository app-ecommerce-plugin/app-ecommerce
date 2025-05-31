//backend/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const redisClient = require('../utils/redisClient');

// Función auxiliar para verificar HMAC de la petición de callback (seguridad de Shopify)
function verifyHmac(query) {
  const { hmac, signature, ...params } = query;
  const message = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const providedHmac = hmac || signature;  // Shopify utiliza 'hmac'; 'signature' quedó obsoleto
  const hash = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  return hash === providedHmac;
}

// GET /shopify/auth - Inicia el proceso de autenticación OAuth en Shopify
router.get('/', async (req, res) => {
  try {
    const shop = req.query.shop || process.env.SHOPIFY_SHOP;
    if (!shop) {
      return res.status(400).send('Falta el parámetro de tienda (shop)');
    }
    const apiKey = process.env.SHOPIFY_API_KEY;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_products';
    const redirectUri = `${req.protocol}://${req.get('host')}/shopify/auth/callback`;
    // URL de autorización de Shopify
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}`;
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error al iniciar autenticación OAuth:', error);
    res.status(500).send('No se pudo iniciar la autenticación con Shopify');
  }
});

// GET /shopify/auth/callback - Callback de Shopify OAuth, obtiene el token y lo almacena
router.get('/callback', async (req, res) => {
  try {
    const { shop, code, hmac } = req.query;
    if (!shop || !code) {
      return res.status(400).send('Parámetros inválidos en la respuesta de OAuth');
    }
    // Verificar la validez de la firma HMAC para seguridad
    if (!verifyHmac(req.query)) {
      return res.status(400).send('Respuesta de OAuth no válida (falló verificación HMAC)');
    }
    // Solicitar el token de acceso usando el código proporcionado
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code: code
    });
    const accessToken = tokenResponse.data.access_token;
    // Guardar token y tienda en Redis para usos futuros
    await redisClient.set(`accessToken_${shop}`, accessToken);
    await redisClient.set('shopifyShop', shop);
    console.log(`Tienda ${shop} autenticada. Token guardado en Redis.`);
    res.send('Autenticación de Shopify completada correctamente. Ya puede usar la aplicación.');
  } catch (error) {
    console.error('Error en callback de autenticación:', error.response?.data || error.message);
    res.status(500).send('Error al procesar la autenticación de Shopify');
  }
});

module.exports = router;