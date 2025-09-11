// backend/routes/products.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";
const USE_LOCAL = () => process.env.USE_LOCAL_FILES === "true";

/* --------------------------- helpers --------------------------- */
async function fetchShopifyProducts(shop, token) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?fields=id,title,variants`;
  const { data } = await axios.get(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  const items = data.products || [];
  return items.map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.variants?.[0]?.price ?? 0),
    variantId: p.variants?.[0]?.id ?? null,
  }));
}

async function fetchShopifyProductById(shop, token, productId) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json?fields=id,title,variants`;
  const { data } = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const p = data.product;
  return {
    id: p.id,
    title: p.title,
    price: Number(p.variants?.[0]?.price ?? 0),
    variantId: p.variants?.[0]?.id ?? null,
  };
}

async function fetchLocalProducts(shop) {
  const fp = path.join(__dirname, "..", "external_data", `${shop}.json`);
  const raw = await fs.readFile(fp, "utf8");
  const data = JSON.parse(raw);
  const items = Array.isArray(data.products) ? data.products : [];
  // mantenemos campos extra si existen, pero normalizamos lo básico
  return items.map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price ?? 0),
    variantId: p.variantId ?? null,
    currency: p.currency,
    url: p.url,
    source: p.source,
  }));
}

/* ------------------------------------------------------------------ */
/* GET /shopify/products?shop=...                                     */
/* Devuelve catálogo de la tienda (Shopify o JSON local)              */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    if (savedToken && !USE_LOCAL()) {
      const products = await fetchShopifyProducts(shop, savedToken);
      return res.json({ products });
    }

    // Fallback/local
    const products = await fetchLocalProducts(shop);
    return res.json({ products });
  } catch (err) {
    console.error("Error al obtener productos:", err.message);
    res.status(500).json({ error: "No se pudieron obtener productos" });
  }
});

/* ------------------------------------------------------------------ */
/* GET /shopify/products/selected?shop=...                            */
/* Devuelve los IDs seleccionados que hay en Redis (ej.: [1,3])       */
/* Mantiene compatibilidad con tu frontend actual                     */
/* ------------------------------------------------------------------ */
router.get("/selected", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const raw = await redisClient.get(`selectedProducts_${shop}`);
    const selected = raw ? JSON.parse(raw) : [];

    // si estaban guardados como objetos, devolvemos sólo sus IDs (compat front)
    const ids = selected.map((p) => (typeof p === "object" ? p.id : p));
    res.json({ selectedProducts: ids });
  } catch (err) {
    console.error("Error al leer selección:", err.message);
    res.status(500).json({ error: "No se pudo leer la selección" });
  }
});

/* ------------------------------------------------------------------ */
/* POST /shopify/products/selected                                     */
/* Body: { shop, selectedProducts: [<productId> ...] }                */
/* Enriquecer y guardar en Redis: [{id,title,price,variantId}]        */
/* ------------------------------------------------------------------ */
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body;
  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    let enriched = [];

    if (savedToken && !USE_LOCAL()) {
      // Enriquecer con datos reales de Shopify
      for (const id of selectedProducts) {
        try {
          const p = await fetchShopifyProductById(shop, savedToken, id);
          enriched.push(p);
        } catch (e) {
          console.warn(`No se pudo enriquecer producto ${id}: ${e.message}`);
        }
      }
    } else {
      // Enriquecer desde JSON local (IDs del archivo)
      const all = await fetchLocalProducts(shop);
      const idSet = new Set(selectedProducts);
      enriched = all
        .filter((p) => idSet.has(p.id))
        .map((p) => ({
          id: p.id,
          title: p.title,
          price: Number(p.price ?? 0),
          variantId: p.variantId ?? null,
        }));
    }

    await redisClient.set(
      `selectedProducts_${shop}`,
      JSON.stringify(enriched, null, 2)
    );

    res.json({ success: true, saved: enriched.length });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;