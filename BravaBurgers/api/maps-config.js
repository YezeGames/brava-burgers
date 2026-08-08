const { cors } = require('../lib/gasFetch');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) {
    return res.status(503).json({ ok: false, error: 'maps_not_configured' });
  }

  return res.status(200).json({ ok: true, key });
};
