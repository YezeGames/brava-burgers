const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { listWaMessages } = require('../lib/waInbox');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const token = String(req.query.token || '').trim();
  if (!validateAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const result = await listWaMessages({
    since: req.query.since || '',
    limit: req.query.limit,
  });
  if (!result.ok) {
    const code = result.error === 'supabase_not_configured' ? 503 : 502;
    return res.status(code).json(result);
  }
  return res.status(200).json(result);
};
