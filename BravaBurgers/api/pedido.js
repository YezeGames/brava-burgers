const { cors, gasPost } = require('../lib/gasFetch');
const { isSupabaseConfigured } = require('../lib/supabaseServer');
const {
  createOrderFromShop,
  validateCouponForShop,
  listRepartidorRuta,
  repartidorMarkEntregada,
} = require('../lib/bravaSupabase');

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

async function handleRepartidor(body, req, res) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_configured' });
  }
  if (!repartidorKeyOk(body, req)) {
    return res.status(401).json({ ok: false, error: 'invalid_key' });
  }
  const action = String(body.action || '').trim();
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
}

async function handleValidateCupon(body, res) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'cupones_not_configured' });
  }

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
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Repartidor-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const q = req.query || {};
    if (String(q.action || '') === 'listRuta') {
      return handleRepartidor(q, req, res);
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const body = parseBody(req);
  if (body.action === 'listRuta' || body.action === 'markEntregada') {
    return handleRepartidor(body, req, res);
  }
  if (body.action === 'validateCupon' || (body.codigo && !body.cliente)) {
    return handleValidateCupon(body, res);
  }

  const order = body;
  if (!order || !order.cliente) {
    return res.status(400).json({ ok: false, error: 'invalid_order' });
  }

  const secret = process.env.BRAVA_ORDER_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: 'orders_not_configured' });
  }

  if (isSupabaseConfigured()) {
    const data = await createOrderFromShop(order);
    if (!data.ok) {
      const turnoErr =
        data.error === 'turno_cupo_lleno' ||
        data.error === 'turno_cerrado' ||
        data.error === 'turno_no_abierto' ||
        data.error === 'turno_invalid' ||
        data.error === 'turno_no_disponible' ||
        data.error === 'turno_requerido' ||
        data.error === 'pago_requerido' ||
        data.error === 'fuera_de_zona' ||
        data.error === 'direccion_sin_coordenadas';
      const cuponErr =
        data.error === 'codigo_invalido' ||
        data.error === 'codigo_usado' ||
        data.error === 'codigo_otro_telefono';
      const code = turnoErr || cuponErr ? 409 : 502;
      return res.status(code).json(data);
    }
    return res.status(200).json(data);
  }

  const data = await gasPost({
    action: 'createOrder',
    secret,
    order,
  });

  if (!data.ok) {
    const code = data.error === 'unauthorized' ? 401 : data.error === 'gas_not_configured' ? 503 : 502;
    return res.status(code).json(data);
  }
  return res.status(200).json(data);
};
