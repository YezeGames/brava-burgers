const { isSupabaseConfigured, restInsert, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient } = require('./whatsappMeta');

async function insertWaMessage({ messageId, tel, direction, body }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'supabase_not_configured' };
  }
  const normalized = normalizeWaRecipient(tel);
  const text = String(body || '').trim();
  if (!normalized || !text) {
    return { ok: false, error: 'invalid_params' };
  }
  const row = {
    wa_message_id: messageId ? String(messageId) : null,
    tel: normalized,
    direction: direction === 'out' ? 'out' : 'in',
    body: text,
  };
  const prefer = messageId ? 'return=minimal,resolution=ignore-duplicates' : 'return=minimal';
  return restInsert('wa_messages', row, prefer);
}

async function listWaMessages(opts) {
  opts = opts || {};
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'supabase_not_configured', messages: [] };
  }
  const lim = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  let q =
    'select=id,tel,direction,body,created_at,wa_message_id&order=created_at.asc&limit=' + lim;
  if (opts.since) {
    q += '&created_at=gt.' + encodeURIComponent(String(opts.since));
  } else {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    q += '&created_at=gt.' + encodeURIComponent(since);
  }
  const res = await restSelect('wa_messages', q);
  if (!res.ok) {
    return { ok: false, error: res.error, detail: res.detail, messages: [] };
  }
  return { ok: true, messages: res.data || [] };
}

module.exports = { insertWaMessage, listWaMessages };
