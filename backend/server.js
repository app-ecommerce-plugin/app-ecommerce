require("dotenv").config();

const express = require("express");
const cors = require("cors");

const productsRoutes = require("./routes/products");
const comparisonRoutes = require("./routes/comparison");
const authRoutes = require("./routes/auth");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use("/shopify/products", productsRoutes);
app.use("/shopify/comparison", comparisonRoutes);
app.use("/auth", authRoutes);
app.use("/debug", require("./routes/debug"));
app.use("/public", require("express").static(path.join(__dirname, "public")));

const competitorsRoutes = require("./routes/competitors");
app.use("/competitors", competitorsRoutes);

// Ruta base
app.get("/", (req, res) => {
  res.send("Backend de Shopify activo");
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
