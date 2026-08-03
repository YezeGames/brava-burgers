(function () {
  var API = '/api/admin';
  var token = sessionStorage.getItem('brava_admin_token') || '';
  var currentEstado = 'activa';
  var knownOrns = new Set();
  var soundOn = false;
  var audioCtx = null;
  var pollTimer = null;

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
    loadOrders();
    pollTimer = setInterval(pollNewOrders, 20000);
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

  var allOrdersCache = [];

  function renderTabCounts(orders) {
    var counts = { activa: 0, entregada: 0, cancelada: 0 };
    orders.forEach(function (o) {
      var e = String(o.estado || '').trim().toLowerCase();
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

  function ordersForTab(orders) {
    return orders.filter(function (o) {
      return String(o.estado || '').trim().toLowerCase() === currentEstado;
    });
  }

  function renderRows(orders) {
    var tb = $('tbody');
    tb.innerHTML = '';
    if (!orders.length) {
      var empty = document.createElement('tr');
      var hint =
        currentEstado === 'activa'
          ? 'No hay pedidos activos. Si ya los entregaste, mirá la pestaña <strong>Entregados</strong>.'
          : 'No hay pedidos en esta pestaña.';
      empty.innerHTML =
        '<td colspan="7" style="padding:24px;text-align:center;color:#666;">' + hint + '</td>';
      tb.appendChild(empty);
      return;
    }
    orders.forEach(function (o) {
      var tr = document.createElement('tr');
      var fecha = o.fecha_creado ? new Date(o.fecha_creado).toLocaleString('es-AR') : '';
      var wa = telWa(o.telefono);
      var actions = document.createElement('div');
      actions.className = 'actions';
      if (currentEstado === 'activa') {
        var ok = document.createElement('button');
        ok.className = 'btn-sm btn-ok';
        ok.textContent = '✓';
        ok.onclick = function () {
          updateEstado(o.orn, 'entregada');
        };
        var x = document.createElement('button');
        x.className = 'btn-sm btn-x';
        x.textContent = '✕';
        x.onclick = function () {
          if (confirm('¿Cancelar ' + o.orn + '?')) updateEstado(o.orn, 'cancelada');
        };
        actions.appendChild(ok);
        actions.appendChild(x);
      }
      var a = document.createElement('a');
      a.className = 'btn-wa';
      a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola, pedido ' + o.orn);
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<i class="fab fa-whatsapp"></i>';
      actions.appendChild(a);
      var print = document.createElement('button');
      print.className = 'btn-sm';
      print.textContent = 'Ticket';
      print.onclick = function () {
        window.open('../comanda-ejemplo.html', '_blank');
      };
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
      tb.appendChild(tr);
    });
  }

  function listErrorMessage(err) {
    if (err === 'invalid_gas_response' || err === 'gas_network_error' || err === 'gas_failed') {
      return 'No se pudo conectar con Google. Esperá unos segundos y tocá Activas de nuevo.';
    }
    return err || 'Error al cargar pedidos';
  }

  function handleAuthFailure() {
    sessionStorage.removeItem('brava_admin_token');
    token = '';
    showLogin();
  }

  function applyTabView() {
    renderTabCounts(allOrdersCache);
    renderRows(ordersForTab(allOrdersCache));
  }

  function fetchOrdersFromServer() {
    $('app-err').hidden = true;
    return api({ action: 'listOrders', token: token, estadoFilter: '' })
      .then(function (res) {
        if (!res.data.ok) {
          if (res.status === 401 || res.data.error === 'unauthorized') {
            handleAuthFailure();
            return false;
          }
          $('app-err').textContent = listErrorMessage(res.data.error);
          $('app-err').hidden = false;
          return false;
        }
        allOrdersCache = res.data.orders || [];
        if (currentEstado === 'activa') {
          ordersForTab(allOrdersCache).forEach(function (o) {
            if (o.orn) knownOrns.add(o.orn);
          });
        }
        applyTabView();
        $('poll-status').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
        return true;
      })
      .catch(function () {
        $('app-err').textContent = 'Sin conexión al servidor. Revisá internet e intentá otra vez.';
        $('app-err').hidden = false;
        return false;
      });
  }

  function loadOrders() {
    fetchOrdersFromServer().then(function (ok) {
      if (!ok && !allOrdersCache.length) renderRows([]);
    });
  }

  function pollNewOrders() {
    api({ action: 'listOrders', token: token, estadoFilter: '' }).then(function (res) {
      if (!res.data.ok) return;
      var list = res.data.orders || [];
      var neu = false;
      list.forEach(function (o) {
        var e = String(o.estado || '').trim().toLowerCase();
        if (e === 'activa' && o.orn && !knownOrns.has(o.orn)) {
          knownOrns.add(o.orn);
          neu = true;
        }
      });
      allOrdersCache = list;
      renderTabCounts(allOrdersCache);
      applyTabView();
      if (neu) playDing();
      $('poll-status').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
    });
  }

  function patchOrderEstadoInCache(orn, estado) {
    for (var i = 0; i < allOrdersCache.length; i++) {
      if (allOrdersCache[i].orn === orn) {
        allOrdersCache[i].estado = estado;
        break;
      }
    }
    applyTabView();
  }

  function updateEstado(orn, estado) {
    patchOrderEstadoInCache(orn, estado);
    api({ action: 'updateOrder', token: token, orn: orn, estado: estado }).then(function (res) {
      if (res.data.ok) fetchOrdersFromServer();
      else if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
      else {
        $('app-err').textContent = listErrorMessage(res.data.error);
        $('app-err').hidden = false;
        fetchOrdersFromServer();
      }
    });
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
      currentEstado = btn.dataset.estado;
      applyTabView();
    };
  });

  $('btn-sound').onclick = function () {
    soundOn = true;
    playDing();
    $('btn-sound').textContent = 'Sonido activado ✓';
  };

  if (token) showApp();
  else showLogin();
})();
