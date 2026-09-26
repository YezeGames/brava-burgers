const {
  sendTextMessage,
  sendInteractiveList,
  sendInteractiveButtons,
  normalizeWaRecipient,
} = require('./whatsappMeta');
const { insertWaMessage, encodeWaMediaBody } = require('./waInbox');
const { getReclamoSession, upsertReclamoSession, insertReclamo } = require('./waReclamoStore');
const { ensureWaReclamoSchema } = require('./waReclamoSchema');

const DESC_MIN = 8;
const MOTIVO_ROWS = [
  { id: 'frio', title: 'Pedido frío', description: 'Llegó frío' },
  { id: 'faltante', title: 'Faltante', description: 'Incompleto' },
  { id: 'error', title: 'Error pedido', description: 'Algo incorrecto' },
  { id: 'demora', title: 'Demora', description: 'Tardó mucho' },
  { id: 'otro', title: 'Otro', description: 'Otro motivo' },
];

function newReclamoId(orn) {
  const tail = String(orn || '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .slice(-12);
  return 'RCL-' + (tail || String(Date.now()).slice(-8));
}

async function saveOutbound(from, text, graphResult) {
  const graphId =
    graphResult &&
    graphResult.data &&
    graphResult.data.messages &&
    graphResult.data.messages[0] &&
    graphResult.data.messages[0].id;
  await insertWaMessage({
    messageId: graphId || 'bot-out-' + Date.now(),
    tel: from,
    direction: 'out',
    body: String(text || '').trim(),
  });
  return graphId;
}

async function replyText(from, text) {
  const sent = await sendTextMessage(from, text);
  if (sent.ok) await saveOutbound(from, text, sent);
  return sent;
}

async function startReclamoFlow(from, session) {
  const orn = String(session && session.orn ? session.orn : 'tu pedido').trim();
  await upsertReclamoSession(from, { step: 'motivo', open: true, orn: orn });
  const bodyText = 'Lamentamos el inconveniente 😔\n¿Qué pasó con el pedido *' + orn + '*?';
  const sent = await sendInteractiveList({
    to: from,
    headerText: 'Reclamo',
    bodyText: bodyText,
    buttonLabel: 'Elegir motivo',
    sections: [
      {
        title: 'Motivo',
        rows: MOTIVO_ROWS,
      },
    ],
  });
  if (sent.ok) {
    await saveOutbound(from, bodyText + '\n[Lista de motivos]', sent);
  }
  return { handled: true, kind: 'reclamo_motivo', sent: sent.ok };
}

async function onMotivoChosen(from, motivoId, session) {
  const motivo = String(motivoId || '').trim();
  const orn = session && session.orn ? session.orn : '';
  await upsertReclamoSession(from, {
    step: 'need_description',
    motivo: motivo,
    open: true,
    orn: orn,
  });
  const text =
    'Contanos con tus palabras *qué pasó* (qué llegó mal, qué faltó, etc.).\n\n' +
    'Escribilo en un mensaje. *Es obligatorio* antes de la foto.';
  const sent = await replyText(from, text);
  return { handled: true, kind: 'reclamo_need_desc', sent: sent.ok };
}

async function onDescription(from, text, session) {
  const body = String(text || '').trim();
  if (body.length < DESC_MIN) {
    await replyText(from, 'Necesitamos un poco más de detalle para entender el reclamo 🙏');
    return { handled: true, kind: 'reclamo_desc_short' };
  }
  await upsertReclamoSession(from, {
    step: 'need_photo',
    descripcion: body,
    open: true,
    orn: session.orn || '',
    motivo: session.motivo || '',
  });
  const msg =
    'Gracias. Ahora mandá una *foto del pedido* (caja, burgers o lo que faltó).\n\n' +
    '📷 Sin foto no podemos *confirmar* el reclamo.';
  await replyText(from, msg);
  return { handled: true, kind: 'reclamo_need_photo' };
}

async function finishReclamo(from, session, photoMediaId) {
  const reclamoId = newReclamoId(session.orn);
  const motivo = session.motivo || '—';
  const desc = session.descripcion || '—';
  const orn = session.orn || '—';
  const savedRow = await insertReclamo({
    reclamo_id: reclamoId,
    orn: orn,
    tel: normalizeWaRecipient(from),
    motivo: motivo,
    descripcion: desc,
    photo_media_id: photoMediaId || '',
    estado: 'abierto',
  });
  if (!savedRow.ok) {
    console.warn('[wa-reclamo] insert wa_reclamos failed', savedRow.error || '', savedRow.detail || '');
  }
  await upsertReclamoSession(from, {
    step: 'done',
    open: true,
    reclamo_id: reclamoId,
    photo_media_id: photoMediaId || '',
    orn: orn,
    motivo: motivo,
    descripcion: desc,
  });
  const text =
    'Recibimos tu reclamo *' +
    reclamoId +
    '* ✅\n\n' +
    'Motivo: ' +
    motivo +
    '\n' +
    'Resumen guardado con tu foto.\n\n' +
    'Un humano de Brava lo revisa en breve.';
  await replyText(from, text);
  return { handled: true, kind: 'reclamo_confirmed', reclamoId: reclamoId };
}

async function showRating(from) {
  const bodyText = '¿Cómo calificarías el delivery y las burgers?';
  const sent = await sendInteractiveButtons({
    to: from,
    bodyText: bodyText,
    buttons: [
      { id: 'rate_5', title: '⭐ 5 Excelente' },
      { id: 'rate_4', title: '⭐ 4 Muy bien' },
      { id: 'rate_3', title: '⭐ 3 Regular' },
    ],
  });
  if (sent.ok) await saveOutbound(from, bodyText + '\n[Calificación]', sent);
  return { handled: true, kind: 'rating', sent: sent.ok };
}

async function onRating(from, starId) {
  const n = String(starId || '').replace('rate_', '');
  if (Number(n) >= 4) {
    await replyText(
      from,
      '¡Gracias! 💛 Si te sobra un segundo, una reseña en IG nos ayuda un montón:\n@bravaburgers.ok'
    );
  } else {
    await replyText(from, 'Gracias por contarlo. Si querés, seguimos por acá para resolverlo.');
  }
  return { handled: true, kind: 'rating_done', stars: n };
}

async function onPedirDeNuevo(from) {
  await replyText(
    from,
    '¡Gracias por volver! 🔥\n\nPedí acá con aclaraciones en cada burger:\nhttps://linktr.ee/bravaburgers'
  );
  return { handled: true, kind: 'pedir_de_nuevo' };
}

function isMotivoId(id) {
  return MOTIVO_ROWS.some(function (r) {
    return r.id === id;
  });
}

/**
 * Bot post-entrega / reclamo. Devuelve { handled: true } si consumió el mensaje (no mandar bienvenida).
 */
async function handleReclamoInbound(ctx) {
  await ensureWaReclamoSchema();
  const from = ctx.from;
  const interactiveId = String(ctx.interactiveReplyId || '').trim();
  const text = String(ctx.text || '').trim();
  const mediaId = String(ctx.mediaId || '').trim();
  const mediaType = String(ctx.mediaType || '').trim();
  const isImage = mediaType === 'image' && !!mediaId;

  if (interactiveId === 'reclamo') {
    const session = (await getReclamoSession(from)) || {};
    return startReclamoFlow(from, session);
  }
  if (interactiveId === 'calificar') {
    return showRating(from);
  }
  if (interactiveId === 'pedir') {
    return onPedirDeNuevo(from);
  }
  if (interactiveId.indexOf('rate_') === 0) {
    return onRating(from, interactiveId);
  }
  if (isMotivoId(interactiveId)) {
    const session = (await getReclamoSession(from)) || {};
    return onMotivoChosen(from, interactiveId, session);
  }

  const session = await getReclamoSession(from);
  if (!session) return { handled: false };

  const step = String(session.step || '').trim();

  if (step === 'need_description') {
    if (isImage) {
      await replyText(from, 'Primero contanos *con texto* qué pasó; después pedimos la foto 🙏');
      return { handled: true, kind: 'reclamo_photo_before_desc' };
    }
    if (!text || text === '[Imagen]') {
      return { handled: false };
    }
    return onDescription(from, text, session);
  }

  if (step === 'need_photo') {
    if (text && !isImage && text !== '[Imagen]') {
      await replyText(
        from,
        'Para confirmar el reclamo necesitamos la *foto del pedido*. Mandala como imagen 📷'
      );
      return { handled: true, kind: 'reclamo_need_photo_reminder' };
    }
    if (!isImage) {
      return { handled: false };
    }
    const merged = Object.assign({}, session, { descripcion: session.descripcion || '' });
    return finishReclamo(from, merged, mediaId);
  }

  if (step === 'motivo') {
    await replyText(from, 'Elegí un motivo tocando *Elegir motivo* en el mensaje de arriba 👆');
    return { handled: true, kind: 'reclamo_pick_motivo' };
  }

  if (session.open && step === 'done') {
    return { handled: false };
  }

  return { handled: false };
}

module.exports = {
  handleReclamoInbound,
  MOTIVO_ROWS,
};
