const { restSelect, restInsert, restPatch } = require('./supabaseServer');
const { telNorm } = require('./bravaCoupons');

const TOPIC_SEEDS = {
  'Cliente no atiende':
    'Estoy en la puerta y no me atienden (timbre/teléfono). ¿Les avisan ustedes?',
  'Dirección / GPS': 'No encuentro bien la dirección / el GPS no coincide. ¿Me confirman?',
  'Pago / cobro': 'Tengo un problema con el cobro o el monto del pedido. ¿Qué hago?',
  'Producto / pedido': 'El pedido no coincide (falta/sobra). Necesito indicaciones.',
  Otro: 'Necesito ayuda con esta entrega:',
};

function isMissingSupport(r) {
  const blob = String((r && r.detail) || (r && r.error) || '').toLowerCase();
  return blob.indexOf('repartidor_support') >= 0 || blob.indexOf('pgrst205') >= 0 || blob.indexOf('42p01') >= 0;
}

function rowToThread(row) {
  if (!row) return null;
  return {
    id: row.id,
    repartidor_tel: row.repartidor_tel,
    orn: row.orn,
    parada: row.parada,
    topic: row.topic || '',
    status: row.status,
    closed_by: row.closed_by || null,
    creado_at: row.creado_at,
    cerrado_at: row.cerrado_at,
    actualizado_at: row.actualizado_at,
  };
}

async function getOpenThread(repartidorTel, orn) {
  const tel = telNorm(repartidorTel);
  const o = String(orn || '').trim();
  if (!tel || !o) return { ok: true, thread: null };
  const r = await restSelect(
    'repartidor_support_threads',
    'select=*&repartidor_tel=eq.' +
      encodeURIComponent(tel) +
      '&orn=eq.' +
      encodeURIComponent(o) +
      '&status=eq.open&order=actualizado_at.desc&limit=1'
  );
  if (!r.ok) {
    if (isMissingSupport(r)) return { ok: false, error: 'support_schema_missing' };
    return { ok: false, error: r.error || 'lookup_failed', detail: r.detail };
  }
  return { ok: true, thread: rowToThread(r.data && r.data[0]) };
}

async function listThreadMessages(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return { ok: false, error: 'missing_thread' };
  const r = await restSelect(
    'repartidor_support_messages',
    'select=id,thread_id,sender,body,creado_at&thread_id=eq.' +
      encodeURIComponent(id) +
      '&order=creado_at.asc'
  );
  if (!r.ok) {
    if (isMissingSupport(r)) return { ok: false, error: 'support_schema_missing' };
    return { ok: false, error: r.error || 'list_failed', detail: r.detail };
  }
  return { ok: true, messages: Array.isArray(r.data) ? r.data : [] };
}

async function insertMessage(threadId, sender, body) {
  const ins = await restInsert('repartidor_support_messages', {
    thread_id: threadId,
    sender: sender,
    body: String(body || '').trim(),
  });
  if (!ins.ok) return ins;
  await restPatch('repartidor_support_threads', 'id=eq.' + encodeURIComponent(threadId), {
    actualizado_at: new Date().toISOString(),
  });
  return { ok: true, message: ins.data && ins.data[0] };
}

async function openSupportThread(repartidorTel, body) {
  const tel = telNorm(repartidorTel);
  const orn = String(body.orn || '').trim();
  const topic = String(body.topic || '').trim();
  const parada = body.parada != null ? parseInt(body.parada, 10) : null;
  if (!tel || !orn || !topic) return { ok: false, error: 'missing_fields' };

  let open = await getOpenThread(tel, orn);
  if (!open.ok) return open;
  if (open.thread) {
    const msgs = await listThreadMessages(open.thread.id);
    if (!msgs.ok) return msgs;
    return { ok: true, thread: open.thread, messages: msgs.messages, reopened: false };
  }

  const ins = await restInsert('repartidor_support_threads', {
    repartidor_tel: tel,
    orn: orn,
    parada: Number.isFinite(parada) ? parada : null,
    topic: topic,
    status: 'open',
  });
  if (!ins.ok) {
    if (isMissingSupport(ins)) return { ok: false, error: 'support_schema_missing' };
    return { ok: false, error: ins.error || 'create_failed', detail: ins.detail };
  }
  const thread = rowToThread(ins.data && ins.data[0]);
  if (!thread) return { ok: false, error: 'create_failed' };

  await insertMessage(thread.id, 'system', 'Chat abierto · cocina responde desde Admin → Soporte');
  const seed =
    String(body.message || '').trim() ||
    TOPIC_SEEDS[topic] ||
    'Tema: ' + topic + ' · ' + orn + (parada != null ? ' · Parada ' + parada : '');
  const riderMsg = await insertMessage(thread.id, 'rider', seed);
  if (!riderMsg.ok) return riderMsg;

  const msgs = await listThreadMessages(thread.id);
  return { ok: true, thread: thread, messages: msgs.ok ? msgs.messages : [], reopened: true };
}

async function getSupportState(repartidorTel, orn) {
  const tel = telNorm(repartidorTel);
  const o = String(orn || '').trim();
  if (!tel || !o) return { ok: false, error: 'missing_fields' };
  const r = await restSelect(
    'repartidor_support_threads',
    'select=*&repartidor_tel=eq.' +
      encodeURIComponent(tel) +
      '&orn=eq.' +
      encodeURIComponent(o) +
      '&order=actualizado_at.desc&limit=1'
  );
  if (!r.ok) {
    if (isMissingSupport(r)) return { ok: false, error: 'support_schema_missing' };
    return { ok: false, error: r.error || 'lookup_failed', detail: r.detail };
  }
  const thread = rowToThread(r.data && r.data[0]);
  if (!thread) return { ok: true, thread: null, messages: [] };
  const msgs = await listThreadMessages(thread.id);
  if (!msgs.ok) return msgs;
  return { ok: true, thread: thread, messages: msgs.messages };
}

