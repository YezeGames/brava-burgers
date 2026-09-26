const { cors } = require('../lib/gasFetch');
const { validateAdminToken } = require('../lib/adminAuth');
const {
  getWhatsAppConfig,
  isWebhookConfigured,
  fetchWabaSubscribedApps,
  subscribeWabaToApp,
} = require('../lib/whatsappMeta');
const { listWaMessages, insertWaMessage } = require('../lib/waInbox');
const { migrateWaMessages, migrateWaReclamos } = require('../lib/dbMigrate');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const migrateKind = String(req.query.migrate || '').trim();

  if (req.query.diagnose === '1') {
    const key = String(req.query.key || '').trim();
    const expected = (process.env.BRAVA_ORDER_SECRET || '').trim();
    const to = String(req.query.to || '').trim();
    if (!expected || key !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    if (!to) {
      return res.status(400).json({ ok: false, error: 'missing_to' });
    }
    const { diagnoseWhatsAppDelivery } = require('../lib/waDiagnose');
    const interactive = String(req.query.interactive || '') === '1';
    const diag = await diagnoseWhatsAppDelivery(to, { interactive: interactive });
    return res.status(200).json(diag);
  }

  if (req.query.probe_post_entrega === '1') {
    const key = String(req.query.key || '').trim();
    const expected = (process.env.BRAVA_ORDER_SECRET || '').trim();
    const to = String(req.query.to || '').trim();
    if (!expected || key !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    if (!to) {
      return res.status(400).json({ ok: false, error: 'missing_to' });
    }
    const { probePostEntregaInteractive } = require('../lib/waPostEntrega');
    const probe = await probePostEntregaInteractive(to);
    const detail =
      probe.detail && probe.detail.message
        ? String(probe.detail.message)
        : probe.interactiveDetail || probe.message || '';
    const msgId =
      probe.messageId ||
      (probe.data && probe.data.messages && probe.data.messages[0] && probe.data.messages[0].id) ||
      '';
    return res.status(200).json({
      ok: !!probe.ok,
      probe: true,
      to: probe.to,
      waMessageId: msgId,
      contactWaId: probe.contactWaId || '',
      mode: probe.mode || probe.fallback || null,
      hint: probe.hint || probe.interactiveHint || null,
      error: probe.ok ? null : probe.error,
      detail: detail.slice(0, 400),
      graphCode: probe.detail && probe.detail.code != null ? probe.detail.code : null,
    });
  }

  if (migrateKind === 'wa_reclamos') {
    const key = String(req.query.key || '').trim();
    const expected = (process.env.BRAVA_ORDER_SECRET || '').trim();
    if (!expected || key !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const migrateResult = await migrateWaReclamos();
    return res.status(200).json({
      ok: !!migrateResult.ok,
      kind: 'wa_reclamos',
      migrated: !!migrateResult.migrated,
      error: migrateResult.ok ? null : migrateResult.error,
      detail: migrateResult.ok ? null : (migrateResult.detail || migrateResult.hint || '').slice(0, 300),
    });
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

  let migrateResult = null;
  let migrateReclamosResult = null;
  if (req.query.migrate === '1') {
    migrateResult = await migrateWaMessages();
    migrateReclamosResult = await migrateWaReclamos();
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
    migrateOk: migrateResult ? !!migrateResult.ok : null,
    migrateError: migrateResult && !migrateResult.ok ? migrateResult.error : null,
    migrateDetail: migrateResult && !migrateResult.ok ? (migrateResult.detail || '').slice(0, 200) : null,
    migrateReclamosOk: migrateReclamosResult ? !!migrateReclamosResult.ok : null,
    migrateReclamosError:
      migrateReclamosResult && !migrateReclamosResult.ok ? migrateReclamosResult.error : null,
    migrateReclamosDetail:
      migrateReclamosResult && !migrateReclamosResult.ok
        ? (migrateReclamosResult.detail || migrateReclamosResult.hint || '').slice(0, 200)
        : null,
  });
};
