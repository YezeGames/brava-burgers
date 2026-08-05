const { cors, gasPost } = require('../lib/gasFetch');
const { isSupabaseConfigured, createAdminSupabaseSession } = require('../lib/supabaseServer');
const { checkAdminLogin, validateAdminToken } = require('../lib/adminAuth');
const {
  listOrders,
  updateOrder,
  listGastos,
  createGasto,
  deleteGasto,
} = require('../lib/bravaSupabase');

function parseRequestBody(req) {
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

async function handleSupabaseAdmin(body) {
  const { action, token } = body;

  if (action === 'login') {
    const login = checkAdminLogin(body.user, body.password);
    if (!login.ok) return login;
    let realtime = null;
    try {
      realtime = await createAdminSupabaseSession();
    } catch {
      realtime = null;
    }
    return {
      ok: true,
      token: login.token,
      expiresIn: login.expiresIn,
      backend: 'supabase',
      realtime,
    };
  }

  if (!validateAdminToken(token)) {
    return { ok: false, error: 'unauthorized' };
  }

  if (action === 'listOrders' || action === 'listOrdersRecent') {
    const max = action === 'listOrdersRecent' ? 35 : 250;
    return listOrders(max);
  }

  if (action === 'updateOrder') {
    return updateOrder(body);
  }

  if (action === 'listGastos') {
    return listGastos(body.desde || '', body.hasta || '');
  }

  if (action === 'createGasto') {
    return createGasto(body);
  }

  if (action === 'deleteGasto') {
    return deleteGasto(body.id);
  }

  if (action === 'refreshRealtime') {
    const realtime = await createAdminSupabaseSession();
    if (!realtime) return { ok: false, error: 'realtime_not_configured' };
    return { ok: true, realtime };
  }

  return { ok: false, error: 'unknown_action' };
}

async function handleGasAdmin(body) {
  const {
    action,
    token,
    user,
    password,
    orn,
    estado,
    items,
    subtotal,
    total,
    estadoFilter,
    rechazoMensaje,
    desde,
    hasta,
    concepto,
    monto,
    pagadoCon,
    id: gastoId,
  } = body;

  const payload = { action };
  if (action === 'login') {
    payload.user = user;
    payload.password = password;
  } else {
    payload.token = token;
    if (action === 'listOrders' || action === 'listOrdersRecent') payload.estado = estadoFilter || '';
    if (action === 'updateOrder') {
      payload.orn = orn;
      if (estado) payload.estado = estado;
      if (items) payload.items = items;
      if (subtotal != null) payload.subtotal = subtotal;
      if (total != null) payload.total = total;
      if (rechazoMensaje != null) payload.rechazoMensaje = rechazoMensaje;
    }
    if (action === 'listGastos') {
      payload.desde = desde || '';
      payload.hasta = hasta || '';
    }
    if (action === 'createGasto') {
      payload.concepto = concepto;
      payload.monto = monto;
      payload.fecha = body.fecha;
      payload.pagadoCon = pagadoCon;
    }
    if (action === 'deleteGasto') payload.id = gastoId;
  }

  return gasPost(payload);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const body = parseRequestBody(req);
  if (!body.action) return res.status(400).json({ ok: false, error: 'missing_action' });

  let data;
  try {
    data = isSupabaseConfigured() ? await handleSupabaseAdmin(body) : await handleGasAdmin(body);
  } catch (err) {
    console.error('admin handler error', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  if (!data || typeof data !== 'object') {
    return res.status(502).json({ ok: false, error: 'invalid_handler_response' });
  }

  if (!data.ok) {
    const authErrors = ['unauthorized', 'invalid_credentials', 'admin_not_configured'];
    const code = authErrors.includes(data.error)
      ? data.error === 'admin_not_configured'
        ? 503
        : 401
      : data.error === 'gas_not_configured' || data.error === 'supabase_not_configured'
        ? 503
        : 502;
    return res.status(code).json(data);
  }
  return res.status(200).json(data);
};
