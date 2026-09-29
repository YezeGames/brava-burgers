const { cors } = require('../lib/gasFetch');
const { fetchOsrmRouteForApp } = require('../lib/osrmRouteProxy');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const out = await fetchOsrmRouteForApp(req.query || {});
  return res.status(out.ok ? 200 : out.status || 502).json(out);
};
