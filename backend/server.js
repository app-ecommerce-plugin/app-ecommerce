require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const cors = require("cors");
const { RedisStore } = require("connect-redis");
const { createClient } = require("redis");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Cliente Redis
const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient
  .connect()
  .then(() => console.log("Conectado a Redis correctamente"))
  .catch((err) => console.error("Error al conectar Redis:", err));

// Configuración CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// Habilitar 'trust proxy' para Render (cookies seguras detrás de proxy)
app.set("trust proxy", 1);

// Configuración de sesiones
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// Middleware adicional
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Endpoint básico
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente en Render");
});

// OAuth Shopify
app.get("/auth/shopify", (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Se requiere el parámetro "shop"');

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;

  const state = crypto.randomBytes(16).toString("hex");
  req.session.state = state;

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  res.redirect(authUrl);
});

// Callback OAuth Shopify (guardando token en Redis)
app.get("/auth/shopify/callback", async (req, res) => {
  const { shop, code, state } = req.query;

  if (state !== req.session.state) {
    return res
      .status(403)
      .send("No se puede verificar el origen de la solicitud");
  }

  const payload = {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code,
  };

  try {
    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      payload
    );

    const redisKey = `shop:${shop}:config`;

    await redisClient.hSet(redisKey, {
      accessToken: response.data.access_token,
      installedAt: new Date().toISOString(),
    });

    res.redirect(`${process.env.FRONTEND_URL}?shop=${shop}&auth=success`);
  } catch (error) {
    res.status(500).send(`Error en OAuth: ${error.message}`);
  }
});

// Obtener productos usando el token almacenado en Redis
app.get("/shopify/products", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Falta parámetro 'shop'.");

  const redisKey = `shop:${shop}:config`;
  const accessToken = await redisClient.hGet(redisKey, "accessToken");

  if (!accessToken)
    return res
      .status(401)
      .send("No existe token OAuth válido para esta tienda.");

  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2023-10/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).send(`Error obteniendo productos: ${error.message}`);
  }
});

// Al final de server.js, antes de app.listen

app.use(express.json());

app.post("/shopify/save-selection", async (req, res) => {
  const { shop, selected_products } = req.body;

  if (!shop || !Array.isArray(selected_products)) {
    return res.status(400).send("Faltan datos en la solicitud.");
  }

  const redisKey = `shop:${shop}:config`;
  try {
    await redisClient.hSet(
      redisKey,
      "selected_products",
      JSON.stringify(selected_products)
    );
    res.send("Selección guardada en Redis.");
  } catch (error) {
    res.status(500).send("Error guardando en Redis: " + error.message);
  }
});

app.get('/shopify/selected-products', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Falta parámetro 'shop'.");

  const redisKey = `shop:${shop}:config`;

  try {
    const selected = await redisClient.hGet(redisKey, 'selected_products');
    if (!selected) return res.json({ selected: [] });

    res.json({ selected: JSON.parse(selected) });
  } catch (err) {
    res.status(500).send('Error recuperando datos: ' + err.message);
  }
});


app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
