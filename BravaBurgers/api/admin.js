const { cors, gasPost } = require('../lib/gasFetch');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { action, token, user, password, orn, estado, items, subtotal, total, estadoFilter } =
    req.body || {};

  if (!action) return res.status(400).json({ ok: false, error: 'missing_action' });

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
    }
  }

  const data = await gasPost(payload);
  if (!data.ok) {
    const authErrors = ['unauthorized', 'invalid_credentials', 'admin_not_configured'];
    const code = authErrors.includes(data.error)
      ? data.error === 'admin_not_configured'
        ? 503
        : 401
      : data.error === 'gas_not_configured'
        ? 503
        : 502;
    return res.status(code).json(data);
  }
  return res.status(200).json(data);
};
