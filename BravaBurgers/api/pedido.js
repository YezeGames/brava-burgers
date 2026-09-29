const { cors, gasPost } = require('../lib/gasFetch');
const { isSupabaseConfigured } = require('../lib/supabaseServer');
const {
  createOrderFromShop,
  validateCouponForShop,
  listRepartidorRuta,
  repartidorMarkEntregada,
  repartidorConfirmarLlegada,
  repartidorIniciarRecorrido,
  getPublicOrderSeguimiento,
  repartidorReportTrack,
} = require('../lib/bravaSupabase');
const { verifySeguimientoToken } = require('../lib/seguimientoToken');
const { validateRepartidorToken } = require('../lib/repartidorAuth');
const { repartidorLogin } = require('../lib/repartidorUsers');
const { upsertRepartidorPushToken } = require('../lib/repartidorPushTokens');
const { migrateRepartidorPushTokensSchema, migrateRepartidorRealtimeEventsSchema } =
  require('../lib/dbMigrate');
const {
  createRepartidorSupabaseRealtimeSession,
  isRepartidorRealtimeConfigured,
} = require('../lib/repartidorSupabaseRealtime');
const { telNorm } = require('../lib/bravaCoupons');

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

function resolveRepartidorTel(body, req) {
  const tok = String(
    body.repartidorToken || body.repartidor_token || body.token || req.headers['x-repartidor-token'] || ''
  ).trim();
  if (tok) {
    const v = validateRepartidorToken(tok);
    if (v.ok) return { ok: true, tel: v.telefono, session: v };
    return { ok: false, error: v.error || 'invalid_token' };
  }
  const tel = telNorm(body.telefono || body.tel || body.repartidor_tel);
  if (tel) return { ok: true, tel: tel, legacy: true };
  return { ok: false, error: 'missing_auth' };
}

async function handleRepartidor(body, req, res) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'supabase_not_configured' });
  }
  const action = String(body.action || '').trim();
  if (action === 'repartidorLogin') {
    if (!repartidorKeyOk(body, req)) {
      return res.status(401).json({ ok: false, error: 'invalid_key' });
    }
    const out = await repartidorLogin(body.login || body.user, body.password);
    if (out.ok && isRepartidorRealtimeConfigured()) {
      out.realtime = createRepartidorSupabaseRealtimeSession(out.telefono);
    }
    return res.status(out.ok ? 200 : 401).json(out);
  }
  if (!repartidorKeyOk(body, req)) {
    return res.status(401).json({ ok: false, error: 'invalid_key' });
  }
  try {
    const auth = resolveRepartidorTel(body, req);
    if (!auth.ok) {
      return res.status(401).json({ ok: false, error: auth.error || 'unauthorized' });
    }
    if (action === 'listRuta') {
      const includeItems = body.includeItems !== false && body.include_items !== false;
      const orn = String(body.orn || '').trim();
      const out = await listRepartidorRuta(auth.tel, false, {
        includeItems: includeItems,
        orn: orn || undefined,
      });
      return res.status(out.ok ? 200 : 400).json(out);
    }
    if (action === 'markEntregada') {
      const payload = Object.assign({}, body, {
        telefono: auth.tel,
        repartidor_tel: auth.tel,
      });
      const out = await repartidorMarkEntregada(payload);
      return res.status(out.ok ? 200 : 400).json(out);
    }
    if (action === 'iniciarRecorrido') {
      const payload = Object.assign({}, body, {
        telefono: auth.tel,
        repartidor_tel: auth.tel,
      });
      const out = await repartidorIniciarRecorrido(payload);
      return res.status(out.ok ? 200 : 400).json(out);
    }
    if (action === 'confirmarLlegada') {
      const payload = Object.assign({}, body, {
        telefono: auth.tel,
        repartidor_tel: auth.tel,
      });
      const out = await repartidorConfirmarLlegada(payload);
      const code =
        out.ok ? 200 : out.error === 'wa_failed' || out.error === 'whatsapp_not_configured' ? 502 : 400;
      return res.status(code).json(out);
    }
    if (action === 'reportTrack') {
      const payload = Object.assign({}, body, {
        telefono: auth.tel,
        repartidor_tel: auth.tel,
      });
      const out = await repartidorReportTrack(payload);
      return res.status(out.ok ? 200 : 400).json(out);
    }
    if (action === 'repartidorRealtimeSession') {
      if (!isRepartidorRealtimeConfigured()) {
        return res.status(503).json({ ok: false, error: 'realtime_not_configured' });
      }
      const rt = createRepartidorSupabaseRealtimeSession(auth.tel);
      if (!rt) {
        return res.status(503).json({ ok: false, error: 'realtime_session_failed' });
      }
      return res.status(200).json({ ok: true, realtime: rt });
    }
    if (action === 'savePushToken') {
      let out = await upsertRepartidorPushToken(
        auth.tel,
        body.fcm_token || body.fcmToken || body.token,
        body.platform || 'android'
      );
      if (!out.ok && out.error === 'repartidor_push_schema_missing') {
        const mig = await migrateRepartidorPushTokensSchema();
        if (mig.ok) {
          out = await upsertRepartidorPushToken(
            auth.tel,
            body.fcm_token || body.fcmToken || body.token,
            body.platform || 'android'
          );
        } else {
          out.migrate = mig;
        }
      }
      return res.status(out.ok ? 200 : 400).json(out);
    }
    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'repartidor_failed', detail: String(e.message || e) });
  }
}

async function handleSeguimientoPublic(q, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
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
    const action = String(q.action || '').trim();
    if (action === 'osrmRoute') {
      const { fetchOsrmRouteForApp } = require('../lib/osrmRouteProxy');
      const out = await fetchOsrmRouteForApp(q);
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
      return res.status(out.ok ? 200 : out.status || 502).json(out);
    }
    if (action === 'listRuta') {
      return handleRepartidor(q, req, res);
    }
    if (action === 'seguimientoPublic' || q.t || q.token) {
      if (!isSupabaseConfigured()) {
        return res.status(503).json({ ok: false, error: 'supabase_not_configured' });
      }
      return handleSeguimientoPublic(q, res);
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const body = parseBody(req);
  if (body.action === 'osrmRoute') {
    const { fetchOsrmRouteForApp } = require('../lib/osrmRouteProxy');
    const out = await fetchOsrmRouteForApp(body);
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
    return res.status(out.ok ? 200 : out.status || 502).json(out);
  }
  if (
    body.action === 'repartidorLogin' ||
    body.action === 'listRuta' ||
    body.action === 'markEntregada' ||
    body.action === 'confirmarLlegada' ||
    body.action === 'iniciarRecorrido' ||
    body.action === 'reportTrack' ||
    body.action === 'savePushToken' ||
    body.action === 'repartidorRealtimeSession'
  ) {
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
