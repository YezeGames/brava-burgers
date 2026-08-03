const { cors, gasPost } = require('./_gasFetch');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const order = req.body;
  if (!order || !order.cliente) {
    return res.status(400).json({ ok: false, error: 'invalid_order' });
  }

  const secret = process.env.BRAVA_ORDER_SECRET;
  if (!secret) {
    return res.status(503).json({ ok: false, error: 'orders_not_configured' });
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
