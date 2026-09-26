const {
  sendTextMessage,
  sendInteractiveList,
  sendInteractiveButtons,
  normalizeWaRecipient,
} = require('./whatsappMeta');
const { insertWaMessage, encodeWaMediaBody } = require('./waInbox');
const {
  getReclamoSession,
  upsertReclamoSession,
  insertReclamo,
  getReclamoByOrn,
} = require('./waReclamoStore');
const { reclamoAccionTomadaForOrn } = require('./reclamoCompensacion');
const { buildAlreadyCompensatedWaText } = require('./bravaCoupons');
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
    (graphResult && graphResult.messageId) ||
    (graphResult &&
      graphResult.data &&
      graphResult.data.messages &&
      graphResult.data.messages[0] &&
      graphResult.data.messages[0].id);
  await insertWaMessage({
    messageId: graphId || 'bot-out-' + Date.now(),
    tel: from,
    direction: 'out',
    body: String(text || '').trim(),
  });
  return graphId;
}

function normalizeKeywordText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchPostEntregaKeyword(text) {
  const t = normalizeKeywordText(text);
  if (!t || t.length > 40) return '';
  if (/\breclamo\b/.test(t) || t === 'reclamar') return 'reclamo';
  if (/\bcalificar\b/.test(t) || /\bcalificacion\b/.test(t) || /\bvalorar\b/.test(t)) return 'calificar';
  if (/\bpedir\b/.test(t) || /\bpedido\b/.test(t) || /\bmenu\b/.test(t) || /\bmenú\b/.test(t)) return 'pedir';
  return '';
}

function motivoTextMenu() {
  return (
    'Elegí el motivo respondiendo con el *número*:\n\n' +
    '1 — Pedido frío\n' +
    '2 — Faltante\n' +
    '3 — Error en el pedido\n' +
    '4 — Demora\n' +
    '5 — Otro'
  );
}

function parseMotivoNumber(text) {
  const t = String(text || '').trim();
  const m = t.match(/^([1-5])\b/);
  if (!m) return null;
  const idx = Number(m[1]) - 1;
  return MOTIVO_ROWS[idx] ? MOTIVO_ROWS[idx].id : null;
}

function parseRatingNumber(text) {
  const t = String(text || '').trim();
  const m = t.match(/^([1-5])\b/);
  if (!m) return null;
  return 'rate_' + m[1];
}

async function replyText(from, text) {
  const sent = await sendTextMessage(from, text);
  if (sent.ok) await saveOutbound(from, text, sent);
  return sent;
}

async function maybeStartReclamo(from, session) {
  const orn = String(session && session.orn ? session.orn : '').trim();
  if (orn) {
    const taken = await reclamoAccionTomadaForOrn(orn);
    if (taken.gratificado) {
      await replyText(
        from,
        buildAlreadyCompensatedWaText(session && session.cliente, orn, taken.codigo, taken.compensation)
      );
      return { handled: true, kind: 'reclamo_already_compensated' };
    }
    if (taken.reenvioOrn) {
      await replyText(
        from,
        'Para el pedido *' +
          orn +
          '* ya gestionamos un *reenvío* (' +
          taken.reenvioOrn +
          '). Si necesitás algo más, escribinos.'
      );
      return { handled: true, kind: 'reclamo_already_reenvio' };
    }
    const row = await getReclamoByOrn(orn);
    if (row) {
      const est = String(row.estado || '').toLowerCase();
      if (est === 'abierto') {
        await replyText(
          from,
          'Ya tenemos tu reclamo *' +
            (row.reclamo_id || '') +
            '* para el pedido *' +
            orn +
            '*. Lo estamos revisando 🙏'
        );
        return { handled: true, kind: 'reclamo_already_open' };
      }
      if (est === 'compensado' || est === 'cerrado') {
        await replyText(
          from,
          'El reclamo del pedido *' +
            orn +
            '* ya fue *atendido* por Brava. Si es otro pedido, pedí de nuevo y usá la tarjeta de ese delivery.'
        );
        return { handled: true, kind: 'reclamo_already_closed' };
      }
    }
  }
  const inProgress = session && reclamoStepInProgress(session.step);
  if (inProgress) {
    const busy = await replyReclamoFlowBusy(from, session);
    if (busy) return busy;
  }
  return startReclamoFlow(from, session);
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
  if (sent.ok && sent.messageId) {
    await saveOutbound(from, bodyText + '\n[Lista de motivos]', sent);
    return { handled: true, kind: 'reclamo_motivo', sent: true };
  }
  await upsertReclamoSession(from, { step: 'motivo_text', open: true, orn: orn });
  await replyText(from, bodyText + '\n\n' + motivoTextMenu());
  return { handled: true, kind: 'reclamo_motivo_text', sent: true };
}

