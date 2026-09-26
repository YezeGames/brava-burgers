const {
  getWhatsAppConfig,
  normalizeWaRecipient,
  sendTextMessage,
  sendInteractiveButtons,
  fetchPhoneNumberProfile,
  fetchWabaSubscribedApps,
} = require('./whatsappMeta');

async function diagnoseWhatsAppDelivery(to, opts) {
  opts = opts || {};
  const cfg = getWhatsAppConfig();
  const tel = normalizeWaRecipient(to);
  const out = {
    ok: false,
    toRequested: String(to || ''),
    toNormalized: tel,
    configured: !!(cfg.accessToken && cfg.phoneNumberId),
    tokenLength: cfg.accessToken ? cfg.accessToken.length : 0,
    phoneNumberId: cfg.phoneNumberId ? String(cfg.phoneNumberId) : '',
    wabaId: cfg.wabaId ? String(cfg.wabaId) : '',
    graphVersion: cfg.graphVersion || '',
  };

  if (!out.configured) {
    out.error = 'whatsapp_not_configured';
    out.hint = 'Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en Vercel';
    return out;
  }

  const profile = await fetchPhoneNumberProfile();
  out.phoneProfileOk = !!profile.ok;
  if (profile.ok && profile.profile) {
    out.displayPhone = profile.profile.display_phone_number || '';
    out.verifiedName = profile.profile.verified_name || '';
    out.qualityRating = profile.profile.quality_rating || '';
    out.platformType = profile.profile.platform_type || '';
  } else if (!profile.ok) {
    out.phoneProfileError = profile.detail || profile.error || '';
    out.hint = out.tokenLength < 50 ? 'token_invalid_or_missing' : 'phone_id_token_mismatch';
  }

  const wabaSub = await fetchWabaSubscribedApps(cfg);
  out.wabaSubscribed = !!(wabaSub.ok && wabaSub.apps && wabaSub.apps.length);

  if (opts.textPing !== false) {
    const ping = await sendTextMessage(
      tel,
      'Brava probe ' + new Date().toISOString().slice(11, 19) + ' — si ves esto, la API llega a tu celu.'
    );
    out.textPing = {
      ok: !!ping.ok,
      messageId: ping.messageId || '',
      contactWaId: ping.contactWaId || '',
      contactInput: ping.contactInput || '',
      hint: ping.hint || '',
      error: ping.ok ? null : ping.error,
      detail:
        ping.ok ? null : ping.message || (ping.detail && ping.detail.message) || JSON.stringify(ping.detail || '').slice(0, 200),
    };
    if (ping.ok) out.ok = true;
    else {
      out.error = ping.error || 'text_ping_failed';
      out.hint = ping.hint || out.hint;
    }
  }

  if (opts.interactive && out.textPing && out.textPing.ok) {
    const card = await sendInteractiveButtons({
      to: tel,
      bodyText: 'Probe tarjeta Brava — ¿ves 3 botones?',
      footerText: 'Brava Burgers',
      buttons: [
        { id: 'p1', title: 'Sí, los veo' },
        { id: 'p2', title: 'No llegó' },
        { id: 'p3', title: 'Otro' },
      ],
    });
    out.interactiveProbe = {
      ok: !!card.ok,
      messageId: card.messageId || '',
      hint: card.hint || '',
      error: card.ok ? null : card.error,
      detail: card.ok ? null : card.message || JSON.stringify(card.detail || '').slice(0, 200),
    };
    if (card.ok && card.messageId) {
      out.deliveryCheckUrl =
        '/api/whatsapp-status?delivery=1&wait=1&key=BRAVA_ORDER_SECRET&wamid=' +
        encodeURIComponent(card.messageId);
      if (opts.waitDelivery) {
        const { waitForWaMessageStatuses } = require('./waMessageStatus');
        out.deliveryWebhook = await waitForWaMessageStatuses(card.messageId, {
          attempts: 5,
          delayMs: 1500,
        });
        if (out.deliveryWebhook.summary && out.deliveryWebhook.summary.failed) {
          const f = out.deliveryWebhook.summary.failed;
          out.hint =
            'Meta reportó failed en webhook: código ' +
            (f.error_code != null ? f.error_code : '?') +
            ' — ' +
            (f.error_title || 'sin título');
        } else if (out.deliveryWebhook.summary && out.deliveryWebhook.summary.delivered) {
          out.hint = 'Webhook: delivered/read OK para la tarjeta interactiva.';
        } else if (out.deliveryWebhook.pending) {
          out.hint =
            'Aún no llegó status al webhook (sent/delivered/failed). Verificá suscripción messages en Meta o repetí delivery=1 con el wamid.';
        }
      }
    }
  }

  if (out.textPing && out.textPing.contactWaId && out.textPing.contactWaId !== tel) {
    out.waIdMismatch = true;
    out.hint =
      'Meta normalizó otro wa_id (' +
      out.textPing.contactWaId +
      '). Probá guardar ese formato en pedidos.';
  }

  if (out.textPing && out.textPing.hint === 'needs_template_or_session') {
    out.hint =
      'Ventana 24 h cerrada: mandá un mensaje al WhatsApp de Brava (+54 9 11 7372-1945) y repetí el probe.';
  }

  return out;
}

module.exports = { diagnoseWhatsAppDelivery };
