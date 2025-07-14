// Importar módulos necesarios
const express = require('express');
const router = express.Router();
const compararProductos = require('./compararProductos');  // Importa la función de comparación de productos

// Ruta API para iniciar la comparación de productos seleccionados
router.get('/comparar', async (req, res) => {
  try {
    // Obtener el dominio de la tienda Shopify actual.
    // Se asume que está disponible en la sesión del usuario o como parámetro de consulta.
    const shopDomain = req.session.shopDomain || req.query.shop;
    if (!shopDomain) {
      return res.status(400).json({ error: 'Falta el dominio de la tienda' });
    }

    // Llamar a la función de comparación de productos con el dominio de la tienda.
    const resultadosComparacion = await compararProductos(shopDomain);

    // Devolver los resultados en formato JSON
    res.status(200).json(resultadosComparacion);
  } catch (error) {
    console.error('Error al comparar productos:', error);
    res.status(500).json({ 
      error: 'Error interno al comparar productos', 
      detalles: error.message 
    });
  }
});

module.exports = router;
