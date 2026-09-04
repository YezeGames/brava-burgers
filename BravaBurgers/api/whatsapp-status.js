const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const { getWhatsAppConfig } = require('../lib/whatsappMeta');
const { listWaMessages, insertWaMessage } = require('../lib/waInbox');

async function fetchWabaSubscription(cfg) {
  if (!cfg.accessToken || !cfg.wabaId) return null;
  const url =
    'https://graph.facebook.com/' +
    encodeURIComponent(cfg.graphVersion) +
    '/' +
    encodeURIComponent(cfg.wabaId) +
    '/subscribed_apps';
  try {
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + cfg.accessToken },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(function () {
      return {};
    });
    return { ok: res.ok, status: res.status, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const token = String(req.query.token || '').trim();
  if (!validateAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const cfg = getWhatsAppConfig();
  const inbox = await listWaMessages({ limit: 5 });
  const wabaSub = await fetchWabaSubscription(cfg);
  let inboxWrite = null;
  if (req.query.probe === '1') {
    inboxWrite = await insertWaMessage({
      messageId: 'probe-' + Date.now(),
      tel: '5491100000000',
      direction: 'in',
      body: 'probe inbox write',
    });
  }
  return res.status(200).json({
    ok: true,
    configured: !!(cfg.accessToken && cfg.phoneNumberId),
    hasAccessToken: !!cfg.accessToken,
    hasPhoneNumberId: !!cfg.phoneNumberId,
    hasWabaId: !!cfg.wabaId,
    tokenLength: cfg.accessToken ? cfg.accessToken.length : 0,
    inboxReadOk: !!inbox.ok,
    inboxCount: inbox.messages ? inbox.messages.length : 0,
    inboxError: inbox.ok ? null : inbox.error,
    inboxDetail: inbox.ok ? null : (inbox.detail || '').slice(0, 200),
    inboxWriteOk: inboxWrite ? !!inboxWrite.ok : null,
    inboxWriteError: inboxWrite && !inboxWrite.ok ? inboxWrite.error : null,
    inboxWriteDetail: inboxWrite && !inboxWrite.ok ? (inboxWrite.detail || '').slice(0, 200) : null,
    wabaSubscribed: wabaSub && wabaSub.ok && wabaSub.data && Array.isArray(wabaSub.data.data) && wabaSub.data.data.length > 0,
    wabaSubDetail: wabaSub ? (wabaSub.ok ? null : JSON.stringify(wabaSub.data || wabaSub.error || '').slice(0, 200)) : 'no_waba_or_token',
  });
};
