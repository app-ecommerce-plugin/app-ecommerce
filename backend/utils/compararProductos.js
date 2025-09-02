// utils/compararProductos.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // si usas Node 18+ podrías usar global fetch
const redisClient = require('./redisClient');

/**
 * Normaliza títulos para mejorar el matching por texto:
 * - minúsculas
 * - sin acentos
 * - sin signos raros
 * - espacios colapsados
 */
function normTitle(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Carga el JSON de external_data para la tienda dada.
 */
function loadLocalCatalog(shopDomain) {
  const filePath = path.join(__dirname, '..', 'external_data', `${shopDomain}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data.products) ? data.products : [];
}

/**
 * Devuelve una lista de { title, price } de los productos seleccionados de la tienda,
 * usando API de Shopify (si hay token y no forzamos local) o los datos locales/Redis.
 */
async function getSelectedStoreProducts(shopDomain, options = {}) {
  const USE_LOCAL = process.env.USE_LOCAL_FILES === 'true';

  // 1) Obtener selección desde Redis (clave unificada con "_")
  const redisKey = `selectedProducts_${shopDomain}`;
  let seleccion = [];
  try {
    const raw = await redisClient.get(redisKey);
    seleccion = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Error leyendo selección en Redis (${redisKey}):`, e);
    seleccion = [];
  }
  if (!Array.isArray(seleccion) || seleccion.length === 0) return [];

  // ¿Hay token OAuth guardado?
  const accessToken = await redisClient.get(`accessToken_${shopDomain}`);
  const debeUsarLocal = USE_LOCAL || !accessToken;

  // 2) Si debemos usar local (o no hay token), devolvemos directamente la selección enriquecida
  if (debeUsarLocal) {
    // La selección se guarda como [{ id, title, price }, ...]
    // Si por algún motivo fueran solo IDs, intentamos resolverlos contra el JSON local.
    if (typeof seleccion[0] === 'object' && seleccion[0] !== null && 'title' in seleccion[0]) {
      return seleccion.map(p => ({ title: p.title, price: Number(p.price) || 0 }));
    } else {
      // Cargar JSON local y filtrar por IDs
      const all = loadLocalCatalog(shopDomain);
      const ids = seleccion.map(x => (typeof x === 'object' ? x.id : x));
      return all
        .filter(p => ids.includes(p.id))
        .map(p => ({ title: p.title, price: Number(p.price) || 0 }));
    }
  }

  // 3) Si hay token y no forzamos modo local, pedimos a Shopify cada producto seleccionado
  const ids = seleccion.map(x => (typeof x === 'object' ? x.id : x));
  const productosTienda = [];

  for (const productId of ids) {
    try {
      const url = `https://${shopDomain}/admin/api/2023-04/products/${productId}.json`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const producto = data.product;
      if (!producto) continue;

      const price = producto.variants?.length
        ? Number(producto.variants[0].price) || 0
        : Number(producto.price) || 0;

      productosTienda.push({ title: producto.title, price });
    } catch (err) {
      console.error(`Error obteniendo producto ${productId} de Shopify:`, err.message);
      // Continuar con el resto
    }
  }

  return productosTienda;
}

/**
 * Carga los "precios de competencia" desde external_data/{shop}.json
 * (mismo fichero que usamos como catálogo de prueba).
 */
function getCompetitorCatalog(shopDomain) {
  try {
    return loadLocalCatalog(shopDomain);
  } catch (e) {
    console.error(`Error leyendo catálogo de competencia para ${shopDomain}:`, e.message);
    return [];
  }
}

/**
 * Compara por título (normalizado), permitiendo coincidencias exactas o inclusión (a ⊆ b o b ⊆ a).
 */
function compararListasPorTitulo(productosTienda, productosCompetencia) {
  const compIndex = new Map();
  for (const pc of productosCompetencia) {
    if (!pc?.title) continue;
    const key = normTitle(pc.title);
    if (!key) continue;
    // guardamos el primero que veamos
    if (!compIndex.has(key)) compIndex.set(key, pc);
  }

  const comparaciones = [];
  for (const pt of productosTienda) {
    const a = normTitle(pt.title);
    if (!a) continue;

    // Búsqueda por igualdad o inclusión
    let encontrado = null;
    if (compIndex.has(a)) {
      encontrado = compIndex.get(a);
    } else {
      for (const [k, val] of compIndex) {
        if (k.includes(a) || a.includes(k)) {
          encontrado = val;
          break;
        }
      }
    }

    if (encontrado) {
      const precioTienda = Number(pt.price) || 0;
      const precioComp = Number(encontrado.price) || 0;
      comparaciones.push({
        tienda: { title: pt.title, price: precioTienda },
        externo: { title: encontrado.title, price: precioComp },
        diferenciaPrecio: +(precioTienda - precioComp).toFixed(2),
      });
    }
  }

  return comparaciones;
}

/**
 * Función principal invocada desde la ruta.
 */
async function compararProductos(shopDomain, options = {}) {
  const productosTienda = await getSelectedStoreProducts(shopDomain, options);
  if (!productosTienda.length) return [];

  const productosCompetencia = getCompetitorCatalog(shopDomain);
  if (!productosCompetencia.length) return [];

  const comparaciones = compararListasPorTitulo(productosTienda, productosCompetencia);
  return comparaciones;
}

module.exports = compararProductos;