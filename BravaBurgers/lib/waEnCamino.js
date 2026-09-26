const { sendTextMessage, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');
const { isSupabaseConfigured, restSelect } = require('./supabaseServer');

const EN_CAMINO_MARKER = '__en_camino__:';

function firstName(cliente) {
  var s = String(cliente || '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0];
}

function buildEnCaminoMessage(cliente) {
  var n = firstName(cliente);
  var nombre = n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'Hola';
  return '¡' + nombre + ', tu pedido ya está en camino! 🛵🍔';
}

async function enCaminoAlreadySent(orn) {
  if (!isSupabaseConfigured() || !orn) return false;
  const marker = EN_CAMINO_MARKER + String(orn).trim();
  const r = await restSelect(
    'wa_messages',
    'select=id&body=eq.' + encodeURIComponent(marker) + '&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function markEnCaminoSent(orn, tel) {
  return insertWaMessage({
    messageId: 'en-camino-' + String(orn).trim(),
    tel: tel,
    direction: 'out',
    body: EN_CAMINO_MARKER + String(orn).trim(),
  });
}

async function sendEnCaminoWhatsApp(telefono, cliente, orn) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const id = String(orn || '').trim();
  if (!id) return { ok: false, error: 'missing_orn' };
  if (await enCaminoAlreadySent(id)) {
    return { ok: true, skipped: true, reason: 'already_sent', orn: id };
  }
  const to = String(telefono || '').trim();
  if (!to) return { ok: false, skipped: true, reason: 'no_phone' };
  const text = buildEnCaminoMessage(cliente);
  const sent = await sendTextMessage(to, text);
  if (!sent.ok) return sent;
  const graphId =
    sent.data && sent.data.messages && sent.data.messages[0] && sent.data.messages[0].id;
  await insertWaMessage({
    messageId: graphId,
    tel: to,
    direction: 'out',
    body: text,
  });
  await markEnCaminoSent(id, to);
  return { ok: true, sent: true, orn: id, text: text };
}

module.exports = {
  buildEnCaminoMessage,
  sendEnCaminoWhatsApp,
  EN_CAMINO_MARKER,
};
