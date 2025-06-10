const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

// GET /shopify/products?shop=... - Devuelve productos desde Shopify o JSON local
router.get("/", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    const shopDomain = shop;

    if (savedToken) {
      const response = await axios.get(
        `https://${shopDomain}/admin/api/2023-01/products.json`,
        {
          headers: {
            "X-Shopify-Access-Token": savedToken,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json(response.data.products || []);
    } else {
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const content = await fs.readFile(filePath, "utf-8");
      const products = JSON.parse(content);
      return res.json(products);
    }
  } catch (error) {
    console.error("Error al obtener productos:", error.message);
    return res.status(500).json({ error: "No se pudieron obtener productos" });
  }
});

// GET /shopify/products/selected?shop=... - Devuelve productos seleccionados
router.get("/selected", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    return res.json({ selectedProducts: data.selectedProducts || [] });
  } catch (err) {
    console.error("Error al leer productos seleccionados:", err.message);
    return res.status(404).json({ error: "No se pudo leer el archivo local" });
  }
});

// POST /shopify/products/selected - Guarda productos seleccionados
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body;

  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    const allProducts = data.products || [];

    // Buscar títulos a partir de los IDs seleccionados
    const enriched = selectedProducts
      .map((id) => {
        const found = allProducts.find((p) => p.id === id);
        return found ? { id: found.id, title: found.title } : null;
      })
      .filter(Boolean); // elimina nulls si no se encontró algún ID

    // Guardar en archivo local
    data.selectedProducts = enriched;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    // Guardar también en Redis
    const redisKey = `selectedProducts_${shop}`;
    await redisClient.set(redisKey, JSON.stringify(enriched));

    return res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar productos seleccionados:", err.message);
    return res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;
