const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Rutas
const authRoutes = require("./routes/auth");
const productsRoutes = require("./routes/products");
const recommendRoutes = require("./routes/recommend");
const debugRoutes = require("./routes/debug"); // NUEVO (si no lo tienes, crea el archivo que te di antes)

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

// Prefijo oficial
app.use("/shopify", authRoutes);
app.use("/shopify", productsRoutes); // <- monta aquí
app.use("/shopify", recommendRoutes);

// Alias sin prefijo (compatibilidad)
app.use("/", productsRoutes);
app.use("/", recommendRoutes);

// Debug
app.use("/debug", debugRoutes);

// 404 controlado
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend escuchando en :${PORT}`);
});