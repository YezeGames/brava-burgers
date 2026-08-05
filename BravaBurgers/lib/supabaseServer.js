const { createClient } = require('@supabase/supabase-js');

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function serviceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  );
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

function getServiceClient() {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sesión Supabase Auth para Realtime en el navegador del admin */
async function createAdminSupabaseSession() {
  const sb = getServiceClient();
  const email = process.env.SUPABASE_ADMIN_EMAIL;
  const password = process.env.SUPABASE_ADMIN_PASSWORD;
  if (!sb || !email || !password) return null;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return {
    url: supabaseUrl(),
    anonKey: anonKey(),
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  };
}

module.exports = { isSupabaseConfigured, getServiceClient, createAdminSupabaseSession };
