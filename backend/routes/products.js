// routes/products.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

/* ------------------------------------------------------------------ */
/* GET /shopify/products?shop=...                                     */
/* Devuelve catálogo de la tienda (Shopify o JSON local)              */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    const USE_LOCAL = process.env.USE_LOCAL_FILES === "true";

    // 1) Si hay token y NO forzamos modo local: Shopify
    if (savedToken && !USE_LOCAL) {
      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json`,
        {
          headers: {
            "X-Shopify-Access-Token": savedToken,
            "Content-Type": "application/json",
          },
        }
      );
      return res.json({ products: response.data.products || [] });
    }

    // 2) Catálogo de prueba en external_data/ (fallback o forzado por USE_LOCAL_FILES)
    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const data = JSON.parse(await fs.readFile(filePath, "utf-8"));
    return res.json({ products: data.products || [] });
  } catch (err) {
    console.error("Error al obtener productos:", err.message);
    res.status(500).json({ error: "No se pudieron obtener productos" });
  }
});

/* ------------------------------------------------------------------ */
/* GET /shopify/products/selected?shop=...                            */
/* Devuelve los IDs seleccionados que hay en Redis                    */
/* ------------------------------------------------------------------ */
router.get("/selected", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const raw = await redisClient.get(`selectedProducts_${shop}`);
    const selected = raw ? JSON.parse(raw) : [];

    // Solo IDs para el front (ej: [1,3])
    const ids = selected.map((p) => (typeof p === "object" ? p.id : p));
    res.json({ selectedProducts: ids });
  } catch (err) {
    console.error("Error al leer selección:", err.message);
    res.status(500).json({ error: "No se pudo leer la selección" });
  }
});

// routes/products.js (POST /shopify/products/selected)
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body; // p. ej. [idShopify1, idShopify2]
  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    const USE_LOCAL = process.env.USE_LOCAL_FILES === "true";
    let enriched = [];

    if (savedToken && !USE_LOCAL) {
      // Enriquecer desde Shopify (IDs reales)
      for (const id of selectedProducts) {
        const { data } = await axios.get(
          `https://${shop}/admin/api/2023-01/products/${id}.json`,
          { headers: { "X-Shopify-Access-Token": savedToken } }
        );
        const p = data.product;
        const price = p.variants?.[0]?.price ?? 0;
        enriched.push({ id: p.id, title: p.title, price: Number(price) });
      }
    } else {
      // Enriquecer desde JSON local (IDs del archivo)
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const allProds =
        JSON.parse(await fs.readFile(filePath, "utf-8")).products || [];
      enriched = selectedProducts
        .map((id) => {
          const p = allProds.find((pr) => pr.id === id);
          return p
            ? { id: p.id, title: p.title, price: Number(p.price ?? 0) }
            : null;
        })
        .filter(Boolean);
    }

    await redisClient.set(`selectedProducts_${shop}`, JSON.stringify(enriched));
    res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;
