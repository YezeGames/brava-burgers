const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient, sendTextMessage, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage, AUTO_WELCOME_MARKER } = require('./waInbox');

function getWelcomeMessage() {
  const custom = (process.env.WHATSAPP_WELCOME_MESSAGE || '').trim();
  if (custom) return custom;
  return (
    '¡Hola! 👋 Somos Brava Burgers 🍔\n' +
    'Pedí online acá: https://brava-burgers.vercel.app\n' +
    'Si ya pediste, te avisamos por acá. Para consultas, escribinos y te respondemos en breve.'
  );
}

function welcomeMarkerId(tel) {
  return 'welcome-' + normalizeWaRecipient(tel);
}

async function welcomeAlreadySent(tel) {
  const markerId = welcomeMarkerId(tel);
  if (!markerId || markerId === 'welcome-') return false;
  const r = await restSelect(
    'wa_messages',
    'select=id&wa_message_id=eq.' + encodeURIComponent(markerId) + '&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function hasPriorInbound(tel) {
  const normalized = normalizeWaRecipient(tel);
  if (!normalized || !isSupabaseConfigured()) return false;
  const r = await restSelect(
    'wa_messages',
    'select=id&tel=eq.' +
      encodeURIComponent(normalized) +
      '&direction=eq.in&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function markWelcomeSent(tel) {
  return insertWaMessage({
    messageId: welcomeMarkerId(tel),
    tel: tel,
    direction: 'out',
    body: AUTO_WELCOME_MARKER,
  });
}

async function handleInboundMessage({ from, text, messageId }) {
  const body = String(text || '').trim();
  if (!body) {
    return { ok: true, skipped: true, reason: 'empty_body' };
  }

  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }

  const firstContact = !(await hasPriorInbound(from));
  const saved = await insertWaMessage({
    messageId: messageId,
    tel: from,
    direction: 'in',
    body: body,
  });

  let autoWelcome = { sent: false, reason: 'not_first_contact' };
  if (firstContact && !(await welcomeAlreadySent(from))) {
    const sent = await sendTextMessage(from, getWelcomeMessage());
    if (sent.ok) {
      await markWelcomeSent(from);
      autoWelcome = { sent: true, firstContact: true };
    } else {
      autoWelcome = {
        sent: false,
        reason: 'send_failed',
        detail: sent.message || sent.error,
        firstContact: true,
      };
      console.warn('[wa-welcome] auto reply failed', from, autoWelcome.detail || '');
    }
  }

  return {
    ok: saved.ok,
    saved: saved.ok,
    firstContact: firstContact,
    messageId: messageId,
    autoWelcome: autoWelcome,
    error: saved.error || null,
    detail: saved.detail || null,
  };
}

module.exports = {
  AUTO_WELCOME_MARKER,
  getWelcomeMessage,
  handleInboundMessage,
};
