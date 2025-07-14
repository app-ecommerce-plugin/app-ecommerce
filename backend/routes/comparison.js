const express = require("express");
const router = express.Router();
const { redisClient } = require("../server");
const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");
const compararProductos = require("../utils/compararProductos");

// Normalizador de IDs
function parseSelectedIds(input) {
  if (!input) return [];
  let arr = Array.isArray(input) ? input : [input];
  return arr.map((i) => {
    let id = typeof i === "object" ? i.id : i;
    if (typeof id === "string" && id.startsWith("gid://")) {
      id = id.split("/").pop();
    }
    return String(id);
  });
}

// GET /comparison?shop=xxxx (la llamada principal del frontend)
router.get("/", async (req, res) => {
  const shop = req.session?.shop || req.query.shop;
  if (!shop) return res.status(400).json({ error: "Tienda no especificada" });

  try {
    // 1. Leer productos seleccionados desde Redis
    const idsJson = await redisClient.get(`selectedProducts:${shop}`);
    const selectedIds = parseSelectedIds(idsJson ? JSON.parse(idsJson) : []);
    if (!selectedIds.length)
      return res.status(400).json({ error: "No hay productos seleccionados" });

    // 2. Obtener productos de Shopify (o mock si USE_LOCAL_FILES=true)
    let storeProducts = [];
    const useLocal = process.env.USE_LOCAL_FILES === "true";
    if (useLocal) {
      // Lee del JSON de prueba como tienda real (simulación)
      const storeFile = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const fileRaw = await fs.readFile(storeFile, "utf-8");
      storeProducts = JSON.parse(fileRaw).products.filter((p) =>
        selectedIds.includes(String(p.id))
      );
    } else {
      // Llama a la API real
      const token = await redisClient.get(`accessToken_${shop}`);
      if (!token)
        return res.status(401).json({ error: "No hay token de acceso" });
      const url = `https://${shop}/admin/api/2023-07/products.json?ids=${selectedIds.join(
        ","
      )}`;
      const response = await axios.get(url, {
        headers: { "X-Shopify-Access-Token": token },
      });
      storeProducts = response.data.products || [];
    }

    // 3. Leer productos "de competencia" (siempre del JSON local)
    const competitorFile = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const fileRaw = await fs.readFile(competitorFile, "utf-8");
    const competitorProducts = JSON.parse(fileRaw).products || [];

    // 4. Comparar por título
    const results = compararProductos(storeProducts, competitorProducts);

    res.json(results);
  } catch (err) {
    console.error("Error en comparación:", err);
    res.status(500).json({ error: "Error interno al comparar productos" });
  }
});

module.exports = router;
