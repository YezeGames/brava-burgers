const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { sendTextMessage, sendImageMessage, uploadMediaBuffer, getWhatsAppConfig } = require('../lib/whatsappMeta');
const { insertWaMessage, encodeWaMediaBody } = require('../lib/waInbox');

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

function parseImagePayload(body) {
  const b64 = String(body.imageBase64 || '').trim();
  if (!b64) return null;
  const raw = b64.indexOf(',') >= 0 ? b64.split(',')[1] : b64;
  if (!raw) return null;
  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch (e) {
    return null;
  }
  if (!buffer.length) return null;
  if (buffer.length > 5 * 1024 * 1024) {
    return { error: 'image_too_large' };
  }
  const mimeType = String(body.mimeType || 'image/jpeg').trim() || 'image/jpeg';
  return { buffer: buffer, mimeType: mimeType };
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

  const imagePayload = parseImagePayload(body);
  let result;
  let savedBody = '';
  let graphId = null;

  if (imagePayload && imagePayload.error) {
    return res.status(400).json({ ok: false, error: imagePayload.error });
  }

  if (imagePayload) {
    const uploaded = await uploadMediaBuffer(imagePayload.buffer, imagePayload.mimeType);
    if (!uploaded.ok) {
      console.error('[whatsapp-send] upload failed', uploaded.error, uploaded.message || '');
      return res.status(502).json(uploaded);
    }
    const caption = String(body.text || body.caption || '').trim();
    result = await sendImageMessage(body.to, uploaded.mediaId, caption);
    savedBody = encodeWaMediaBody('image', uploaded.mediaId, caption);
  } else {
    result = await sendTextMessage(body.to, body.text);
    savedBody = String(body.text || '').trim();
  }

  if (!result.ok) {
    console.error('[whatsapp-send]', result.error, result.message || '', JSON.stringify(result.detail || {}));
    const code = result.error === 'invalid_params' ? 400 : 502;
    return res.status(code).json(result);
  }

  graphId =
    result.data &&
    result.data.messages &&
    result.data.messages[0] &&
    result.data.messages[0].id;
  const saved = await insertWaMessage({
    messageId: graphId,
    tel: body.to,
    direction: 'out',
    body: savedBody,
  });
  if (!saved.ok && saved.error !== 'supabase_not_configured') {
    console.warn('[whatsapp-send] inbox save failed', saved.error);
  }

  return res.status(200).json(
    Object.assign({}, result, {
      inboxId: saved.id != null ? saved.id : null,
      graphId: graphId || null,
    })
  );
};
