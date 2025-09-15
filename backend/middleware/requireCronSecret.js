// backend/middleware/requireCronSecret.js
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.warn(
      "[WARN] CRON_SECRET no configurado. No se puede validar llamadas internas."
    );
    return res.status(500).json({ error: "CRON_SECRET no configurado" });
  }
  const got = req.header("x-cron-secret");
  if (got !== expected)
    return res.status(403).json({ error: "No autorizado (cron)" });
  next();
}

module.exports = { requireCronSecret };