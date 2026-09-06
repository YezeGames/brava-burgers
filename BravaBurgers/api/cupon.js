const { cors } = require('../lib/gasFetch');
const { isSupabaseConfigured } = require('../lib/supabaseServer');
const { validateCouponForShop } = require('../lib/bravaSupabase');

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === 'object' ? body : {};
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'cupones_not_configured' });
  }

  const body = parseBody(req);
  const codigo = body.codigo || body.code;
  const telefono = body.telefono || body.phone;

  const data = await validateCouponForShop(codigo, telefono);
  if (!data.ok) {
    const clientErr = [
      'missing_fields',
      'codigo_invalido',
      'codigo_usado',
      'codigo_otro_telefono',
    ].includes(data.error);
    return res.status(clientErr ? 409 : 502).json(data);
  }

  return res.status(200).json(data);
};
