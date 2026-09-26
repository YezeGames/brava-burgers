const { isSupabaseConfigured, restSelect, restInsert, restPatch } = require('./supabaseServer');
const { normalizeWaRecipient } = require('./whatsappMeta');

function tableMissing(res) {
  if (!res || res.ok) return false;
  const d = String(res.detail || res.error || '');
  return d.indexOf('wa_reclamo') >= 0 || d.indexOf('PGRST205') >= 0 || d.indexOf('42P01') >= 0;
}

async function getReclamoSession(tel) {
  const normalized = normalizeWaRecipient(tel);
  if (!normalized || !isSupabaseConfigured()) return null;
  const r = await restSelect(
    'wa_reclamo_sessions',
    'select=*&tel=eq.' + encodeURIComponent(normalized) + '&limit=1'
  );
  if (!r.ok) {
    if (tableMissing(r)) return null;
    return null;
  }
  if (!r.data || !r.data.length) return null;
  return r.data[0];
}

async function upsertReclamoSession(tel, fields) {
  const normalized = normalizeWaRecipient(tel);
  if (!normalized || !isSupabaseConfigured()) return { ok: false, error: 'not_configured' };
  const existing = await getReclamoSession(normalized);
  const row = Object.assign({ updated_at: new Date().toISOString() }, fields || {});
  if (existing) {
    return restPatch('wa_reclamo_sessions', 'tel=eq.' + encodeURIComponent(normalized), row);
  }
  row.tel = normalized;
  return restInsert('wa_reclamo_sessions', row);
}

async function insertReclamo(row) {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not_configured' };
  return restInsert('wa_reclamos', row);
}

async function getReclamoByOrn(orn) {
  const o = String(orn || '').trim();
  if (!o || !isSupabaseConfigured()) return null;
  const r = await restSelect(
    'wa_reclamos',
    'select=*&orn=eq.' + encodeURIComponent(o) + '&order=created_at.desc&limit=1'
  );
  if (!r.ok || !r.data || !r.data.length) return null;
  return r.data[0];
}

async function markReclamosCompensadoForOrn(orn) {
  const o = String(orn || '').trim();
  if (!o || !isSupabaseConfigured()) return { ok: false, error: 'not_configured' };
  return restPatch('wa_reclamos', 'orn=eq.' + encodeURIComponent(o), {
    estado: 'compensado',
  });
}

module.exports = {
  getReclamoSession,
  upsertReclamoSession,
  insertReclamo,
  getReclamoByOrn,
  markReclamosCompensadoForOrn,
};
