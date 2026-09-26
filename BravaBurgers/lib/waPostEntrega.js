const { isSupabaseConfigured, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient, getWhatsAppConfig } = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');
const { upsertReclamoSession } = require('./waReclamoStore');
const { ensureWaReclamoSchema } = require('./waReclamoSchema');
const {
  postEntregaMode,
  sendPostEntregaTextMenu,
  sendPostEntregaInteractive,
} = require('./waPostEntregaSend');

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

function buildPostEntregaPrompt() {
  return '¿Cómo te fue con el pedido? Elegí una opción:';
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
  const mode = postEntregaMode();
  var primary = null;
  var interactiveResult = null;

  if (mode === 'text' || mode === 'both') {
    primary = await sendPostEntregaTextMenu(tel, nombre, orn);
    if (!primary.ok) {
      console.warn('[wa-post-entrega] text menu failed', orn, tel, primary.message || primary.error);
      return primary;
    }
    await insertWaMessage({
      messageId: primary.messageId,
      tel: tel,
      direction: 'out',
      body: primary.body + '\n\n[Post-entrega · menú texto]',
    });
  }

  if (mode === 'interactive' || mode === 'both') {
    interactiveResult = await sendPostEntregaInteractive(tel, buildPostEntregaPrompt());
    if (interactiveResult.ok) {
      await insertWaMessage({
        messageId: interactiveResult.messageId,
        tel: tel,
        direction: 'out',
        body: buildPostEntregaPrompt() + '\n\n[Botones: reclamo · calificar · pedir de nuevo]',
      });
    } else if (mode === 'interactive') {
      console.warn('[wa-post-entrega] interactive only failed', orn, interactiveResult);
      return interactiveResult;
    }
  }

  if (!primary && !(interactiveResult && interactiveResult.ok)) {
    return { ok: false, error: 'post_entrega_nothing_sent' };
  }

  await markPostEntregaSent(orn, tel);
  await upsertReclamoSession(tel, { orn: orn, step: 'menu', open: false });

  var outMode = 'text_menu';
  if (primary && interactiveResult && interactiveResult.ok) outMode = 'text_menu_plus_interactive';
  else if (interactiveResult && interactiveResult.ok) outMode = 'interactive';
  else if (primary) outMode = 'text_menu';

  var checkWamid =
    (interactiveResult && interactiveResult.ok && interactiveResult.messageId) ||
    (primary && primary.messageId) ||
    '';
  return {
    ok: true,
    sent: true,
    tel: tel,
    messageId: (primary && primary.messageId) || (interactiveResult && interactiveResult.messageId),
    preludeMessageId: primary ? primary.messageId : null,
    interactiveMessageId: interactiveResult && interactiveResult.ok ? interactiveResult.messageId : null,
    contactWaId: (primary && primary.contactWaId) || (interactiveResult && interactiveResult.contactWaId) || '',
    mode: outMode,
    deliveryCheckWamid: checkWamid,
    deliveryCheckHint: checkWamid
      ? 'Consultá entrega Meta: GET /api/whatsapp-status?delivery=1&wait=1&key=…&wamid=' + checkWamid
      : null,
    warn:
      mode === 'both' && primary && interactiveResult && !interactiveResult.ok
        ? 'interactive_not_delivered_try_text_keywords'
        : null,
  };
}

async function probePostEntregaInteractive(to) {
  const tel = normalizeWaRecipient(to);
  if (!tel) return { ok: false, error: 'invalid_phone' };
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, error: 'whatsapp_not_configured' };
  }
  return sendPostEntregaTextMenu(tel, 'Cliente', 'ORN-DEL-TEST');
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
