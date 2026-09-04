const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { getWhatsAppConfig } = require('../lib/whatsappMeta');

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

  const cfg = getWhatsAppConfig();
  return res.status(200).json({
    ok: true,
    configured: !!(cfg.accessToken && cfg.phoneNumberId),
    hasAccessToken: !!cfg.accessToken,
    hasPhoneNumberId: !!cfg.phoneNumberId,
    tokenLength: cfg.accessToken ? cfg.accessToken.length : 0,
  });
};
