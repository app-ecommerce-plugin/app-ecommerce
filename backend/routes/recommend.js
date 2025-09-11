const express = require("express");
const router = express.Router();
const compararProductos = require("../utils/compararProductos");
const buildRecommendations = require("../engine/priceEngine");

// GET /shopify/recommend?shop=...&mode=auto&undercutPct=5&minMarginPct=3
router.get("/recommend", async (req, res) => {
  try {
    const { shop, mode = "auto" } = req.query;
    const undercutPct = Number(req.query.undercutPct ?? 5);
    const minMarginPct = Number(req.query.minMarginPct ?? 0);

    if (!shop) return res.status(400).json({ error: "Falta shop" });

    const comparaciones = await compararProductos(shop, { mode });
    const recs = buildRecommendations(comparaciones, {
      undercutPct,
      minMarginPct,
    });
    res.json({ recommendations: recs });
  } catch (e) {
    console.error("recommend error:", e.message);
    res.status(500).json({ error: "No se pudieron generar recomendaciones" });
  }
});

module.exports = router;