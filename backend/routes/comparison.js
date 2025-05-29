const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const redisClient = require("../utils/redisClient");
const {
  compararPorTitulo,
  compararPorEmbeddings,
} = require("../utils/compararProductos");

const router = express.Router();

/** Utilidad local – lee selección almacenada */
async function getSelectedProducts(shop) {
  const raw = await redisClient.get(`shop:${shop}:selected_products`);
  return raw ? JSON.parse(raw) : [];
}

/** Carga catálogo externo estático (JSON en /external_data) */
async function loadExternalData(shop) {
  const file = path.join(__dirname, "..", "external_data", `${shop}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** ---------- utilidades internas y requires previos ---------- */
// … (todo lo que ya tenías arriba se mantiene igual)

/* ----------  HANDLER ÚNICO  ---------- */
async function handleCompare(req, res) {
  const { shop, mode = "title" } = req.method === "GET" ? req.query : req.body;

  if (!shop) return res.status(400).json({ error: "shop requerido" });

  const selected = await getSelectedProducts(shop);
  if (!selected.length)
    return res.status(404).json({ error: "No hay productos seleccionados" });

  const externos = await loadExternalData(shop);
  if (!externos) return res.status(404).json({ error: "Sin catálogo externo" });

  try {
    const resultados =
      mode === "semantic"
        ? await compararPorEmbeddings(selected, externos)
        : compararPorTitulo(selected, externos);

    res.json({ mode, count: resultados.length, resultados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error comparando productos" });
  }
}

/* ----------  ENDPOINTS  ---------- */
//  POST /shopify/compare  ─ guarda o compara vía cuerpo JSON
router.post("/compare", handleCompare);

//  GET  /shopify/compare?shop=<tienda>&mode=semantic
router.get("/compare", handleCompare);

module.exports = router;
