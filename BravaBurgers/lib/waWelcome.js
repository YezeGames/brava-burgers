const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient, sendTextMessage, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage, AUTO_CONSULTA_MARKER, encodeWaMediaBody } = require('./waInbox');

const ACTIVE_ORDER_STATES = ['pendiente', 'aceptado', 'en_preparacion', 'en_camino'];

function getConsultaMessage() {
  const custom = (process.env.WHATSAPP_CONSULTA_MESSAGE || process.env.WHATSAPP_WELCOME_MESSAGE || '').trim();
  if (custom) return custom;
  return (
    '¡Hola! ¿Cómo va? 🍔✨\n\n' +
    'Para armar tu pedido y que salga tal cual te gusta, sumalo directo desde nuestra web: https://linktr.ee/bravaburgers\n' +
    '(¡podés dejarnos las aclaraciones que quieras en cada hamburguesa!).\n\n' +
    'Apenas nos llegue, te confirmamos por acá.'
  );
}

function getClosedMessage() {
  const custom = (process.env.WHATSAPP_CLOSED_MESSAGE || '').trim();
  if (custom) return custom;
  const hours =
    (process.env.WHATSAPP_OPEN_HOURS_LABEL || '').trim() || 'Sáb, 20:00–23:00';
  return (
    '¡Hola! 👋 Somos Brava Burgers 🍔\n\n' +
    'En este horario estamos *cerrados* (abrímos ' +
    hours +
    ').\n\n' +
    'Pedí cuando estemos abiertos acá:\n' +
    'https://linktr.ee/bravaburgers\n\n' +
    'Te leemos en cuanto arranque el turno. ¡Gracias!'
  );
}

function parseHm(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isWithinOpenHours() {
  const tz = (process.env.WHATSAPP_TZ || 'America/Argentina/Buenos_Aires').trim();
  const daysStr = (process.env.WHATSAPP_OPEN_DAYS || '6').trim();
  const openDays = daysStr
    .split(',')
    .map(function (d) {
      return Number(String(d).trim());
    })
    .filter(function (n) {
      return !isNaN(n);
    });
  const fromMin = parseHm(process.env.WHATSAPP_OPEN_FROM || '20:00');
  const toMin = parseHm(process.env.WHATSAPP_OPEN_TO || '23:00');
  if (fromMin == null || toMin == null) return true;

  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[dayFormatter.format(now)];
  if (openDays.indexOf(dow) === -1) return false;

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = timeFormatter.formatToParts(now);
  var hour = 0;
  var minute = 0;
  parts.forEach(function (p) {
    if (p.type === 'hour') hour = Number(p.value);
    if (p.type === 'minute') minute = Number(p.value);
  });
  const nowMin = hour * 60 + minute;
  if (toMin > fromMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  return nowMin >= fromMin || nowMin < toMin;
}

function consultaMarkerId(tel) {
  return 'consulta-auto-' + normalizeWaRecipient(tel);
}

async function consultaAutoAlreadySent(tel) {
  const markerId = consultaMarkerId(tel);
  if (!markerId || markerId === 'consulta-auto-') return false;
  const r = await restSelect(
    'wa_messages',
    'select=id&wa_message_id=eq.' + encodeURIComponent(markerId) + '&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function markConsultaAutoSent(tel) {
  return insertWaMessage({
    messageId: consultaMarkerId(tel),
    tel: tel,
    direction: 'out',
    body: AUTO_CONSULTA_MARKER,
  });
}

function telTailDigits(tel) {
  const d = normalizeWaRecipient(tel);
  return d.length >= 8 ? d.slice(-10) : d;
}

function phonesLikelyMatch(orderPhone, waTel) {
  const a = String(orderPhone || '').replace(/\D/g, '');
  const b = normalizeWaRecipient(waTel);
  if (!a || !b) return false;
  if (a === b) return true;
  const tailA = a.slice(-10);
  const tailB = b.slice(-10);
  return tailA.length >= 8 && tailA === tailB;
}

async function hasActiveOrderForTel(tel) {
  if (!isSupabaseConfigured()) return false;
  const tail = telTailDigits(tel);
  if (tail.length < 8) return false;
  const r = await restSelect(
    'orders',
    'select=telefono,estado&estado=in.(' +
      ACTIVE_ORDER_STATES.join(',') +
      ')&telefono=ilike.' +
      encodeURIComponent('*' + tail + '*') +
      '&limit=25'
  );
  if (!r.ok || !r.data || !r.data.length) return false;
  return r.data.some(function (row) {
    return phonesLikelyMatch(row.telefono, tel);
  });
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

async function sendAutoReply(from, text) {
  const sent = await sendTextMessage(from, text);
  if (!sent.ok) {
    return {
      sent: false,
      reason: 'send_failed',
      detail: sent.message || sent.error || sent.hint || '',
    };
  }
  const graphId =
    sent.data && sent.data.messages && sent.data.messages[0] && sent.data.messages[0].id;
  const saved = await insertWaMessage({
    messageId: graphId || 'auto-' + Date.now(),
    tel: from,
    direction: 'out',
    body: String(text || '').trim(),
  });
  if (!saved.ok && saved.error !== 'supabase_not_configured') {
    console.warn('[wa-auto] inbox save failed', from, saved.error || '');
  }
  return { sent: true, messageId: graphId || null };
}

async function handleInboundMessage({ from, text, messageId, mediaType, mediaId, caption, fileName }) {
  let body = '';
  if (mediaId && (mediaType === 'image' || mediaType === 'pdf' || mediaType === 'document')) {
    body = encodeWaMediaBody(mediaType, mediaId, caption || text || '', fileName || '');
  } else {
    body = String(text || '').trim();
  }
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

  let autoReply = { sent: false, kind: 'none', reason: 'none' };

  if (!isWithinOpenHours()) {
    autoReply = Object.assign({ kind: 'closed' }, await sendAutoReply(from, getClosedMessage()));
    if (!autoReply.sent) {
      console.warn('[wa-auto] closed reply failed', from, autoReply.detail || autoReply.reason || '');
    }
  } else if (await hasActiveOrderForTel(from)) {
    autoReply = { sent: false, kind: 'consulta', reason: 'active_order' };
  } else if (await consultaAutoAlreadySent(from)) {
    autoReply = { sent: false, kind: 'consulta', reason: 'already_sent' };
  } else {
    autoReply = Object.assign({ kind: 'consulta' }, await sendAutoReply(from, getConsultaMessage()));
    if (autoReply.sent) {
      await markConsultaAutoSent(from);
    } else {
      console.warn('[wa-auto] consulta reply failed', from, autoReply.detail || autoReply.reason || '');
    }
  }

  return {
    ok: saved.ok,
    saved: saved.ok,
    firstContact: firstContact,
    autoReply: autoReply,
    autoWelcome: autoReply.kind === 'consulta' && autoReply.sent ? { sent: true } : { sent: false },
    error: saved.error || null,
    detail: saved.detail || null,
  };
}

module.exports = {
  getConsultaMessage,
  getClosedMessage,
  isWithinOpenHours,
  handleInboundMessage,
};
