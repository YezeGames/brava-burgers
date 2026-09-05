const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { downloadMediaBuffer, getWhatsAppConfig } = require('../lib/whatsappMeta');

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
  if (!cfg.accessToken) {
    return res.status(503).json({ ok: false, error: 'whatsapp_not_configured' });
  }

  const mediaId = String(req.query.id || '').trim();
  if (!mediaId) {
    return res.status(400).json({ ok: false, error: 'missing_media_id' });
  }

  const result = await downloadMediaBuffer(mediaId);
  if (!result.ok) {
    const code = result.error === 'invalid_params' ? 400 : 502;
    return res.status(code).json(result);
  }

  res.setHeader('Content-Type', result.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).send(Buffer.from(result.buffer));
};
