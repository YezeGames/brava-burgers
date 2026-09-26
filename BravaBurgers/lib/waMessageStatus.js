const { isSupabaseConfigured, restFetch, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient } = require('./whatsappMeta');
const { ensureWaDeliverySchema } = require('./waDeliverySchema');

function metaTimestampFromUnix(ts) {
  const n = Number(ts);
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

async function upsertWaMessageStatus(row) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'supabase_not_configured' };
  }
  const wamid = String(row.wa_message_id || '').trim();
  const status = String(row.status || '').trim();
  if (!wamid || !status) {
    return { ok: false, error: 'invalid_params' };
  }
  const payload = {
    wa_message_id: wamid,
    tel: normalizeWaRecipient(row.tel || '') || String(row.tel || ''),
    status: status,
    error_code: row.error_code != null && row.error_code !== '' ? Number(row.error_code) : null,
    error_title: row.error_title ? String(row.error_title).slice(0, 500) : null,
    error_details: row.error_details ? String(row.error_details).slice(0, 1000) : null,
    meta_timestamp: row.meta_timestamp || null,
  };
  return restFetch('/rest/v1/wa_message_status?on_conflict=wa_message_id,status', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Persiste status del webhook (sent, delivered, read, failed).
 */
async function recordWaMessageStatus(ev) {
  await ensureWaDeliverySchema();
  if (!ev || !ev.messageId) {
    return { ok: false, error: 'missing_message_id' };
  }
  const saved = await upsertWaMessageStatus({
    wa_message_id: ev.messageId,
    tel: ev.recipientId || '',
    status: ev.status,
    error_code: ev.statusErrorCode,
    error_title: ev.statusError || '',
    error_details: ev.statusErrorDetails || '',
    meta_timestamp: metaTimestampFromUnix(ev.timestamp),
  });
  if (!saved.ok && saved.detail && String(saved.detail).indexOf('wa_message_status') >= 0) {
    console.warn('[wa-delivery] upsert failed (¿migrar wa_message_status?)', saved.detail.slice(0, 200));
  }
  return saved;
}

async function getWaMessageStatuses(waMessageId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'supabase_not_configured', statuses: [] };
  }
  await ensureWaDeliverySchema();
  const wamid = String(waMessageId || '').trim();
  if (!wamid) {
    return { ok: false, error: 'missing_wamid', statuses: [] };
  }
  const q =
    'select=wa_message_id,tel,status,error_code,error_title,error_details,meta_timestamp,created_at' +
    '&wa_message_id=eq.' +
    encodeURIComponent(wamid) +
    '&order=created_at.asc';
  const res = await restSelect('wa_message_status', q);
  if (!res.ok) {
    return { ok: false, error: res.error, detail: res.detail, statuses: [] };
  }
  return { ok: true, statuses: res.data || [] };
}

function summarizeDelivery(statuses) {
  const rows = Array.isArray(statuses) ? statuses : [];
  var last = null;
  var failed = null;
  rows.forEach(function (r) {
    last = r;
    if (r.status === 'failed') failed = r;
  });
  return {
    lastStatus: last ? last.status : null,
    failed: failed,
    delivered: rows.some(function (r) {
      return r.status === 'delivered' || r.status === 'read';
    }),
    count: rows.length,
  };
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/** Espera webhooks de Meta y devuelve filas guardadas (diagnóstico). */
async function waitForWaMessageStatuses(waMessageId, opts) {
  opts = opts || {};
  const attempts = Math.min(Math.max(Number(opts.attempts) || 4, 1), 10);
  const delayMs = Math.min(Math.max(Number(opts.delayMs) || 1500, 500), 5000);
  var last = { ok: true, statuses: [] };
  for (var i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    last = await getWaMessageStatuses(waMessageId);
    if (!last.ok) return last;
    const sum = summarizeDelivery(last.statuses);
    if (sum.failed || sum.delivered || sum.lastStatus === 'sent') {
      return Object.assign({}, last, { summary: sum, attempts: i + 1 });
    }
  }
  return Object.assign({}, last, {
    summary: summarizeDelivery(last.statuses),
    attempts: attempts,
    pending: true,
  });
}

module.exports = {
  recordWaMessageStatus,
  getWaMessageStatuses,
  summarizeDelivery,
  waitForWaMessageStatuses,
};
