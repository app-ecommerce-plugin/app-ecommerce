const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

// GET /shopify/products?shop=...
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
      return res.json({ products: response.data.products || [] });
    } else {
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      return res.json({ products: data.products || [] });
    }
  } catch (error) {
    console.error("Error al obtener productos:", error.message);
    return res.status(500).json({ error: "No se pudieron obtener productos" });
  }
});

// GET /shopify/products/selected?shop=...
router.get("/selected", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const key = `selectedProducts_${shop}`;
    const raw = await redisClient.get(key);
    const selected = raw ? JSON.parse(raw) : [];
    const ids = selected.map((p) => (typeof p === "object" ? p.id : p));
    return res.json({ selectedProducts: ids });
  } catch (err) {
    console.error("Error al leer selección:", err.message);
    return res.status(500).json({ error: "No se pudo leer la selección" });
  }
});

// POST /shopify/products/selected
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body; // selectedProducts = [1,3,…]

  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    // 1. Leemos todos los productos del JSON fijo que está en el repo
    const filePath = path.join(__dirname, '..', 'external_data', `${shop}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    const allProds = data.products || [];

    // 2. Enriquecemos: de cada ID obtenemos su título
    const enriched = selectedProducts
      .map((id) => {
        const p = allProds.find((pr) => pr.id === id);
        return p ? { id: p.id, title: p.title } : null;
      })
      .filter(Boolean); // quita posibles null si un id no existe

    // 3. Guardamos SOLO en Redis (no escribimos disco en Render)
    await redisClient.set(`selectedProducts_${shop}`, JSON.stringify(enriched));

    // 4. Respondemos OK
    return res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    return res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;
