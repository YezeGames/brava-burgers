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

  var editOrn = null;

  var editItems = [];

  var editEnvio = 0;

  var editCatalog = null;

  var EDIT_MENU_SHEET_ID = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';



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
  var cierresCache = [];
  var cierresFetchInFlight = null;
  var cierresReady = false;
  var filterDesde = '';
  var filterHasta = '';
  var lastPuedeOperarCaja = null;



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

  function orderCajaDateIso(o) {
    if (o && o.entregado_at) {
      var d = new Date(o.entregado_at);
      if (!isNaN(d.getTime())) {
        return (
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0')
        );
      }
    }
    return orderDateIso(o);
  }

  function isHamburguesaItem(it) {
    var n = String((it && it.nombre) || '').toLowerCase();
    if (!n) return false;
    if (n.indexOf('burger') >= 0) return true;
    if (n.indexOf('hamburg') >= 0) return true;
    return false;
  }

  function hamburguesaEsDoble(it) {
    var n = String((it && it.nombre) || '').toLowerCase();
    return n.indexOf('doble') >= 0;
  }

  function cajaStorageKey() {
    return 'brava_caja_abierta_' + (filterDesde || '') + '_' + (filterHasta || '');
  }

  function aperturaStorageKey() {
    return 'brava_caja_apertura_at_' + (filterDesde || '') + '_' + (filterHasta || '');
  }

  function isCajaMarcadaAbierta() {
    try {
      return localStorage.getItem(cajaStorageKey()) === '1';
    } catch (e) {
      return false;
    }
  }

  function setCajaMarcadaAbierta(on) {
    try {
      if (on) localStorage.setItem(cajaStorageKey(), '1');
      else localStorage.removeItem(cajaStorageKey());
    } catch (e) {}
  }

  function getAperturaAtMs() {
    try {
      var iso = localStorage.getItem(aperturaStorageKey());
      if (!iso) return NaN;
      var t = new Date(iso).getTime();
      return isNaN(t) ? NaN : t;
    } catch (e) {
      return NaN;
    }
  }

  function setAperturaNow() {
    try {
      localStorage.setItem(aperturaStorageKey(), new Date().toISOString());
    } catch (e) {}
  }

  function clearApertura() {
    try {
      localStorage.removeItem(aperturaStorageKey());
    } catch (e) {}
  }

  function orderEntregadoAtMs(o) {
    if (!o || !o.entregado_at) return NaN;
    var t = new Date(o.entregado_at).getTime();
    return isNaN(t) ? NaN : t;
  }

  function gastoTimestampMs(g) {
    if (g && g.creado_at) {
      var t = new Date(g.creado_at).getTime();
      if (!isNaN(t)) return t;
    }
    var iso = String((g && g.fecha) || '').slice(0, 10);
    if (iso) return new Date(iso + 'T12:00:00').getTime();
    return 0;
  }

  function emptyCajaStats() {
    return {
      ef: 0,
      mp: 0,
      ventas: 0,
      cancel: 0,
      gTotal: 0,
      resultado: 0,
      simples: 0,
      dobles: 0,
      hambTotal: 0,
    };
  }

  function computeSesionStats() {
    var desdeMs = getAperturaAtMs();
    if (isNaN(desdeMs)) return emptyCajaStats();
    var hastaMs = Date.now();
    var ef = 0;
    var mp = 0;
    var cancel = 0;
    var simples = 0;
    var dobles = 0;
    allOrdersCache.forEach(function (o) {
      var e = normalizeEstado(o.estado);
      var total = Number(o.total) || 0;
      if (e === 'entregada') {
        if (!inDateRange(orderCajaDateIso(o))) return;
        var t = orderEntregadoAtMs(o);
        if (isNaN(t) || t < desdeMs || t > hastaMs) return;
        if (pagoEsEfectivo(o.pago)) ef += total;
        else mp += total;
        parseOrderItems(o).forEach(function (it) {
          if (!isHamburguesaItem(it)) return;
          var q = editItemQty(it);
          if (hamburguesaEsDoble(it)) dobles += q;
          else simples += q;
        });
      } else if (e === 'cancelada') {
        if (!inDateRange(orderDateIso(o))) return;
        var ct = o.cancelado_at ? new Date(o.cancelado_at).getTime() : NaN;
        if (isNaN(ct)) return;
        if (ct < desdeMs || ct > hastaMs) return;
        cancel += total;
      }
    });
    var ventas = ef + mp;
    var gTotal = 0;
    gastosCache.forEach(function (g) {
      if (!gastoInFilterRange(g)) return;
      var gt = gastoTimestampMs(g);
      if (gt >= desdeMs && gt <= hastaMs) gTotal += Number(g.monto) || 0;
    });
    return {
      ef: ef,
      mp: mp,
      ventas: ventas,
      cancel: cancel,
      gTotal: gTotal,
      resultado: ventas - gTotal,
      simples: simples,
      dobles: dobles,
      hambTotal: simples + dobles,
    };
  }

  /** Montos visibles en sidebar: solo con caja abierta; si no, todo en 0. */
  function computeCajaDisplayStats() {
    if (!isCajaTurnoActivo()) return emptyCajaStats();
    return computeSesionStats();
  }

  function normPeriodDate(v) {
    return String(v || '').slice(0, 10);
  }

  function syncCajaLocalConServidor() {
    if (findCierreForCurrentPeriod()) {
      setCajaMarcadaAbierta(false);
      clearApertura();
    }
  }

  function isCajaTurnoActivo() {
    if (!cierresReady) return false;
    if (findCierreForCurrentPeriod()) return false;
    return isCajaMarcadaAbierta() && !isNaN(getAperturaAtMs());
  }

  function mensajeBloqueoOperarPedidos() {
    if (!cierresReady) return 'Esperá un momento: cargando el estado de caja…';
    if (findCierreForCurrentPeriod()) {
      return 'Turno cerrado. Usá «Abrir caja» (columna derecha) antes de aceptar o marcar entregados.';
    }
    if (!isCajaMarcadaAbierta() || isNaN(getAperturaAtMs())) {
      return 'La caja no está abierta. Tocá «Abrir caja» para aceptar pedidos y que sumen en el turno.';
    }
    return '';
  }

  function updateTurnoPedidosBanner() {
    var el = $('turno-pedidos-banner');
    if (!el) return;
    if (isCajaTurnoActivo()) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    var msg = mensajeBloqueoOperarPedidos();
    el.classList.remove('hidden');
    el.innerHTML =
      '<strong>No podés operar pedidos en caja cerrada</strong>' +
      msg +
      ' Podés rechazar pedidos o imprimir ticket; aceptar y entregar quedan bloqueados hasta abrir.';
  }

  function syncTurnoPedidosUi() {
    var ok = isCajaTurnoActivo();
    updateTurnoPedidosBanner();
    if (lastPuedeOperarCaja !== ok) {
      lastPuedeOperarCaja = ok;
      if (allOrdersCache.length) {
        rebuildAllPanelFrags();
        paintCurrentTab();
      }
    }
  }

  function gastoInSesionTurno(g) {
    if (!g || !isCajaTurnoActivo()) return false;
    var desdeMs = getAperturaAtMs();
    if (!gastoInFilterRange(g)) return false;
    var gt = gastoTimestampMs(g);
    return gt >= desdeMs;
  }

  function gastosVisiblesTurno() {
    if (!cierresReady) return [];
    if (findCierreForCurrentPeriod()) return [];
    if (!isCajaMarcadaAbierta() || isNaN(getAperturaAtMs())) return [];
    return gastosCache.filter(gastoInSesionTurno);
  }

  function updateGastosChrome() {
    var btn = $('btn-add-gasto');
    var active = isCajaTurnoActivo();
    if (btn) {
      btn.disabled = !active;
      btn.title = active ? '' : 'Abrí la caja para agregar gastos del turno';
    }
  }

  function findCierreForCurrentPeriod() {
    var d = normPeriodDate(filterDesde);
    var h = normPeriodDate(filterHasta);
    for (var i = 0; i < cierresCache.length; i++) {
      var c = cierresCache[i];
      if (normPeriodDate(c.periodo_desde) === d && normPeriodDate(c.periodo_hasta) === h) return c;
    }
    return null;
  }

  function computePeriodStats() {
    var ef = 0;
    var mp = 0;
    var cancel = 0;
    var simples = 0;
    var dobles = 0;
    allOrdersCache.forEach(function (o) {
      var e = normalizeEstado(o.estado);
      var total = Number(o.total) || 0;
      if (e === 'entregada') {
        if (!inDateRange(orderCajaDateIso(o))) return;
        if (pagoEsEfectivo(o.pago)) ef += total;
        else mp += total;
        parseOrderItems(o).forEach(function (it) {
          if (!isHamburguesaItem(it)) return;
          var q = editItemQty(it);
          if (hamburguesaEsDoble(it)) dobles += q;
          else simples += q;
        });
      } else if (e === 'cancelada') {
        if (!inDateRange(orderDateIso(o))) return;
        cancel += total;
      }
    });
    var ventas = ef + mp;
    var gTotal = 0;
    gastosCache.forEach(function (g) {
      gTotal += Number(g.monto) || 0;
    });
    return {
      ef: ef,
      mp: mp,
      ventas: ventas,
      cancel: cancel,
      gTotal: gTotal,
      resultado: ventas - gTotal,
      simples: simples,
      dobles: dobles,
      hambTotal: simples + dobles,
    };
  }

  function formatCierreWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + ' ' + hh + ':' + mi;
  }

  function updateVentasRegistroChrome() {
    var hint = $('ventas-turno-hint');
    if (!hint) return;
    if (!cierresReady) {
      hint.textContent = 'Cargando turno…';
      return;
    }
    if (findCierreForCurrentPeriod()) {
      hint.textContent = 'Turno cerrado — hamburguesas en 0 (solo cuenta con caja abierta).';
      return;
    }
    if (isCajaTurnoActivo()) {
      hint.textContent = 'Contando entregados ✓ desde que abriste la caja.';
      return;
    }
    hint.textContent = 'Sin apertura — contadores en 0. Abrí caja para empezar.';
  }

  function updateCierreStatusUI() {
    var cierre = cierresReady ? findCierreForCurrentPeriod() : null;
    var abierta = cierresReady && isCajaTurnoActivo();
    var btnCierre = $('btn-cierre-caja');
    var btnAbrir = $('btn-abrir-caja');
    var estado = $('caja-estado');
    var detalle = $('caja-cierre-detalle');
    if (cierre) {
      if (estado) {
        estado.textContent = 'Caja cerrada';
        estado.classList.add('cerrada');
        estado.classList.remove('abierta');
      }
      if (detalle) {
        detalle.hidden = false;
        detalle.textContent =
          (cierre.id || '') +
          ' · ' +
          formatCierreWhen(cierre.cerrado_at) +
          ' · ventas $' +
          fmt(cierre.ventas_total || 0) +
          ' · abrí de nuevo para un turno en 0';
      }
      if (btnCierre) btnCierre.classList.add('hidden');
      if (btnAbrir) btnAbrir.classList.remove('hidden');
    } else if (abierta) {
      if (estado) {
        estado.textContent = 'Caja abierta';
        estado.classList.add('abierta');
        estado.classList.remove('cerrada');
      }
      if (detalle) detalle.hidden = true;
      if (btnCierre) btnCierre.classList.remove('hidden');
      if (btnAbrir) btnAbrir.classList.add('hidden');
    } else {
      if (estado) {
        estado.textContent = 'Caja sin abrir';
        estado.classList.remove('abierta', 'cerrada');
      }
      if (detalle) detalle.hidden = true;
      if (btnCierre) btnCierre.classList.add('hidden');
      if (btnAbrir) btnAbrir.classList.remove('hidden');
    }
  }

  function updateCajaUI() {
    if (!$('caja-ef')) return;
    var st = computeCajaDisplayStats();
    $('caja-ef').textContent = '$' + fmt(st.ef);
    $('caja-mp').textContent = '$' + fmt(st.mp);
    $('caja-ventas').textContent = '$' + fmt(st.ventas);
    $('caja-cancel').textContent = '$' + fmt(st.cancel);
    $('caja-gastos').textContent = '−$' + fmt(st.gTotal);
    $('caja-resultado').textContent = (st.resultado < 0 ? '−$' : '$') + fmt(Math.abs(st.resultado));
    var row = $('row-resultado');
    if (row) {
      row.classList.remove('pos', 'neg');
      row.classList.add(st.resultado >= 0 ? 'pos' : 'neg');
    }
    if ($('ventas-hamb-simples')) $('ventas-hamb-simples').textContent = String(Math.round(st.simples));
    if ($('ventas-hamb-dobles')) $('ventas-hamb-dobles').textContent = String(Math.round(st.dobles));
    if ($('ventas-hamb-total')) $('ventas-hamb-total').textContent = String(Math.round(st.hambTotal));
    updateVentasRegistroChrome();
    if ($('caja-range')) {
      var d1 = filterDesde ? filterDesde.split('-').reverse().join('/') : '…';
      var d2 = filterHasta ? filterHasta.split('-').reverse().join('/') : '…';
      var rango = d1 === d2 ? d1 : d1 + ' — ' + d2;
      if (findCierreForCurrentPeriod()) {
        $('caja-range').textContent = 'Turno cerrado · ' + rango;
      } else if (isCajaTurnoActivo()) {
        var ap = getAperturaAtMs();
        var desdeLbl = isNaN(ap)
          ? '—'
          : formatCierreWhen(new Date(ap).toISOString()).split(' ')[1] || '—';
        $('caja-range').textContent = 'Turno abierto desde ' + desdeLbl + ' · ' + rango;
      } else {
        $('caja-range').textContent = 'Sin apertura · ' + rango + ' (todo en $0 hasta abrir)';
      }
    }
    updateCierreStatusUI();
    updateGastosChrome();
    syncTurnoPedidosUi();
  }

  function loadCierres(force) {
    if (cierresFetchInFlight && !force) return cierresFetchInFlight;
    cierresFetchInFlight = api({ action: 'listCierres', token: token, limit: 50 })
      .then(function (res) {
        if (res.data.ok) {
          cierresCache = res.data.cierres || [];
          syncCajaLocalConServidor();
          updateCajaUI();
          renderGastosList();
          return true;
        }
        if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
        return false;
      })
      .finally(function () {
        cierresReady = true;
        cierresFetchInFlight = null;
        renderGastosList();
      });
    return cierresFetchInFlight;
  }

  function performAbrirCaja() {
    readDateFiltersFromUi();
    var cierre = findCierreForCurrentPeriod();
    if (cierre) {
      if (
        !confirm(
          '¿Abrir caja para este período?\n\nSe quita el cierre ' +
            (cierre.id || '') +
            ' de Supabase para poder operar y cerrar de nuevo cuando quieras.'
        )
      ) {
        return;
      }
      api({ action: 'deleteCierre', token: token, id: cierre.id }).then(function (res) {
        if (res.data.ok) {
          cierresCache = cierresCache.filter(function (x) {
            return x.id !== cierre.id;
          });
          setCajaMarcadaAbierta(true);
          setAperturaNow();
          updateCajaUI();
          renderGastosList();
          loadCierres(true);
        } else {
          if (res.status === 401) handleAuthFailure();
          else alert('No se pudo abrir la caja.');
        }
      });
      return;
    }
    setCajaMarcadaAbierta(true);
    setAperturaNow();
    updateCajaUI();
    renderGastosList();
  }

  function performCierreCaja() {
    if (findCierreForCurrentPeriod()) {
      alert('Este período ya está cerrado. Usá «Abrir caja» si querés operar de nuevo.');
      return;
    }
    if (!isCajaMarcadaAbierta()) {
      alert('Primero abrí la caja con el botón «Abrir caja».');
      return;
    }
    readDateFiltersFromUi();
    var st = computeSesionStats();
    var d1 = filterDesde ? filterDesde.split('-').reverse().join('/') : '…';
    var d2 = filterHasta ? filterHasta.split('-').reverse().join('/') : '…';
    var periodoLbl = d1 === d2 ? d1 : d1 + ' — ' + d2;
    var msg =
      '¿Cerrar caja del turno (' +
      periodoLbl +
      ')?\n\n' +
      'Se guarda este resumen y la caja vuelve a $0 hasta la próxima apertura.\n\n' +
      'Ventas del turno: $' +
      fmt(st.ventas) +
      ' (EF $' +
      fmt(st.ef) +
      ' · MP $' +
      fmt(st.mp) +
      ')\n' +
      'Gastos: $' +
      fmt(st.gTotal) +
      '\n' +
      'Resultado: $' +
      fmt(st.resultado) +
      '\n\n' +
      'Hamb. simples: ' +
      Math.round(st.simples) +
      '\n' +
      'Hamb. dobles: ' +
      Math.round(st.dobles) +
      '\n' +
      'Total hamburguesas: ' +
      Math.round(st.hambTotal);
    if (!confirm(msg)) return;
    var btn = $('btn-cierre-caja');
    if (btn) btn.disabled = true;
    var aperturaIso = isNaN(getAperturaAtMs()) ? null : new Date(getAperturaAtMs()).toISOString();
    api({
      action: 'createCierre',
      token: token,
      periodo_desde: filterDesde,
      periodo_hasta: filterHasta,
      ventana_desde: aperturaIso,
      ventana_hasta: new Date().toISOString(),
      efectivo: st.ef,
      mercado_pago: st.mp,
      ventas_total: st.ventas,
      gastos: st.gTotal,
      resultado: st.resultado,
      cancelados: st.cancel,
      hamb_simples: Math.round(st.simples),
      hamb_dobles: Math.round(st.dobles),
      hamb_total: Math.round(st.hambTotal),
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.data.ok && res.data.cierre) {
        setCajaMarcadaAbierta(false);
        clearApertura();
        cierresCache.unshift(res.data.cierre);
        updateCajaUI();
        renderGastosList();
        alert('Cierre guardado: ' + res.data.cierre.id);
        loadCierres(true);
      } else {
        if (res.status === 401) handleAuthFailure();
        else {
          alert('No se pudo guardar. Ejecutá en Supabase: supabase/cierres_caja_migration.sql');
        }
        updateCierreStatusUI();
      }
    });
  }

  function renderGastosList() {
    var ul = $('gasto-list');
    var empty = $('gastos-empty');
    if (!ul) return;
    ul.innerHTML = '';
    updateGastosChrome();
    var visibles = gastosVisiblesTurno();
    if (!visibles.length) {
      if (empty) {
        empty.classList.remove('hidden');
        if (!isCajaTurnoActivo()) {
          empty.textContent = 'Sin gastos — abrí la caja para cargar gastos del turno (ahora $0).';
        } else {
          empty.textContent = 'Sin gastos en este turno.';
        }
      }
      updateCajaUI();
      return;
    }
    if (empty) empty.classList.add('hidden');
    visibles.forEach(function (g) {
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
    cierresReady = false;
    loadCierres(true).then(function () {
      loadGastos(true);
    });
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

    cierresReady = false;

  }



  function showApp() {

    $('login-view').classList.add('hidden');

    $('app-view').classList.remove('hidden');

    initDateFilters();

    paintCurrentTab();

    loadOrders();

    cierresReady = false;
    loadCierres(true).then(function () {
      loadGastos(true);
    });

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



  function addActionBtn(parent, text, className, action, orn, title, disabled) {

    var b = document.createElement('button');

    b.type = 'button';

    b.className = className;

    b.textContent = text;

    b.dataset.action = action;

    b.dataset.orn = orn;

    if (title) b.title = title;

    if (disabled) {
      b.disabled = true;
      if (!title) b.title = mensajeBloqueoOperarPedidos();
    }

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



      var cajaOk = isCajaTurnoActivo();

      if (panelEstado === 'pendiente') {

        addActionBtn(
          actions,
          '✓',
          'btn-sm btn-ok',
          'accept',
          o.orn,
          cajaOk ? 'Aceptar pedido' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

        addActionBtn(actions, '✕', 'btn-sm btn-x', 'reject', o.orn, 'Rechazar pedido');

      }

      if (panelEstado === 'aceptado') {

        addActionBtn(actions, 'Editar', 'btn-sm btn-edit', 'edit', o.orn, 'Editar comanda');

        addActionBtn(
          actions,
          '✓',
          'btn-sm btn-ok',
          'deliver',
          o.orn,
          cajaOk ? 'Marcar entregado' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

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

        (String(o.modificado || '').toUpperCase() === 'SI'

          ? '<span class="badge-mod">editado</span>'

          : '') +

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



  function parseOrderItems(o) {

    if (!o) return [];

    if (Array.isArray(o.items) && o.items.length) return JSON.parse(JSON.stringify(o.items));

    if (o.items_json) {

      try {

        var j = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json;

        if (Array.isArray(j)) return j;

      } catch (e) {}

    }

    return [];

  }



  function editItemQty(it) {

    var q = it.qty != null ? it.qty : it.cantidad;

    q = parseFloat(q);

    return isNaN(q) || q <= 0 ? 1 : q;

  }



  function editItemPrecio(it) {

    var p = parseFloat(it.precio);

    return isNaN(p) ? 0 : p;

  }



  function normalizeItemsForSave(items) {

    return (items || []).map(function (it) {

      return {

        nombre: it.nombre || it.name || 'Ítem',

        variedad: it.variedad || '',

        acl: (it.acl || it.aclaraciones || '').trim(),

        qty: editItemQty(it),

        precio: editItemPrecio(it),

      };

    });

  }



  function recalcEditTotals() {

    var sub = 0;

    editItems.forEach(function (it) {

      sub += editItemQty(it) * editItemPrecio(it);

    });

    return { subtotal: sub, total: sub + (Number(editEnvio) || 0) };

  }



  function loadEditCatalog(done) {

    if (editCatalog && editCatalog.length) {

      done(editCatalog);

      return;

    }

    if (typeof Papa === 'undefined') {

      done([]);

      return;

    }

    var url =

      'https://docs.google.com/spreadsheets/d/' +

      EDIT_MENU_SHEET_ID +

      '/gviz/tq?tqx=out:csv&sheet=' +

      encodeURIComponent('productos');

    fetch(url)

      .then(function (r) {

        return r.text();

      })

      .then(function (csv) {

        var parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

        var list = [];

        (parsed.data || []).forEach(function (row, i) {

          var nombre = String(row.nombre || row.Nombre || '').trim();

          if (!nombre) return;

          var oculto = String(row.ocultar || row.Ocultar || '').toLowerCase();

          if (oculto === 'si' || oculto === 'sí') return;

          var precio = parseInt(String(row.precio || row.Precio || '0').replace(/[^0-9]/g, ''), 10) || 0;

          list.push({

            key: 'p' + i,

            nombre: nombre,

            variedad: String(row.variedad || row.Variedad || '').trim(),

            precio: precio,

          });

        });

        editCatalog = list;

        done(list);

      })

      .catch(function () {

        done([]);

      });

  }



  function fillEditAddSelect(catalog) {

    var sel = $('edit-add-select');

    if (!sel) return;

    if (!catalog.length) {

      sel.innerHTML = '<option value="">(Menú no cargado — igual podés +/- ítems)</option>';

      return;

    }

    sel.innerHTML = catalog

      .map(function (c) {

        var label = c.nombre + (c.variedad ? ' (' + c.variedad + ')' : '') + ' — ' + fmt(c.precio);

        return '<option value="' + c.key + '">' + label + '</option>';

      })

      .join('');

  }



  function renderEditModalItems() {

    var box = $('edit-items');

    if (!box) return;

    var html = '';

    editItems.forEach(function (it, idx) {

      var det = it.variedad ? it.variedad : '';

      var acl = (it.acl || it.aclaraciones || '').trim();

      if (acl) det += (det ? ' · ' : '') + 'Acl.: ' + acl;

      html +=

        '<div class="modal-item">' +

        '<div><strong>' +

        (it.nombre || 'Ítem') +

        '</strong>' +

        (det ? '<small>' + det + '</small>' : '') +

        '</div>' +

        '<div class="modal-qty">' +

        '<button type="button" data-edit-qty="' +

        idx +

        '" data-delta="-1">−</button>' +

        '<span>' +

        editItemQty(it) +

        '</span>' +

        '<button type="button" data-edit-qty="' +

        idx +

        '" data-delta="1">+</button>' +

        '</div>' +

        '<span>' +

        fmt(editItemQty(it) * editItemPrecio(it)) +

        '</span></div>';

    });

    html +=

      '<div class="modal-item" style="background:#fafafa;"><div>Envío</div><div></div><span>' +

      fmt(editEnvio) +

      '</span></div>';

    box.innerHTML = html;

    var totals = recalcEditTotals();

    $('edit-total').textContent =

      'Total: ' + fmt(totals.total) + ' (productos ' + fmt(totals.subtotal) + ' + envío)';

  }



  function openEditModal(orn) {

    var o = findOrderByOrn(orn);

    if (!o) {

      alert('Pedido no encontrado.');

      return;

    }

    if (normalizeEstado(o.estado) !== 'aceptado') {

      alert('Solo podés editar pedidos en Aceptados.');

      return;

    }

    editOrn = orn;

    editItems = normalizeItemsForSave(parseOrderItems(o));

    editEnvio = Number(o.envio) || 0;

    $('edit-sub').textContent =

      o.orn +

      ' · ' +

      (o.cliente || '') +

      ' — Si pidieron más por WhatsApp, ajustá acá (mismo ORN).';

    loadEditCatalog(function (catalog) {

      fillEditAddSelect(catalog);

      renderEditModalItems();

      $('edit-modal').classList.remove('hidden');

    });

  }



  function closeEditModal() {

    editOrn = null;

    editItems = [];

    $('edit-modal').classList.add('hidden');

  }



  function changeEditQty(idx, delta) {

    if (!editItems[idx]) return;

    var q = editItemQty(editItems[idx]) + delta;

    if (q <= 0) editItems.splice(idx, 1);

    else editItems[idx].qty = q;

    renderEditModalItems();

  }



  function addEditCatalogLine() {

    var sel = $('edit-add-select');

    if (!sel || !editCatalog || !editCatalog.length) return;

    var c = editCatalog.find(function (x) {

      return x.key === sel.value;

    });

    if (!c) return;

    var found = editItems.find(function (it) {

      return (it.nombre || '') === c.nombre && (it.variedad || '') === c.variedad && !(it.acl || it.aclaraciones);

    });

    if (found) found.qty = editItemQty(found) + 1;

    else

      editItems.push({

        nombre: c.nombre,

        variedad: c.variedad,

        acl: '',

        qty: 1,

        precio: c.precio,

      });

    renderEditModalItems();

  }



  function saveEditModal() {

    if (!editOrn || !editItems.length) {

      alert('Agregá al menos un ítem.');

      return;

    }

    var totals = recalcEditTotals();

    var items = normalizeItemsForSave(editItems);

    var now = new Date().toISOString();

    sendOrderUpdate(editOrn, {

      items: items,

      subtotal: totals.subtotal,

      total: totals.total,

      modificado: 'SI',

      modificado_at: now,

      items_json: JSON.stringify(items),

    });

    closeEditModal();

  }



  function sendOrderUpdate(orn, patch) {

    patchOrderInCache(orn, patch);

    var body = { action: 'updateOrder', token: token, orn: orn };

    if (patch.estado) body.estado = patch.estado;

    if (patch.rechazo_mensaje != null) body.rechazoMensaje = patch.rechazo_mensaje;

    if (patch.items) body.items = patch.items;

    if (patch.subtotal != null) body.subtotal = patch.subtotal;

    if (patch.total != null) body.total = patch.total;

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

    if (!window.BravaComanda || !window.BravaComanda.renderTicketHtml) {

      alert('No cargó el módulo de comanda. Recargá con Ctrl+Shift+R.');

      return;

    }

    window.BravaComanda.storeOrderForPrint(o);

    $('comanda-ticket-inner').innerHTML = window.BravaComanda.renderTicketHtml(o);

    $('comanda-modal-title').textContent = 'Comanda ' + o.orn;

    $('comanda-modal').classList.remove('hidden');

  }



  function closeComandaModal() {

    $('comanda-modal').classList.add('hidden');

    document.body.classList.remove('printing-comanda');

  }



  function printComandaModal() {

    document.body.classList.add('printing-comanda');

    var done = function () {

      document.body.classList.remove('printing-comanda');

    };

    if (window.matchMedia) {

      window.matchMedia('print').addEventListener(

        'change',

        function m(e) {

          if (!e.matches) {

            done();

            window.matchMedia('print').removeEventListener('change', m);

          }

        },

        { once: true }

      );

    }

    window.onafterprint = function () {

      done();

      window.onafterprint = null;

    };

    window.print();

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

    if (action === 'edit') {

      var ornEdit = btn.dataset.orn;

      if (ornEdit) openEditModal(ornEdit);

      return;

    }

    var orn = btn.dataset.orn;

    if (!orn) return;

    if (action === 'accept') {
      if (!isCajaTurnoActivo()) {
        alert(mensajeBloqueoOperarPedidos());
        return;
      }
      sendOrderUpdate(orn, { estado: 'aceptado' });
    }

    if (action === 'reject') openRechazoModal(orn);

    if (action === 'deliver') {
      if (!isCajaTurnoActivo()) {
        alert(mensajeBloqueoOperarPedidos());
        return;
      }
      sendOrderUpdate(orn, { estado: 'entregada' });
    }

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

  if ($('comanda-close')) $('comanda-close').onclick = closeComandaModal;

  if ($('comanda-print')) $('comanda-print').onclick = printComandaModal;

  if ($('comanda-modal')) {

    $('comanda-modal').addEventListener('click', function (e) {

      if (e.target === $('comanda-modal')) closeComandaModal();

    });

  }

  if ($('edit-close')) $('edit-close').onclick = closeEditModal;

  if ($('edit-save')) $('edit-save').onclick = saveEditModal;

  if ($('edit-add-btn')) $('edit-add-btn').onclick = addEditCatalogLine;

  if ($('edit-items')) {

    $('edit-items').addEventListener('click', function (e) {

      var b = e.target.closest('[data-edit-qty]');

      if (!b) return;

      changeEditQty(parseInt(b.getAttribute('data-edit-qty'), 10), parseInt(b.getAttribute('data-delta'), 10));

    });

  }

  if ($('edit-modal')) {

    $('edit-modal').addEventListener('click', function (e) {

      if (e.target === $('edit-modal')) closeEditModal();

    });

  }



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

  if ($('btn-abrir-caja')) $('btn-abrir-caja').onclick = performAbrirCaja;

  if ($('btn-cierre-caja')) $('btn-cierre-caja').onclick = performCierreCaja;

  if ($('btn-add-gasto')) {
    $('btn-add-gasto').onclick = function () {
      if (!isCajaTurnoActivo()) {
        alert('Abrí la caja antes de agregar gastos. Sin apertura la lista queda en 0.');
        return;
      }
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
        creado_at: new Date().toISOString(),
      };
      if (isCajaTurnoActivo()) {
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
            if (!g.creado_at) g.creado_at = new Date().toISOString();
            if (gastoInSesionTurno(g)) gastosCache.unshift(g);
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


