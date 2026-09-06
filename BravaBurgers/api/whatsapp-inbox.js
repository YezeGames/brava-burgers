const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { listWaMessages, deleteWaMessagesForTel } = require('../lib/waInbox');
const { downloadMediaBuffer, getWhatsAppConfig } = require('../lib/whatsappMeta');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String(req.query.token || '').trim();
  if (!validateAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method === 'DELETE') {
    const tel = String(req.query.tel || '').trim();
    if (!tel) {
      return res.status(400).json({ ok: false, error: 'tel_required' });
    }
    const result = await deleteWaMessagesForTel(tel);
    if (!result.ok) {
      const code = result.error === 'supabase_not_configured' ? 503 : 502;
      return res.status(code).json(result);
    }
    return res.status(200).json(result);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const mediaId = String(req.query.id || '').trim();
  if (mediaId) {
    const cfg = getWhatsAppConfig();
    if (!cfg.accessToken) {
      return res.status(503).json({ ok: false, error: 'whatsapp_not_configured' });
    }
    const result = await downloadMediaBuffer(mediaId);
    if (!result.ok) {
      const code = result.error === 'invalid_params' ? 400 : 502;
      return res.status(code).json(result);
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (String(result.contentType || '').indexOf('pdf') >= 0) {
      res.setHeader('Content-Disposition', 'inline');
    }
    return res.status(200).send(Buffer.from(result.buffer));
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
