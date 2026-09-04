const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { sendTextMessage, getWhatsAppConfig } = require('../lib/whatsappMeta');
const { insertWaMessage } = require('../lib/waInbox');

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
    console.error('[whatsapp-send]', result.error, result.message || '', JSON.stringify(result.detail || {}));
    const code = result.error === 'invalid_params' ? 400 : 502;
    return res.status(code).json(result);
  }

  const graphId =
    result.data &&
    result.data.messages &&
    result.data.messages[0] &&
    result.data.messages[0].id;
  const saved = await insertWaMessage({
    messageId: graphId,
    tel: body.to,
    direction: 'out',
    body: body.text,
  });
  if (!saved.ok && saved.error !== 'supabase_not_configured') {
    console.warn('[whatsapp-send] inbox save failed', saved.error);
  }

  return res.status(200).json(result);
};
