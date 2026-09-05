const { isSupabaseConfigured, restInsert, restSelect } = require('./supabaseServer');
const { normalizeWaRecipient } = require('./whatsappMeta');

const AUTO_WELCOME_MARKER = '__auto_welcome__';
const AUTO_CONSULTA_MARKER = '__auto_consulta__';
const WA_MEDIA_PREFIX = '__wa_media__:';

function encodeWaMediaBody(mediaType, mediaId, caption, fileName) {
  return (
    WA_MEDIA_PREFIX +
    JSON.stringify({
      t: String(mediaType || 'image'),
      id: String(mediaId || ''),
      c: String(caption || ''),
      f: String(fileName || ''),
    })
  );
}

function parseWaMessageBody(raw) {
  const body = String(raw || '');
  if (!body.startsWith(WA_MEDIA_PREFIX)) {
    return { body: body, mediaType: '', mediaId: '', caption: '' };
  }
  try {
    const j = JSON.parse(body.slice(WA_MEDIA_PREFIX.length));
    return {
      body: body,
      mediaType: j.t || 'image',
      mediaId: j.id || '',
      caption: j.c || '',
      fileName: j.f || '',
    };
  } catch (e) {
    return { body: body, mediaType: '', mediaId: '', caption: '' };
  }
}

function displayTextForBody(raw) {
  const p = parseWaMessageBody(raw);
  if (p.mediaId && p.mediaType === 'image') {
    return p.caption || '📷 Imagen';
  }
  if (p.mediaId && (p.mediaType === 'pdf' || p.mediaType === 'document')) {
    return p.caption || (p.fileName ? '📄 ' + p.fileName : '📄 PDF');
  }
  return p.caption || p.body || raw;
}

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
  const prefer = messageId
    ? 'return=representation,resolution=ignore-duplicates'
    : 'return=representation';
  const inserted = await restInsert('wa_messages', row, prefer);
  if (!inserted.ok) return inserted;
  const rowData = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  return { ok: true, id: rowData && rowData.id != null ? rowData.id : null };
}

async function listWaMessages(opts) {
  opts = opts || {};
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'supabase_not_configured', messages: [] };
  }
  const lim = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  let q =
    'select=id,tel,direction,body,created_at,wa_message_id&body=neq.' +
    encodeURIComponent(AUTO_WELCOME_MARKER) +
    '&body=neq.' +
    encodeURIComponent(AUTO_CONSULTA_MARKER) +
    '&order=created_at.asc&limit=' +
    lim;
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

module.exports = {
  insertWaMessage,
  listWaMessages,
  AUTO_WELCOME_MARKER,
  AUTO_CONSULTA_MARKER,
  WA_MEDIA_PREFIX,
  encodeWaMediaBody,
  parseWaMessageBody,
  displayTextForBody,
};
