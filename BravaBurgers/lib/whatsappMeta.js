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

function extractInboundMessageText(msg) {
  if (!msg || !msg.type) return '';
  if (msg.type === 'text' && msg.text && msg.text.body) {
    return String(msg.text.body).trim();
  }
  if (msg.type === 'button' && msg.button && msg.button.text) {
    return String(msg.button.text).trim();
  }
  if (msg.type === 'interactive') {
    var i = msg.interactive || {};
    if (i.button_reply && i.button_reply.title) return String(i.button_reply.title).trim();
    if (i.list_reply && i.list_reply.title) return String(i.list_reply.title).trim();
  }
  if (msg.type === 'image' && msg.image && msg.image.caption) {
    return String(msg.image.caption).trim();
  }
  if (msg.type === 'video' && msg.video && msg.video.caption) {
    return String(msg.video.caption).trim();
  }
  if (msg.type === 'document' && msg.document && msg.document.caption) {
    return String(msg.document.caption).trim();
  }
  if (msg.type === 'location' && msg.location) {
    var loc = msg.location;
    var label = [loc.name, loc.address].filter(Boolean).join(' · ');
    if (label) return label;
    if (loc.latitude != null && loc.longitude != null) {
      return 'Ubicación: ' + loc.latitude + ', ' + loc.longitude;
    }
  }
  var labels = {
    audio: '[Audio]',
    image: '[Imagen]',
    video: '[Video]',
    document: '[Documento]',
    sticker: '[Sticker]',
    contacts: '[Contacto]',
    location: '[Ubicación]',
    reaction: '[Reacción]',
    unsupported: '[Mensaje no soportado]',
  };
  return labels[msg.type] || '[' + msg.type + ']';
}

function extractInboundMedia(msg) {
  if (!msg || !msg.type) return null;
  if (msg.type === 'image' && msg.image && msg.image.id) {
    return {
      mediaType: 'image',
      mediaId: String(msg.image.id),
      caption: msg.image.caption ? String(msg.image.caption).trim() : '',
    };
  }
  return null;
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
        const media = extractInboundMedia(msg);
        events.push({
          ...base,
          type: 'message',
          messageId: msg.id,
          from: msg.from,
          timestamp: msg.timestamp,
          messageType: msg.type,
          text: extractInboundMessageText(msg),
          mediaType: media ? media.mediaType : '',
          mediaId: media ? media.mediaId : '',
          caption: media ? media.caption : '',
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

async function uploadMediaBuffer(buffer, mimeType) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const type = String(mimeType || 'image/jpeg').trim() || 'image/jpeg';
  const url =
    'https://graph.facebook.com/' +
    encodeURIComponent(cfg.graphVersion) +
    '/' +
    encodeURIComponent(cfg.phoneNumberId) +
    '/media';

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', type);
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  form.append('file', new Blob([bytes], { type: type }), type.indexOf('png') >= 0 ? 'image.png' : 'image.jpg');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      return {
        ok: false,
        error: 'graph_error',
        status: res.status,
        detail: data.error || data,
        message: data.error && data.error.message ? String(data.error.message) : 'upload_failed',
      };
    }
    const mediaId = data && data.id ? String(data.id) : '';
    if (!mediaId) {
      return { ok: false, error: 'missing_media_id', detail: data };
    }
    return { ok: true, mediaId: mediaId, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function sendImageMessage(to, mediaId, caption) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const digits = normalizeWaRecipient(to);
  const id = String(mediaId || '').trim();
  if (!digits || !id) {
    return { ok: false, error: 'invalid_params' };
  }

  const image = { id: id };
  const cap = String(caption || '').trim();
  if (cap) image.caption = cap;

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
      type: 'image',
      image: image,
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
    if (code === 190 || code === 102) hint = 'token_invalid';
    else if (code === 131047 || code === 131026) hint = 'needs_template_or_session';
    else if (code === 131030) hint = 'recipient_not_allowed';
    return {
      ok: false,
      error: 'graph_error',
      hint: hint,
      status: res.status,
      detail: detail,
      message: detail && detail.message ? String(detail.message) : 'graph_request_failed',
    };
  }
  return { ok: true, data: data, mediaId: id };
}

async function downloadMediaBuffer(mediaId) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const id = String(mediaId || '').trim();
  if (!id) {
    return { ok: false, error: 'invalid_params' };
  }
  const metaUrl =
    'https://graph.facebook.com/' + encodeURIComponent(cfg.graphVersion) + '/' + encodeURIComponent(id);
  try {
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      signal: AbortSignal.timeout(20000),
    });
    const meta = await metaRes.json().catch(function () {
      return {};
    });
    if (!metaRes.ok || !meta.url) {
      return {
        ok: false,
        error: 'media_meta_failed',
        status: metaRes.status,
        detail: meta.error || meta,
      };
    }
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      signal: AbortSignal.timeout(45000),
    });
    if (!fileRes.ok) {
      return { ok: false, error: 'media_download_failed', status: fileRes.status };
    }
    const buffer = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get('content-type') || meta.mime_type || 'image/jpeg';
    return { ok: true, buffer: buffer, contentType: contentType };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function fetchWabaSubscribedApps(cfg) {
  if (!cfg.accessToken || !cfg.wabaId) {
    return { ok: false, error: 'missing_waba_or_token', apps: [] };
  }
  const url =
    'https://graph.facebook.com/' +
    encodeURIComponent(cfg.graphVersion) +
    '/' +
    encodeURIComponent(cfg.wabaId) +
    '/subscribed_apps';
  try {
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    const apps = data && Array.isArray(data.data) ? data.data : [];
    return { ok: res.ok, status: res.status, apps: apps, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e), apps: [] };
  }
}

async function subscribeWabaToApp(cfg) {
  if (!cfg.accessToken || !cfg.wabaId) {
    return { ok: false, error: 'missing_waba_or_token' };
  }
  const url =
    'https://graph.facebook.com/' +
    encodeURIComponent(cfg.graphVersion) +
    '/' +
    encodeURIComponent(cfg.wabaId) +
    '/subscribed_apps';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: 'graph_error',
        detail: data.error || data,
      };
    }
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = {
  getWhatsAppConfig,
  isWebhookConfigured,
  verifyWebhookSubscribe,
  verifyWebhookSignature,
  readRawBody,
  parseWebhookPayload,
  extractInboundMedia,
  sendTextMessage,
  sendImageMessage,
  uploadMediaBuffer,
  downloadMediaBuffer,
  normalizeWaRecipient,
  fetchWabaSubscribedApps,
  subscribeWabaToApp,
};
