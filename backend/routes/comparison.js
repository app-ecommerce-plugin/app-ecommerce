const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { compararPorTitulo } = require("../utils/compararProductos");

const router = express.Router();

const USE_LOCAL_FILES = process.env.USE_LOCAL_FILES === "true";

// GET /shopify/comparison?shop=mi-tienda.myshopify.com
router.get("/", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    // 1. Leer productos de la tienda (simulados)
    const tiendaFile = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const tiendaJson = JSON.parse(await fs.readFile(tiendaFile, "utf-8"));
    const productosTienda = tiendaJson.products || [];

    // 2. Leer productos de la competencia (puedes usar la otra tienda, por ejemplo)
    // Para la prueba, simula que la "otra tienda" es la segunda de tus archivos
    const otrosArchivos = [
      "precios-dinamicos-prueba.myshopify.com.json",
      "tienda-prueba-multiusuario.myshopify.com.json",
    ];
    const archivoCompetencia = otrosArchivos.find((a) => !a.includes(shop));
    const competenciaFile = path.join(
      __dirname,
      "..",
      "external_data",
      archivoCompetencia
    );
    const competenciaJson = JSON.parse(
      await fs.readFile(competenciaFile, "utf-8")
    );
    const productosCompetencia = competenciaJson.products || [];

    // 3. Comparar por título exacto
    const comparaciones = compararPorTitulo(
      productosTienda,
      productosCompetencia
    );

    res.json({ comparaciones });
  } catch (e) {
    console.error("comparison:", e.message);
    res.status(500).json({ error: "Error al comparar", detalle: e.message });
  }
});

module.exports = router;
