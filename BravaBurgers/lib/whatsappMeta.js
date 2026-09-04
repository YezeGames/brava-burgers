const crypto = require('crypto');

function getWhatsAppConfig() {
  return {
    verifyToken: (process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
    accessToken: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    wabaId: (process.env.WHATSAPP_WABA_ID || '').trim(),
    appSecret: (process.env.WHATSAPP_APP_SECRET || '').trim(),
    graphVersion: (process.env.WHATSAPP_GRAPH_VERSION || 'v22.0').trim(),
  };
}

function isWebhookConfigured() {
  return !!getWhatsAppConfig().verifyToken;
}

function verifyWebhookSubscribe(query) {
  const q = query || {};
  const mode = q['hub.mode'];
  const token = q['hub.verify_token'];
  const challenge = q['hub.challenge'];
  const expected = getWhatsAppConfig().verifyToken;

  if (mode !== 'subscribe' || !challenge) {
    return { ok: false, reason: 'invalid_mode_or_challenge' };
  }
  if (!expected) {
    return { ok: false, reason: 'verify_token_not_configured' };
  }
  if (token !== expected) {
    return { ok: false, reason: 'verify_token_mismatch' };
  }
  return { ok: true, challenge: String(challenge) };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = getWhatsAppConfig().appSecret;
  if (!secret) return { ok: true, skipped: true };
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ok: false, reason: 'missing_signature' };
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  return { ok: true };
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (chunk) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function parseWebhookPayload(raw) {
  let body = raw;
  if (Buffer.isBuffer(body)) {
    body = body.toString('utf8');
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, error: 'invalid_json', events: [] };
    }
  }
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return { ok: true, events: [], ignored: true };
  }

  const events = [];
  body.entry.forEach(function (entry) {
    const wabaId = entry.id;
    (entry.changes || []).forEach(function (change) {
      const value = change.value || {};
      const meta = value.metadata || {};
      const base = {
        wabaId,
        field: change.field,
        phoneNumberId: meta.phone_number_id,
        displayPhone: meta.display_phone_number,
      };

      (value.messages || []).forEach(function (msg) {
        events.push({
          ...base,
          type: 'message',
          messageId: msg.id,
          from: msg.from,
          timestamp: msg.timestamp,
          messageType: msg.type,
          text: msg.type === 'text' && msg.text ? msg.text.body : '',
        });
      });

      (value.statuses || []).forEach(function (st) {
        events.push({
          ...base,
          type: 'status',
          messageId: st.id,
          status: st.status,
          recipientId: st.recipient_id,
          timestamp: st.timestamp,
        });
      });
    });
  });

  return { ok: true, events };
}

function normalizeWaRecipient(to) {
  let d = String(to || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('549')) return d;
  if (d.startsWith('5411') && d.length === 12) return '549' + d.slice(2);
  if (d.startsWith('54')) return d;
  if (d.startsWith('15')) d = '11' + d.slice(2);
  if (d.startsWith('11')) return '549' + d;
  return '54911' + d;
}

async function sendTextMessage(to, text) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const digits = normalizeWaRecipient(to);
  if (!digits || !String(text || '').trim()) {
    return { ok: false, error: 'invalid_params' };
  }

  const url =
    'https://graph.facebook.com/' +
    encodeURIComponent(cfg.graphVersion) +
    '/' +
    encodeURIComponent(cfg.phoneNumberId) +
    '/messages';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + cfg.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: digits,
      type: 'text',
      text: { body: String(text).trim() },
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json().catch(function () {
    return {};
  });
  if (!res.ok) {
    const detail = data.error || data;
    const code = detail && detail.code != null ? detail.code : null;
    let hint = '';
    if (code === 190 || code === 102) {
      hint = 'token_invalid';
    } else if (code === 131047 || code === 131026) {
      hint = 'needs_template_or_session';
    } else if (code === 131030) {
      hint = 'recipient_not_allowed';
    }
    return {
      ok: false,
      error: 'graph_error',
      hint: hint,
      status: res.status,
      detail: detail,
      message: detail && detail.message ? String(detail.message) : 'graph_request_failed',
    };
  }
  return { ok: true, data };
}

module.exports = {
  getWhatsAppConfig,
  isWebhookConfigured,
  verifyWebhookSubscribe,
  verifyWebhookSignature,
  readRawBody,
  parseWebhookPayload,
  sendTextMessage,
  normalizeWaRecipient,
};
