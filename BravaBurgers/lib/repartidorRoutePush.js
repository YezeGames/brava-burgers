'use strict';

const { isFcmConfigured, sendFcmToToken } = require('./firebaseFcm');
const {
  listPushTokensForTelefono,
  listAllPushTokens,
  deleteInvalidPushToken,
} = require('./repartidorPushTokens');

function buildRoutePushMessage(assignOut) {
  const n = Number(assignOut.assigned) || 0;
  const cleared = Number(assignOut.cleared) || 0;
  if (assignOut.empty_route && n === 0) {
    return {
      title: 'Ruta vacía',
      body: 'Cocina limpió tu ruta en la app.',
      data: { type: 'route_clear', cleared: String(cleared) },
    };
  }
  if (cleared > 0 && n > 0) {
    return {
      title: 'Ruta modificada',
      body:
        'Cocina actualizó tu ruta: ' +
        n +
        ' parada' +
        (n === 1 ? '' : 's') +
        ', quitó ' +
        cleared +
        '. Abrí Brava Repartidor.',
      data: { type: 'route_modified', count: String(n), cleared: String(cleared) },
    };
  }
  if (cleared > 0 && n === 0) {
    return {
      title: 'Paradas quitadas',
      body: 'Cocina te sacó ' + cleared + ' parada' + (cleared === 1 ? '' : 's') + ' de la ruta.',
      data: { type: 'route_removed', cleared: String(cleared) },
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
  const cleared = Number(assignOut.cleared) || 0;
  if (!assigned && !assignOut.empty_route && cleared === 0) {
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
    const sent = await sendFcmToToken(tok, msg, { dataOnly: true });
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

/**
 * FCM `app_update` a todos los tokens (publish repartidor nativo).
 * @param {{ versionCode?: number, versionName?: string }} opts
 */
async function notifyRepartidorAppUpdate(opts) {
  if (!isFcmConfigured()) {
    return { ok: false, skipped: true, error: 'firebase_not_configured' };
  }
  const versionCode = Number(opts && opts.versionCode) || 0;
  const versionName = String((opts && opts.versionName) || '').trim();
  const listed = await listAllPushTokens();
  if (!listed.ok) return listed;
  if (!listed.tokens.length) {
    return { ok: true, skipped: true, reason: 'no_device_tokens' };
  }
  const body =
    versionName !== ''
      ? 'Versión ' + versionName + ' disponible. Abrí la app para instalarla.'
      : 'Hay una versión nueva. Abrí Brava Repartidor.';
  const msg = {
    title: 'Actualización de Brava Repartidor',
    body: body,
    data: {
      type: 'app_update',
      version_code: String(versionCode || ''),
      version_name: versionName,
    },
  };
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
  return { ok: anyOk, sent: results.filter(function (r) {
    return r.ok;
  }).length, total: listed.tokens.length, results: results, message: msg };
}

module.exports = {
  notifyRepartidorRouteAssigned,
  notifyRepartidorAppUpdate,
  buildRoutePushMessage,
};
