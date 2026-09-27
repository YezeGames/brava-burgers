'use strict';

const { isFcmConfigured, sendFcmToToken } = require('./firebaseFcm');
const { listPushTokensForTelefono, deleteInvalidPushToken } = require('./repartidorPushTokens');

function buildRoutePushMessage(assignOut) {
  const n = Number(assignOut.assigned) || 0;
  if (assignOut.empty_route && n === 0) {
    return {
      title: 'Ruta actualizada',
      body: 'Cocina limpió tu ruta en la app.',
      data: { type: 'route_clear' },
    };
  }
  if (n === 1) {
    return {
      title: 'Nueva parada en tu ruta',
      body: 'Tenés 1 entrega asignada. Abrí Brava Repartidor.',
      data: { type: 'route_assign', count: '1' },
    };
  }
  return {
    title: n + ' paradas nuevas',
    body: 'Cocina te asignó entregas. Abrí Brava Repartidor.',
    data: { type: 'route_assign', count: String(n) },
  };
}

/**
 * Envía FCM a todos los tokens del repartidor (no bloquea assign si falla).
 * @param {string} repartidorTel
 * @param {object} assignOut — resultado de assignRepartidorRuta
 */
async function notifyRepartidorRouteAssigned(repartidorTel, assignOut) {
  if (!isFcmConfigured()) {
    return { ok: false, skipped: true, error: 'firebase_not_configured' };
  }
  const tel = String(repartidorTel || assignOut.repartidor_tel || '').trim();
  if (!tel) return { ok: false, error: 'missing_telefono' };

  const assigned = Number(assignOut.assigned) || 0;
  if (!assigned && !assignOut.empty_route) {
    return { ok: true, skipped: true, reason: 'nothing_to_notify' };
  }

  const listed = await listPushTokensForTelefono(tel);
  if (!listed.ok) return listed;
  if (!listed.tokens.length) {
    return { ok: true, skipped: true, reason: 'no_device_tokens' };
  }

  const msg = buildRoutePushMessage(assignOut);
  const results = [];
  for (let i = 0; i < listed.tokens.length; i++) {
    const tok = listed.tokens[i];
    const sent = await sendFcmToToken(tok, msg);
    results.push({ token: tok.slice(0, 12) + '…', ok: sent.ok, error: sent.error });
    if (!sent.ok && sent.code === 'messaging/registration-token-not-registered') {
      await deleteInvalidPushToken(tok);
    }
  }
  const anyOk = results.some(function (r) {
    return r.ok;
  });
  return { ok: anyOk, results: results, message: msg };
}

module.exports = {
  notifyRepartidorRouteAssigned,
  buildRoutePushMessage,
};
