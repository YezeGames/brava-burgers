const { cors } = require('../lib/gasFetch');
const { getPublishedShopCatalog, storeCatalogHealth } = require('../lib/storeCatalog');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=30');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    if (req.query.health === '1') {
      const health = await storeCatalogHealth();
      return res.status(health.ok ? 200 : 503).json(health);
    }

    const catalog = await getPublishedShopCatalog();
    if (!catalog.ok) {
      if (catalog.error === 'store_catalog_not_migrated') {
        return res.status(503).json({ ok: false, error: catalog.error, hint: catalog.hint });
      }
      return res.status(502).json(catalog);
    }
    if (catalog.empty) {
      return res.status(200).json({ ok: true, source: 'supabase', empty: true, productos: [], extras: [] });
    }
    return res.status(200).json({
      ok: true,
      source: 'supabase',
      publishedAt: catalog.publishedAt,
      productos: catalog.productos,
      extras: catalog.extras,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'catalog_failed', detail: String(e.message || e) });
  }
};
