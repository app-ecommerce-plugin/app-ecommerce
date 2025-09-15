// backend/middleware/shopValidation.js
const Joi = require("joi");

const shopSchema = Joi.string()
  .pattern(/^[a-z0-9-]+\.myshopify\.com$/i)
  .required();

function extractShop(req) {
  // prioriza body, luego query (depende del endpoint)
  return (req.body && req.body.shop) || (req.query && req.query.shop) || null;
}

function validateShopParam(req, res, next) {
  const shop = extractShop(req);
  const { error } = shopSchema.validate(shop);
  if (error) {
    return res
      .status(400)
      .json({ error: "Parámetro 'shop' inválido o ausente" });
  }
  // ancla shop normalizado en la request
  req.shop = shop;
  next();
}

module.exports = { validateShopParam, shopSchema };