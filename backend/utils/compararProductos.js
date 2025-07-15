const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');  // Asegurarse de tener node-fetch u otra librería HTTP para llamadas API
const redisClient = require('./redisClient');  // Cliente de Redis previamente configurado
// (Se asume que './redisClient' exporta un cliente conectado y con promesas habilitadas)

// Función principal para comparar productos seleccionados de la tienda vs precios de competencia
async function compararProductos(shopDomain) {
  // 1. Obtener la lista de IDs de productos seleccionados desde Redis
  let idsProductosSeleccionados = [];
  try {
    const redisKey = `selectedProducts:${shopDomain}`;
    const seleccionJSON = await redisClient.get(redisKey);
    if (seleccionJSON) {
      idsProductosSeleccionados = JSON.parse(seleccionJSON);
    }
  } catch (err) {
    console.error(`Error al obtener productos seleccionados de Redis para ${shopDomain}:`, err);
    // Si hay error al leer Redis, continuamos con lista vacía (no hay productos seleccionados)
    idsProductosSeleccionados = [];
  }

  // Si no hay productos seleccionados, devolvemos una lista vacía de comparaciones de inmediato
  if (!idsProductosSeleccionados || idsProductosSeleccionados.length === 0) {
    return [];  // Nada que comparar
  }

  // 2. Obtener los datos actualizados de cada producto seleccionado desde la API de Shopify
  let productosTienda = [];
  if (process.env.USE_LOCAL_FILES === 'true') {
    // Modo local (testing): aquí podríamos cargar datos de ejemplo de la tienda si existieran
    // Por ahora, asumimos que en producción siempre USE_LOCAL_FILES es false.
    console.warn('USE_LOCAL_FILES está activo, pero no se ha definido un origen local de productos de la tienda.');
  } else {
    // **CORRECCIÓN:** Usar el token OAuth2 almacenado para la tienda y obtener cada producto vía API Shopify
    // (Se espera que exista un mecanismo para recuperar el access token de la tienda actual)
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || (req.session && req.session.accessToken);
    // ^ NOTA: En una app multiusuario real, se debería obtener el token específico de `shopDomain` desde la base de datos o memoria

    for (let productId of idsProductosSeleccionados) {
      try {
        // Llamada a la API REST de Shopify para obtener el producto por ID
        const url = `https://${shopDomain}/admin/api/2023-04/products/${productId}.json`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        const data = await response.json();
        const producto = data.product;
        if (producto) {
          // Extraer título y precio (se toma el de la primera variante suponiendo un solo precio por producto)
          const precio = producto.variants && producto.variants.length > 0 
                         ? parseFloat(producto.variants[0].price) 
                         : parseFloat(producto.price || 0);
          productosTienda.push({
            title: producto.title,
            price: precio
          });
        }
      } catch (apiErr) {
        console.error(`Error al obtener datos del producto ${productId} desde Shopify:`, apiErr);
        // Si falla una llamada de API, continuar con la siguiente sin detener todo el proceso
      }
    }
  }

  // 3. Cargar los datos de precios de la competencia desde el archivo JSON correspondiente a la tienda
  let productosCompetencia = [];
  try {
    const filePath = path.join('/external_data', `${shopDomain}.json`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const datosCompetencia = JSON.parse(fileContent);
    productosCompetencia = datosCompetencia.products || [];
  } catch (err) {
    console.error(`Error al leer el archivo de competencia para ${shopDomain}:`, err);
    // Si no se puede leer el archivo, se mantiene productosCompetencia como lista vacía
    productosCompetencia = [];
  }

  // 4. Comparar cada producto seleccionado de la tienda contra el listado de competencia por título
  const comparaciones = [];
  for (let prodTienda of productosTienda) {
    // Buscar un producto de la competencia con el mismo título (coincidencia exacta)
    const tituloBuscar = prodTienda.title.trim();
    const productoComp = productosCompetencia.find(prodComp => {
      return prodComp.title && prodComp.title.trim() === tituloBuscar;
    });

    if (productoComp) {
      // **CORRECCIÓN:** Coincidencia encontrada por título exacto, preparar resultado
      const precioTienda = parseFloat(prodTienda.price);
      const precioCompetencia = parseFloat(productoComp.price);
      const diferencia = precioTienda - precioCompetencia;  // cálculo de diferencia de precios

      comparaciones.push({
        title: prodTienda.title,
        storePrice: precioTienda,
        competitorPrice: precioCompetencia,
        difference: diferencia
      });
    }
    // Si no hay coincidencia, se omite el producto de la tienda (no se agrega a comparaciones)
  }

  // 5. Devolver el resultado de las comparaciones en formato JSON
  return comparaciones;
}

// Exportar la función para uso en otras partes (ej. controlador de rutas)
module.exports = compararProductos;