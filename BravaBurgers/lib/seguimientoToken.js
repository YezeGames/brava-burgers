const crypto = require('crypto');

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function trackingSecret() {
  return process.env.BRAVA_ORDER_SECRET || process.env.ADMIN_SESSION_SECRET || '';
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', trackingSecret()).update(payloadB64).digest('base64url');
}

function createSeguimientoToken(orn) {
  const secret = trackingSecret();
  const id = String(orn || '').trim();
  if (!secret || !id) return null;
  const payload = { v: 1, orn: id, exp: Date.now() + TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return payloadB64 + '.' + signPayload(payloadB64);
}

function verifySeguimientoToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing_token' };
  const secret = trackingSecret();
  if (!secret) return { ok: false, error: 'tracking_not_configured' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid_token' };
  const [payloadB64, sig] = parts;
  if (signPayload(payloadB64) !== sig) return { ok: false, error: 'invalid_token' };
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.orn) return { ok: false, error: 'invalid_token' };
    if (payload.exp && Date.now() > payload.exp) return { ok: false, error: 'token_expired' };
    return { ok: true, orn: String(payload.orn).trim() };
  } catch (e) {
    return { ok: false, error: 'invalid_token' };
  }
}

module.exports = { createSeguimientoToken, verifySeguimientoToken };
