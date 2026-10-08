const { restSelect, restInsert, restPatch } = require('./supabaseServer');
const { telNorm } = require('./bravaCoupons');
const { normalizeLogin, hashPassword, verifyPassword } = require('./repartidorAuth');

async function getRepartidorUserByLogin(login) {
  const id = normalizeLogin(login);
  if (!id) return { ok: true, user: null };
  const r = await restSelect(
    'repartidor_users',
    'select=login&login=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  if (!r.ok) return { ok: false, error: r.error || 'lookup_failed', detail: r.detail };
  return { ok: true, user: r.data && r.data[0] ? r.data[0] : null };
}

function isMissingTable(r) {
  const blob = String((r && r.detail) || (r && r.error) || '').toLowerCase();
  return blob.indexOf('repartidor_signup') >= 0 || blob.indexOf('pgrst205') >= 0 || blob.indexOf('42p01') >= 0;
}

function proposeLogin(nombre, apellido) {
  const fromAp = normalizeLogin(apellido);
  if (fromAp.length >= 2) return fromAp;
  const fromNom = normalizeLogin(nombre);
  if (fromNom.length >= 2) return fromNom;
  return '';
}

async function submitRepartidorSignup(body) {
  const nombre = String(body.nombre || body.name || '').trim();
  const apellido = String(body.apellido || '').trim();
  const tel = telNorm(body.telefono || body.tel);
  const password = String(body.password || '').trim();
  if (!nombre || !apellido) return { ok: false, error: 'missing_name' };
  if (!tel || tel.length < 8) return { ok: false, error: 'invalid_telefono' };
  if (password.length < 6) return { ok: false, error: 'weak_password' };

  const login = proposeLogin(nombre, apellido);
  if (!login || login.length < 2) return { ok: false, error: 'invalid_login' };

  const existsUser = await getRepartidorUserByLogin(login);
  if (!existsUser.ok) return existsUser;
  if (existsUser.user) return { ok: false, error: 'login_taken' };

  const pending = await restSelect(
    'repartidor_signup_requests',
    'select=id&login_requested=eq.' +
      encodeURIComponent(login) +
      '&status=eq.pending&limit=1'
  );
  if (!pending.ok) {
    if (isMissingTable(pending)) return { ok: false, error: 'signup_schema_missing' };
    return { ok: false, error: pending.error || 'lookup_failed', detail: pending.detail };
  }
  if (pending.data && pending.data[0]) return { ok: false, error: 'signup_pending_exists' };

  const row = {
    nombre: nombre,
    apellido: apellido,
    telefono: tel,
    login_requested: login,
    password_hash: hashPassword(password),
    status: 'pending',
  };
  const ins = await restInsert('repartidor_signup_requests', row);
  if (!ins.ok) {
    if (isMissingTable(ins)) return { ok: false, error: 'signup_schema_missing' };
    return { ok: false, error: ins.error || 'create_failed', detail: ins.detail };
  }
  const created = ins.data && ins.data[0] ? ins.data[0] : null;
  return {
    ok: true,
    request: {
      id: created && created.id,
      login: login,
      nombre: nombre + ' ' + apellido,
      telefono: tel,
      status: 'pending',
    },
  };
}

async function listRepartidorSignupRequests(status) {
  const st = status || 'pending';
  const r = await restSelect(
    'repartidor_signup_requests',
    'select=id,nombre,apellido,telefono,login_requested,status,creado_at&status=eq.' +
      encodeURIComponent(st) +
      '&order=creado_at.desc'
  );
  if (!r.ok) {
    if (isMissingTable(r)) return { ok: false, error: 'signup_schema_missing' };
    return { ok: false, error: r.error || 'list_failed', detail: r.detail };
  }
  const rows = Array.isArray(r.data) ? r.data : [];
  return {
    ok: true,
    requests: rows.map(function (row) {
      return {
        id: row.id,
        nombre: row.nombre,
        apellido: row.apellido,
        telefono: row.telefono,
        login: row.login_requested,
        status: row.status,
        creado_at: row.creado_at,
      };
    }),
  };
}

/** Login fallido: si hay solicitud pending con misma clave, devolver datos para la app. */
async function repartidorPendingSignupLogin(login, password) {
  const id = normalizeLogin(login);
  if (!id || !password) return null;
  const r = await restSelect(
    'repartidor_signup_requests',
    'select=nombre,apellido,telefono,login_requested,password_hash,status&login_requested=eq.' +
      encodeURIComponent(id) +
      '&status=eq.pending&limit=1'
  );
  if (!r.ok) {
    if (isMissingTable(r)) return null;
    return null;
  }
  const row = r.data && r.data[0];
  if (!row || !row.password_hash) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return {
    ok: false,
    error: 'signup_pending',
    signup_pending: {
      nombre: String(row.nombre || '').trim(),
      apellido: String(row.apellido || '').trim(),
      telefono: telNorm(row.telefono),
      login: String(row.login_requested || id).trim(),
    },
  };
}

async function rejectRepartidorSignup(id) {
  const rid = String(id || '').trim();
  if (!rid) return { ok: false, error: 'missing_id' };
  const r = await restPatch('repartidor_signup_requests', 'id=eq.' + encodeURIComponent(rid), {
    status: 'rejected',
    resuelto_at: new Date().toISOString(),
  });
  if (!r.ok) return { ok: false, error: r.error || 'reject_failed', detail: r.detail };
  return { ok: true };
}

async function approveRepartidorSignup(id) {
  const rid = String(id || '').trim();
  if (!rid) return { ok: false, error: 'missing_id' };
  const got = await restSelect(
    'repartidor_signup_requests',
    'select=*&id=eq.' + encodeURIComponent(rid) + '&limit=1'
  );
  if (!got.ok) return { ok: false, error: got.error || 'lookup_failed', detail: got.detail };
  const row = got.data && got.data[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'not_pending' };

  const login = normalizeLogin(row.login_requested);
  const exists = await getRepartidorUserByLogin(login);
  if (!exists.ok) return exists;
  if (exists.user) {
    await rejectRepartidorSignup(rid);
    return { ok: false, error: 'login_taken' };
  }

  const nombreFull = String(row.nombre || '').trim() + ' ' + String(row.apellido || '').trim();
  const userRow = {
    login: login,
    telefono: telNorm(row.telefono),
    nombre: nombreFull.trim(),
    password_hash: row.password_hash,
    activo: true,
  };
  const ins = await restInsert('repartidor_users', userRow);
  if (!ins.ok) return { ok: false, error: ins.error || 'user_create_failed', detail: ins.detail };

  await restPatch('repartidor_signup_requests', 'id=eq.' + encodeURIComponent(rid), {
    status: 'approved',
    resuelto_at: new Date().toISOString(),
  });

  return {
    ok: true,
    user: { login: login, nombre: userRow.nombre, telefono: userRow.telefono, activo: true },
    selfPassword: true,
  };
}

module.exports = {
  submitRepartidorSignup,
  listRepartidorSignupRequests,
  approveRepartidorSignup,
  rejectRepartidorSignup,
  proposeLogin,
  repartidorPendingSignupLogin,
};
