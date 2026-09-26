const crypto = require('crypto');
const { telNorm } = require('./bravaCoupons');

const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.BRAVA_ORDER_SECRET || '';
}

function signToken(payloadB64) {
  return crypto.createHmac('sha256', sessionSecret()).update(payloadB64).digest('base64url');
}

function normalizeLogin(login) {
  return String(login || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return 'scrypt:' + salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const hash = crypto.scryptSync(String(password), parts[1], 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(parts[2], 'hex'));
  } catch {
    return false;
  }
}

function generateRepartidorPassword() {
  const n = crypto.randomInt(100000, 999999);
  return 'Brava-' + n;
}

function createRepartidorToken(user) {
  const secret = sessionSecret();
  if (!secret) return null;
  const tel = telNorm(user.telefono);
  if (!tel) return null;
  const payload = {
    v: 1,
    role: 'repartidor',
    sub: normalizeLogin(user.login),
    tel: tel,
    nombre: String(user.nombre || '').trim(),
    exp: Date.now() + TTL_MS,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return payloadB64 + '.' + signToken(payloadB64);
}

function validateRepartidorToken(token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'missing_token' };
  }
  const secret = sessionSecret();
  if (!secret) return { ok: false, error: 'auth_not_configured' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid_token' };
  const [payloadB64, sig] = parts;
  if (signToken(payloadB64) !== sig) return { ok: false, error: 'invalid_token' };
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.role !== 'repartidor') return { ok: false, error: 'invalid_token' };
    if (!payload.exp || Date.now() > payload.exp) return { ok: false, error: 'token_expired' };
    const tel = telNorm(payload.tel);
    if (!tel) return { ok: false, error: 'invalid_token' };
    return {
      ok: true,
      login: payload.sub || '',
      telefono: tel,
      nombre: payload.nombre || '',
      exp: payload.exp,
    };
  } catch {
    return { ok: false, error: 'invalid_token' };
  }
}

module.exports = {
  normalizeLogin,
  hashPassword,
  verifyPassword,
  generateRepartidorPassword,
  createRepartidorToken,
  validateRepartidorToken,
  REPARTIDOR_TOKEN_TTL_SEC: Math.floor(TTL_MS / 1000),
};
