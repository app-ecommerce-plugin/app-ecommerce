const express = require("express");
const router = express.Router();
const redisClient = require("../utils/redisClient");
const fs = require("fs/promises");
const path = require("path");
const { compararPorTitulo } = require("../utils/compararProductos");
const axios = require("axios");

router.get("/", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: "Falta parámetro shop" });

  try {
    const rawSel = await redisClient.get(`selectedProducts_${shop}`);
    const seleccion = rawSel ? JSON.parse(rawSel) : [];

    let storeProducts = [];

    if (process.env.USE_LOCAL_FILES === "true") {
      const filePath = path.join(
        __dirname,
        "..",
        "external_data",
        `${shop}.json`
      );
      const content = await fs.readFile(filePath, "utf-8");
      storeProducts = JSON.parse(content).products;
    } else {
      const token = await redisClient.get(`accessToken_${shop}`);
      if (!token) {
        return res.status(403).json({ error: `No hay token para ${shop}` });
      }
      const response = await axios.get(
        `https://${shop}/admin/api/2023-01/products.json`,
        {
          headers: { "X-Shopify-Access-Token": token },
        }
      );
      storeProducts = response.data.products;
    }

    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${shop}.json`
    );
    const dataCompetencia = JSON.parse(
      await fs.readFile(filePath, "utf-8")
    ).products;

    const comparaciones = compararPorTitulo(
      storeProducts,
      dataCompetencia,
      seleccion
    );

    res.json({ comparaciones });
  } catch (e) {
    console.error("Error en comparación:", e.message);
    res.status(500).json({ error: "Error al comparar" });
  }
});

module.exports = router;