async function onMotivoChosen(from, motivoId, session) {
  session = session || {};
  const step = String(session.step || '').trim();
  if (step && step !== 'motivo' && step !== 'motivo_text') {
    const busy = await replyReclamoFlowBusy(from, session);
    if (busy) return busy;
  }
  if (step === 'motivo' || step === 'motivo_text') {
    if (session.motivo && String(session.motivo).trim()) {
      const busy2 = await replyReclamoFlowBusy(from, Object.assign({}, session, { step: 'need_description' }));
      if (busy2) return busy2;
    }
  }
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
  if (sent.ok && sent.messageId) {
    await saveOutbound(from, bodyText + '\n[Calificación]', sent);
    return { handled: true, kind: 'rating', sent: true };
  }
  await upsertReclamoSession(from, { step: 'rating_text', open: false });
  await replyText(from, bodyText + '\n\nRespondé con un número del *1* al *5* (5 = excelente).');
  return { handled: true, kind: 'rating_text', sent: true };
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

function reclamoStepInProgress(step) {
  const s = String(step || '').trim();
  return s === 'motivo' || s === 'motivo_text' || s === 'need_description' || s === 'need_photo';
}

async function replyReclamoFlowBusy(from, session) {
  const step = String(session && session.step ? session.step : '').trim();
  const orn = session && session.orn ? String(session.orn).trim() : 'tu pedido';
  if (step === 'need_description') {
    await replyText(
      from,
      'Ya registramos el *motivo* del pedido *' +
        orn +
        '*.\n\n' +
        'Seguí con un mensaje contando *qué pasó* (obligatorio antes de la foto). No hace falta elegir motivo otra vez 🙏'
    );
    return { handled: true, kind: 'reclamo_busy_need_desc' };
  }
  if (step === 'need_photo') {
    await replyText(
      from,
      'Tu reclamo de *' +
        orn +
        '* ya tiene motivo y descripción.\n\n' +
        'Mandá la *foto del pedido* 📷 para confirmarlo. No podés cambiar el motivo ahora.'
    );
    return { handled: true, kind: 'reclamo_busy_need_photo' };
  }
  if (step === 'motivo' || step === 'motivo_text') {
    await replyText(
      from,
      'Tenés la lista *Elegir motivo* en el mensaje de arriba 👆\n\n' +
        'Elegí una opción (solo una). Si no la ves, escribí el número del 1 al 5.'
    );
    return { handled: true, kind: 'reclamo_motivo_pending' };
  }
  if (step === 'done' && session && session.reclamo_id) {
    await replyText(
      from,
      'Ya recibimos tu reclamo *' +
        session.reclamo_id +
        '* del pedido *' +
        orn +
        '*. Brava lo está revisando 🙏'
    );
    return { handled: true, kind: 'reclamo_already_submitted' };
  }
  return null;
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
    return maybeStartReclamo(from, session);
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

  var sessionEarly = await getReclamoSession(from);
  if (!interactiveId && text) {
    const kw = matchPostEntregaKeyword(text);
    if (kw) {
      sessionEarly = sessionEarly || {};
      if (kw === 'reclamo') return maybeStartReclamo(from, sessionEarly);
      if (kw === 'calificar') return showRating(from);
      if (kw === 'pedir') return onPedirDeNuevo(from);
    }
  }

  const session = sessionEarly || (await getReclamoSession(from));
  if (!session) return { handled: false };

  const step = String(session.step || '').trim();

  if (step === 'menu' && text && !interactiveId) {
    const kwMenu = matchPostEntregaKeyword(text);
    if (kwMenu === 'reclamo') return maybeStartReclamo(from, session);
    if (kwMenu === 'calificar') return showRating(from);
    if (kwMenu === 'pedir') return onPedirDeNuevo(from);
  }

  if (step === 'motivo_text' && text && !interactiveId) {
    const motivoId = parseMotivoNumber(text);
    if (motivoId) return onMotivoChosen(from, motivoId, session);
    await replyText(from, 'Respondé solo con un número del 1 al 5 👆\n\n' + motivoTextMenu());
    return { handled: true, kind: 'reclamo_motivo_bad_number' };
  }

  if (step === 'rating_text' && text && !interactiveId) {
    const starId = parseRatingNumber(text);
    if (starId) return onRating(from, starId);
    await replyText(from, 'Escribí un número del *1* al *5* para calificar.');
    return { handled: true, kind: 'rating_bad_number' };
  }

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
    const motivoFromText = parseMotivoNumber(text);
    if (motivoFromText) return onMotivoChosen(from, motivoFromText, session);
    await replyText(
      from,
      'Elegí un motivo tocando *Elegir motivo* en el mensaje de arriba, o respondé con el número:\n\n' +
        motivoTextMenu()
    );
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
