// routes/competitors.js
const express = require('express');
const router = express.Router();
const {
  ingestCompetitorsForShop,
  listConsolidated,
  listSources,
  saveSources,
} = require('../utils/ingestCompetitors');

// GET /competitors/sources?shop=...
router.get('/sources', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });
  try {
    const cfg = await listSources(shop);
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /competitors/sources
// Body: { shop, action: 'add'|'remove'|'set', source?: {...}, sources?: [...] }
router.post('/sources', async (req, res) => {
  const { shop, action, source, sources } = req.body || {};
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });

  try {
    const cfg = await listSources(shop);
    let list = cfg.sources;

    if (action === 'set' && Array.isArray(sources)) {
      list = sources;
    } else if (action === 'add' && source) {
      list = [...list, source];
    } else if (action === 'remove' && source) {
      list = list.filter(s =>
        !(
          s.type === source.type &&
          ((s.url && s.url === source.url) || (s.apiKey && s.apiKey === source.apiKey))
        )
      );
    } else {
      return res.status(400).json({ error: 'Acción inválida o payload incompleto' });
    }

    await saveSources(shop, list);
    res.json({ success: true, sources: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /competitors/ingest?shop=...
router.post('/ingest', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });
  try {
    const report = await ingestCompetitorsForShop(shop);
    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /competitors?shop=...
router.get('/', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });
  try {
    const data = await listConsolidated(shop);
    res.json(data || { updatedAt: null, items: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ping', (_req, res) => res.send('OK: competitors funcionando'));
module.exports = router;