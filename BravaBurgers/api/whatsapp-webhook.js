const {
  isWebhookConfigured,
  verifyWebhookSubscribe,
  verifyWebhookSignature,
  readRawBody,
  parseWebhookPayload,
} = require('../lib/whatsappMeta');
const { insertWaMessage } = require('../lib/waInbox');

async function handler(req, res) {
  if (req.method === 'GET') {
    if (!isWebhookConfigured()) {
      return res.status(503).json({ ok: false, error: 'whatsapp_verify_token_not_configured' });
    }
    const result = verifyWebhookSubscribe(req.query);
    if (!result.ok) {
      return res.status(403).json({ ok: false, error: result.reason || 'verification_failed' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(result.challenge);
  }

  if (req.method === 'POST') {
    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (e) {
      console.error('[wa-webhook] read body failed', e.message || e);
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }

    const sig = verifyWebhookSignature(rawBody, req.headers['x-hub-signature-256']);
    if (!sig.ok) {
      console.warn('[wa-webhook] signature rejected:', sig.reason);
      return res.status(403).json({ ok: false, error: sig.reason || 'invalid_signature' });
    }

    const parsed = parseWebhookPayload(rawBody);
    if (parsed.events && parsed.events.length) {
      for (const ev of parsed.events) {
        if (ev.type === 'message') {
          console.log('[wa-webhook] message', ev.from, ev.messageType, ev.text ? ev.text.slice(0, 120) : '');
          if (ev.text) {
            const saved = await insertWaMessage({
              messageId: ev.messageId,
              tel: ev.from,
              direction: 'in',
              body: ev.text,
            });
            if (!saved.ok && saved.error !== 'supabase_not_configured') {
              console.warn('[wa-webhook] save failed', saved.error, saved.detail || '');
            }
          }
        } else if (ev.type === 'status') {
          console.log('[wa-webhook] status', ev.messageId, ev.status);
        }
      }
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}

handler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
