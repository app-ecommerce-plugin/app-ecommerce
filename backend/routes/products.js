const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

// Obtener productos desde Shopify o JSON según USE_LOCAL_FILES
router.get("/", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    let products;

    if (process.env.USE_LOCAL_FILES === "true") {
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const fileContent = await fs.readFile(filePath, "utf-8");
      products = JSON.parse(fileContent).products;
    } else {
      const token = await redisClient.get(`accessToken_${shop}`);
      if (!token) {
        return res.status(401).json({ error: "No hay token para esta tienda" });
      }
      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json`,
        {
          headers: { "X-Shopify-Access-Token": token },
        }
      );
      products = response.data.products;
    }

    res.json({ products });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// Guardar selección de productos en Redis
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body;
  if (!shop || !selectedProducts) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    await redisClient.set(
      `selectedProducts_${shop}`,
      JSON.stringify(selectedProducts)
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

// Obtener selección desde Redis
router.get("/selected", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const raw = await redisClient.get(`selectedProducts_${shop}`);
    const selectedProducts = raw ? JSON.parse(raw) : [];
    res.json({ selectedProducts });
  } catch (err) {
    console.error("Error al obtener selección:", err.message);
    res.status(500).json({ error: "Error al obtener la selección" });
  }
});

module.exports = router;