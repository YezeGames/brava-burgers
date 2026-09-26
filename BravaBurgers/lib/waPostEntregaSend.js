const {
  normalizeWaRecipient,
  sendInteractiveButtons,
  sendTextMessage,
  uploadMediaBuffer,
} = require('./whatsappMeta');

let cachedHeaderMediaId = null;

function postEntregaMode() {
  const m = String(process.env.WHATSAPP_POST_ENTREGA_MODE || 'interactive').trim().toLowerCase();
  if (m === 'text' || m === 'both') return m;
  return 'interactive';
}

function postEntregaUseHeaderImage() {
  return String(process.env.WHATSAPP_POST_ENTREGA_HEADER_IMAGE || '').trim() === '1';
}

function postEntregaImageUrl() {
  const custom = (process.env.WHATSAPP_POST_ENTREGA_IMAGE_URL || '').trim();
  if (custom) return custom;
  return 'https://brava-burgers.vercel.app/logoweb.png';
}

function plainWaBody(text) {
  return String(text || '')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function buildPostEntregaTextMenu(nombre, orn) {
  return (
    '¡Listo, ' +
    nombre +
    '! 🍔\n' +
    'Tu pedido ' +
    orn +
    ' fue entregado.\n\n' +
    '¿Cómo te fue? Si no ves botones, respondé con *un número*:\n\n' +
    '1 — Iniciar reclamo\n' +
    '2 — Calificar (1 a 5)\n' +
    '3 — Pedir de nuevo'
  );
}

function postEntregaButtons() {
  return [
    { id: 'reclamo', title: 'Iniciar reclamo' },
    { id: 'calificar', title: 'Calificar' },
    { id: 'pedir', title: 'Pedir de nuevo' },
  ];
}

async function resolveHeaderMediaId() {
  const fromEnv = (process.env.WHATSAPP_POST_ENTREGA_MEDIA_ID || '').trim();
  if (fromEnv) return fromEnv;
  if (cachedHeaderMediaId) return cachedHeaderMediaId;
  const url = postEntregaImageUrl();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const ct = String(res.headers.get('content-type') || 'image/png').toLowerCase();
    const mime = ct.indexOf('jpeg') >= 0 || ct.indexOf('jpg') >= 0 ? 'image/jpeg' : 'image/png';
    const uploaded = await uploadMediaBuffer(buf, mime);
    if (uploaded.ok && uploaded.mediaId) {
      cachedHeaderMediaId = uploaded.mediaId;
      return cachedHeaderMediaId;
    }
  } catch (e) {
    console.warn('[wa-post-entrega] header upload failed', e.message || e);
  }
  return '';
}

function graphDetail(sent) {
  if (!sent || sent.ok) return '';
  const d = sent.detail;
  if (d && d.message) return String(d.message);
  if (sent.message) return String(sent.message);
  return sent.error || '';
}

async function sendPostEntregaTextMenu(to, nombre, orn) {
  const tel = normalizeWaRecipient(to);
  const body = buildPostEntregaTextMenu(nombre, orn);
  const sent = await sendTextMessage(tel, body);
  if (!sent.ok || !sent.messageId) {
    return sent.ok ? { ok: false, error: 'missing_message_id' } : sent;
  }
  return {
    ok: true,
    messageId: sent.messageId,
    contactWaId: sent.contactWaId || '',
    mode: 'text_menu',
    body: body,
  };
}

/**
 * Tarjeta interactiva (solo botones, sin imagen por defecto — mejor entrega en Meta).
 * Imagen header solo si WHATSAPP_POST_ENTREGA_HEADER_IMAGE=1
 */
async function sendPostEntregaInteractive(to, bodyText) {
  const tel = normalizeWaRecipient(to);
  const plainBody = plainWaBody(bodyText).slice(0, 1024);
  const buttons = postEntregaButtons();
  const footer = 'Brava Burgers';

  let sent = await sendInteractiveButtons({
    to: tel,
    bodyText: plainBody,
    footerText: footer,
    buttons: buttons,
  });

  if (!sent.ok && postEntregaUseHeaderImage()) {
    const mediaId = await resolveHeaderMediaId();
    if (mediaId) {
      sent = await sendInteractiveButtons({
        to: tel,
        bodyText: plainBody,
        footerText: footer,
        imageMediaId: mediaId,
        buttons: buttons,
      });
    }
    if (!sent.ok) {
      sent = await sendInteractiveButtons({
        to: tel,
        bodyText: plainBody,
        footerText: footer,
        imageUrl: postEntregaImageUrl(),
        buttons: buttons,
      });
    }
  }

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error || 'interactive_failed',
      hint: sent.hint || '',
      interactiveDetail: graphDetail(sent).slice(0, 200),
    };
  }

  if (!sent.messageId) {
    return { ok: false, error: 'interactive_missing_wamid' };
  }

  return Object.assign({ mode: 'interactive', body: plainBody }, sent);
}

module.exports = {
  postEntregaMode,
  sendPostEntregaTextMenu,
  sendPostEntregaInteractive,
  buildPostEntregaTextMenu,
  postEntregaButtons,
  plainWaBody,
  resolveHeaderMediaId,
};
