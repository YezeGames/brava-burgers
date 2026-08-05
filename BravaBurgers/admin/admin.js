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

  var gastosPollEvery = 3;

  var gastosFetchInFlight = null;

  var sbClient = null;

  var sbChannels = [];

  var realtimeLive = false;

  var POLL_FALLBACK_MS = 15000;

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
  var gastosCache = [];
  var filterDesde = '';
  var filterHasta = '';



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

    var ms = realtimeLive ? POLL_FALLBACK_MS : POLL_MS;

    pollTimer = setInterval(pollNewOrders, ms);

    pollNewOrders();

  }

  function teardownRealtime() {

    realtimeLive = false;

    sbChannels.forEach(function (ch) {

      try {

        if (sbClient) sbClient.removeChannel(ch);

      } catch (ignore) {}

    });

    sbChannels = [];

    sbClient = null;

  }

  function onRealtimeDataChange() {

    var prevPendientes = new Set();

    allOrdersCache.forEach(function (o) {

      if (normalizeEstado(o.estado) === 'pendiente' && o.orn) prevPendientes.add(o.orn);

    });

    fetchOrdersFromServer(true).then(function (ok) {

      if (!ok) return;

      var neu = false;

      allOrdersCache.forEach(function (o) {

        if (normalizeEstado(o.estado) === 'pendiente' && o.orn && !prevPendientes.has(o.orn)) neu = true;

      });

      if (neu) playDing();

    });

    loadGastos(true);

  }

  function initSupabaseRealtime(cfg) {

    teardownRealtime();

    if (!cfg || !cfg.url || !cfg.anonKey || !cfg.access_token || !window.supabase) return Promise.resolve(false);

    sbClient = window.supabase.createClient(cfg.url, cfg.anonKey);

    return sbClient.auth

      .setSession({

        access_token: cfg.access_token,

        refresh_token: cfg.refresh_token || '',

      })

      .then(function (res) {

        if (res.error) return false;

        var chOrders = sbClient

          .channel('brava-admin-orders')

          .on(

            'postgres_changes',

            { event: '*', schema: 'public', table: 'orders' },

            function () {

              onRealtimeDataChange();

            }

          )

          .subscribe();

        var chGastos = sbClient

          .channel('brava-admin-gastos')

          .on(

            'postgres_changes',

            { event: '*', schema: 'public', table: 'gastos' },

            function () {

              loadGastos(true);

              updateCajaUI();

            }

          )

          .subscribe();

        sbChannels.push(chOrders, chGastos);

        realtimeLive = true;

        updatePollStatusLabel();

        startPolling();

        return true;

      })

      .catch(function () {

        return false;

      });

  }

  function bootstrapRealtimeAfterLogin(cfg) {

    return initSupabaseRealtime(cfg).then(function (ok) {

      if (!ok && $('poll-status')) $('poll-status').textContent = 'Sync cada ~0,4 s (sin realtime)';

    });

  }

  function refreshSupabaseSession() {

    if (!token) return Promise.resolve();

    return api({ action: 'refreshRealtime', token: token }).then(function (res) {

      if (res.data.ok && res.data.realtime) return initSupabaseRealtime(res.data.realtime);

    });

  }



  function $(id) {

    return document.getElementById(id);

  }



  function fmt(n) {
    return Number(n).toLocaleString('es-AR');
  }

  function todayIsoLocal() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function initDateFilters() {
    var t = todayIsoLocal();
    filterDesde = t;
    filterHasta = t;
    if ($('filtro-desde')) $('filtro-desde').value = t;
    if ($('filtro-hasta')) $('filtro-hasta').value = t;
  }

  function readDateFiltersFromUi() {
    filterDesde = ($('filtro-desde') && $('filtro-desde').value) || filterDesde;
    filterHasta = ($('filtro-hasta') && $('filtro-hasta').value) || filterHasta;
  }

  function orderDateIso(o) {
    if (!o || !o.fecha_creado) return '';
    var d = new Date(o.fecha_creado);
    if (isNaN(d.getTime())) return '';
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function inDateRange(iso) {
    if (!iso) return false;
    if (filterDesde && iso < filterDesde) return false;
    if (filterHasta && iso > filterHasta) return false;
    return true;
  }

  function pagoEsEfectivo(pago) {
    var p = String(pago || '').toLowerCase();
    return p.indexOf('efectivo') >= 0;
  }

  function updateCajaUI() {
    if (!$('caja-ef')) return;
    var ef = 0;
    var mp = 0;
    var cancel = 0;
    allOrdersCache.forEach(function (o) {
      if (!inDateRange(orderDateIso(o))) return;
      var e = normalizeEstado(o.estado);
      var total = Number(o.total) || 0;
      if (e === 'entregada') {
        if (pagoEsEfectivo(o.pago)) ef += total;
        else mp += total;
      }
      if (e === 'cancelada') cancel += total;
    });
    var ventas = ef + mp;
    var gTotal = 0;
    gastosCache.forEach(function (g) {
      gTotal += Number(g.monto) || 0;
    });
    var resultado = ventas - gTotal;
    $('caja-ef').textContent = '$' + fmt(ef);
    $('caja-mp').textContent = '$' + fmt(mp);
    $('caja-ventas').textContent = '$' + fmt(ventas);
    $('caja-cancel').textContent = '$' + fmt(cancel);
    $('caja-gastos').textContent = '−$' + fmt(gTotal);
    $('caja-resultado').textContent = (resultado < 0 ? '−$' : '$') + fmt(Math.abs(resultado));
    var row = $('row-resultado');
    if (row) {
      row.classList.remove('pos', 'neg');
      row.classList.add(resultado >= 0 ? 'pos' : 'neg');
    }
    if ($('caja-range')) {
      var d1 = filterDesde ? filterDesde.split('-').reverse().join('/') : '…';
      var d2 = filterHasta ? filterHasta.split('-').reverse().join('/') : '…';
      $('caja-range').textContent = d1 === d2 ? 'Período: ' + d1 : 'Período: ' + d1 + ' — ' + d2;
    }
  }

  function renderGastosList() {
    var ul = $('gasto-list');
    var empty = $('gastos-empty');
    if (!ul) return;
    ul.innerHTML = '';
    if (!gastosCache.length) {
      if (empty) empty.classList.remove('hidden');
      updateCajaUI();
      return;
    }
    if (empty) empty.classList.add('hidden');
    gastosCache.forEach(function (g) {
      var li = document.createElement('li');
      var pagado = g.pagado_con || '';
      var pagadoLbl =
        pagado === 'efectivo' ? 'Efectivo' : pagado === 'transferencia' ? 'Transferencia' : pagado;
      li.innerHTML =
        '<div class="concept">' +
        escapeHtml(g.concepto || '') +
        (pagadoLbl ? '<small>' + escapeHtml(pagadoLbl) + '</small>' : '') +
        '</div><span class="monto">−$' +
        fmt(g.monto) +
        '</span><button type="button" class="btn-del" data-gasto-id="' +
        escapeHtml(g.id) +
        '" title="Eliminar">✕</button>';
      ul.appendChild(li);
    });
    ul.querySelectorAll('.btn-del').forEach(function (btn) {
      btn.onclick = function () {
        var gid = btn.getAttribute('data-gasto-id');
        if (!gid || !confirm('¿Eliminar gasto ' + gid + '?')) return;
        var prev = gastosCache.slice();
        gastosCache = gastosCache.filter(function (g) {
          return g.id !== gid;
        });
        renderGastosList();
        api({ action: 'deleteGasto', token: token, id: gid }).then(function (res) {
          if (res.data.ok) loadGastos(true);
          else {
            gastosCache = prev;
            renderGastosList();
            if (res.status === 401) handleAuthFailure();
            else alert('No se pudo eliminar el gasto.');
          }
        });
      };
    });
    updateCajaUI();
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function gastoInFilterRange(g) {
    var iso = String(g.fecha || '').slice(0, 10);
    if (!iso) return true;
    if (filterDesde && iso < filterDesde) return false;
    if (filterHasta && iso > filterHasta) return false;
    return true;
  }

  function loadGastos(force) {
    readDateFiltersFromUi();
    if (gastosFetchInFlight && !force) return gastosFetchInFlight;
    gastosFetchInFlight = api({
      action: 'listGastos',
      token: token,
      desde: filterDesde,
      hasta: filterHasta,
    })
      .then(function (res) {
        if (res.data.ok) {
          gastosCache = res.data.gastos || [];
          renderGastosList();
          return true;
        }
        if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
        return false;
      })
      .finally(function () {
        gastosFetchInFlight = null;
      });
    return gastosFetchInFlight;
  }

  function applyDateFilter() {
    readDateFiltersFromUi();
    fetchOrdersFromServer(true);
    loadGastos();
    updateCajaUI();
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

    teardownRealtime();

    if (pollTimer) clearInterval(pollTimer);

    pollTimer = null;

  }



  function showApp() {

    $('login-view').classList.add('hidden');

    $('app-view').classList.remove('hidden');

    initDateFilters();

    paintCurrentTab();

    loadOrders();

    loadGastos();

    refreshSupabaseSession().finally(function () {

      startPolling();

    });

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

      print.dataset.orn = o.orn;

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

    if (err === 'server_error' || err === 'supabase_not_configured') {
      return 'No se pudieron cargar los pedidos (Supabase). Probá recargar en 1 minuto.';
    }
    if (String(err).indexOf('supabase_http_') === 0) {
      return 'Supabase respondió con error. Revisá que corriste schema.sql en el proyecto.';
    }
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

    updateCajaUI();

    updatePollStatusLabel();

  }



  function updatePollStatusLabel() {

    var el = $('poll-status');

    if (!el) return;

    var t = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (realtimeLive) el.textContent = 'En vivo · Supabase · lista al día ' + t;

    else el.textContent = 'Lista al día ' + t + ' (sync automático)';

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

    if (pollTick % gastosPollEvery === 0) loadGastos();

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

    updateCajaUI();

  }



  function sendOrderUpdate(orn, patch) {

    patchOrderInCache(orn, patch);

    var body = { action: 'updateOrder', token: token, orn: orn };

    if (patch.estado) body.estado = patch.estado;

    if (patch.rechazo_mensaje != null) body.rechazoMensaje = patch.rechazo_mensaje;

    api(body).then(function (res) {

      if (res.data.ok) {
        updateCajaUI();
        return;
      }

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

              ? 'Falta configurar ADMIN_USER y ADMIN_PASSWORD en Vercel'

              : res.data.error === 'server_error'

                ? 'Error en el servidor (Vercel). Esperá 1 minuto y probá de nuevo.'

              : res.data.error === 'invalid_gas_response' || res.data.error === 'invalid_response'

                ? 'Error al conectar con el servidor. Probá en unos minutos.'

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

        if (res.data.realtime) bootstrapRealtimeAfterLogin(res.data.realtime);

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



  function findOrderByOrn(orn) {

    for (var i = 0; i < allOrdersCache.length; i++) {

      if (allOrdersCache[i].orn === orn) return allOrdersCache[i];

    }

    return null;

  }



  function openComanda(orn) {

    var o = findOrderByOrn(orn);

    if (!o) {

      alert('No encontramos ese pedido. Probá APLICAR o recargá el panel.');

      return;

    }

    sessionStorage.setItem('brava_comanda_print', JSON.stringify(o));

    window.open('/admin/comanda.html', '_blank', 'noopener');

  }



  $('orders-table').addEventListener('click', function (e) {

    var btn = e.target.closest('[data-action]');

    if (!btn) return;

    var action = btn.dataset.action;

    if (action === 'ticket') {

      var ornTicket = btn.dataset.orn;

      if (ornTicket) openComanda(ornTicket);

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

    teardownRealtime();

    if (pollTimer) clearInterval(pollTimer);

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

  if ($('btn-filtro-aplicar')) $('btn-filtro-aplicar').onclick = applyDateFilter;

  if ($('btn-filtro-hoy')) {
    $('btn-filtro-hoy').onclick = function () {
      initDateFilters();
      applyDateFilter();
    };
  }

  if ($('btn-add-gasto')) {
    $('btn-add-gasto').onclick = function () {
      $('g-concepto').value = '';
      $('g-monto').value = '';
      $('g-fecha').value = filterHasta || todayIsoLocal();
      $('g-pagado').value = '';
      $('gasto-modal').classList.remove('hidden');
      $('g-concepto').focus();
    };
  }

  if ($('g-cancel')) {
    $('g-cancel').onclick = function () {
      $('gasto-modal').classList.add('hidden');
    };
  }

  if ($('g-save')) {
    $('g-save').onclick = function () {
      var concepto = $('g-concepto').value.trim();
      var monto = parseFloat($('g-monto').value, 10);
      var fecha = $('g-fecha').value || todayIsoLocal();
      var pagadoCon = $('g-pagado').value;
      if (!concepto || !monto || monto <= 0) {
        alert('Completá concepto y monto.');
        return;
      }
      var tempId = 'tmp-' + Date.now();
      var optimistic = {
        id: tempId,
        fecha: fecha,
        concepto: concepto,
        monto: monto,
        pagado_con: pagadoCon,
      };
      if (gastoInFilterRange(optimistic)) {
        gastosCache.unshift(optimistic);
        renderGastosList();
      }
      $('gasto-modal').classList.add('hidden');
      api({
        action: 'createGasto',
        token: token,
        concepto: concepto,
        monto: monto,
        fecha: fecha,
        pagadoCon: pagadoCon,
      }).then(function (res) {
        if (res.data.ok) {
          gastosCache = gastosCache.filter(function (g) {
            return g.id !== tempId;
          });
          if (res.data.gasto) {
            var g = res.data.gasto;
            if (gastoInFilterRange(g)) gastosCache.unshift(g);
          }
          renderGastosList();
          loadGastos(true);
        } else {
          gastosCache = gastosCache.filter(function (g) {
            return g.id !== tempId;
          });
          renderGastosList();
          if (res.status === 401) handleAuthFailure();
          else alert('No se pudo guardar el gasto.');
        }
      });
    };
  }

  document.addEventListener('visibilitychange', function () {

    if (document.visibilityState === 'visible' && token && !$('app-view').classList.contains('hidden')) {

      fetchOrdersFromServer(true);
      loadGastos();

    }

  });



  if (token) showApp();

  else showLogin();

})();


