// backend/routes/auth.js
const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto");
const redis = require("../utils/redisClient");
const { encrypt } = require("../utils/crypto");
const { validateShopParam } = require("../middleware/shopValidation");

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES || "read_products,write_products";
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI; // e.g. https://tuapp.com/shopify/auth/callback

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_REDIRECT_URI) {
  console.warn(
    "[WARN] Falta configuración Shopify (API_KEY/SECRET/REDIRECT_URI)"
  );
}

const stateKey = (state) => `oauth_state_${state}`;
const tokenKey = (shop) => `accessToken_${shop}`;
const shopsSetKey = "shops";

// Helper: genera y guarda state con TTL
async function issueState() {
  const state = crypto.randomBytes(16).toString("hex");
  await redis.set(stateKey(state), "1", { EX: 600 }); // 10 minutos
  return state;
}

// Helper: verifica HMAC de Shopify (querystring sin hmac)
function verifyShopifyHmac(params, secret) {
  const { hmac, signature, ...rest } = params;
  const keys = Object.keys(rest).sort();
  const msg = keys
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(msg)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "utf8"),
    Buffer.from(hmac, "utf8")
  );
}

// GET /shopify/auth/shopify?shop=mitienda.myshopify.com
router.get("/auth/shopify", validateShopParam, async (req, res) => {
  const shop = req.shop;
  const state = await issueState();
  const url =
    `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(
      SHOPIFY_API_KEY
    )}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}`;
  return res.redirect(url);
});

// GET /shopify/auth/callback?shop=...&code=...&state=...&hmac=...
router.get("/auth/callback", async (req, res) => {
  try {
    const { shop, code, state, hmac } = req.query || {};
    if (!shop || !code || !state || !hmac) {
      return res.status(400).send("Parámetros inválidos");
    }

    // 1) verificar state
    const exists = await redis.get(stateKey(state));
    if (!exists) return res.status(400).send("State inválido o expirado");
    await redis.del(stateKey(state));

    // 2) verificar HMAC
    if (!verifyShopifyHmac(req.query, SHOPIFY_API_SECRET)) {
      return res.status(400).send("HMAC inválido");
    }

    // 3) intercambiar code por access_token
    const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("OAuth token exchange failed:", resp.status, body);
      return res.status(502).send("No se pudo obtener token");
    }

    const data = await resp.json(); // { access_token, scope }
    const enc = encrypt(data.access_token);
    await redis.set(tokenKey(shop), enc);
    await redis.sAdd(shopsSetKey, shop);

    // Redirigir a tu frontend/dashboard
    const frontendUrl = process.env.APP_DASHBOARD_URL || "/";
    return res.redirect(
      `${frontendUrl}?shop=${encodeURIComponent(shop)}&installed=1`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.status(500).send("Error en callback OAuth");
  }
});

module.exports = router;