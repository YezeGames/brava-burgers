const { sendTextMessage, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');

function firstName(cliente) {
  var s = String(cliente || '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0];
}

function buildLlegadaMessage(cliente) {
  var nombre = firstName(cliente) || 'Bravísimo';
  return (
    '¡Hola ' +
    nombre +
    '! 🎉\n\n' +
    '¡Llegamos! Tu pedido de *Brava Burgers* ya está en la puerta 🍔🚪✨\n\n' +
    '¡Gracias por elegirnos! ❤️🔥'
  );
}

async function sendRepartidorLlegadaWhatsApp(telefono, cliente) {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const to = String(telefono || '').trim();
  if (!to) return { ok: false, error: 'missing_telefono' };
  const text = buildLlegadaMessage(cliente);
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
  return { ok: true, text: text, graphId: graphId || null };
}

module.exports = {
  buildLlegadaMessage,
  sendRepartidorLlegadaWhatsApp,
};
