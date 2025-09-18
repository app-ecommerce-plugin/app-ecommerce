// backend/routes/auth.js
const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");
const redis = require("../utils/redisClient");
const { validateShopParam } = require("../middleware/shopValidation");
const { tokenKey } = require("../middleware/ensureShopAccess");
const { encrypt } = require("../utils/crypto");

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_REDIRECT_URI =
  process.env.SHOPIFY_REDIRECT_URI ||
  "https://app-ecommerce-7h17.onrender.com/shopify/auth/callback";
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES || "read_products,write_products,read_orders";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
  // No hacemos throw para no romper el arranque, pero dejamos aviso claro.
  console.warn(
    "[auth] Falta SHOPIFY_API_KEY o SHOPIFY_API_SECRET en el entorno"
  );
}

const stateKey = (state) => `oauth_state:${state}`; // -> JSON {shop, createdAt}

// ---------- Helpers
function buildAuthorizeURL(shop, state) {
  const base = `https://${shop}/admin/oauth/authorize`;
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: SHOPIFY_REDIRECT_URI,
    state,
    "grant_options[]": "", // offline por defecto
  });
  return `${base}?${params.toString()}`;
}

function verifyHmac(queryObj, secret) {
  const { hmac, signature, ...rest } = queryObj;
  const keys = Object.keys(rest).sort();
  const message = keys.map((k) => `${k}=${rest[k]}`).join("&");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(hmac, "utf8"),
    Buffer.from(digest, "utf8")
  );
}

async function exchangeCodeForToken(shop, code) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const body = {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  if (!resp.ok) {
    throw new Error(`access_token ${resp.status}: ${txt}`);
  }
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Error(`access_token JSON inválido: ${txt}`);
  }
  return json.access_token;
}

// ---------- Rutas

// Inicia OAuth: genera 'state' (guardado en Redis) y redirige a Shopify.
router.get("/auth", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const state = crypto.randomBytes(16).toString("hex");
    await redis.set(
      stateKey(state),
      JSON.stringify({ shop, createdAt: Date.now() }),
      "EX",
      600
    );
    const url = buildAuthorizeURL(shop, state);
    return res.redirect(302, url);
  } catch (err) {
    console.error("GET /auth error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "No se pudo iniciar OAuth" });
  }
});

// Callback de Shopify: valida hmac/state y canjea el code por token.
router.get("/auth/callback", async (req, res) => {
  try {
    const { shop, code, state, hmac, host } = req.query;

    // Validación de parámetros
    const missing = [];
    if (!shop) missing.push("shop");
    if (!code) missing.push("code");
    if (!state) missing.push("state");
    if (!hmac) missing.push("hmac");
    if (!host) missing.push("host");

    if (missing.length) {
      return res
        .status(400)
        .send(`Parámetros inválidos (faltan: ${missing.join(", ")})`);
    }

    // Valida que el state exista y pertenezca a ese shop
    const raw = await redis.get(stateKey(state));
    if (!raw) {
      return res
        .status(400)
        .send("Parámetros inválidos (state no reconocido o caducado)");
    }
    let stateObj = null;
    try {
      stateObj = JSON.parse(raw);
    } catch {
      return res.status(400).send("Parámetros inválidos (state corrupto)");
    }
    if (stateObj.shop !== shop) {
      return res
        .status(400)
        .send("Parámetros inválidos (shop/state no coinciden)");
    }

    // Verifica HMAC
    const okHmac = verifyHmac(req.query, SHOPIFY_API_SECRET);
    if (!okHmac) {
      return res.status(400).send("Parámetros inválidos (HMAC no válido)");
    }

    // Intercambia el code por token
    const accessToken = await exchangeCodeForToken(shop, code);

    // Guarda token cifrado
    const cipher = encrypt(accessToken);
    await redis.set(tokenKey(shop), cipher);
    await redis.sAdd("shops", shop);

    // Limpia state
    await redis.del(stateKey(state));

    // Respuesta simple (puedes redirigir a tu frontend si quieres)
    return res
      .status(200)
      .send("✅ Instalación correcta. Ya puedes cerrar esta pestaña.");
  } catch (err) {
    console.error("GET /auth/callback error:", err);
    return res
      .status(400)
      .send(`Parámetros inválidos (${String(err.message || err)})`);
  }
});

// Estado de instalación/token (diagnóstico)
router.get("/auth/status", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const enc = await redis.get(tokenKey(shop));
    const installed = !!enc;
    return res.json({
      shop,
      installed,
      token: { exists: installed, cipherLength: enc ? enc.length : 0 },
      redirectUri: SHOPIFY_REDIRECT_URI,
      scopes: SHOPIFY_SCOPES,
      apiVersion: SHOPIFY_API_VERSION,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;
