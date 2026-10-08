const { restSelect, restInsert, restPatch, restDelete } = require('./supabaseServer');
const { telNorm } = require('./bravaCoupons');
const {
  normalizeLogin,
  hashPassword,
  verifyPassword,
  generateRepartidorPassword,
  createRepartidorToken,
  REPARTIDOR_TOKEN_TTL_SEC,
} = require('./repartidorAuth');

function rowToUser(row) {
  if (!row) return null;
  return {
    login: row.login,
    telefono: row.telefono || '',
    nombre: row.nombre || '',
    activo: row.activo !== false,
    creado_at: row.creado_at,
  };
}

async function listRepartidorUsers() {
  const r = await restSelect(
    'repartidor_users',
    'select=login,telefono,nombre,activo,creado_at&order=nombre.asc,login.asc'
  );
  if (!r.ok) {
    if (isTableMissing(r)) {
      return { ok: false, error: 'repartidor_users_schema_missing', hint: 'Ejecutá migrateRepartidorUsers en admin' };
    }
    return { ok: false, error: r.error || 'list_failed', detail: r.detail };
  }
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, users: rows.map(rowToUser).filter(Boolean) };
}

function isTableMissing(r) {
  const blob = String((r && r.detail) || (r && r.error) || '').toLowerCase();
  return blob.indexOf('repartidor_users') >= 0 || blob.indexOf('pgrst205') >= 0 || blob.indexOf('42p01') >= 0;
}

async function getRepartidorUserByLogin(login) {
  const id = normalizeLogin(login);
  if (!id) return { ok: true, user: null };
  const r = await restSelect(
    'repartidor_users',
    'select=login,telefono,nombre,password_hash,activo&login=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  if (!r.ok) return { ok: false, error: r.error || 'lookup_failed', detail: r.detail };
  if (!r.data || !r.data[0]) return { ok: true, user: null };
  const row = r.data[0];
  return {
    ok: true,
    user: {
      login: row.login,
      telefono: row.telefono,
      nombre: row.nombre,
      password_hash: row.password_hash,
      activo: row.activo !== false,
    },
  };
}

async function repartidorLogin(login, password) {
  const id = normalizeLogin(login);
  if (!id || !password) return { ok: false, error: 'missing_credentials' };
  const got = await getRepartidorUserByLogin(id);
  if (!got.ok) return got;
  if (!got.user) return { ok: false, error: 'invalid_credentials' };
  if (!got.user.activo) return { ok: false, error: 'user_inactive' };
  if (!verifyPassword(password, got.user.password_hash)) {
    return { ok: false, error: 'invalid_credentials' };
  }
  const token = createRepartidorToken(got.user);
  if (!token) return { ok: false, error: 'auth_not_configured' };
  return {
    ok: true,
    token: token,
    expiresIn: REPARTIDOR_TOKEN_TTL_SEC,
    login: got.user.login,
    nombre: got.user.nombre,
    telefono: telNorm(got.user.telefono),
  };
}

async function createRepartidorUser(body) {
  const login = normalizeLogin(body.login);
  const nombre = String(body.nombre || body.name || login).trim();
  const tel = telNorm(body.telefono || body.tel);
  if (!login || login.length < 2) return { ok: false, error: 'invalid_login' };
  if (!tel) return { ok: false, error: 'missing_telefono' };

  const exists = await getRepartidorUserByLogin(login);
  if (!exists.ok) return exists;
  if (exists.user) return { ok: false, error: 'login_taken' };

  const plain = String(body.password || '').trim() || generateRepartidorPassword();
  const row = {
    login: login,
    telefono: tel,
    nombre: nombre,
    password_hash: hashPassword(plain),
    activo: true,
  };
  const ins = await restInsert('repartidor_users', row);
  if (!ins.ok) {
    if (isTableMissing(ins)) {
      return { ok: false, error: 'repartidor_users_schema_missing' };
    }
    return { ok: false, error: ins.error || 'create_failed', detail: ins.detail };
  }
  return {
    ok: true,
    user: { login: login, nombre: nombre, telefono: tel, activo: true },
    password: plain,
  };
}

async function resetRepartidorUserPassword(login) {
  const id = normalizeLogin(login);
  if (!id) return { ok: false, error: 'invalid_login' };
  const got = await getRepartidorUserByLogin(id);
  if (!got.ok) return got;
  if (!got.user) return { ok: false, error: 'user_not_found' };
  const plain = generateRepartidorPassword();
  const r = await restPatch('repartidor_users', 'login=eq.' + encodeURIComponent(id), {
    password_hash: hashPassword(plain),
    actualizado_at: new Date().toISOString(),
  });
  if (!r.ok) return { ok: false, error: r.error || 'reset_failed', detail: r.detail };
  return { ok: true, login: id, password: plain };
}

async function setRepartidorUserActive(login, activo) {
  const id = normalizeLogin(login);
  if (!id) return { ok: false, error: 'invalid_login' };
  const r = await restPatch('repartidor_users', 'login=eq.' + encodeURIComponent(id), {
    activo: !!activo,
    actualizado_at: new Date().toISOString(),
  });
  if (!r.ok) return { ok: false, error: r.error || 'update_failed', detail: r.detail };
  return { ok: true, login: id, activo: !!activo };
}

async function deleteRepartidorUser(login) {
  const id = normalizeLogin(login);
  if (!id) return { ok: false, error: 'invalid_login' };
  const got = await getRepartidorUserByLogin(id);
  if (!got.ok) return got;
  if (!got.user) return { ok: false, error: 'user_not_found' };
  const r = await restDelete('repartidor_users', 'login=eq.' + encodeURIComponent(id));
  if (!r.ok) return { ok: false, error: r.error || 'delete_failed', detail: r.detail };
  return { ok: true, login: id };
}

module.exports = {
  listRepartidorUsers,
  repartidorLogin,
  createRepartidorUser,
  resetRepartidorUserPassword,
  setRepartidorUserActive,
  deleteRepartidorUser,
};
