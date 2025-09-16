const express = require("express");
const fetch = require("node-fetch");
const Joi = require("joi");

const redis = require("../utils/redisClient");
const { decrypt } = require("../utils/crypto");
const { validateShopParam } = require("../middleware/shopValidation");
const {
  ensureShopAccess,
  tokenKey,
} = require("../middleware/ensureShopAccess");

const router = express.Router();

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-04";

// Helpers
async function getDecryptedToken(shop) {
  const enc = await redis.get(tokenKey(shop));
  if (!enc) throw new Error("Token no encontrado");
  return decrypt(enc);
}

function parseLinkHeader(link) {
  if (!link) return {};
  const parts = link.split(",");
  const out = {};
  for (const p of parts) {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

async function fetchAllProducts(shop, token) {
  let url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
  const products = [];

  while (url) {
    const resp = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify products error ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    products.push(...(data.products || []));
    const link = resp.headers.get("link");
    const parsed = parseLinkHeader(link);
    url = parsed.next || null;
  }

  return products.map((p) => {
    const v = (p.variants && p.variants[0]) || {};
    return {
      id: p.id,
      title: p.title,
      price: v.price ? Number(v.price) : null,
      variantId: v.id || null,
    };
  });
}

// GET /products?shop=...
router.get(
  "/products",
  validateShopParam,
  ensureShopAccess,
  async (req, res) => {
    try {
      const shop = req.shop;
      const token = await getDecryptedToken(shop);
      const list = await fetchAllProducts(shop, token);
      res.json({ products: list });
    } catch (err) {
      console.error("GET /products error:", err);
      res.status(500).json({ error: "No se pudieron obtener productos" });
    }
  }
);

const selectSchema = Joi.object({
  shop: Joi.string().required(),
  productIds: Joi.array().items(Joi.number().unsafe()).min(1).required(),
});

// POST /products/selected
router.post("/products/selected", async (req, res) => {
  try {
    const { error, value } = selectSchema.validate(req.body);
    if (error) return res.status(400).json({ error: "Body inválido" });

    const { shop, productIds } = value;
    const token = await getDecryptedToken(shop);

    const all = await fetchAllProducts(shop, token);
    const chosen = all.filter((p) => productIds.includes(p.id));

    await redis.set(`selectedProducts_${shop}`, JSON.stringify(chosen));
    res.json({ success: true, count: chosen.length, items: chosen });
  } catch (err) {
    console.error("POST /products/selected error:", err);
    res.status(500).json({ error: "No se pudo guardar selección" });
  }
});

module.exports = router;