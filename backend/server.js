const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Rutas
const authRoutes = require("./routes/auth");
const productsRoutes = require("./routes/products");
const recommendRoutes = require("./routes/recommend");
const comparisonRoutes = require("./routes/comparison");
const debugRoutes = require("./routes/debug");

const app = express();

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(express.json());

// Healthcheck
app.get("/", (_req, res) => res.send("Backend de Shopify activo"));

// ----- Prefijo oficial
app.use("/shopify", authRoutes);
app.use("/shopify", productsRoutes);
app.use("/shopify", recommendRoutes);
app.use("/shopify", comparisonRoutes);

// ----- Alias sin prefijo (compatibilidad)
app.use("/", productsRoutes);
app.use("/", recommendRoutes);

// ----- Alias de AUTH bajo /auth (compatibilidad puntual)
// Nota: la ruta canónica del callback es /shopify/auth/callback.
// Este alias redirige cualquier /auth/shopify/callback -> /shopify/auth/callback preservando querystring.
app.get("/auth/shopify/callback", (req, res) => {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return res.redirect(302, `/shopify/auth/callback${q}`);
});

// ----- Debug
app.use("/debug", debugRoutes);

// 404 controlado
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend escuchando en :${PORT}`));