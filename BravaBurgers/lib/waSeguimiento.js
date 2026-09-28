const {
  sendTextMessage,
  sendInteractiveCtaUrl,
  getWhatsAppConfig,
  uploadMediaBuffer,
} = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');
const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { createSeguimientoToken } = require('./seguimientoToken');
const { getPublicSiteUrl } = require('./bravaSiteUrl');

const SEGUIMIENTO_MARKER = '__seguimiento__:';

let cachedLogoMediaId = '';

function firstName(cliente) {
  var s = String(cliente || '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0];
}

function buildSeguimientoUrl(orn) {
  const token = createSeguimientoToken(orn);
  if (!token) return null;
  return getPublicSiteUrl() + '/seguimiento/?t=' + encodeURIComponent(token);
}

function buildSeguimientoBody(cliente, phase) {
  var n = firstName(cliente);
  var nombre = n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'Hola';
  if (phase === 'next_stop') {
    return (
      '¡' +
      nombre +
      ', ya entregamos los pedidos anteriores y vamos hacia vos! 🛵🍔\n\n' +
      'Seguilo en el mapa con el botón de abajo 👇'
    );
  }
  return (
    '¡' +
    nombre +
    ', tu pedido ya está en camino! 🛵🍔\n\n' +
    'Seguilo en el mapa con el botón de abajo 👇'
  );
}

function buildSeguimientoMessage(cliente, orn, phase) {
  var body = buildSeguimientoBody(cliente, phase === 'next_stop' ? 'next_stop' : 'inicio');
  var url = buildSeguimientoUrl(orn);
  return body + (url ? '\n' + url : '');
}

function graphDetail(sent) {
  if (!sent || sent.ok) return '';
  const d = sent.detail;
  if (d && d.message) return String(d.message);
  if (sent.message) return String(sent.message);
  return sent.error || '';
}

function seguimientoLogoUrl() {
  const custom = String(process.env.WHATSAPP_SEGUIMIENTO_IMAGE_URL || '').trim();
  if (custom) return custom;
  return getPublicSiteUrl() + '/logoweb.png';
}

async function resolveSeguimientoLogoMediaId() {
  const fromEnv = String(process.env.WHATSAPP_SEGUIMIENTO_MEDIA_ID || '').trim();
  if (fromEnv) return fromEnv;
  if (cachedLogoMediaId) return cachedLogoMediaId;
  const url = seguimientoLogoUrl();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const ct = String(res.headers.get('content-type') || 'image/png').toLowerCase();
    const mime = ct.indexOf('jpeg') >= 0 || ct.indexOf('jpg') >= 0 ? 'image/jpeg' : 'image/png';
    const uploaded = await uploadMediaBuffer(buf, mime);
    if (uploaded.ok && uploaded.mediaId) {
      cachedLogoMediaId = uploaded.mediaId;
      return cachedLogoMediaId;
    }
  } catch (e) {
    console.warn('[wa-seguimiento] logo upload failed', e.message || e);
  }
  return '';
}

/**
 * Tarjeta CTA (botón URL). Sin imagen primero — Meta suele fallar si no puede bajar el header.
 */
async function sendSeguimientoCtaCard(to, bodyText, url, opts) {
  opts = opts || {};
  const displayText = String(opts.displayText || 'Ver seguimiento').slice(0, 20);
  const footerText = String(opts.footerText || 'Brava Burgers').trim();
  const logoUrl = seguimientoLogoUrl();
  const base = {
    to: to,
    bodyText: bodyText,
    url: url,
    displayText: displayText,
    footerText: footerText,
  };

  let sent = await sendInteractiveCtaUrl(base);
  if (sent.ok) return Object.assign({ mode: 'cta_plain' }, sent);

  const firstErr = graphDetail(sent).slice(0, 200);
  const firstHint = sent.hint || '';

  const mediaId = await resolveSeguimientoLogoMediaId();
  if (mediaId) {
    sent = await sendInteractiveCtaUrl(Object.assign({}, base, { imageMediaId: mediaId }));
    if (sent.ok) return Object.assign({ mode: 'cta_logo_upload' }, sent);
  }

  sent = await sendInteractiveCtaUrl(Object.assign({}, base, { imageUrl: logoUrl }));
  if (sent.ok) return Object.assign({ mode: 'cta_logo_link' }, sent);

  console.warn('[wa-seguimiento] cta_url failed', firstHint, firstErr, graphDetail(sent).slice(0, 200));
  return Object.assign({ mode: 'cta_failed', ctaFirstError: firstErr, ctaHint: firstHint }, sent);
}

