/**
 * Hilos de soporte in-app (repartidor ↔ cocina) en pestaña Soporte del panel WA.
 * Depende de BravaWaPanel.upsertAppSupportThread / loadAppSupportThread.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var knownOpen = {};
  var lastPollMs = 0;

  function getToken() {
    return typeof window.getAdminToken === 'function' ? window.getAdminToken() : '';
  }

  function adminPost(body) {
    var token = getToken();
    if (!token) return Promise.resolve({ ok: false, error: 'unauthorized' });
    body.token = token;
    return fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function mapMessages(rows) {
    return (rows || []).map(function (m) {
      var sender = m.sender || '';
      var dir = sender === 'admin' ? 'out' : sender === 'system' ? 'sys' : 'in';
      return {
        dir: dir,
        text: m.body || '',
        t: formatTime(m.creado_at),
        at: m.creado_at,
      };
    });
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      return (
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      );
    } catch (e) {
      return '';
    }
  }

  function riderLabel(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    return d.length >= 4 ? 'Rep · ·' + d.slice(-4) : 'Repartidor';
  }

  function upsertFromList(thread, opts) {
    if (!window.BravaWaPanel || typeof BravaWaPanel.upsertAppSupportThread !== 'function') return;
    var preview =
      'Tema: ' +
      (thread.topic || 'Soporte') +
      ' · ' +
      (thread.orn || '') +
      (thread.status === 'closed' ? ' · cerrado' : '');
    BravaWaPanel.upsertAppSupportThread(
      {
        id: thread.id,
        repartidor_tel: thread.repartidor_tel,
        orn: thread.orn,
        parada: thread.parada,
        topic: thread.topic,
        status: thread.status,
        closed_by: thread.closed_by,
        actualizado_at: thread.actualizado_at,
        riderName: riderLabel(thread.repartidor_tel),
        preview: preview,
        unread: !!(opts && opts.unread),
      },
      null
    );
  }

  function pollSupportThreads() {
    var token = getToken();
    if (!token) return;
    var now = Date.now();
    if (now - lastPollMs < 2500) return;
    lastPollMs = now;

    adminPost({ action: 'listRepartidorSupportThreads', status: 'open' }).then(function (data) {
      if (!data.ok && data.error === 'support_schema_missing') {
        adminPost({ action: 'migrateRepartidorSupport' }).then(function () {
          pollSupportThreads();
        });
        return;
      }
      if (!data.ok) return;
      var threads = data.threads || [];
      var seen = {};
      threads.forEach(function (th) {
        seen[th.id] = true;
        var bump = !knownOpen[th.id];
        knownOpen[th.id] = th.actualizado_at || true;
        upsertFromList(th, { unread: bump });
      });
      Object.keys(knownOpen).forEach(function (id) {
        if (!seen[id]) delete knownOpen[id];
      });
    });
  }

  function loadThreadFull(threadId, markRead) {
    if (!threadId) return Promise.resolve();
    return adminPost({
      action: 'getRepartidorSupportThread',
      thread_id: threadId,
    }).then(function (data) {
      if (!data.ok || !data.thread) return;
      if (window.BravaWaPanel && typeof BravaWaPanel.upsertAppSupportThread === 'function') {
        BravaWaPanel.upsertAppSupportThread(
          {
            id: data.thread.id,
            repartidor_tel: data.thread.repartidor_tel,
            orn: data.thread.orn,
            parada: data.thread.parada,
            topic: data.thread.topic,
            status: data.thread.status,
            closed_by: data.thread.closed_by,
            riderName: riderLabel(data.thread.repartidor_tel),
            preview: '',
            unread: !markRead,
          },
          mapMessages(data.messages)
        );
      }
    });
  }

  function startPoll() {
    if (pollTimer) return;
    pollSupportThreads();
    pollTimer = setInterval(pollSupportThreads, 5000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function init() {
    startPoll();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pollSupportThreads();
    });
  }

  window.BravaWaSupportApp = {
    init: init,
    poll: pollSupportThreads,
    loadThread: loadThreadFull,
    onOpenChat: function (threadId) {
      return loadThreadFull(threadId, true);
    },
    sendAdminMessage: function (threadId, text) {
      return adminPost({
        action: 'sendRepartidorSupportMessage',
        thread_id: threadId,
        message: text,
      }).then(function (data) {
        if (data.ok) return loadThreadFull(threadId, true);
        return data;
      });
    },
    closeThread: function (threadId) {
      return adminPost({
        action: 'closeRepartidorSupportThread',
        thread_id: threadId,
      }).then(function (data) {
        if (data.ok) return loadThreadFull(threadId, true);
        return data;
      });
    },
  };
})();
