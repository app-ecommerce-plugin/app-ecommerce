const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const redis = require("../utils/redisClient");
const { compararPorTitulo } = require("../utils/compararProductos");

const router = express.Router();

/**
 * GET /shopify/compare?shop=mi-tienda&other=competidor
 * Ejemplo:
 *   /shopify/compare?shop=precios-dinamicos-prueba.myshopify.com
 *                      &other=tienda-prueba-multiusuario.myshopify.com
 */
router.get("/", async (req, res) => {
  const { shop, other } = req.query;
  if (!shop || !other) {
    return res.status(400).json({ error: "Faltan parámetros shop y other" });
  }

  try {
    /* ---- 1. Selección guardada en Redis ---- */
    const rawSel = await redis.get(`selectedProducts_${shop}`);
    const seleccion = rawSel ? JSON.parse(rawSel) : []; // [{id,title},…]
    
    /* ---- 2. Catálogo del “competidor” (archivo local) ---- */
    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${other}.json`
    );
    const dataCompet = JSON.parse(await fs.readFile(filePath, "utf-8"));
    const productosCompet = dataCompet.products || [];

    /* ---- 3. Comparación simple por título ---- */
    const comparaciones = compararPorTitulo(seleccion, productosCompet);

    res.json({ comparaciones });
  } catch (e) {
    console.error("compare:", e.message);
    res.status(500).json({ error: "Error al comparar" });
  }
});

module.exports = router;
