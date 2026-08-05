const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.BRAVA_ORDER_SECRET || '';
}

function signToken(payloadB64) {
  return crypto.createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url');
}

function createAdminToken() {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = {
    v: 1,
    exp: Date.now() + TTL_MS,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return payloadB64 + '.' + signToken(payloadB64);
}

function validateAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  if (signToken(payloadB64) !== sig) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function checkAdminLogin(user, password) {
  const u = process.env.ADMIN_USER || '';
  const p = process.env.ADMIN_PASSWORD || '';
  if (!u || !p) return { ok: false, error: 'admin_not_configured' };
  if (user !== u || password !== p) return { ok: false, error: 'invalid_credentials' };
  const token = createAdminToken();
  if (!token) return { ok: false, error: 'admin_not_configured' };
  return { ok: true, token, expiresIn: Math.floor(TTL_MS / 1000) };
}

module.exports = { createAdminToken, validateAdminToken, checkAdminLogin };