async function seguimientoAlreadySent(orn, parada) {
  if (!isSupabaseConfigured() || !orn) return false;
  var p = parada != null && !isNaN(Number(parada)) ? String(Number(parada)) : '0';
  var marker = SEGUIMIENTO_MARKER + String(orn).trim() + ':' + p;
  const r = await restSelect(
    'wa_messages',
    'select=id&body=eq.' + encodeURIComponent(marker) + '&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function markSeguimientoSent(orn, parada, tel, text) {
  var p = parada != null && !isNaN(Number(parada)) ? String(Number(parada)) : '0';
  var marker = SEGUIMIENTO_MARKER + String(orn).trim() + ':' + p;
  await insertWaMessage({
    messageId: 'seguimiento-' + String(orn).trim() + '-' + p,
    tel: tel,
    direction: 'out',
    body: marker,
  });
  if (text) {
    await insertWaMessage({
      messageId: 'seguimiento-text-' + String(orn).trim() + '-' + p + '-' + Date.now(),
      tel: tel,
      direction: 'out',
      body: text,
    });
  }
}

/**
 * @param {'inicio'|'next_stop'} phase
 */
async function sendSeguimientoWhatsApp(telefono, cliente, orn, opts) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const id = String(orn || '').trim();
  if (!id) return { ok: false, error: 'missing_orn' };
  const phase = (opts && opts.phase) || 'inicio';
  const parada = opts && opts.parada != null ? Number(opts.parada) : phase === 'inicio' ? 1 : null;
  if (await seguimientoAlreadySent(id, parada)) {
    return { ok: true, skipped: true, reason: 'already_sent', orn: id, parada: parada };
  }
  const to = String(telefono || '').trim();
  if (!to) return { ok: false, skipped: true, reason: 'no_phone' };
  if (!createSeguimientoToken(id)) {
    return { ok: false, error: 'tracking_not_configured' };
  }
  const phaseKey = phase === 'next_stop' ? 'next_stop' : 'inicio';
  const body = buildSeguimientoBody(cliente, phaseKey);
  const url = buildSeguimientoUrl(id);
  if (!url) return { ok: false, error: 'missing_url' };

  let sent = await sendSeguimientoCtaCard(to, body, url);
  let deliveryMode = sent.mode || 'cta';

  if (!sent.ok) {
    const intro = await sendTextMessage(to, body);
    if (intro.ok) {
      sent = await sendSeguimientoCtaCard(to, 'Mapa en vivo del repartidor 🗺️', url);
      deliveryMode = sent.ok ? 'text_then_cta' : 'text_only_partial';
    }
  }

  if (!sent.ok) {
    sent = await sendTextMessage(to, body + '\n' + url, { previewUrl: false });
    deliveryMode = 'text_url_no_preview';
  }

  if (!sent.ok) return sent;

  const text = buildSeguimientoMessage(cliente, id, phaseKey);
  const graphId = sent.messageId || (sent.data && sent.data.messages && sent.data.messages[0] && sent.data.messages[0].id);
  if (graphId) {
    await insertWaMessage({
      messageId: graphId,
      tel: to,
      direction: 'out',
      body: text,
    });
  }
  await markSeguimientoSent(id, parada, to, null);
  return {
    ok: true,
    sent: true,
    orn: id,
    parada: parada,
    url: url,
    text: text,
    deliveryMode: deliveryMode,
    ctaHint: sent.ctaHint || null,
  };
}

async function probeSeguimientoCta(to) {
  const url = getPublicSiteUrl() + '/seguimiento/?t=probe';
  return sendSeguimientoCtaCard(to, 'Probe Brava — ¿ves logo, texto y botón Ver seguimiento?', url);
}

module.exports = {
  buildSeguimientoUrl,
  buildSeguimientoBody,
  buildSeguimientoMessage,
  sendSeguimientoWhatsApp,
  probeSeguimientoCta,
  SEGUIMIENTO_MARKER,
};
