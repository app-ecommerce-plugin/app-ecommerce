// backend/routes/debugCompetitors.js
const express = require("express");
const redis = require("../utils/redisClient");

const router = express.Router();
const TTL_SEC = 60 * 60 * 24; // 24h
const SECRET = process.env.CRON_SECRET || "";

function key(shop) {
  return `competitors:${shop}`;
}

function requireSecret(req, res, next) {
  const header = req.get("x-cron-secret") || "";
  if (!SECRET || header !== SECRET) {
    return res.status(401).json({ error: "Unauthorized (x-cron-secret)" });
  }
  next();
}

// POST: carga/reescribe catálogo de competencia
router.post("/competitors", requireSecret, async (req, res) => {
  try {
    const shop = String(req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ error: "Falta ?shop=" });

    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length)
      return res.status(400).json({ error: "Body debe ser array con items" });

    await redis.set(
      key(shop),
      JSON.stringify({ items, ts: Date.now() }),
      "EX",
      TTL_SEC
    );
    res.json({ ok: true, count: items.length, ttlSeconds: TTL_SEC });
  } catch (e) {
    console.error("POST /debug/competitors", e);
    res.status(500).json({ error: "No se pudo guardar catalogo" });
  }
});

// GET: consulta lo cargado
router.get("/competitors", requireSecret, async (req, res) => {
  try {
    const shop = String(req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ error: "Falta ?shop=" });

    const raw = await redis.get(key(shop));
    if (!raw) return res.json({ ok: true, exists: false });

    const json = JSON.parse(raw);
    res.json({
      ok: true,
      exists: true,
      count: (json.items || []).length,
      data: json,
    });
  } catch (e) {
    console.error("GET /debug/competitors", e);
    res.status(500).json({ error: "No se pudo leer catalogo" });
  }
});

module.exports = router;