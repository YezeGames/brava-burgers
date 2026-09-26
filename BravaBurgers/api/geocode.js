const { cors } = require('../lib/gasFetch');
const { geocodeDeliveryAddress } = require('../lib/geocodeAddress');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const q = String(req.query.q || '')
    .trim()
    .slice(0, 200);
  const locHint = String(req.query.loc || '')
    .trim()
    .slice(0, 80);

  if (q.length < 3) {
    return res.status(400).json({ ok: false, error: 'missing_query' });
  }

  try {
    const out = await geocodeDeliveryAddress(q, { locHint: locHint });
    if (!out.ok) {
      const code = out.error === 'geocoder_not_configured' ? 503 : 404;
      return res.status(code).json(out);
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'geocode_failed', detail: String(e.message || e) });
  }
};
