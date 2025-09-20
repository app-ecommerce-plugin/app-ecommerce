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
  "https://app-ecommerce-7h17.onrender.com/auth/shopify/callback";
const SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES || "read_products,write_products,read_orders";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

const stateKey = (s) => `oauth_state:${s}`;

function buildAuthorizeURL(shop, state) {
  const base = `https://${shop}/admin/oauth/authorize`;
  const q = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: SHOPIFY_REDIRECT_URI,
    state,
    "grant_options[]": "",
  });
  return `${base}?${q.toString()}`;
}

function verifyHmac(queryObj, secret) {
  const { hmac, signature, ...rest } = queryObj;
  const keys = Object.keys(rest).sort();
  const message = keys.map((k) => `${k}=${rest[k]}`).join("&");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "utf8"),
      Buffer.from(digest, "utf8")
    );
  } catch {
    return false;
  }
}

async function exchangeCodeForToken(shop, code) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const body = {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`access_token ${r.status}: ${txt}`);
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Error(`access_token JSON inválido: ${txt}`);
  }
  return json.access_token;
}

// ---------- Rutas

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
    return res.redirect(302, buildAuthorizeURL(shop, state));
  } catch (err) {
    console.error("GET /auth error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "No se pudo iniciar OAuth" });
  }
});

// Handler único para los dos callbacks
async function handleCallback(req, res) {
  try {
    let { shop, code, state, hmac, host } = req.query;

    // Derivar shop desde host si falta
    if (!shop && host) {
      try {
        const decoded = Buffer.from(String(host), "base64").toString("utf8"); // ej: tienda.myshopify.com/admin
        const m = decoded.match(/([a-zA-Z0-9][\w-]+\.myshopify\.com)/);
        if (m) shop = m[1];
      } catch {}
    }

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

    // Validar state
    const raw = await redis.get(stateKey(state));
    if (!raw)
      return res
        .status(400)
        .send("Parámetros inválidos (state no reconocido o caducado)");
    const st = JSON.parse(raw);
    if (st.shop !== shop)
      return res
        .status(400)
        .send("Parámetros inválidos (shop/state no coinciden)");

    // HMAC
    if (!verifyHmac(req.query, SHOPIFY_API_SECRET)) {
      return res.status(400).send("Parámetros inválidos (HMAC no válido)");
    }

    // Intercambio de code por token
    const accessToken = await exchangeCodeForToken(shop, code);
    const cipher = encrypt(accessToken);
    await redis.set(tokenKey(shop), cipher);
    await redis.sAdd("shops", shop);
    await redis.del(stateKey(state));

    return res
      .status(200)
      .send("✅ Instalación correcta. Ya puedes cerrar esta pestaña.");
  } catch (err) {
    console.error("GET /auth/callback error:", err);
    return res
      .status(400)
      .send(`Parámetros inválidos (${String(err.message || err)})`);
  }
}

// Exponer AMBAS rutas al mismo handler
router.get("/auth/shopify/callback", handleCallback);
router.get("/shopify/auth/callback", handleCallback);

// Diagnóstico
router.get("/auth/status", validateShopParam, async (req, res) => {
  try {
    const shop = req.shop;
    const enc = await redis.get(tokenKey(shop));
    const installed = !!enc;
    res.json({
      shop,
      installed,
      token: { exists: installed, cipherLength: enc ? enc.length : 0 },
      redirectUri: SHOPIFY_REDIRECT_URI,
      scopes: SHOPIFY_SCOPES,
      apiVersion: SHOPIFY_API_VERSION,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

module.exports = router;