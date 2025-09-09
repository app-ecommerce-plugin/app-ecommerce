// utils/ingestCompetitors.js
const axios = require('axios');
const { parse: parseCsv } = require('csv-parse/sync');
const redisClient = require('./redisClient');

const norm = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function sourceFromUrl(url = '') {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

function normalizeItem(raw, fallbackSource = '') {
  const title = raw.title ?? raw.name ?? raw.product ?? '';
  let priceRaw = raw.price ?? raw.amount ?? raw.value ?? raw.price_value ?? '';
  if (typeof priceRaw === 'string') {
    priceRaw = priceRaw.replace(/[^0-9,\.]/g, '').replace(',', '.');
  }
  const price = Number(priceRaw) || 0;
  const currency = raw.currency ?? raw.curr ?? 'EUR';
  const url = raw.url ?? raw.link ?? '';
  const source = raw.source ?? fallbackSource ?? '';
  return { title: String(title).trim(), price, currency, url, source };
}

function dedupeByTitle(items) {
  const byTitle = new Map();
  for (const it of items) {
    const k = norm(it.title);
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, it);
    else {
      const prev = byTitle.get(k);
      if ((it.price || 0) < (prev.price || 0)) byTitle.set(k, it);
    }
  }
  return [...byTitle.values()];
}

async function fetchJsonUrl(url) {
  const { data } = await axios.get(url, { timeout: 15000 });
  const arr = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
  return arr.map(x => normalizeItem(x, sourceFromUrl(url)));
}

async function fetchCsvUrl(url) {
  const { data: csv } = await axios.get(url, { responseType: 'text', timeout: 15000 });
  const rows = parseCsv(csv, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map(r => normalizeItem(r, sourceFromUrl(url)));
}

async function fetchPriceLab(apiKey) {
  if (!apiKey) return [];
  // TODO: integrar API real de PriceLab si la usas
  return [];
}

async function ingestCompetitorsForShop(shop) {
  const cfgRaw = await redisClient.get(`competitor_sources_${shop}`);
  const cfg = cfgRaw ? JSON.parse(cfgRaw) : { sources: [] };
  const sources = Array.isArray(cfg.sources) ? cfg.sources : [];

  const all = [];
  const report = { totalSources: sources.length, ok: 0, fail: 0, errors: [] };

  for (const src of sources) {
    try {
      let items = [];
      if (src.type === 'json_url' && src.url) items = await fetchJsonUrl(src.url);
      else if (src.type === 'csv_url' && src.url) items = await fetchCsvUrl(src.url);
      else if (src.type === 'pricelab') items = await fetchPriceLab(src.apiKey || process.env.PRICELAB_API_KEY);
      else throw new Error(`Tipo de fuente no soportado: ${src.type}`);
      all.push(...items);
      report.ok += 1;
    } catch (e) {
      report.fail += 1;
      report.errors.push({ source: src, error: e.message });
    }
  }

  const consolidated = dedupeByTitle(all);
  const payload = { updatedAt: Date.now(), items: consolidated };
  await redisClient.set(`competitors_${shop}`, JSON.stringify(payload));
  return { ...report, consolidatedCount: consolidated.length };
}

async function listConsolidated(shop) {
  const raw = await redisClient.get(`competitors_${shop}`);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj)) return { updatedAt: null, items: obj };
    return obj;
  } catch { return null; }
}

async function listSources(shop) {
  const raw = await redisClient.get(`competitor_sources_${shop}`);
  const cfg = raw ? JSON.parse(raw) : { sources: [] };
  cfg.sources = Array.isArray(cfg.sources) ? cfg.sources : [];
  return cfg;
}

async function saveSources(shop, sources) {
  await redisClient.set(`competitor_sources_${shop}`, JSON.stringify({ sources }));
}

module.exports = {
  ingestCompetitorsForShop,
  listConsolidated,
  listSources,
  saveSources,
};