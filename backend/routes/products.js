const express = require("express");
const router = express.Router();
const { redisClient } = require("../server");
const axios = require("axios");

// Utilidad: Normaliza IDs de Shopify
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

// POST /products/select  (guarda selección)
router.post("/select", async (req, res) => {
  const shop = req.session?.shop || req.body.shop;
  const rawSelection = req.body.selectedIds || req.body.selected || req.body;
  const selectedIds = parseSelectedIds(rawSelection);
  if (!shop) return res.status(400).json({ error: "Tienda no especificada" });
  try {
    await redisClient.set(
      `selectedProducts:${shop}`,
      JSON.stringify(selectedIds)
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error guardando selección:", err);
    res.status(500).json({ error: "Error al guardar la selección" });
  }
});

// GET /products/selected (devuelve productos seleccionados reales)
router.get("/selected", async (req, res) => {
  const shop = req.session?.shop || req.query.shop;
  if (!shop) return res.status(400).json({ error: "Tienda no especificada" });
  try {
    const idsJson = await redisClient.get(`selectedProducts:${shop}`);
    const selectedIds = parseSelectedIds(idsJson ? JSON.parse(idsJson) : []);
    if (!selectedIds.length) return res.json([]);
    // Usar token de Redis (guardado al autorizar la app)
    const token = await redisClient.get(`accessToken_${shop}`);
    if (!token)
      return res.status(401).json({ error: "No hay token para la tienda" });
    const url = `https://${shop}/admin/api/2023-07/products.json?ids=${selectedIds.join(
      ","
    )}`;
    const response = await axios.get(url, {
      headers: { "X-Shopify-Access-Token": token },
    });
    res.json(response.data.products || []);
  } catch (err) {
    console.error("Error obteniendo seleccionados:", err);
    res.status(500).json({ error: "Error al obtener seleccionados" });
  }
});

module.exports = router;