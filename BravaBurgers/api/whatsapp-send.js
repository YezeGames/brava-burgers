const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { sendTextMessage, getWhatsAppConfig } = require('../lib/whatsappMeta');

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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = parseRequestBody(req);
  if (!validateAdminToken(body.token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return res.status(503).json({ ok: false, error: 'whatsapp_not_configured' });
  }

  const result = await sendTextMessage(body.to, body.text);
  if (!result.ok) {
    const code = result.error === 'invalid_params' ? 400 : 502;
    return res.status(code).json(result);
  }
  return res.status(200).json(result);
};
