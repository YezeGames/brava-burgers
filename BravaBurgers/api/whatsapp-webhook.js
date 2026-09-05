const {
  isWebhookConfigured,
  verifyWebhookSubscribe,
  verifyWebhookSignature,
  readRawBody,
  parseWebhookPayload,
} = require('../lib/whatsappMeta');
const { insertWaMessage } = require('../lib/waInbox');
const { handleInboundMessage } = require('../lib/waWelcome');

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
    const saveResults = [];
    if (parsed.events && parsed.events.length) {
      for (const ev of parsed.events) {
        if (ev.type === 'message') {
          console.log('[wa-webhook] message', ev.from, ev.messageType, ev.text ? ev.text.slice(0, 120) : '');
          if (ev.text) {
            const saved = await handleInboundMessage({
              from: ev.from,
              text: ev.text,
              messageId: ev.messageId,
            });
            saveResults.push({
              messageId: ev.messageId,
              ok: saved.ok,
              firstContact: saved.firstContact,
              autoWelcome: saved.autoWelcome || null,
              error: saved.error || null,
              detail: saved.detail || null,
            });
            if (!saved.ok && saved.error !== 'supabase_not_configured') {
              console.warn('[wa-webhook] inbound failed', saved.error, saved.detail || '');
            } else if (saved.autoWelcome && saved.autoWelcome.sent) {
              console.log('[wa-webhook] welcome sent', ev.from);
            }
          } else {
            console.warn('[wa-webhook] message without body', ev.from, ev.messageType);
          }
        } else if (ev.type === 'status') {
          console.log('[wa-webhook] status', ev.messageId, ev.status);
        }
      }
    }

    return res.status(200).json({ ok: true, events: (parsed.events || []).length, saved: saveResults });
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
