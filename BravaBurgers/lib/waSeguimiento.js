const { sendTextMessage, sendInteractiveCtaUrl, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');
const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { createSeguimientoToken } = require('./seguimientoToken');
const { getPublicSiteUrl } = require('./bravaSiteUrl');

const SEGUIMIENTO_MARKER = '__seguimiento__:';

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
  const logoUrl = getPublicSiteUrl() + '/logoweb.png';
  let sent = await sendInteractiveCtaUrl({
    to: to,
    bodyText: body,
    url: url,
    displayText: 'Ver seguimiento',
    imageUrl: logoUrl,
  });
  if (!sent.ok) {
    const text = buildSeguimientoMessage(cliente, id, phaseKey);
    sent = await sendTextMessage(to, text, { previewUrl: true });
  }
  if (!sent.ok) return sent;
  const text = buildSeguimientoMessage(cliente, id, phaseKey);
  const graphId =
    sent.data && sent.data.messages && sent.data.messages[0] && sent.data.messages[0].id;
  await insertWaMessage({
    messageId: graphId,
    tel: to,
    direction: 'out',
    body: text,
  });
  await markSeguimientoSent(id, parada, to, null);
  return { ok: true, sent: true, orn: id, parada: parada, url: buildSeguimientoUrl(id), text: text };
}

module.exports = {
  buildSeguimientoUrl,
  buildSeguimientoBody,
  buildSeguimientoMessage,
  sendSeguimientoWhatsApp,
  SEGUIMIENTO_MARKER,
};
