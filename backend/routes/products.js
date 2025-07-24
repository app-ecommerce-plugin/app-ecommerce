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

    // 1. Catálogo real (si hay token OAuth guardado)
    if (savedToken) {
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

    // 2. Catálogo de prueba en external_data/
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

    // Solo IDs (el front solo necesita el array numérico)
    const ids = selected.map((p) => (typeof p === "object" ? p.id : p));

    res.json({ selectedProducts: ids });
  } catch (err) {
    console.error("Error al leer selección:", err.message);
    res.status(500).json({ error: "No se pudo leer la selección" });
  }
});

/* ------------------------------------------------------------------ */
/* POST /shopify/products/selected                                     */
/* Guarda la selección enriquecida con título + precio                */
/* ------------------------------------------------------------------ */
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body;

  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    let allProds = [];

    if (savedToken) {
      // Obtener productos reales desde Shopify
      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json`,
        {
          headers: {
            "X-Shopify-Access-Token": savedToken,
            "Content-Type": "application/json",
          },
        }
      );
      allProds = response.data.products || [];
    } else {
      // Modo local: cargar desde archivo
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const data = JSON.parse(await fs.readFile(filePath, "utf-8"));
      allProds = data.products || [];
    }

    // Enriquecer con título y precio
    const enriched = selectedProducts
      .map((id) => {
        const p = allProds.find((pr) => pr.id === id || pr.id === Number(id));
        const variantPrice = p?.variants?.[0]?.price ?? p?.price ?? 0;
        return p
          ? { id: p.id, title: p.title, price: parseFloat(variantPrice) }
          : null;
      })
      .filter(Boolean);

    await redisClient.set(`selectedProducts_${shop}`, JSON.stringify(enriched));

    res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;
