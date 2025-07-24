const express = require("express");
const router = express.Router();
const compararProductos = require("../utils/compararProductos");

router.get("/", async (req, res) => {
  const shopDomain = req.query.shop;
  const mode = req.query.mode || "title";

  if (!shopDomain) {
    return res.status(400).json({ error: "Falta el dominio de la tienda" });
  }

  try {
    const comparaciones = await compararProductos(shopDomain, mode);
    res.status(200).json({ comparaciones });
  } catch (error) {
    console.error("Error al comparar productos:", error.message);
    res.status(500).json({
      error: "Error interno al comparar productos",
      detalles: error.message,
    });
  }
});

module.exports = router;
