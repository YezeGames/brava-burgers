const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const {
  getWhatsAppConfig,
  isWebhookConfigured,
  fetchWabaSubscribedApps,
  subscribeWabaToApp,
} = require('../lib/whatsappMeta');
const { listWaMessages, insertWaMessage } = require('../lib/waInbox');

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
  let wabaSub = await fetchWabaSubscribedApps(cfg);
  let subscribeAttempt = null;

  if (req.query.subscribe === '1' && (!wabaSub.ok || !wabaSub.apps.length)) {
    subscribeAttempt = await subscribeWabaToApp(cfg);
    wabaSub = await fetchWabaSubscribedApps(cfg);
  }

  let inboxWrite = null;
  if (req.query.probe === '1') {
    inboxWrite = await insertWaMessage({
      messageId: 'probe-' + Date.now(),
      tel: '5491100000000',
      direction: 'in',
      body: 'probe inbox write',
    });
  }

  const wabaSubscribed = !!(wabaSub.ok && wabaSub.apps && wabaSub.apps.length);

  return res.status(200).json({
    ok: true,
    configured: !!(cfg.accessToken && cfg.phoneNumberId),
    hasAccessToken: !!cfg.accessToken,
    hasPhoneNumberId: !!cfg.phoneNumberId,
    hasWabaId: !!cfg.wabaId,
    hasAppSecret: !!cfg.appSecret,
    webhookVerifyConfigured: isWebhookConfigured(),
    tokenLength: cfg.accessToken ? cfg.accessToken.length : 0,
    inboxReadOk: !!inbox.ok,
    inboxCount: inbox.messages ? inbox.messages.length : 0,
    inboxError: inbox.ok ? null : inbox.error,
    inboxDetail: inbox.ok ? null : (inbox.detail || '').slice(0, 200),
    inboxWriteOk: inboxWrite ? !!inboxWrite.ok : null,
    inboxWriteError: inboxWrite && !inboxWrite.ok ? inboxWrite.error : null,
    inboxWriteDetail: inboxWrite && !inboxWrite.ok ? (inboxWrite.detail || '').slice(0, 200) : null,
    wabaSubscribed: wabaSubscribed,
    wabaAppCount: wabaSub.apps ? wabaSub.apps.length : 0,
    wabaSubDetail: wabaSub.ok
      ? null
      : JSON.stringify(wabaSub.data || wabaSub.error || '').slice(0, 200),
    subscribeAttemptOk: subscribeAttempt ? !!subscribeAttempt.ok : null,
    subscribeAttemptDetail: subscribeAttempt && !subscribeAttempt.ok
      ? JSON.stringify(subscribeAttempt.detail || subscribeAttempt.error || '').slice(0, 200)
      : null,
  });
};
