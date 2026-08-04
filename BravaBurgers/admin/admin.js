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
      return r.json().then(function (d) {
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

  function renderRows(orders) {
    var tb = $('tbody');
    tb.innerHTML = '';
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

  function loadOrders() {
    $('app-err').hidden = true;
    api({ action: 'listOrders', token: token, estadoFilter: currentEstado }).then(function (res) {
      if (!res.data.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem('brava_admin_token');
          showLogin();
          return;
        }
        $('app-err').textContent = res.data.error || 'Error al cargar';
        $('app-err').hidden = false;
        return;
      }
      renderRows(res.data.orders || []);
      if (currentEstado === 'activa') {
        (res.data.orders || []).forEach(function (o) {
          if (o.orn) knownOrns.add(o.orn);
        });
      }
      $('poll-status').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
    });
  }

  function pollNewOrders() {
    api({ action: 'listOrders', token: token, estadoFilter: 'activa' }).then(function (res) {
      if (!res.data.ok) return;
      var list = res.data.orders || [];
      var neu = false;
      list.forEach(function (o) {
        if (o.orn && !knownOrns.has(o.orn)) {
          knownOrns.add(o.orn);
          neu = true;
        }
      });
      if (neu && currentEstado === 'activa') {
        playDing();
        loadOrders();
      }
    });
  }

  function updateEstado(orn, estado) {
    api({ action: 'updateOrder', token: token, orn: orn, estado: estado }).then(function (res) {
      if (res.data.ok) loadOrders();
    });
  }

  $('login-btn').onclick = function () {
    $('login-err').hidden = true;
    api({
      action: 'login',
      user: $('login-user').value.trim(),
      password: $('login-pass').value,
    }).then(function (res) {
      if (!res.data.ok) {
        $('login-err').textContent = 'Usuario o contraseña incorrectos';
        $('login-err').hidden = false;
        return;
      }
      token = res.data.token;
      sessionStorage.setItem('brava_admin_token', token);
      knownOrns = new Set();
      showApp();
    });
  };

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
      loadOrders();
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
