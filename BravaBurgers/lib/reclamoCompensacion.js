const { restSelect } = require('./supabaseServer');
const { sendTextMessage, normalizeWaRecipient } = require('./whatsappMeta');
const { insertWaMessage } = require('./waInbox');

async function sendCompensationWaPair(tel, textMain, textFarewell) {
  const to = normalizeWaRecipient(tel);
  if (!to) return { ok: false, error: 'invalid_phone', main: null, farewell: null };
  const main = await sendTextMessage(to, textMain);
  if (main.ok && main.messageId) {
    await insertWaMessage({
      messageId: main.messageId,
      tel: to,
      direction: 'out',
      body: textMain,
    });
  }
  var farewell = null;
  if (main.ok && textFarewell) {
    await new Promise(function (resolve) {
      setTimeout(resolve, 500);
    });
    farewell = await sendTextMessage(to, textFarewell);
    if (farewell.ok && farewell.messageId) {
      await insertWaMessage({
        messageId: farewell.messageId,
        tel: to,
        direction: 'out',
        body: textFarewell,
      });
    }
  }
  return {
    ok: !!(main.ok && (!textFarewell || (farewell && farewell.ok))),
    main: main,
    farewell: farewell,
    waSent: !!main.ok,
    waFarewellSent: !!(farewell && farewell.ok),
    waError: main.ok ? (farewell && !farewell.ok ? farewell.error : null) : main.error,
    waHint: main.ok ? (farewell && !farewell.ok ? farewell.hint : null) : main.hint,
  };
}

async function reclamoAccionTomadaForOrn(origOrn) {
  const orn = String(origOrn || '').trim();
  if (!orn) return { gratificado: false, reenvioOrn: null, codigo: null, compensation: null };

  const comp = await restSelect(
    'compensaciones',
    'select=*&orn_origen=eq.' + encodeURIComponent(orn) + '&limit=1'
  );
  if (comp.ok && comp.data && comp.data[0]) {
    const row = comp.data[0];
    return {
      gratificado: true,
      reenvioOrn: null,
      codigo: row.codigo,
      compensation: row,
    };
  }

  const reenv = await restSelect(
    'orders',
    'select=orn,estado&reenvio_de=eq.' + encodeURIComponent(orn) + '&limit=5'
  );
  if (reenv.ok && reenv.data) {
    for (let i = 0; i < reenv.data.length; i++) {
      const row = reenv.data[i];
      const est = String(row.estado || '').toLowerCase();
      if (est !== 'cancelada' && est !== 'rechazado') {
        return { gratificado: false, reenvioOrn: row.orn, codigo: null, compensation: null };
      }
    }
  }

  return { gratificado: false, reenvioOrn: null, codigo: null, compensation: null };
}

module.exports = {
  sendCompensationWaPair,
  reclamoAccionTomadaForOrn,
};
