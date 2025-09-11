// engine/priceEngine.js
module.exports = function buildRecommendations(
  comparaciones,
  { minMarginPct = 0, undercutPct = 5 } = {}
) {
  // undercut = bajar X% sobre el precio del competidor si estamos por encima
  // minMarginPct: nunca proponer por debajo de (precio_tienda * (1 - minMarginPct/100))
  const out = [];
  for (const c of comparaciones) {
    const current = Number(c.tienda.price) || 0;
    const competitor = Number(c.externo.price) || 0;
    if (!competitor) continue;

    let suggested = current;
    if (current > competitor) {
      suggested = +(competitor * (1 - undercutPct / 100)).toFixed(2);
      const floor = +(current * (1 - minMarginPct / 100)).toFixed(2);
      if (suggested < floor) suggested = floor; // guardarraíl
    }

    out.push({
      title: c.tienda.title,
      currentPrice: current,
      competitorPrice: competitor,
      suggestedPrice: suggested,
      match_method: c.match_method,
      score: c.score ?? null,
    });
  }
  return out;
};