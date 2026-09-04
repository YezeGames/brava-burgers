/**
 * Panel WhatsApp lateral — inbox + chat semi-automático (wa.me hasta API Meta).
 */
(function () {
  'use strict';

  var WA_SNIPPETS = ['Perfecto, lo tomamos 🍔', 'Va en camino, gracias!', '¿Tenés cambio para $…?'];
  var ACTIVE_ESTADOS = { pendiente: 1, aceptado: 1, en_preparacion: 1, en_camino: 1 };
  var threads = {};
  var waActiveTel = null;
  var waInChat = false;
  var activeOrn = null;
  var waPinnedTels = {};
  var waMsgIdsSeen = {};
  var waPollSince = null;
  var waPollTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function telWa(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (d.startsWith('549')) return d;
    if (d.startsWith('54')) return d;
    if (d.startsWith('11') || d.startsWith('15')) return '549' + d.replace(/^15/, '11');
    return '54911' + d;
  }

  function orderHasPhone(o) {
    return String(o && o.telefono ? o.telefono : '').replace(/\D/g, '').length >= 8;
  }

  function waFirstName(o) {
    return String((o && o.cliente) || (o && o.name) || '')
      .trim()
      .split(/\s+/)[0] || 'Hola';
  }

  function buildNotifyMessage(kind, o) {
    var n = waFirstName(o);
    if (kind === 'camino') return '¡' + n + ', tu pedido ya está en camino!';
    return 'Hola ' + n + ', pedido confirmado!';
  }

  function fmtMoney(n) {
    return Number(n || 0).toLocaleString('es-AR');
  }

  function buildOrderLine(o) {
    if (!o) return '';
    var addr = [o.direccion, o.localidad]
      .filter(function (x) {
        return String(x || '').trim();
      })
      .join(' · ');
    var pago = String(o.pago || '').toUpperCase().indexOf('MP') >= 0 ? 'MP' : 'EF';
    return addr + ' · ' + pago + ' $' + fmtMoney(o.total);
  }

  function waInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function waNowTime() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function waLastPreview(th) {
    if (!th.msgs.length) return 'Sin mensajes';
    return th.msgs[th.msgs.length - 1].text.replace(/\n/g, ' ');
  }

  function isoToTime(iso) {
    try {
      var d = new Date(iso);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) {
      return waNowTime();
    }
  }

  function ensureThread(tel, defaults) {
    tel = telWa(tel);
    defaults = defaults || {};
    if (!threads[tel]) {
      threads[tel] = {
        name: defaults.name || 'WA ···' + tel.slice(-4),
        orn: defaults.orn || '',
        phone: defaults.phone || tel,
        tel: tel,
        orderLine: defaults.orderLine || 'WhatsApp',
        unread: false,
        msgs: [],
      };
    }
    return threads[tel];
  }

  function mergeInboxMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return false;
    var changed = false;
    messages.forEach(function (m) {
      var id = m.id != null ? String(m.id) : '';
      if (id && waMsgIdsSeen[id]) return;
      if (id) waMsgIdsSeen[id] = true;
      var tel = telWa(m.tel);
      waPinnedTels[tel] = true;
      var th = ensureThread(tel, {});
      if (th.msgs.some(function (x) {
        return id && x.id === id;
      })) {
        return;
      }
      th.msgs.push({
        id: id,
        dir: m.direction === 'out' ? 'out' : 'in',
        text: m.body || '',
        t: isoToTime(m.created_at),
        at: m.created_at || '',
      });
      th.msgs.sort(function (a, b) {
        return String(a.at || '').localeCompare(String(b.at || ''));
      });
      if (m.direction === 'in' && tel !== waActiveTel) th.unread = true;
      if (m.created_at && (!waPollSince || m.created_at > waPollSince)) {
        waPollSince = m.created_at;
      }
      changed = true;
    });
    return changed;
  }

  function getAdminToken() {
    try {
      return sessionStorage.getItem('brava_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  function pollWaInbox() {
    var adminToken = getAdminToken();
    if (!adminToken) return;
    var url =
      '/api/whatsapp-inbox?token=' +
      encodeURIComponent(adminToken) +
      '&limit=300' +
      (waPollSince ? '&since=' + encodeURIComponent(waPollSince) : '');
    fetch(url)
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (res) {
        if (!res || !res.ok || !res.messages || !res.messages.length) return;
        if (mergeInboxMessages(res.messages)) {
          renderWaThreads();
          if (waActiveTel && threads[waActiveTel]) renderWaMessages();
        }
      })
      .catch(function () {});
  }

  function startWaInboxPoll() {
    if (waPollTimer) return;
    pollWaInbox();
    waPollTimer = setInterval(pollWaInbox, 12000);
  }

  function waLastTime(th) {
    if (!th.msgs.length) return '';
    return th.msgs[th.msgs.length - 1].t;
  }

  function hideWaAutoHint() {
    var hint = $('wa-auto-hint');
    var compose = document.querySelector('.wa-compose');
    if (hint) {
      hint.classList.add('hidden');
      hint.classList.remove('is-error');
    }
    if (compose) compose.classList.remove('is-auto-draft');
  }

  function showWaSendError(msg) {
    var hint = $('wa-auto-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.remove('hidden');
    hint.classList.add('is-error');
  }

  function formatWaApiError(res) {
    if (!res) return 'Sin respuesta del servidor.';
    if (res.error === 'whatsapp_not_configured') {
      return 'WhatsApp API sin token en Vercel. Redeploy después de cargar WHATSAPP_ACCESS_TOKEN.';
    }
    if (res.error === 'unauthorized') {
      return 'Sesión expirada. Recargá el admin e iniciá sesión de nuevo.';
    }
    if (res.hint === 'token_invalid' || (res.message && /access token/i.test(res.message))) {
      return 'Token de WhatsApp inválido o vencido. Regeneralo en Meta y actualizalo en Vercel.';
    }
    if (res.hint === 'needs_template_or_session') {
      return 'Meta no permite texto libre: el cliente no escribió en las últimas 24 h (hace falta plantilla aprobada).';
    }
    if (res.hint === 'recipient_not_allowed') {
      return 'Número no autorizado en Meta (modo prueba: agregalo como destinatario de test).';
    }
    if (res.message) return String(res.message);
    if (res.error) return String(res.error);
    return 'No se pudo enviar por API.';
  }

  function showWaAutoHint(kind) {
    var hint = $('wa-auto-hint');
    var compose = document.querySelector('.wa-compose');
    if (!hint) return;
    hint.textContent =
      kind === 'camino'
        ? 'En camino → mensaje listo. Revisá y enviá (abre WhatsApp).'
        : 'Pedido aceptado → mensaje listo. Revisá y enviá (abre WhatsApp).';
    hint.classList.remove('hidden');
    if (compose) compose.classList.add('is-auto-draft');
  }

  function setWaView(inChat) {
    waInChat = inChat;
    if ($('wa-toolbar-inbox')) $('wa-toolbar-inbox').classList.toggle('hidden', inChat);
    if ($('wa-toolbar-chat')) $('wa-toolbar-chat').classList.toggle('hidden', !inChat);
    if ($('wa-inbox-panel')) $('wa-inbox-panel').classList.toggle('hidden', inChat);
    if ($('wa-chat-panel')) $('wa-chat-panel').classList.toggle('hidden', !inChat);
    if (!inChat) hideWaAutoHint();
  }

  function syncOrders(orders) {
    if (!Array.isArray(orders)) return;
    var seen = {};
    orders.forEach(function (o) {
      if (!o || !orderHasPhone(o)) return;
      var est = String(o.estado || '').toLowerCase();
      if (!ACTIVE_ESTADOS[est]) return;
      var tel = telWa(o.telefono);
      seen[tel] = true;
      waPinnedTels[tel] = true;
      var prev = threads[tel] || { msgs: [], unread: false };
      threads[tel] = {
        name: String(o.cliente || 'Cliente').trim() || 'Cliente',
        orn: o.orn || '',
        phone: String(o.telefono || '').trim(),
        tel: tel,
        orderLine: buildOrderLine(o),
        unread: prev.unread,
        msgs: prev.msgs || [],
      };
    });
    Object.keys(threads).forEach(function (tel) {
      if (!seen[tel] && !waPinnedTels[tel]) delete threads[tel];
    });
    renderWaThreads();
    if (waActiveTel && threads[waActiveTel]) renderWaMessages();
  }

  function renderWaThreads() {
    var list = $('wa-thread-list');
    if (!list) return;
    list.innerHTML = '';
    var tels = Object.keys(threads);
    if (!tels.length) {
      list.innerHTML = '<p class="wa-inbox-empty">Sin chats. Los mensajes de WhatsApp aparecen acá.</p>';
      return;
    }
    tels.sort(function (a, b) {
      var ta = threads[a];
      var tb = threads[b];
      return waLastTime(tb).localeCompare(waLastTime(ta));
    });
    tels.forEach(function (tel) {
      var th = threads[tel];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'wa-inbox-item' +
        (waActiveTel === tel && waInChat ? ' is-active' : '') +
        (th.unread ? ' has-unread' : '');
      btn.setAttribute('data-wa-tel', tel);
      btn.innerHTML =
        '<span class="wa-avatar wa-avatar--sm">' +
        waInitial(th.name) +
        '</span>' +
        '<span class="wa-inbox-main">' +
        '<span class="wa-inbox-top">' +
        '<span class="wa-inbox-name">' +
        escapeHtml(th.name) +
        '</span>' +
        '<span class="wa-inbox-time">' +
        escapeHtml(waLastTime(th)) +
        '</span>' +
        '</span>' +
        '<span class="wa-inbox-bottom">' +
        '<span class="wa-inbox-preview">' +
        escapeHtml(waLastPreview(th).slice(0, 48)) +
        '</span>' +
        (th.unread ? '<span class="wa-unread-dot" aria-label="Nuevo"></span>' : '') +
        '</span>' +
        '</span>';
      btn.addEventListener('click', function () {
        openChat(tel, { manual: true });
      });
      list.appendChild(btn);
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightOrderCards() {
    document.querySelectorAll('.order-card').forEach(function (c) {
      var orn = c.getAttribute('data-orn') || (c.querySelector('.order-orn') && c.querySelector('.order-orn').textContent);
      c.classList.toggle('is-wa-active', !!activeOrn && orn === activeOrn);
    });
  }

  function renderWaMessages() {
    var body = $('wa-chat-body');
    var chip = $('wa-order-chip');
    var who = $('wa-toolbar-who');
    if (!body || !chip || !who) return;

    if (!waActiveTel || !threads[waActiveTel]) {
      setWaView(false);
      body.innerHTML = '';
      chip.classList.add('hidden');
      chip.innerHTML = '';
      who.innerHTML = '';
      activeOrn = null;
      highlightOrderCards();
      renderWaThreads();
      return;
    }

    setWaView(true);
    var th = threads[waActiveTel];
    th.unread = false;
    activeOrn = th.orn;

    who.innerHTML =
      '<span class="wa-avatar">' +
      waInitial(th.name) +
      '</span>' +
      '<span><div class="wa-toolbar-name">' +
      escapeHtml(th.name) +
      '</div><div class="wa-toolbar-meta">' +
      escapeHtml(th.orn) +
      ' · ' +
      escapeHtml(th.phone) +
      '</div></span>';

    chip.classList.remove('hidden');
    if (th.orn) {
      chip.innerHTML =
        '<span class="orn">' +
        escapeHtml(th.orn) +
        '</span><br><strong>Pedido:</strong> ' +
        escapeHtml(th.orderLine);
    } else {
      chip.innerHTML =
        '<span class="wa-chip-note">Chat WhatsApp · sin pedido activo en panel</span>';
    }

    body.innerHTML = '';
    th.msgs.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'wa-msg ' + (m.dir === 'out' ? 'out' : 'in');
      el.textContent = m.text;
      var tm = document.createElement('div');
      tm.className = 'wa-time';
      tm.textContent = m.t;
      el.appendChild(tm);
      body.appendChild(el);
    });
    body.scrollTop = body.scrollHeight;
    highlightOrderCards();
    renderWaThreads();
  }

  function openChat(tel, opts) {
    opts = opts || {};
    if (!threads[tel]) return;
    waActiveTel = tel;
    if (opts.manual) {
      hideWaAutoHint();
      var input = $('wa-input');
      if (input) input.value = '';
    }
    renderWaMessages();
  }

  function closeChat() {
    waActiveTel = null;
    activeOrn = null;
    hideWaAutoHint();
    var input = $('wa-input');
    if (input) input.value = '';
    renderWaMessages();
  }

  function autoNotify(order, kind) {
    if (!order || !orderHasPhone(order)) return;
    syncOrders(getOrdersSnapshot());
    var tel = telWa(order.telefono);
    if (!threads[tel]) return;
    openChat(tel, { manual: false });
    var input = $('wa-input');
    var msg = buildNotifyMessage(kind, order);
    if (input) {
      input.value = msg;
      input.focus();
    }
    showWaAutoHint(kind);
  }

  var ordersSnapshotFn = null;

  function getOrdersSnapshot() {
    return ordersSnapshotFn ? ordersSnapshotFn() : [];
  }

  function sendWaOut() {
    if (!waActiveTel || !threads[waActiveTel]) return;
    var input = $('wa-input');
    var text = input && input.value ? input.value.trim() : '';
    if (!text) return;
    var th = threads[waActiveTel];

    function pushOutAndClear() {
      th.msgs.push({ dir: 'out', text: text, t: waNowTime(), at: new Date().toISOString() });
      waPinnedTels[waActiveTel] = true;
      if (input) input.value = '';
      hideWaAutoHint();
      renderWaMessages();
    }

    function openWaMeFallback(reason) {
      if (reason) showWaSendError(reason + ' Abriendo WhatsApp…');
      window.open('https://wa.me/' + th.tel + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      pushOutAndClear();
    }

    var adminToken = getAdminToken();

    if (!adminToken) {
      openWaMeFallback('Sin sesión de admin.');
      return;
    }

    fetch('/api/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, to: th.tel, text: text }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: 'invalid_json' };
        }).then(function (data) {
          return { status: r.status, data: data };
        });
      })
      .then(function (wrap) {
        var res = wrap && wrap.data ? wrap.data : {};
        if (res && res.ok) {
          hideWaAutoHint();
          pushOutAndClear();
          return;
        }
        if (wrap.status === 401) res.error = 'unauthorized';
        if (wrap.status === 503) res.error = 'whatsapp_not_configured';
        openWaMeFallback(formatWaApiError(res));
      })
      .catch(function () {
        openWaMeFallback('Error de red al llamar /api/whatsapp-send.');
      });
  }

  function initSnippets() {
    var snipWrap = $('wa-snippets');
    if (!snipWrap || snipWrap.dataset.bound) return;
    snipWrap.dataset.bound = '1';
    WA_SNIPPETS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', function () {
        var input = $('wa-input');
        if (input) {
          input.value = s;
          input.focus();
        }
        hideWaAutoHint();
      });
      snipWrap.appendChild(b);
    });
  }

  function checkWhatsappApiStatus() {
    var adminToken = getAdminToken();
    if (!adminToken) return;
    fetch('/api/whatsapp-status?token=' + encodeURIComponent(adminToken))
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (res) {
        if (!res || !res.ok) return;
        if (res.configured) return;
        showWaSendError(
          'WhatsApp API no configurada en el servidor' +
            (res.hasAccessToken ? '' : ' (falta WHATSAPP_ACCESS_TOKEN)') +
            '. Hacé redeploy en Vercel.'
        );
      })
      .catch(function () {});
  }

  function init() {
    if (!$('wa-aside')) return;
    initSnippets();
    checkWhatsappApiStatus();
    if ($('wa-back')) $('wa-back').addEventListener('click', closeChat);
    if ($('wa-send')) $('wa-send').addEventListener('click', sendWaOut);
    var waInput = $('wa-input');
    if (waInput) {
      waInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendWaOut();
        }
      });
      waInput.addEventListener('input', function () {
        if (!waInput.value.trim()) hideWaAutoHint();
      });
    }
    setWaView(false);
    renderWaThreads();
    startWaInboxPoll();
  }

  window.BravaWaPanel = {
    init: init,
    syncOrders: syncOrders,
    autoNotify: autoNotify,
    openChat: openChat,
    closeChat: closeChat,
    setOrdersProvider: function (fn) {
      ordersSnapshotFn = fn;
    },
    telWa: telWa,
  };
})();
