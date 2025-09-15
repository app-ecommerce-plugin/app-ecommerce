// backend/middleware/ensureShopAccess.js
const redis = require("../utils/redisClient");

const tokenKey = (shop) => `accessToken_${shop}`;

async function ensureShopAccess(req, res, next) {
  const shop = req.shop || (req.query && req.query.shop);
  if (!shop) return res.status(400).json({ error: "Falta 'shop'" });
  const encToken = await redis.get(tokenKey(shop));
  if (!encToken) {
    return res
      .status(401)
      .json({ error: "Tienda no autorizada o sin token válido" });
  }
  // No devolvemos el token aquí por seguridad; solo validamos existencia.
  next();
}

module.exports = { ensureShopAccess, tokenKey };