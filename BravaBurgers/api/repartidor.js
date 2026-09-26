const { cors } = require('../lib/gasFetch');
const { isSupabaseConfigured } = require('../lib/supabaseServer');
const { listRepartidorRuta, repartidorMarkEntregada } = require('../lib/bravaSupabase');

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

function repartidorKeyOk(body, req) {
  const required = (process.env.REPARTIDOR_APP_KEY || '').trim();
  if (!required) return true;
  const got = String(body.key || req.headers['x-repartidor-key'] || '').trim();
  return got === required;
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Repartidor-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_configured' });
  }

  const body = req.method === 'GET' ? req.query || {} : parseBody(req);
  if (!repartidorKeyOk(body, req)) {
    return res.status(401).json({ ok: false, error: 'invalid_key' });
  }

  const action = String(body.action || (req.method === 'GET' ? 'listRuta' : '')).trim();

  try {
    if (action === 'listRuta') {
      const tel = body.telefono || body.tel || body.repartidor_tel;
      const out = await listRepartidorRuta(tel);
      return res.status(out.ok ? 200 : 400).json(out);
    }
    if (action === 'markEntregada') {
      const out = await repartidorMarkEntregada(body);
      return res.status(out.ok ? 200 : 400).json(out);
    }
    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'repartidor_failed', detail: String(e.message || e) });
  }
};
