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
    const accessToken = response.data.access_token;

    // 🔁 Clave hash por tienda
    const redisKey = `shop:${shop}:config`;

    // 🧠 Guardar token y timestamp en un único hash
    await redisClient.hSet(redisKey, {
      accessToken,
      installedAt: new Date().toISOString(),
    });

    res.redirect(`${process.env.FRONTEND_URL}?shop=${shop}&auth=success`);
  } catch (error) {
    console.error("Error en el callback de OAuth:", error);
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
    console.error(
      "Error obteniendo productos:",
      error.response?.data || error.message
    );
    res.status(500).send("Error obteniendo productos");
  }
});

//El siguiente endpoint recibe una lista de IDs de productos seleccionados desde el frontend.
//Usa el parámetro ```shop``` de la query string para identificar la tienda.
//Guarda la selección en Redis bajo la clave ```shop:<shop>:selected_products```

// Endpoint para guardar selección de productos en Redis
app.post("/shopify/selected", express.json(), async (req, res) => {
  const { shop, selectedProducts } = req.body;

  if (!shop) return res.status(400).send("Falta parámetro 'shop'");
  if (!Array.isArray(selectedProducts))
    return res
      .status(400)
      .send("Formato inválido. Se espera un array de productos.");

  const redisKey = `shop:${shop}:config`;

  try {
    await redisClient.hSet(redisKey, {
      selected_products: JSON.stringify(selectedProducts),
    });

    res
      .status(200)
      .send(
        "Productos seleccionados guardados correctamente en configuración Redis"
      );
  } catch (err) {
    console.error("Error guardando productos en Redis:", err);
    res.status(500).send("Error interno al guardar productos seleccionados");
  }
});

//El siguiente endpoint consulta Redis usando la clave: ```shop:<shop>:selected_products```
//Devuelve un array con los IDs (u objetos, según lo que guardes) de los productos seleccionados.
//Responde con código 404 si no hay datos guardados.

// Endpoint para recuperar productos seleccionados desde Redis
app.get("/shopify/selected", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Falta parámetro 'shop'");

  const redisKey = `shop:${shop}:config`;

  try {
    const selectedRaw = await redisClient.hGet(redisKey, "selected_products");
    const selected = selectedRaw ? JSON.parse(selectedRaw) : [];
    res.status(200).json({ selectedProducts: selected });
  } catch (err) {
    console.error("Error recuperando productos seleccionados:", err);
    res.status(500).send("Error interno al obtener selección");
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

app.get("/shopify/selected-products", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Falta parámetro 'shop'.");

  const redisKey = `shop:${shop}:config`;

  try {
    const selected = await redisClient.hGet(redisKey, "selected_products");
    if (!selected) return res.json({ selected: [] });

    res.json({ selected: JSON.parse(selected) });
  } catch (err) {
    res.status(500).send("Error recuperando datos: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

// Endpoint temporal para depuración de Redis
app.get("/debug/redis", async (req, res) => {
  try {
    const keys = await redisClient.keys("shop:*");
    const result = {};

    for (const key of keys) {
      const data = await redisClient.hGetAll(key);
      result[key] = data;
    }

    res.json(result);
  } catch (error) {
    res.status(500).send(`Error al obtener datos de Redis: ${error.message}`);
  }
});

const comparisonRoutes = require("./routes/comparison");
app.use(comparisonRoutes);
