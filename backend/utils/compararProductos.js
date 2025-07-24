const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const redisClient = require("./redisClient");

async function compararProductos(shopDomain, mode = "title") {
  const redisKey = `selectedProducts_${shopDomain}`;
  let seleccion = [];

  try {
    const seleccionJSON = await redisClient.get(redisKey);
    seleccion = seleccionJSON ? JSON.parse(seleccionJSON) : [];
  } catch (err) {
    console.error("❌ Error leyendo selección de Redis:", err.message);
    return [];
  }

  if (!seleccion.length) {
    console.warn("⚠️ No hay productos seleccionados para comparar.");
    return [];
  }

  let productosTienda = [];

  const useLocal = process.env.USE_LOCAL_FILES === "true";
  if (useLocal) {
    productosTienda = seleccion;
  } else {
    try {
      const accessToken = await redisClient.get(`accessToken_${shopDomain}`);
      if (!accessToken) throw new Error("No hay token");

      for (const p of seleccion) {
        const url = `https://${shopDomain}/admin/api/2023-07/products/${p.id}.json`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });
        const data = await response.json();
        const producto = data.product;
        if (producto) {
          const precio = producto.variants?.[0]?.price || producto.price || 0;
          productosTienda.push({
            title: producto.title,
            price: parseFloat(precio),
          });
        }
      }
    } catch (err) {
      console.error("❌ Error obteniendo productos de Shopify:", err.message);
      return [];
    }
  }

  // Leer JSON de competencia
  let productosCompetencia = [];
  try {
    const filePath = path.join(
      __dirname,
      "..",
      "external_data",
      `${shopDomain}.json`
    );
    const content = fs.readFileSync(filePath, "utf-8");
    productosCompetencia = JSON.parse(content).products || [];
  } catch (err) {
    console.error("❌ Error leyendo JSON externo de competencia:", err.message);
    return [];
  }

  const comparaciones = [];

  for (const p of productosTienda) {
    const comp = productosCompetencia.find(
      (c) => c.title.trim().toLowerCase() === p.title.trim().toLowerCase()
    );

    if (comp) {
      const precioTienda = parseFloat(p.price);
      const precioCompetencia = parseFloat(comp.price);
      comparaciones.push({
        title: p.title,
        storePrice: precioTienda,
        competitorPrice: precioCompetencia,
        difference: precioTienda - precioCompetencia,
      });
    }
  }

  return comparaciones;
}

module.exports = compararProductos;