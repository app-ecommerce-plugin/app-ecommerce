const express = require('express');
const router  = express.Router();

// TODO: implementar OAuth Shopify.  Por ahora evita fallo de módulo.
router.all('*', (_, res) =>
  res.status(501).json({ error: 'Auth route not implemented yet' })
);

module.exports = router;