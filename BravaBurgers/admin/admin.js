(function () {
  var API = '/api/admin';
  var token = sessionStorage.getItem('brava_admin_token') || '';
  var currentEstado = 'pendiente';
  var knownOrns = new Set();
  var soundOn = false;
  var audioCtx = null;
  var pollTimer = null;
  var POLL_MS = 400;
  var pollTick = 0;
  var fetchStartedAt = 0;
  var FETCH_STALE_MS = 7000;

  var allOrdersCache = [];
  var fetchInFlight = null;
  var cacheSignature = '';
  var TAB_ESTADOS = ['pendiente', 'aceptado', 'rechazado', 'entregada', 'cancelada'];
  var panelFrags = {
    pendiente: null,
    aceptado: null,
    rechazado: null,
    entregada: null,
    cancelada: null,
  };
  var rechazoOrn = null;

  function normalizeEstado(est) {
    var e = String(est || '')
      .trim()
      .toLowerCase();
    if (e === 'activa') return 'pendiente';
    return e;
  }

  function emptyPanelFrags() {
    panelFrags = {
      pendiente: null,
      aceptado: null,
      rechazado: null,
      entregada: null,
      cancelada: null,
    };
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollNewOrders, POLL_MS);
    pollNewOrders();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return Number(n).toLocaleString('es-AR');
  }

  function api(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.text().then(function (text) {
        var d;
        try {
          d = JSON.parse(text);
        } catch (e) {
          d = { ok: false, error: 'invalid_response', raw: text.slice(0, 120) };
        }
        return { status: r.status, data: d };
      });
    });
  }

  function showLogin() {
    $('login-view').classList.remove('hidden');
    $('app-view').classList.add('hidden');
    if (pollTimer) clearInterval(pollTimer);
  }

  function showApp() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    paintCurrentTab();
    loadOrders();
    startPolling();
  }

  function playDing() {
    if (!soundOn) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    [880, 1318].forEach(function (f, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      var t0 = t + i * 0.18;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  }

  function telWa(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (d.startsWith('549')) return d;
    if (d.startsWith('54')) return d;
    if (d.startsWith('11') || d.startsWith('15')) return '549' + d.replace(/^15/, '11');
    return '54911' + d;
  }

  function ordersForEstado(orders, estado) {
    return orders.filter(function (o) {
      if (!o.orn || String(o.orn).trim() === '') return false;
      return normalizeEstado(o.estado) === estado;
    });
  }

  function buildCacheSignature(orders) {
    return orders
      .map(function (o) {
        return (o.orn || '') + ':' + normalizeEstado(o.estado);
      })
      .join('|');
  }

  function renderTabCounts(orders) {
    var counts = { pendiente: 0, aceptado: 0, rechazado: 0, entregada: 0, cancelada: 0 };
    orders.forEach(function (o) {
      var e = normalizeEstado(o.estado);
      if (Object.prototype.hasOwnProperty.call(counts, e)) counts[e]++;
    });
    document.querySelectorAll('.tab').forEach(function (btn) {
      var est = btn.dataset.estado;
      var label = btn.getAttribute('data-label');
      if (!label) {
        label = btn.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
        btn.setAttribute('data-label', label);
      }
      var n = counts[est] || 0;
      btn.textContent = n ? label + ' (' + n + ')' : label;
    });
  }

  function appendEmptyRow(parent, panelEstado) {
    var hints = {
      pendiente:
        'No hay pedidos pendientes. Los nuevos aparecen acá con aviso de sonido (si está activado).',
      aceptado: 'No hay pedidos aceptados. Aceptá uno desde <strong>Pendientes</strong>.',
      rechazado: 'No hay pedidos rechazados.',
      entregada: 'No hay pedidos entregados.',
      cancelada: 'No hay pedidos cancelados.',
    };
    var empty = document.createElement('tr');
    empty.innerHTML =
      '<td colspan="7" style="padding:24px;text-align:center;color:#666;">' +
      (hints[panelEstado] || 'No hay pedidos en esta pestaña.') +
      '</td>';
    parent.appendChild(empty);
  }

  function addActionBtn(parent, text, className, action, orn, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.dataset.action = action;
    b.dataset.orn = orn;
    if (title) b.title = title;
    parent.appendChild(b);
  }

  function buildPanelFragment(orders, panelEstado) {
    var frag = document.createDocumentFragment();
    if (!orders.length) {
      appendEmptyRow(frag, panelEstado);
      return frag;
    }
    orders.forEach(function (o) {
      var tr = document.createElement('tr');
      var fecha = o.fecha_creado ? new Date(o.fecha_creado).toLocaleString('es-AR') : '';
      var wa = telWa(o.telefono);
      var actions = document.createElement('div');
      actions.className = 'actions';

      if (panelEstado === 'pendiente') {
        addActionBtn(actions, '✓', 'btn-sm btn-ok', 'accept', o.orn, 'Aceptar pedido');
        addActionBtn(actions, '✕', 'btn-sm btn-x', 'reject', o.orn, 'Rechazar pedido');
      }
      if (panelEstado === 'aceptado') {
        addActionBtn(actions, '✓', 'btn-sm btn-ok', 'deliver', o.orn, 'Marcar entregado');
        addActionBtn(actions, '✕', 'btn-sm btn-x', 'cancel', o.orn, 'Cancelar pedido');
      }

      var a = document.createElement('a');
      a.className = 'btn-wa';
      a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola, pedido ' + o.orn);
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<i class="fab fa-whatsapp"></i>';
      actions.appendChild(a);
      var print = document.createElement('button');
      print.type = 'button';
      print.className = 'btn-sm';
      print.textContent = 'Ticket';
      print.dataset.action = 'ticket';
      actions.appendChild(print);

      tr.innerHTML =
        '<td>' +
        fecha +
        '</td><td>' +
        (o.cliente || '') +
        '</td><td>' +
        (o.telefono || '') +
        '</td><td>' +
        (o.pago || '') +
        '</td><td>' +
        fmt(o.total) +
        '</td><td>' +
        (o.orn || '') +
        '</td>';
      var td = document.createElement('td');
      td.appendChild(actions);
      tr.appendChild(td);
      frag.appendChild(tr);
    });
    return frag;
  }

  function rebuildAllPanelFrags() {
    TAB_ESTADOS.forEach(function (est) {
      panelFrags[est] = buildPanelFragment(ordersForEstado(allOrdersCache, est), est);
    });
    renderTabCounts(allOrdersCache);
  }

  function paintCurrentTab() {
    var tb = $('tbody');
    if (!tb) return;
    tb.replaceChildren();
    var frag = panelFrags[currentEstado];
    if (frag) tb.appendChild(frag.cloneNode(true));
    else appendEmptyRow(tb, currentEstado);
  }

  function listErrorMessage(err) {
    if (err === 'invalid_gas_response' || err === 'gas_network_error' || err === 'gas_failed') {
      return 'No se pudo conectar con Google. Los pedidos en pantalla siguen siendo los últimos cargados.';
    }
    return err || 'Error al cargar pedidos';
  }

  function handleAuthFailure() {
    sessionStorage.removeItem('brava_admin_token');
    token = '';
    showLogin();
  }

  function normalizeOrdersInCache(orders) {
    (orders || []).forEach(function (o) {
      o.estado = normalizeEstado(o.estado);
    });
  }

  function applyCacheFromServer(orders) {
    allOrdersCache = orders || [];
    normalizeOrdersInCache(allOrdersCache);
    ordersForEstado(allOrdersCache, 'pendiente').forEach(function (o) {
      if (o.orn) knownOrns.add(o.orn);
    });
    var sig = buildCacheSignature(allOrdersCache);
    if (sig !== cacheSignature) {
      cacheSignature = sig;
      rebuildAllPanelFrags();
      paintCurrentTab();
    }
    $('poll-status').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
  }

  function mergeOrdersIntoCache(incoming) {
    var map = {};
    allOrdersCache.forEach(function (o) {
      if (o.orn) map[o.orn] = o;
    });
    (incoming || []).forEach(function (o) {
      if (o.orn) {
        o.estado = normalizeEstado(o.estado);
        map[o.orn] = o;
      }
    });
    var merged = Object.keys(map).map(function (k) {
      return map[k];
    });
    merged.sort(function (a, b) {
      return new Date(b.fecha_creado) - new Date(a.fecha_creado);
    });
    applyCacheFromServer(merged);
  }

  function fetchOrdersFromServer(fullSync) {
    var now = Date.now();
    if (fetchInFlight && now - fetchStartedAt < FETCH_STALE_MS) return fetchInFlight;
    pollTick += 1;
    var action = fullSync || pollTick % 10 === 0 ? 'listOrders' : 'listOrdersRecent';
    fetchStartedAt = now;
    fetchInFlight = api({ action: action, token: token, estadoFilter: '' })
      .then(function (res) {
        if (!res.data.ok) {
          if (action === 'listOrdersRecent') {
            fetchInFlight = null;
            return fetchOrdersFromServer(true);
          }
          if (res.status === 401 || res.data.error === 'unauthorized') {
            handleAuthFailure();
            return false;
          }
          $('app-err').textContent = listErrorMessage(res.data.error);
          $('app-err').hidden = false;
          return false;
        }
        $('app-err').hidden = true;
        if (action === 'listOrdersRecent') mergeOrdersIntoCache(res.data.orders || []);
        else applyCacheFromServer(res.data.orders || []);
        return true;
      })
      .catch(function () {
        $('app-err').textContent = 'Sin conexión. Mostrando últimos pedidos cargados.';
        $('app-err').hidden = false;
        return false;
      })
      .finally(function () {
        fetchInFlight = null;
      });
    return fetchInFlight;
  }

  function loadOrders() {
    fetchOrdersFromServer(true).then(function (ok) {
      if (!ok && !allOrdersCache.length) {
        rebuildAllPanelFrags();
        paintCurrentTab();
      }
    });
  }

  function pollNewOrders() {
    var prevPendientes = new Set();
    allOrdersCache.forEach(function (o) {
      if (normalizeEstado(o.estado) === 'pendiente' && o.orn) prevPendientes.add(o.orn);
    });
    fetchOrdersFromServer().then(function (ok) {
      if (!ok) return;
      var neu = false;
      allOrdersCache.forEach(function (o) {
        if (normalizeEstado(o.estado) === 'pendiente' && o.orn && !prevPendientes.has(o.orn)) neu = true;
      });
      if (neu) playDing();
    });
  }

  function findOrder(orn) {
    for (var i = 0; i < allOrdersCache.length; i++) {
      if (allOrdersCache[i].orn === orn) return allOrdersCache[i];
    }
    return null;
  }

  function patchOrderInCache(orn, patch) {
    for (var i = 0; i < allOrdersCache.length; i++) {
      if (allOrdersCache[i].orn === orn) {
        Object.keys(patch).forEach(function (k) {
          allOrdersCache[i][k] = patch[k];
        });
        break;
      }
    }
    cacheSignature = buildCacheSignature(allOrdersCache);
    rebuildAllPanelFrags();
    paintCurrentTab();
  }

  function sendOrderUpdate(orn, patch) {
    patchOrderInCache(orn, patch);
    var body = { action: 'updateOrder', token: token, orn: orn };
    if (patch.estado) body.estado = patch.estado;
    if (patch.rechazo_mensaje != null) body.rechazoMensaje = patch.rechazo_mensaje;
    api(body).then(function (res) {
      if (res.data.ok) return;
      if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
      else {
        $('app-err').textContent = listErrorMessage(res.data.error);
        $('app-err').hidden = false;
        fetchOrdersFromServer(true);
      }
    });
  }

  function switchTab(estado) {
    currentEstado = estado;
    paintCurrentTab();
  }

  function buildRechazoMessage(o) {
    var motivos = [];
    document.querySelectorAll('#rechazo-motivos input:checked').forEach(function (cb) {
      motivos.push(cb.value);
    });
    var extra = ($('rechazo-extra').value || '').trim();
    var first = (o.cliente || '').split(' ')[0] || 'Hola';
    var lines = ['Hola ' + first + ', somos Brava Burgers.', '', 'Lamentamos informarte que no podemos tomar tu pedido ' + o.orn + '.'];
    if (motivos.length) {
      lines.push('');
      lines.push('Motivo:');
      motivos.forEach(function (m) {
        lines.push('• ' + m);
      });
    }
    if (extra) {
      lines.push('');
      lines.push(extra);
    }
    lines.push('');
    lines.push('Gracias por tu comprensión.');
    return lines.join('\n');
  }

  function updateRechazoPreview() {
    var o = rechazoOrn ? findOrder(rechazoOrn) : null;
    if (!o) return;
    $('rechazo-preview').textContent = buildRechazoMessage(o);
  }

  function openRechazoModal(orn) {
    var o = findOrder(orn);
    if (!o) return;
    rechazoOrn = orn;
    $('rechazo-sub').textContent = o.orn + ' · ' + (o.cliente || '') + ' · ' + (o.telefono || '');
    document.querySelectorAll('#rechazo-motivos input').forEach(function (cb) {
      cb.checked = false;
    });
    $('rechazo-extra').value = '';
    updateRechazoPreview();
    $('rechazo-modal').classList.remove('hidden');
  }

  function closeRechazoModal() {
    rechazoOrn = null;
    $('rechazo-modal').classList.add('hidden');
  }

  function confirmRechazo() {
    var o = rechazoOrn ? findOrder(rechazoOrn) : null;
    if (!o) return;
    var motivos = document.querySelectorAll('#rechazo-motivos input:checked').length;
    var extra = ($('rechazo-extra').value || '').trim();
    if (!motivos && !extra) {
      if (!confirm('¿Rechazar sin motivo ni mensaje?')) return;
    }
    if (!confirm('¿Confirmar rechazo de ' + o.orn + '?')) return;
    var msg = buildRechazoMessage(o);
    closeRechazoModal();
    sendOrderUpdate(o.orn, { estado: 'rechazado', rechazo_mensaje: msg });
  }

  function doLogin() {
    var btn = $('login-btn');
    $('login-err').hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    api({
      action: 'login',
      user: $('login-user').value.trim(),
      password: $('login-pass').value,
    })
      .then(function (res) {
        if (!res.data.ok) {
          var msg =
            res.data.error === 'admin_not_configured'
              ? 'Falta configurar ADMIN_USER y ADMIN_PASSWORD en Apps Script'
              : res.data.error === 'invalid_gas_response' || res.data.error === 'invalid_response'
                ? 'Error al conectar con Google. Probá en unos minutos.'
                : 'Usuario o contraseña incorrectos';
          $('login-err').textContent = msg;
          $('login-err').hidden = false;
          return;
        }
        token = res.data.token;
        sessionStorage.setItem('brava_admin_token', token);
        knownOrns = new Set();
        allOrdersCache = [];
        cacheSignature = '';
        emptyPanelFrags();
        currentEstado = 'pendiente';
        document.querySelectorAll('.tab').forEach(function (b) {
          b.classList.toggle('active', b.dataset.estado === 'pendiente');
        });
        showApp();
      })
      .catch(function () {
        $('login-err').textContent = 'Error de conexión. Probá de nuevo.';
        $('login-err').hidden = false;
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
  }

  $('orders-table').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'ticket') {
      window.open('../comanda-ejemplo.html', '_blank');
      return;
    }
    var orn = btn.dataset.orn;
    if (!orn) return;
    if (action === 'accept') sendOrderUpdate(orn, { estado: 'aceptado' });
    if (action === 'reject') openRechazoModal(orn);
    if (action === 'deliver') sendOrderUpdate(orn, { estado: 'entregada' });
    if (action === 'cancel') {
      if (confirm('¿Cancelar ' + orn + '?')) sendOrderUpdate(orn, { estado: 'cancelada' });
    }
  });

  $('login-btn').onclick = doLogin;
  $('login-pass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });
  $('login-user').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  $('logout-btn').onclick = function () {
    sessionStorage.removeItem('brava_admin_token');
    token = '';
    showLogin();
  };

  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll('.tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      switchTab(btn.dataset.estado);
    };
  });

  $('btn-sound').onclick = function () {
    soundOn = true;
    playDing();
    $('btn-sound').textContent = 'Sonido activado ✓';
  };

  $('rechazo-close').onclick = closeRechazoModal;
  $('rechazo-extra').addEventListener('input', updateRechazoPreview);
  document.querySelectorAll('#rechazo-motivos input').forEach(function (cb) {
    cb.addEventListener('change', updateRechazoPreview);
  });
  $('rechazo-wa').onclick = function () {
    var o = rechazoOrn ? findOrder(rechazoOrn) : null;
    if (!o) return;
    var msg = buildRechazoMessage(o);
    var wa = telWa(o.telefono);
    window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  };
  $('rechazo-confirm').onclick = confirmRechazo;

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && token && !$('app-view').classList.contains('hidden')) {
      fetchOrdersFromServer(true);
    }
  });

  if (token) showApp();
  else showLogin();
})();
