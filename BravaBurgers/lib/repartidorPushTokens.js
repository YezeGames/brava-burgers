'use strict';

const { restSelect, restFetch } = require('./supabaseServer');
const { telNorm } = require('./bravaCoupons');

function isPushTableMissing(res) {
  if (!res || res.ok) return false;
  const blob = JSON.stringify(res.detail || res.error || '').toLowerCase();
  return blob.indexOf('repartidor_push_tokens') >= 0 || blob.indexOf('pgrst205') >= 0 || blob.indexOf('42p01') >= 0;
}

async function upsertRepartidorPushToken(telefono, fcmToken, platform) {
  const tel = telNorm(telefono);
  const token = String(fcmToken || '').trim();
  const plat = String(platform || 'android').trim() || 'android';
  if (!tel) return { ok: false, error: 'missing_telefono' };
  if (!token || token.length < 20) return { ok: false, error: 'invalid_fcm_token' };

  const row = {
    telefono: tel,
    fcm_token: token,
    platform: plat,
    updated_at: new Date().toISOString(),
  };

  const r = await restFetch('/rest/v1/repartidor_push_tokens?on_conflict=fcm_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });

  if (!r.ok && isPushTableMissing(r)) {
    return { ok: false, error: 'repartidor_push_schema_missing' };
  }
  if (!r.ok) return { ok: false, error: r.error || 'upsert_failed', detail: r.detail };
  return { ok: true, telefono: tel };
}

async function listPushTokensForTelefono(telefono) {
  const tel = telNorm(telefono);
  if (!tel) return { ok: false, error: 'missing_telefono', tokens: [] };
  const q =
    'select=fcm_token,platform,updated_at&telefono=eq.' +
    encodeURIComponent(tel) +
    '&order=updated_at.desc&limit=20';
  const r = await restSelect('repartidor_push_tokens', q);
  if (!r.ok) {
    if (isPushTableMissing(r)) {
      return { ok: false, error: 'repartidor_push_schema_missing', tokens: [] };
    }
    return { ok: false, error: r.error || 'select_failed', tokens: [] };
  }
  const tokens = (r.data || [])
    .map(function (row) {
      return String(row.fcm_token || '').trim();
    })
    .filter(Boolean);
  return { ok: true, tokens: tokens };
}

/** Todos los dispositivos registrados (p. ej. aviso OTA). */
async function listAllPushTokens() {
  const q = 'select=fcm_token&order=updated_at.desc&limit=500';
  const r = await restSelect('repartidor_push_tokens', q);
  if (!r.ok) {
    if (isPushTableMissing(r)) {
      return { ok: false, error: 'repartidor_push_schema_missing', tokens: [] };
    }
    return { ok: false, error: r.error || 'select_failed', tokens: [] };
  }
  const seen = new Set();
  const tokens = [];
  for (let i = 0; i < (r.data || []).length; i++) {
    const t = String(r.data[i].fcm_token || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
  }
  return { ok: true, tokens: tokens };
}

async function deleteInvalidPushToken(fcmToken) {
  const token = String(fcmToken || '').trim();
  if (!token) return { ok: true };
  const { restDelete } = require('./supabaseServer');
  return restDelete('repartidor_push_tokens', 'fcm_token=eq.' + encodeURIComponent(token));
}

module.exports = {
  upsertRepartidorPushToken,
  listPushTokensForTelefono,
  listAllPushTokens,
  deleteInvalidPushToken,
  isPushTableMissing,
};
