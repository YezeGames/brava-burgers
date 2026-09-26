const {
  normalizeWaRecipient,
  sendInteractiveButtons,
  sendTextMessage,
  uploadMediaBuffer,
} = require('./whatsappMeta');

let cachedHeaderMediaId = null;

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

/**
 * Envía tarjeta interactiva post-entrega con reintentos (media id → sin imagen → texto).
 */
async function sendPostEntregaInteractive(to, bodyText) {
  const tel = normalizeWaRecipient(to);
  const plainBody = plainWaBody(bodyText);
  const buttons = postEntregaButtons();
  const footer = 'Brava Burgers';

  const mediaId = await resolveHeaderMediaId();
  let sent = await sendInteractiveButtons({
    to: tel,
    bodyText: plainBody,
    footerText: footer,
    imageMediaId: mediaId,
    buttons: buttons,
  });

  if (!sent.ok && mediaId) {
    sent = await sendInteractiveButtons({
      to: tel,
      bodyText: plainBody,
      footerText: footer,
      buttons: buttons,
    });
  }

  if (!sent.ok) {
    sent = await sendInteractiveButtons({
      to: tel,
      bodyText: plainBody.slice(0, 1024),
      footerText: footer,
      imageUrl: postEntregaImageUrl(),
      buttons: buttons,
    });
  }

  if (!sent.ok) {
    const fallbackText =
      plainBody +
      '\n\n' +
      'Respondé tocando un botón arriba si lo ves; si no, escribí: RECLAMO · CALIFICAR · PEDIR';
    const textSent = await sendTextMessage(tel, fallbackText);
    if (textSent.ok && textSent.messageId) {
      return {
        ok: true,
        data: textSent.data,
        messageId: textSent.messageId,
        contactWaId: textSent.contactWaId || '',
        fallback: 'text',
        interactiveError: sent.error,
        interactiveHint: sent.hint || '',
        interactiveDetail: graphDetail(sent).slice(0, 200),
      };
    }
    return Object.assign({}, sent, {
      interactiveDetail: graphDetail(sent).slice(0, 200),
      textFallbackError: textSent.error,
      textFallbackHint: textSent.hint || '',
    });
  }

  return sent;
}

module.exports = {
  sendPostEntregaInteractive,
  postEntregaButtons,
  plainWaBody,
  resolveHeaderMediaId,
};
