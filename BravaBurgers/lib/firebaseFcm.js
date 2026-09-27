'use strict';

let messaging = null;
let initError = null;

function parseServiceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    initError = 'invalid_firebase_json';
    return null;
  }
}

function isFcmConfigured() {
  return !!parseServiceAccount();
}

function getMessaging() {
  if (messaging) return messaging;
  if (initError) return null;
  const sa = parseServiceAccount();
  if (!sa) {
    initError = 'firebase_not_configured';
    return null;
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (e) {
    initError = String(e.message || e);
    return null;
  }
}

/**
 * @param {string} fcmToken
 * @param {{ title: string, body: string, data?: Record<string,string> }} msg
 */
async function sendFcmToToken(fcmToken, msg) {
  const token = String(fcmToken || '').trim();
  if (!token) return { ok: false, error: 'missing_token' };
  const m = getMessaging();
  if (!m) {
    return { ok: false, error: initError || 'firebase_not_configured' };
  }
  const data = msg.data || {};
  const payload = {
    token: token,
    notification: {
      title: String(msg.title || 'Brava Repartidor').slice(0, 120),
      body: String(msg.body || '').slice(0, 240),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'brava_entregas',
        sound: 'default',
      },
    },
    data: Object.keys(data).reduce(function (acc, k) {
      acc[k] = String(data[k]);
      return acc;
    }, {}),
  };
  try {
    const id = await m.send(payload);
    return { ok: true, messageId: id };
  } catch (e) {
    const code = e && e.code ? String(e.code) : '';
    return { ok: false, error: 'fcm_send_failed', detail: String(e.message || e), code: code };
  }
}

module.exports = {
  isFcmConfigured,
  sendFcmToToken,
};
