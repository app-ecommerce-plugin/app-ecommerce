# 🔁 Shopify Dynamic Pricing App + AI (Backend)

Este backend forma parte de una aplicación para **optimizar dinámicamente los precios de productos en tiendas Shopify**, utilizando comparaciones con catálogos externos y modelos de IA (embeddings de OpenAI).

## 📐 Estructura del Proyecto

```plaintext
/backend
├── server.js                   ← punto de entrada limpio y modular
├── /routes                     ← rutas organizadas por dominio funcional
│   ├── auth.js                 ← gestión OAuth con Shopify
│   ├── products.js             ← obtiene productos con token
│   ├── selection.js            ← guarda y recupera selección en Redis
│   ├── comparison.js           ← comparación de precios (exacta y semántica)
│   └── debug.js                ← inspección y depuración (solo dev)
├── /utils
│   ├── redisClient.js          ← cliente Redis reutilizable
│   ├── compararProductos.js    ← lógica de comparación de títulos y precios
│   └── embeddings.js           ← integración con OpenAI
├── /external_data              ← catálogos JSON reales para pruebas
│   ├── precios-dinamicos-prueba.myshopify.com.json
│   └── tienda-prueba-multiusuario.myshopify.com.json

