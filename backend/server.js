require("dotenv").config();
const express = require("express");
const cors = require("cors");
const redisClient = require("./utils/redisClient");

const productsRoutes = require("./routes/products");
const comparisonRoutes = require("./routes/comparison");
const authRoutes = require("./routes/auth");
const debugRoutes = require("./routes/debug");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware esencial
app.use(cors());
app.use(express.json()); // Permite el manejo de JSON en las peticiones
app.use(express.urlencoded({ extended: true }));

// Rutas del backend
app.use("/shopify/products", productsRoutes);
app.use("/shopify/comparison", comparisonRoutes);
app.use("/shopify/auth", authRoutes);
app.use("/debug", debugRoutes);

// Ruta base para verificar que el backend esté activo
app.get("/", (req, res) => {
  res.send("Backend de Shopify activo 🚀");
});

// Conexión con Redis y arranque del servidor
redisClient
  .connect()
  .then(() => {
    console.log("Redis conectado ✅");
    app.listen(PORT, () => {
      console.log(`Servidor activo en puerto ${PORT} 🚀`);
    });
  })
  .catch((err) => {
    console.error("Error conectando a Redis:", err);
  });