async function sendRiderSupportMessage(repartidorTel, body) {
  const tel = telNorm(repartidorTel);
  const threadId = String(body.thread_id || body.threadId || '').trim();
  const text = String(body.message || body.body || '').trim();
  if (!tel || !threadId || !text) return { ok: false, error: 'missing_fields' };

  const th = await restSelect(
    'repartidor_support_threads',
    'select=*&id=eq.' + encodeURIComponent(threadId) + '&limit=1'
  );
  if (!th.ok) return { ok: false, error: th.error || 'lookup_failed' };
  const row = th.data && th.data[0];
  if (!row) return { ok: false, error: 'thread_not_found' };
  if (telNorm(row.repartidor_tel) !== tel) return { ok: false, error: 'forbidden' };
  if (row.status !== 'open') return { ok: false, error: 'thread_closed' };

  const sent = await insertMessage(threadId, 'rider', text);
  if (!sent.ok) return sent;
  const msgs = await listThreadMessages(threadId);
  return { ok: true, message: sent.message, messages: msgs.ok ? msgs.messages : [] };
}

async function closeSupportThread(repartidorTel, body, closedBy) {
  const tel = telNorm(repartidorTel);
  const threadId = String(body.thread_id || body.threadId || '').trim();
  const by = closedBy || 'rider';
  if (!threadId) return { ok: false, error: 'missing_thread' };

  const th = await restSelect(
    'repartidor_support_threads',
    'select=*&id=eq.' + encodeURIComponent(threadId) + '&limit=1'
  );
  if (!th.ok) return { ok: false, error: th.error || 'lookup_failed' };
  const row = th.data && th.data[0];
  if (!row) return { ok: false, error: 'thread_not_found' };
  if (tel && telNorm(row.repartidor_tel) !== tel) return { ok: false, error: 'forbidden' };
  if (row.status === 'closed') return { ok: true, thread: rowToThread(row) };

  let sysText = 'Chat finalizado.';
  if (by === 'rider') sysText = 'El repartidor cerró el chat.';
  else if (by === 'cocina') sysText = 'Cocina cerró el soporte de este pedido.';
  else if (by === 'delivery') sysText = 'Chat finalizado · pedido entregado.';

  await insertMessage(threadId, 'system', sysText);
  const patch = await restPatch('repartidor_support_threads', 'id=eq.' + encodeURIComponent(threadId), {
    status: 'closed',
    closed_by: by,
    cerrado_at: new Date().toISOString(),
    actualizado_at: new Date().toISOString(),
  });
  if (!patch.ok) return { ok: false, error: patch.error || 'close_failed', detail: patch.detail };
  return { ok: true };
}

async function closeSupportByOrn(repartidorTel, orn, closedBy) {
  const open = await getOpenThread(repartidorTel, orn);
  if (!open.ok || !open.thread) return open.ok ? { ok: true, skipped: true } : open;
  return closeSupportThread(repartidorTel, { thread_id: open.thread.id }, closedBy || 'delivery');
}

async function listSupportThreadsAdmin(opts) {
  const status = opts && opts.status ? String(opts.status) : '';
  let q = 'select=*&order=actualizado_at.desc&limit=80';
  if (status === 'open' || status === 'closed') {
    q =
      'select=*&status=eq.' + encodeURIComponent(status) + '&order=actualizado_at.desc&limit=80';
  }
  const r = await restSelect('repartidor_support_threads', q);
  if (!r.ok) {
    if (isMissingSupport(r)) return { ok: false, error: 'support_schema_missing' };
    return { ok: false, error: r.error || 'list_failed', detail: r.detail };
  }
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, threads: rows.map(rowToThread).filter(Boolean) };
}

async function adminGetSupportThread(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return { ok: false, error: 'missing_thread' };
  const th = await restSelect(
    'repartidor_support_threads',
    'select=*&id=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  if (!th.ok) return { ok: false, error: th.error || 'lookup_failed' };
  const thread = rowToThread(th.data && th.data[0]);
  if (!thread) return { ok: false, error: 'not_found' };
  const msgs = await listThreadMessages(id);
  if (!msgs.ok) return msgs;
  return { ok: true, thread: thread, messages: msgs.messages };
}

async function adminSendSupportMessage(threadId, text) {
  const id = String(threadId || '').trim();
  const body = String(text || '').trim();
  if (!id || !body) return { ok: false, error: 'missing_fields' };
  const th = await restSelect(
    'repartidor_support_threads',
    'select=status&id=eq.' + encodeURIComponent(id) + '&limit=1'
  );
  if (!th.ok) return { ok: false, error: th.error || 'lookup_failed' };
  const row = th.data && th.data[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'open') return { ok: false, error: 'thread_closed' };
  const sent = await insertMessage(id, 'admin', body);
  if (!sent.ok) return sent;
  const msgs = await listThreadMessages(id);
  return { ok: true, messages: msgs.ok ? msgs.messages : [] };
}

module.exports = {
  openSupportThread,
  getSupportState,
  sendRiderSupportMessage,
  closeSupportThread,
  closeSupportByOrn,
  listSupportThreadsAdmin,
  adminGetSupportThread,
  adminSendSupportMessage,
  listThreadMessages,
  TOPIC_SEEDS,
};
