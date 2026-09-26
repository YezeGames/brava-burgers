const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient, getWhatsAppConfig } = require('./whatsappMeta');
const { sendPostEntregaInteractive, plainWaBody } = require('./waPostEntregaSend');
const { insertWaMessage } = require('./waInbox');
const { upsertReclamoSession } = require('./waReclamoStore');
const { ensureWaReclamoSchema } = require('./waReclamoSchema');

const POST_ENTREGA_MARKER = '__post_entrega__:';

function postEntregaDisabled() {
  return String(process.env.WHATSAPP_POST_ENTREGA_DISABLE || '').trim() === '1';
}

function waFirstName(cliente) {
  const raw = String(cliente || '')
    .trim()
    .split(/\s+/)[0];
  if (!raw) return 'Hola';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function orderPhoneDigits(telefono) {
  const d = String(telefono || '').replace(/\D/g, '');
  return d.length >= 8 ? d : '';
}

async function postEntregaAlreadySent(orn) {
  if (!isSupabaseConfigured() || !orn) return false;
  const marker = POST_ENTREGA_MARKER + String(orn).trim();
  const r = await restSelect(
    'wa_messages',
    'select=id&body=eq.' + encodeURIComponent(marker) + '&limit=1'
  );
  return !!(r.ok && r.data && r.data.length);
}

async function markPostEntregaSent(orn, tel) {
  return insertWaMessage({
    messageId: 'post-entrega-' + String(orn).trim(),
    tel: tel,
    direction: 'out',
    body: POST_ENTREGA_MARKER + String(orn).trim(),
  });
}

function buildPostEntregaBody(nombre, orn) {
  return (
    '¡Listo, ' +
    nombre +
    '! 🍔\n\n' +
    'Tu pedido *' +
    orn +
    '* fue entregado.\n\n' +
    '¿Cómo te fue? Elegí una opción:'
  );
}

async function fetchOrderByOrn(orn) {
  if (!isSupabaseConfigured() || !orn) return null;
  const r = await restSelect(
    'orders',
    'select=orn,cliente,telefono,estado&orn=eq.' + encodeURIComponent(String(orn).trim()) + '&limit=1'
  );
  if (!r.ok || !r.data || !r.data.length) return null;
  return r.data[0];
}

async function sendPostEntregaForOrder(order, opts) {
  opts = opts || {};
  await ensureWaReclamoSchema();
  if (postEntregaDisabled()) {
    return { ok: false, skipped: true, reason: 'disabled' };
  }
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  if (!order || !order.orn) {
    return { ok: false, error: 'missing_order' };
  }
  const phoneRaw = orderPhoneDigits(order.telefono);
  if (!phoneRaw) {
    return { ok: false, skipped: true, reason: 'no_phone' };
  }
  const tel = normalizeWaRecipient(phoneRaw);
  const orn = String(order.orn).trim();
  const force =
    !!opts.force || String(process.env.WHATSAPP_POST_ENTREGA_FORCE || '').trim() === '1';
  if (!force && (await postEntregaAlreadySent(orn))) {
    return { ok: true, skipped: true, reason: 'already_sent', orn: orn, tel: tel };
  }

  const nombre = waFirstName(order.cliente);
  const bodyText = buildPostEntregaBody(nombre, orn);
  const sent = await sendPostEntregaInteractive(tel, bodyText);
  if (!sent.ok) {
    console.warn(
      '[wa-post-entrega] send failed',
      orn,
      tel,
      sent.message || sent.error,
      sent.hint || '',
      sent.interactiveDetail || ''
    );
    return sent;
  }

  const graphId =
    sent.messageId ||
    (sent.data && sent.data.messages && sent.data.messages[0] && sent.data.messages[0].id);
  await insertWaMessage({
    messageId: graphId || 'post-entrega-out-' + orn,
    tel: tel,
    direction: 'out',
    body:
      plainWaBody(bodyText) +
      (sent.fallback === 'text'
        ? '\n\n[Post-entrega: fallback texto — interactivo falló]'
        : '\n\n[Botones: reclamo · calificar · pedir de nuevo]'),
  });
  await markPostEntregaSent(orn, tel);
  await upsertReclamoSession(tel, { orn: orn, step: '', open: false });

  console.log('[wa-post-entrega] sent', orn, tel);
  return {
    ok: true,
    sent: true,
    tel: tel,
    messageId: graphId || sent.messageId || null,
    contactWaId: sent.contactWaId || '',
    mode: sent.fallback === 'text' ? 'text_fallback' : 'interactive',
  };
}

/** Prueba de tarjeta (no marca ORN enviado). */
async function probePostEntregaInteractive(to) {
  const tel = normalizeWaRecipient(to);
  if (!tel) return { ok: false, error: 'invalid_phone' };
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  const body = buildPostEntregaBody('Cliente', 'ORN-DEL-TEST');
  const sent = await sendPostEntregaInteractive(tel, body);
  return Object.assign(
    {
      probe: true,
      to: tel,
      messageId: sent.messageId || '',
      contactWaId: sent.contactWaId || '',
    },
    sent
  );
}

async function sendPostEntregaForOrn(orn, opts) {
  const order = await fetchOrderByOrn(orn);
  if (!order) {
    return { ok: false, error: 'order_not_found' };
  }
  if (String(order.estado || '').toLowerCase() !== 'entregada') {
    return { ok: false, error: 'not_entregada' };
  }
  return sendPostEntregaForOrder(order, opts);
}

async function resendPostEntregaForOrn(orn) {
  return sendPostEntregaForOrn(orn, { force: true });
}

module.exports = {
  POST_ENTREGA_MARKER,
  sendPostEntregaForOrn,
  sendPostEntregaForOrder,
  resendPostEntregaForOrn,
  buildPostEntregaBody,
  probePostEntregaInteractive,
};
