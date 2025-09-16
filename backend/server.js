// backend/server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Rutas
const authRoutes = require("./routes/auth");
const productsRoutes = require("./routes/products");
const recommendRoutes = require("./routes/recommend");
const debugRoutes = require("./routes/debug"); // NUEVO

const app = express();

// Seguridad básica
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // ajusta más adelante si embebes en Shopify Admin
  })
);

// CORS (restringe origin si lo deseas)
app.use(cors());

// JSON
app.use(express.json());

// Healthcheck
app.get("/", (_req, res) => res.send("Backend de Shopify activo"));

// Prefijo oficial
app.use("/shopify", authRoutes);
app.use("/shopify", productsRoutes);
app.use("/shopify", recommendRoutes);

// Alias sin prefijo (compatibilidad con front antiguo)
app.use("/", productsRoutes);
app.use("/", recommendRoutes);

// Rutas de debug (solo con prefijo /debug)
app.use("/debug", debugRoutes);

// 404 controlado
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// Arranque
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend escuchando en :${PORT}`);
});