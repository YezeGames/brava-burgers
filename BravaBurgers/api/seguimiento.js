const { cors } = require('../lib/gasFetch');
const { verifySeguimientoToken } = require('../lib/seguimientoToken');
const { getPublicOrderSeguimiento } = require('../lib/bravaSupabase');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const q = req.query || {};
  const token = String(q.t || q.token || '').trim();
  const verified = verifySeguimientoToken(token);
  if (!verified.ok) {
    const code = verified.error === 'token_expired' ? 410 : 401;
    return res.status(code).json(verified);
  }

  const out = await getPublicOrderSeguimiento(verified.orn);
  if (!out.ok) {
    return res.status(out.error === 'order_not_found' ? 404 : 502).json(out);
  }
  return res.status(200).json(out);
};
