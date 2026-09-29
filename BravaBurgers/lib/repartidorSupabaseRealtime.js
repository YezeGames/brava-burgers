'use strict';

const jwt = require('jsonwebtoken');
const { telNorm } = require('./bravaCoupons');
const { supabaseUrl, anonKey, restInsert } = require('./supabaseServer');

function jwtSecret() {
  return (process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '').trim();
}

function isRepartidorRealtimeConfigured() {
  return Boolean(supabaseUrl() && anonKey() && jwtSecret());
}

/**
 * JWT Supabase (role authenticated) con claim repartidor_tel para RLS en repartidor_route_events.
 */
function createRepartidorSupabaseRealtimeSession(telefono) {
  if (!isRepartidorRealtimeConfigured()) return null;
  const tel = telNorm(telefono);
  if (!tel) return null;
  const base = supabaseUrl().replace(/\/$/, '');
  const anon = anonKey().trim();
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const sub = 'repartidor:' + tel;
  let access_token;
  try {
    access_token = jwt.sign(
      {
        aud: 'authenticated',
        exp,
        sub,
        role: 'authenticated',
        repartidor_tel: tel,
      },
      jwtSecret(),
      { algorithm: 'HS256' }
    );
  } catch {
    return null;
  }
  return {
    url: base,
    anonKey: anon,
    access_token,
    expires_in: 3600,
    repartidor_tel: tel,
  };
}

function isRouteEventsTableMissing(r) {
  const blob = String((r && r.detail) || (r && r.error) || '').toLowerCase();
  return (
    blob.indexOf('repartidor_route_events') >= 0 ||
    blob.indexOf('pgrst205') >= 0 ||
    blob.indexOf('42p01') >= 0
  );
}

async function emitRepartidorRouteEvent(repartidorTel, eventType) {
  const tel = telNorm(repartidorTel);
  if (!tel) return { ok: false, error: 'missing_tel' };
  const r = await restInsert(
    'repartidor_route_events',
    {
      repartidor_tel: tel,
      event_type: String(eventType || 'route_changed').slice(0, 64),
    },
    'return=minimal'
  );
  if (!r.ok && isRouteEventsTableMissing(r)) {
    return { ok: false, error: 'repartidor_realtime_schema_missing' };
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'insert_failed', detail: r.detail };
}

module.exports = {
  isRepartidorRealtimeConfigured,
  createRepartidorSupabaseRealtimeSession,
  emitRepartidorRouteEvent,
};
