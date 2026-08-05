function getCreateClient() {
  try {
    return require('@supabase/supabase-js').createClient;
  } catch {
    return null;
  }
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

function serviceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

function anonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  );
}

function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

function restConfig() {
  const base = supabaseUrl().replace(/\/$/, '');
  const key = serviceRoleKey();
  if (!base || !key) return null;
  return { base, key };
}

function restHeaders(key, extra) {
  return Object.assign(
    {
      apikey: key,
      Authorization: 'Bearer ' + key,
    },
    extra || {}
  );
}

async function restFetch(path, options) {
  const cfg = restConfig();
  if (!cfg) return { ok: false, error: 'supabase_not_configured' };
  const url = cfg.base + path;
  const headers = restHeaders(cfg.key, options && options.headers);
  let res;
  try {
    res = await fetch(url, Object.assign({}, options, { headers }));
  } catch (e) {
    return { ok: false, error: 'supabase_network', detail: String(e.message || e) };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'supabase_http_' + res.status, detail: text.slice(0, 300) };
  }
  if (!text) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'supabase_invalid_json', detail: text.slice(0, 120) };
  }
}

async function restSelect(table, query) {
  return restFetch('/rest/v1/' + table + '?' + query, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function restInsert(table, row, prefer) {
  return restFetch('/rest/v1/' + table, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function restPatch(table, query, patch) {
  return restFetch('/rest/v1/' + table + '?' + query, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

async function restDelete(table, query) {
  return restFetch('/rest/v1/' + table + '?' + query, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

async function restRpc(fn, body) {
  return restFetch('/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
}

function getServiceClient() {
  const createClient = getCreateClient();
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!createClient || !url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sesión Supabase Auth para Realtime en el navegador del admin */
async function createAdminSupabaseSession() {
  const base = supabaseUrl().replace(/\/$/, '');
  const anon = anonKey().trim();
  const email = process.env.SUPABASE_ADMIN_EMAIL;
  const password = process.env.SUPABASE_ADMIN_PASSWORD;
  if (!base || !anon || !email || !password) return null;

  const createClient = getCreateClient();
  if (createClient) {
    try {
      const sb = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      var { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data && data.session) {
        return {
          url: base,
          anonKey: anon,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
        };
      }
    } catch {
      /* fallback REST abajo */
    }
  }

  try {
    const res = await fetch(base + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: 'Bearer ' + anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) return null;
    return {
      url: base,
      anonKey: anon,
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
    };
  } catch {
    return null;
  }
}

module.exports = {
  isSupabaseConfigured,
  getServiceClient,
  createAdminSupabaseSession,
  restSelect,
  restInsert,
  restPatch,
  restDelete,
  restRpc,
};
