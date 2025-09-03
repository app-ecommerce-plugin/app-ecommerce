// routes/products.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");

/* ----------------------------- Helpers ----------------------------- */
const USE_LOCAL = () => process.env.USE_LOCAL_FILES === "true";

// Normalizador para comparar títulos por texto (sin acentos, minúscula, sin signos)
const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\\s]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

// Heurística sencilla para diferenciar IDs de Shopify vs IDs "locales" de ejemplo
const isShopifyId = (id) => String(id).length >= 10;

/* ------------------------------------------------------------------ */
/* GET /shopify/products?shop=...                                     */
/* Devuelve catálogo de la tienda (Shopify o JSON local)              */
/* ------------------------------------------------------------------ */
router.get("/", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);

    // 1) Si hay token y NO forzamos modo local: Shopify
    if (savedToken && !USE_LOCAL()) {
      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json?limit=250`,
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
    const filePath = path.join(__dirname, "..", "external_data", `${shop}.json`);
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

    // Solo IDs para el front (ej: [1,3] o [<idShopify>])
    const ids = selected.map((p) => (typeof p === "object" ? p.id : p));
    res.json({ selectedProducts: ids });
  } catch (err) {
    console.error("Error al leer selección:", err.message);
    res.status(500).json({ error: "No se pudo leer la selección" });
  }
});

/* ------------------------------------------------------------------ */
/* POST /shopify/products/selected                                     */
/* Guarda la selección. Robustez extra:
   - Con token y NO local:
       * Si llegan IDs "largos" (Shopify) → enriquece por API.
       * Si llegan IDs locales (1,3,...) → toma título del JSON local y
         mapea por NOMBRE al catálogo real de Shopify; guarda {id,title,price} reales.
   - Sin token o en local → enriquece desde JSON local (comportamiento anterior).
   Nota: las comparaciones se harán por NOMBRE; los IDs se guardan solo como metadato. */
/* ------------------------------------------------------------------ */
router.post("/selected", async (req, res) => {
  const { shop, selectedProducts } = req.body; // puede venir [1,3] (local) o [<idShopify>, ...]
  if (!shop || !Array.isArray(selectedProducts)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const savedToken = await redisClient.get(`accessToken_${shop}`);
    let enriched = [];

    if (savedToken && !USE_LOCAL()) {
      // ===== Modo Shopify (hay token) =====
      // 1) Cargamos una vez el catálogo de Shopify para poder mapear por TÍTULO si hiciera falta
      const { data } = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json?limit=250`,
        { headers: { "X-Shopify-Access-Token": savedToken } }
      );
      const shopifyProducts = data.products || [];
      const indexByTitle = new Map(
        shopifyProducts.map((p) => [norm(p.title), p])
      );

      // 2) Cargamos el JSON local (solo por si llegan IDs locales y necesitamos su título)
      let localById = new Map();
      try {
        const filePath = path.join(__dirname, "..", "external_data", `${shop}.json`);
        const local = JSON.parse(await fs.readFile(filePath, "utf-8")).products || [];
        local.forEach((p) => localById.set(p.id, p));
      } catch (_) {
        // si no existe, no pasa nada; solo afectaría a IDs locales
      }

      // 3) Para cada seleccionado:
      for (const rawId of selectedProducts) {
        try {
          if (isShopifyId(rawId)) {
            // ID real → pedir por ID a Shopify y enriquecer
            const { data: one } = await axios.get(
              `https://${shop}/admin/api/2023-01/products/${rawId}.json`,
              { headers: { "X-Shopify-Access-Token": savedToken } }
            );
            const p = one.product;
            const price = p?.variants?.[0]?.price ?? 0;
            enriched.push({ id: p.id, title: p.title, price: Number(price) });
          } else {
            // ID local → obtener título del JSON y mapear por NOMBRE al catálogo de Shopify
            const local = localById.get(rawId);
            if (!local) continue;
            const hit = indexByTitle.get(norm(local.title));
            if (!hit) continue;
            const price = hit?.variants?.[0]?.price ?? 0;
            enriched.push({ id: hit.id, title: hit.title, price: Number(price) });
          }
        } catch (e) {
          console.error("Fallo enriqueciendo producto seleccionado:", rawId, e.message);
          // seguimos con el resto
        }
      }

      if (!enriched.length) {
        return res.status(400).json({
          error:
            "No se pudo mapear la selección. Recarga el catálogo y vuelve a intentar.",
        });
      }

      await redisClient.set(`selectedProducts_${shop}`, JSON.stringify(enriched));
      return res.json({ success: true, source: "shopify", saved: enriched.length });
    }

    // ===== Modo LOCAL (sin token o forzado) =====
    const filePath = path.join(__dirname, "..", "external_data", `${shop}.json`);
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

    await redisClient.set(`selectedProducts_${shop}`, JSON.stringify(enriched));
    return res.json({ success: true, source: "local", saved: enriched.length });
  } catch (err) {
    console.error("Error al guardar selección:", err.message);
    res.status(500).json({ error: "No se pudo guardar la selección" });
  }
});

module.exports = router;