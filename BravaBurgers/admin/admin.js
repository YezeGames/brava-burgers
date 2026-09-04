(function () {

  var API = '/api/admin';

  var token = sessionStorage.getItem('brava_admin_token') || '';

  var currentEstado = 'pendiente';

  var knownOrns = new Set();

  var newPendingOrns = new Set();

  var hasSeededPendingBaseline = false;

  var soundOn = false;

  var audioCtx = null;

  var ALERT_SOUND_URL = '/admin/sounds/zumbido.mp3?v=1';

  var alertAudio = null;

  /** true solo si el MP3 no existe o no se puede decodificar */
  var alertMp3Broken = false;

  /** Respaldo si no carga el MP3 */
  var ALERT_SOUND_NOTES = [
    { freq: 659.25, at: 0, dur: 0.16, wave: 'triangle', vol: 0.28 },
    { freq: 830.61, at: 0.13, dur: 0.2, wave: 'triangle', vol: 0.32 },
    { freq: 987.77, at: 0.26, dur: 0.55, wave: 'sine', vol: 0.26 },
  ];

  var pollTimer = null;

  var POLL_MS = 400;

  var pollTick = 0;

  var gastosPollEvery = 3;

  var gastosFetchInFlight = null;

  var ingresosFetchInFlight = null;

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

  var editProductGroups = null;

  var editExtrasCatalog = null;

  var editDeliveryZones = null;

  var editMenuLoadPromise = null;

  var EDIT_MENU_SHEET_ID = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';

  var allOrdersCache = [];

  var fetchInFlight = null;

  var cacheSignature = '';

  var TAB_ESTADOS = ['pendiente', 'aceptado', 'en_preparacion', 'en_camino', 'entregada', 'cancelada', 'rechazado'];

  var panelFrags = {

    pendiente: null,

    aceptado: null,

    en_preparacion: null,

    en_camino: null,

    rechazado: null,

    entregada: null,

    cancelada: null,

  };

  var rechazoOrn = null;
  var gastosCache = [];

  var ingresosCache = [];
  var cierresCache = [];
  var cierresFetchInFlight = null;
  var cierresReady = false;
  var filterDesde = '';
  var filterHasta = '';
  var lastPuedeOperarCaja = null;
  var pendingCierreSnapshot = null;
  var cashArqueoMode = 'cierre';
  var cashArqueoEsperadoEf = 0;
  var cashArqueoEsperadoMp = 0;
  var pendingAperturaArqueoDone = null;
  var selectedHistorialCierreId = null;
  var cierresHistorialList = [];
  var cierresHistorialHasMore = false;
  var cierresHistorialFetchInFlight = null;
  var selectedProformaOrn = null;
  var proformasList = [];
  var proformasHasMore = false;
  var proformasFetchInFlight = null;
  var proformasSearchTimer = null;



  function normalizeEstado(est) {

    var e = String(est || '')

      .trim()

      .toLowerCase();

    if (e === 'activa') return 'pendiente';

    return e;

  }



  /** ORN de comanda (ORN-DEL). Rechazados y refs PEND no cuentan como ORN. */
  function orderDisplayOrn(o) {

    if (!o) return '—';

    if (normalizeEstado(o.estado) === 'rechazado') return '—';

    var orn = String(o.orn || '').trim();

    if (!orn) return '—';

    if (orn.indexOf('ORN-DEL-') === 0) return orn;

    if (orn.indexOf('PEND-DEL-') === 0) return orn;

    return orn;

  }



  function emptyPanelFrags() {

    panelFrags = {

      pendiente: null,

      aceptado: null,

      en_preparacion: null,

      en_camino: null,

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

    fetchOrdersFromServer(true).then(function (ok) {

      if (!ok) return;

    });

    loadGastos(true);

    loadIngresos(true);

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

              loadIngresos(true);

              updateCajaUI();

            }

          )

          .subscribe();

        var chIngresos = sbClient

          .channel('brava-admin-ingresos')

          .on(

            'postgres_changes',

            { event: '*', schema: 'public', table: 'ingresos' },

            function () {

              loadIngresos(true);

              updateCajaUI();

            }

          )

          .subscribe();

        sbChannels.push(chOrders, chGastos, chIngresos);

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

  function formatOrderRelativeTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return 'hace un momento';
    if (sec < 3600) return 'hace ' + Math.floor(sec / 60) + ' min';
    if (sec < 86400) return 'hace ' + Math.floor(sec / 3600) + ' h';
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatOrderAddressInline(o) {
    var dir = String(o.direccion || '').trim();
    var sub = [o.piso, o.localidad]
      .filter(function (x) {
        return String(x || '').trim();
      })
      .join(' · ');
    if (!dir && !sub) return '';
    return escapeHtml(dir + (sub ? ' · ' + sub : ''));
  }

  function paymentTagHtml(pago) {
    var raw = String(pago || '').trim();
    if (!raw) return '';
    var low = raw.toLowerCase();
    if (low.indexOf('mercado') >= 0 || low === 'mp') {
      return '<span class="tag tag-mp">Mercado Pago</span>';
    }
    if (low.indexOf('efect') >= 0) {
      return '<span class="tag tag-ef">Efectivo</span>';
    }
    return '<span class="tag">' + escapeHtml(raw) + '</span>';
  }

  function updateViewSubtitle() {
    var el = $('view-subtitle');
    if (!el) return;
    if (!filterDesde) {
      el.textContent = '';
      return;
    }
    var d = new Date(filterDesde + 'T12:00:00');
    if (isNaN(d.getTime())) {
      el.textContent = '';
      return;
    }
    var days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    var day = days[d.getDay()];
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    el.textContent = 'Turno ' + day + ' ' + dd + '/' + mm;
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
  }

  function readDateFiltersFromUi() {
    if (!filterDesde || !filterHasta) initDateFilters();
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
    clearStockTurno();
    clearArqueoAperturaTurno();
  }

  function arqueoAperturaStorageKey() {
    return 'brava_caja_arqueo_apertura_' + (filterDesde || '') + '_' + (filterHasta || '');
  }

  function normalizeArqueoRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      efEsperado: Number(raw.efEsperado) || 0,
      mpEsperado: Number(raw.mpEsperado) || 0,
      efContado: Math.max(0, Math.round(Number(raw.efContado) || 0)),
      mpContado: Math.max(0, Math.round(Number(raw.mpContado) || 0)),
      efDiff: Number(raw.efDiff) || 0,
      mpDiff: Number(raw.mpDiff) || 0,
      notaEf: String(raw.notaEf || '').trim(),
      notaMp: String(raw.notaMp || '').trim(),
    };
  }

  function getArqueoAperturaTurno() {
    try {
      var raw = localStorage.getItem(arqueoAperturaStorageKey());
      if (!raw) return null;
      return normalizeArqueoRecord(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function saveArqueoAperturaTurno(arqueo) {
    var n = normalizeArqueoRecord(arqueo);
    if (!n) return;
    try {
      localStorage.setItem(arqueoAperturaStorageKey(), JSON.stringify(n));
    } catch (e) {}
  }

  function clearArqueoAperturaTurno() {
    try {
      localStorage.removeItem(arqueoAperturaStorageKey());
    } catch (e) {}
  }

  var pendingFinalizeAbrirCaja = null;
  var stockModalMode = 'apertura';
  var STOCK_MED_POR_SIMPLE = 1;
  var STOCK_MED_POR_DOBLE = 2;
  var STOCK_LONCHAS_POR_MED = 2;
  var STOCK_LONCHAS_POR_EXTRA_CHEDDAR = 1;
  var STOCK_PAN_POR_BURGER = 1;

  function stockStorageKey() {
    return 'brava_cocina_stock_' + (filterDesde || '') + '_' + (filterHasta || '');
  }

  function stockLastTurnKey() {
    return 'brava_cocina_stock_last';
  }

  function normalizeStockObj(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      panes: Math.max(0, parseInt(raw.panes, 10) || 0),
      medallones: Math.max(0, parseInt(raw.medallones, 10) || 0),
      queso: Math.max(0, parseInt(raw.queso, 10) || 0),
    };
  }

  function getStockTurno() {
    try {
      var raw = localStorage.getItem(stockStorageKey());
      if (!raw) return null;
      return normalizeStockObj(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function saveStockTurno(st) {
    var n = normalizeStockObj(st);
    if (!n) return;
    try {
      localStorage.setItem(stockStorageKey(), JSON.stringify(n));
      localStorage.setItem(stockLastTurnKey(), JSON.stringify(n));
    } catch (e) {}
  }

  function clearStockTurno() {
    try {
      localStorage.removeItem(stockStorageKey());
    } catch (e) {}
  }

  function medallonesPorHambItem(it) {
    var t = itemCatalogText(it);
    if (/\btriple\b/.test(t)) return 3;
    if (hamburguesaEsDoble(it)) return STOCK_MED_POR_DOBLE;
    return STOCK_MED_POR_SIMPLE;
  }

  function countExtraCheddarInVariedad(variedad) {
    var t = String(variedad || '').trim();
    if (!t || /^sin\s*extra/i.test(t)) return 0;
    var total = 0;
    var re = /extra\s*cheddar(?:\s*x\s*(\d+))?/gi;
    var m;
    while ((m = re.exec(t))) {
      total += m[1] ? Math.max(1, parseInt(m[1], 10) || 1) : 1;
    }
    return total;
  }

  function lonchasQuesoPorHambItem(it) {
    var med = medallonesPorHambItem(it);
    var extra = countExtraCheddarInVariedad(it.variedad || it.var || '');
    return med * STOCK_LONCHAS_POR_MED + extra * STOCK_LONCHAS_POR_EXTRA_CHEDDAR;
  }

  function computeStockUsageForOrder(o) {
    var panes = 0;
    var medallones = 0;
    var queso = 0;
    parseOrderItems(o).forEach(function (it) {
      if (!isHamburguesaItem(it)) return;
      var q = editItemQty(it);
      panes += q * STOCK_PAN_POR_BURGER;
      medallones += q * medallonesPorHambItem(it);
      queso += q * lonchasQuesoPorHambItem(it);
    });
    return { panes: panes, medallones: medallones, queso: queso };
  }

  function deductStockForPreparationOrder(o) {
    if (!isCajaTurnoActivo()) return;
    var st = getStockTurno();
    if (!st) return;
    var use = computeStockUsageForOrder(o);
    if (!use.panes && !use.medallones && !use.queso) return;
    st.panes = Math.max(0, st.panes - use.panes);
    st.medallones = Math.max(0, st.medallones - use.medallones);
    st.queso = Math.max(0, st.queso - use.queso);
    saveStockTurno(st);
  }

  function stockLonchasBaseSimple() {
    return STOCK_MED_POR_SIMPLE * STOCK_LONCHAS_POR_MED;
  }

  function stockLonchasBaseDoble() {
    return STOCK_MED_POR_DOBLE * STOCK_LONCHAS_POR_MED;
  }

  function stockCapacidadBurgers(st) {
    var p = st.panes;
    var m = st.medallones;
    var q = st.queso;
    var simples = Math.min(p, m, Math.floor(q / stockLonchasBaseSimple()));
    var dobles = Math.min(p, Math.floor(m / STOCK_MED_POR_DOBLE), Math.floor(q / stockLonchasBaseDoble()));
    function cuelloSimples() {
      var qs = Math.floor(q / stockLonchasBaseSimple());
      var n = Math.min(p, m, qs);
      if (n === p) return 'panes';
      if (n === m) return 'medallones';
      return 'lonchas';
    }
    function cuelloDobles() {
      var dm = Math.floor(m / STOCK_MED_POR_DOBLE);
      var dq = Math.floor(q / stockLonchasBaseDoble());
      var n = Math.min(p, dm, dq);
      if (n === p) return 'panes';
      if (n === dm) return 'medallones';
      return 'lonchas';
    }
    return { simples: simples, dobles: dobles, limitS: cuelloSimples(), limitD: cuelloDobles() };
  }

  function stockApplyRowLevel(row, qty) {
    if (!row) return;
    var low = parseInt(row.getAttribute('data-stock-low'), 10);
    var crit = parseInt(row.getAttribute('data-stock-critical'), 10);
    row.classList.remove('ok', 'low', 'critical');
    if (qty < crit) row.classList.add('critical');
    else if (qty < low) row.classList.add('low');
    else row.classList.add('ok');
  }

  function updateStockChrome() {
    var block = $('stock-cocina-block');
    var capBox = $('burger-capacity-box');
    var activo = isCajaTurnoActivo();
    var st = getStockTurno();
    if (block) block.classList.toggle('hidden', !activo || !st);
    if (activo && st) {
      if ($('stock-live-panes')) $('stock-live-panes').textContent = String(st.panes);
      if ($('stock-live-med')) $('stock-live-med').textContent = String(st.medallones);
      if ($('stock-live-queso')) $('stock-live-queso').textContent = String(st.queso);
      document.querySelectorAll('.stock-live-row[data-stock-key]').forEach(function (row) {
        var key = row.getAttribute('data-stock-key');
        stockApplyRowLevel(row, st[key]);
      });
    }
    if (capBox) {
      if (!activo || !st) {
        capBox.classList.add('is-off');
        if ($('burger-cap-sub')) $('burger-cap-sub').textContent = 'Abrí caja y cargá stock.';
        if ($('burger-cap-simples')) $('burger-cap-simples').textContent = '—';
        if ($('burger-cap-dobles')) $('burger-cap-dobles').textContent = '—';
        if ($('burger-cap-foot')) {
          $('burger-cap-foot').textContent = '2 lonchas/med · extra cheddar +1 al entregar.';
        }
      } else {
        capBox.classList.remove('is-off');
        var cap = stockCapacidadBurgers(st);
        if ($('burger-cap-sub')) {
          $('burger-cap-sub').textContent = 'Según pan, med y lonchas en Stock cocina:';
        }
        if ($('burger-cap-simples')) {
          $('burger-cap-simples').textContent = String(cap.simples);
          $('burger-cap-simples').classList.toggle('zero', cap.simples === 0);
        }
        if ($('burger-cap-dobles')) {
          $('burger-cap-dobles').textContent = String(cap.dobles);
          $('burger-cap-dobles').classList.toggle('zero', cap.dobles === 0);
        }
        if ($('burger-cap-foot')) {
          $('burger-cap-foot').textContent =
            'Limita simples: ' + cap.limitS + ' · dobles: ' + cap.limitD + '.';
        }
      }
    }
  }

  function readStockModalForm() {
    function num(id) {
      var v = parseInt($(id).value, 10);
      return isNaN(v) || v < 0 ? 0 : v;
    }
    return {
      panes: num('stock-qty-panes'),
      medallones: num('stock-qty-med'),
      queso: num('stock-qty-queso'),
    };
  }

  function fillStockModalForm(st) {
    var s = st || { panes: '', medallones: '', queso: '' };
    $('stock-qty-panes').value = s.panes !== '' && s.panes != null ? s.panes : '';
    $('stock-qty-med').value = s.medallones !== '' && s.medallones != null ? s.medallones : '';
    $('stock-qty-queso').value = s.queso !== '' && s.queso != null ? s.queso : '';
  }

  function openStockAperturaModal(mode, afterSave) {
    stockModalMode = mode === 'recontar' ? 'recontar' : 'apertura';
    pendingFinalizeAbrirCaja = typeof afterSave === 'function' ? afterSave : null;
    var modal = $('stock-apertura-modal');
    if (!modal) {
      if (pendingFinalizeAbrirCaja) pendingFinalizeAbrirCaja();
      return;
    }
    if ($('stock-apertura-title')) {
      $('stock-apertura-title').textContent =
        stockModalMode === 'recontar' ? 'Recontar stock cocina' : 'Abrir caja — stock cocina';
    }
    if ($('stock-apertura-sub')) {
      $('stock-apertura-sub').textContent =
        stockModalMode === 'recontar'
          ? 'Actualizá panes, medallones y lonchas.'
          : 'Contá lo que hay ahora. Después podés recontar en la columna Caja.';
    }
    if ($('stock-apertura-ok')) {
      $('stock-apertura-ok').textContent =
        stockModalMode === 'recontar' ? 'Guardar conteo' : 'Confirmar y abrir caja';
    }
    if (stockModalMode === 'recontar') fillStockModalForm(getStockTurno() || {});
    else fillStockModalForm({ panes: '', medallones: '', queso: '' });
    modal.classList.remove('hidden');
    if ($('stock-qty-panes')) $('stock-qty-panes').focus();
  }

  function closeStockAperturaModal() {
    var modal = $('stock-apertura-modal');
    if (modal) modal.classList.add('hidden');
    pendingFinalizeAbrirCaja = null;
  }

  function confirmStockAperturaModal() {
    var st = readStockModalForm();
    if (stockModalMode === 'apertura' && !st.panes && !st.medallones && !st.queso) {
      if (!confirm('Los tres ítems están en 0. ¿Abrir caja igual?')) return;
    }
    saveStockTurno(st);
    var done = pendingFinalizeAbrirCaja;
    var modal = $('stock-apertura-modal');
    if (modal) modal.classList.add('hidden');
    pendingFinalizeAbrirCaja = null;
    updateStockChrome();
    if (stockModalMode === 'apertura' && done) {
      openAperturaArqueoModal(done);
    } else if (done) {
      done();
    }
  }

  function adjustStockTurnoKey(key, delta) {
    if (!isCajaTurnoActivo()) return;
    var st = getStockTurno();
    if (!st || !key) return;
    st[key] = Math.max(0, (st[key] || 0) + delta);
    saveStockTurno(st);
    updateStockChrome();
  }

  function orderEntregadoAtMs(o) {
    if (!o || !o.entregado_at) return NaN;
    var t = new Date(o.entregado_at).getTime();
    return isNaN(t) ? NaN : t;
  }

  var hambMenuMeta = null;
  var hambMenuMetaLoading = null;
  var ventasCatalog = null;

  function normalizeVentasKey(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function ventasTipoFromRow(categoria, subcategoria, nombre) {
    var cat = (categoria || '').toLowerCase();
    var sub = (subcategoria || '').toLowerCase();
    var nom = (nombre || '').toLowerCase();
    if (cat.indexOf('hamburg') >= 0) return 'hamburguesa';
    if (sub === 'simples' || sub === 'dobles' || sub === 'triples') return 'hamburguesa';
    if (nom.indexOf('burger') >= 0 || nom.indexOf('hamburg') >= 0) return 'hamburguesa';
    if (/\bcheese\s*burger\b/.test(nom)) return 'hamburguesa';
    if (/bebida/i.test(cat) || /bebida/i.test(sub)) return 'bebida';
    if (/acompa|entrada/i.test(cat) || /acompa|entrada/i.test(sub)) return 'acompanamiento';
    var blob = cat + ' ' + sub;
    if (/bebida|gaseosa|agua|cerveza|vino|refresco|botella/.test(blob)) return 'bebida';
    if (/acompa|entrada|papas|guarnici|nugget|postre|side/.test(blob)) return 'acompanamiento';
    if (cat || sub || nom) return 'acompanamiento';
    return null;
  }

  function ventasExtraRowNombre(row) {
    var nombre = String(row.nombre || row.Nombre || row.extra || row.Extra || row.titulo || row.Titulo || '').trim();
    if (!nombre) return '';
    var oculto = String(row.ocultar || row.Ocultar || '').toLowerCase();
    if (oculto === 'si' || oculto === 'sí') return '';
    return nombre;
  }

  function buildVentasCatalogFromSheets(productoRows, extraRows) {
    var catalog = { bebidas: [], acompanamientos: [], extras: [], productoTipo: {} };
    (productoRows || []).forEach(function (row) {
      var nombre = String(row.nombre || row.Nombre || '').trim();
      if (!nombre) return;
      var oculto = String(row.ocultar || row.Ocultar || '').toLowerCase();
      if (oculto === 'si' || oculto === 'sí') return;
      var cat = String(row.categoria || row.Categoria || '').trim();
      var sub = String(row.subcategoria || row.Subcategoria || '').trim();
      var tipo = ventasTipoFromRow(cat, sub, nombre);
      if (!tipo || tipo === 'hamburguesa') {
        catalog.productoTipo[nombre.toLowerCase()] = 'hamburguesa';
        return;
      }
      catalog.productoTipo[nombre.toLowerCase()] = tipo;
      if (tipo === 'bebida') catalog.bebidas.push({ nombre: nombre });
      else if (tipo === 'acompanamiento') catalog.acompanamientos.push({ nombre: nombre });
    });
    (extraRows || []).forEach(function (row) {
      var nombre = ventasExtraRowNombre(row);
      if (!nombre) return;
      catalog.extras.push({ nombre: nombre });
    });
    function sortNombre(a, b) {
      return a.nombre.localeCompare(b.nombre, 'es');
    }
    catalog.bebidas.sort(sortNombre);
    catalog.acompanamientos.sort(sortNombre);
    catalog.extras.sort(sortNombre);
    return catalog;
  }

  function ventasTipoForItem(it) {
    var r = resolveItemMeta(it);
    var key = r.nombre.toLowerCase();
    if (ventasCatalog && ventasCatalog.productoTipo[key]) {
      var t = ventasCatalog.productoTipo[key];
      if (t !== 'hamburguesa') return t;
    }
    if (isHamburguesaItem(it)) return 'hamburguesa';
    return ventasTipoFromRow(r.categoria, r.subcategoria, r.nombre);
  }

  function matchVentasExtraName(part) {
    var np = normalizeVentasKey(part);
    if (!np || /^sin\s*extra/.test(np)) return '';
    var list = (ventasCatalog && ventasCatalog.extras) || [];
    for (var i = 0; i < list.length; i++) {
      if (normalizeVentasKey(list[i].nombre) === np) return list[i].nombre;
    }
    for (var j = 0; j < list.length; j++) {
      var ek = normalizeVentasKey(list[j].nombre);
      if (np.indexOf(ek) >= 0 || ek.indexOf(np) >= 0) return list[j].nombre;
    }
    return String(part || '').trim();
  }

  function createEmptyVentasQtyMaps() {
    var maps = { bebidas: {}, acompanamientos: {}, extras: {} };
    if (!ventasCatalog) return maps;
    ventasCatalog.bebidas.forEach(function (x) {
      maps.bebidas[x.nombre] = 0;
    });
    ventasCatalog.acompanamientos.forEach(function (x) {
      maps.acompanamientos[x.nombre] = 0;
    });
    ventasCatalog.extras.forEach(function (x) {
      maps.extras[x.nombre] = 0;
    });
    return maps;
  }

  function ventasQtyMapToList(map, catalogList) {
    var out = [];
    var seen = {};
    (catalogList || []).forEach(function (x) {
      out.push({ nombre: x.nombre, qty: Number(map[x.nombre]) || 0 });
      seen[x.nombre] = true;
    });
    Object.keys(map || {}).forEach(function (nombre) {
      if (seen[nombre]) return;
      var qty = Number(map[nombre]) || 0;
      if (qty > 0) out.push({ nombre: nombre, qty: qty });
    });
    out.sort(function (a, b) {
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    return out;
  }

  function ventasQtyMapsToLists(maps) {
    maps = maps || { bebidas: {}, acompanamientos: {}, extras: {} };
    return {
      bebidasVentas: ventasQtyMapToList(maps.bebidas, ventasCatalog && ventasCatalog.bebidas),
      acompanamientosVentas: ventasQtyMapToList(
        maps.acompanamientos,
        ventasCatalog && ventasCatalog.acompanamientos
      ),
      extrasVentas: ventasQtyMapToList(maps.extras, ventasCatalog && ventasCatalog.extras),
    };
  }

  function accumulateVentasItem(it, acc) {
    var q = editItemQty(it);
    var r = resolveItemMeta(it);
    if (isHamburguesaItem(it)) {
      if (hamburguesaEsDoble(it)) acc.dobles += q;
      else acc.simples += q;
      var nombre = (r.nombre || 'Ítem').trim();
      acc.porProducto[nombre] = (acc.porProducto[nombre] || 0) + q;
      parseExtrasFromVariedad(r.variedad).forEach(function (part) {
        var extraName = matchVentasExtraName(part);
        if (!extraName) return;
        acc.extras[extraName] = (acc.extras[extraName] || 0) + q;
      });
      return;
    }
    var tipo = ventasTipoForItem(it);
    if (tipo === 'bebida') {
      acc.bebidas[r.nombre] = (acc.bebidas[r.nombre] || 0) + q;
    } else if (tipo === 'acompanamiento') {
      acc.acompanamientos[r.nombre] = (acc.acompanamientos[r.nombre] || 0) + q;
    }
  }

  function renderVentasSidebarList(elId, list) {
    var el = $(elId);
    if (!el) return;
    var rows = list || [];
    if (!rows.length) {
      el.innerHTML = '<div class="caja-row ventas-cat-empty"><span>—</span><span>0</span></div>';
      return;
    }
    el.innerHTML = rows
      .map(function (x) {
        return (
          '<div class="caja-row"><span>' +
          escapeHtml(x.nombre) +
          '</span><span>' +
          Math.round(x.qty || 0) +
          '</span></div>'
        );
      })
      .join('');
  }

  function loadHambMenuMeta() {
    if (hambMenuMeta && ventasCatalog) return Promise.resolve(hambMenuMeta);
    if (hambMenuMetaLoading) return hambMenuMetaLoading;
    if (typeof Papa === 'undefined') {
      hambMenuMeta = {};
      ventasCatalog = buildVentasCatalogFromSheets([], []);
      return Promise.resolve(hambMenuMeta);
    }
    var base =
      'https://docs.google.com/spreadsheets/d/' +
      EDIT_MENU_SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=';
    hambMenuMetaLoading = Promise.all([
      fetch(base + encodeURIComponent('productos')).then(function (r) {
        return r.text();
      }),
      fetch(base + encodeURIComponent('extras'))
      .then(function (r) {
        return r.text();
      })
        .catch(function () {
          return '';
        }),
    ])
      .then(function (parts) {
        var parsed = Papa.parse(parts[0], { header: true, skipEmptyLines: true });
        var extraParsed = parts[1]
          ? Papa.parse(parts[1], { header: true, skipEmptyLines: true })
          : { data: [] };
        var map = {};
        (parsed.data || []).forEach(function (row) {
          var nombre = String(row.nombre || row.Nombre || '').trim();
          if (!nombre) return;
          var key = nombre.toLowerCase();
          if (map[key]) return;
          map[key] = {
            categoria: String(row.categoria || row.Categoria || '').trim(),
            subcategoria: String(row.subcategoria || row.Subcategoria || '').trim(),
          };
        });
        hambMenuMeta = map;
        ventasCatalog = buildVentasCatalogFromSheets(parsed.data || [], extraParsed.data || []);
        return map;
      })
      .catch(function () {
        hambMenuMeta = {};
        ventasCatalog = buildVentasCatalogFromSheets([], []);
        return hambMenuMeta;
      })
      .finally(function () {
        hambMenuMetaLoading = null;
      });
    return hambMenuMetaLoading;
  }

  function resolveItemMeta(it) {
    var nombre = String((it && (it.nombre || it.name)) || '').trim();
    var key = nombre.toLowerCase();
    var m = hambMenuMeta && hambMenuMeta[key];
    return {
      nombre: nombre,
      variedad: String((it && it.variedad) || '').trim(),
      categoria: String((it && it.categoria) || (m && m.categoria) || '').trim(),
      subcategoria: String((it && it.subcategoria) || (m && m.subcategoria) || '').trim(),
    };
  }

  function itemCatalogText(it) {
    var r = resolveItemMeta(it);
    return [r.nombre, r.variedad, r.categoria, r.subcategoria].join(' ').toLowerCase();
  }

  function isHamburguesaItem(it) {
    var r = resolveItemMeta(it);
    var t = itemCatalogText(it);
    if (!t.trim()) return false;
    var cat = r.categoria.toLowerCase();
    var sub = r.subcategoria.toLowerCase();
    if (cat.indexOf('hamburg') >= 0) return true;
    if (sub === 'simples' || sub === 'dobles' || sub === 'triples') return true;
    if (t.indexOf('burger') >= 0 || t.indexOf('hamburg') >= 0) return true;
    if (/\bcheese\s*burger\b/.test(t)) return true;
    return false;
  }

  function hamburguesaEsDoble(it) {
    var r = resolveItemMeta(it);
    var t = itemCatalogText(it);
    if (/\bdoble\b/.test(t) || /\btriple\b/.test(t)) return true;
    var sub = r.subcategoria.toLowerCase();
    return sub.indexOf('doble') >= 0 || sub.indexOf('triple') >= 0;
  }

  function movimientoTimestampMs(g) {
    if (g && g.creado_at) {
      var t = new Date(g.creado_at).getTime();
      if (!isNaN(t)) return t;
    }
    var iso = String((g && g.fecha) || '').slice(0, 10);
    if (iso) return new Date(iso + 'T12:00:00').getTime();
    return 0;
  }

  function emptyCajaStats() {
    var ventasListas = ventasQtyMapsToLists(createEmptyVentasQtyMaps());
    return {
      ef: 0,
      mp: 0,
      ventas: 0,
      ventasPedidos: 0,
      efPedidos: 0,
      mpPedidos: 0,
      cancel: 0,
      efIng: 0,
      mpIng: 0,
      iTotal: 0,
      gTotal: 0,
      gEf: 0,
      gMp: 0,
      resultado: 0,
      simples: 0,
      dobles: 0,
      hambTotal: 0,
      productosVentas: [],
      bebidasVentas: ventasListas.bebidasVentas,
      acompanamientosVentas: ventasListas.acompanamientosVentas,
      extrasVentas: ventasListas.extrasVentas,
    };
  }

  function productoNombreEsDoble(nombre) {
    var t = String(nombre || '').toLowerCase();
    return t.indexOf('doble') >= 0 || t.indexOf('triple') >= 0;
  }

  function sortProductosVentasLista(list) {
    var simples = [];
    var dobles = [];
    (list || []).forEach(function (x) {
      if (productoNombreEsDoble(x.nombre)) dobles.push(x);
      else simples.push(x);
    });
    simples.sort(function (a, b) {
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    dobles.sort(function (a, b) {
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    return simples.concat(dobles);
  }

  function buildProductosVentasList(porProducto) {
    var list = Object.keys(porProducto || {}).map(function (nombre) {
      return { nombre: nombre, qty: porProducto[nombre] };
    });
    return sortProductosVentasLista(list);
  }

  function computeSesionStats() {
    var desdeMs = getAperturaAtMs();
    if (isNaN(desdeMs)) return emptyCajaStats();
    var hastaMs = Date.now();
    var ef = 0;
    var mp = 0;
    var cancel = 0;
    var vqty = createEmptyVentasQtyMaps();
    var acc = {
      simples: 0,
      dobles: 0,
      porProducto: {},
      bebidas: vqty.bebidas,
      acompanamientos: vqty.acompanamientos,
      extras: vqty.extras,
    };
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
          accumulateVentasItem(it, acc);
        });
      } else if (e === 'cancelada') {
        if (!inDateRange(orderDateIso(o))) return;
        var ct = o.cancelado_at ? new Date(o.cancelado_at).getTime() : NaN;
        if (isNaN(ct)) return;
        if (ct < desdeMs || ct > hastaMs) return;
        cancel += total;
      }
    });
    var ventasPedidos = ef + mp;
    var efPedidos = ef;
    var mpPedidos = mp;
    var efNet = ef;
    var mpNet = mp;
    var gTotal = 0;
    var gEf = 0;
    var gMp = 0;
    var efIng = 0;
    var mpIng = 0;
    var otroIng = 0;
    ingresosCache.forEach(function (g) {
      if (!movimientoInFilterRange(g)) return;
      var gt = movimientoTimestampMs(g);
      if (gt < desdeMs || gt > hastaMs) return;
      var m = Number(g.monto) || 0;
      var cob = String(g.cobrado_con || '').trim();
      if (cob === 'transferencia') {
        mpNet += m;
        mpIng += m;
      } else {
        efNet += m;
        if (cob === 'efectivo') efIng += m;
        else otroIng += m;
      }
    });
    var iTotal = efIng + mpIng + otroIng;
    gastosCache.forEach(function (g) {
      if (!movimientoInFilterRange(g)) return;
      var gt = movimientoTimestampMs(g);
      if (gt >= desdeMs && gt <= hastaMs) {
        var m = Number(g.monto) || 0;
        gTotal += m;
        var pag = String(g.pagado_con || '').trim();
        if (pag === 'transferencia') {
          mpNet -= m;
          gMp += m;
        } else {
          efNet -= m;
          gEf += m;
        }
      }
    });
    var ventas = efNet + mpNet;
    var ventasListas = ventasQtyMapsToLists({
      bebidas: acc.bebidas,
      acompanamientos: acc.acompanamientos,
      extras: acc.extras,
    });
    return {
      ef: efNet,
      mp: mpNet,
      ventas: ventas,
      ventasPedidos: ventasPedidos,
      efPedidos: efPedidos,
      mpPedidos: mpPedidos,
      cancel: cancel,
      efIng: efIng,
      mpIng: mpIng,
      iTotal: iTotal,
      gTotal: gTotal,
      gEf: gEf,
      gMp: gMp,
      resultado: ventas,
      simples: acc.simples,
      dobles: acc.dobles,
      hambTotal: acc.simples + acc.dobles,
      productosVentas: buildProductosVentasList(acc.porProducto),
      bebidasVentas: ventasListas.bebidasVentas,
      acompanamientosVentas: ventasListas.acompanamientosVentas,
      extrasVentas: ventasListas.extrasVentas,
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
      return 'Turno cerrado. Usá «Abrir turno» (✓ arriba) antes de aceptar, marcar en camino o entregados.';
    }
    if (!isCajaMarcadaAbierta() || isNaN(getAperturaAtMs())) {
      return 'La caja no está abierta. Tocá «Abrir turno» (✓ arriba) para operar pedidos.';
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
      ' Podés rechazar pedidos o imprimir ticket; preparación, en camino y entregado quedan bloqueados hasta abrir.';
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

  function movimientoInSesionTurno(g) {
    if (!g || !isCajaTurnoActivo()) return false;
    var desdeMs = getAperturaAtMs();
    if (!movimientoInFilterRange(g)) return false;
    var gt = movimientoTimestampMs(g);
    return gt >= desdeMs;
  }

  function gastosVisiblesTurno() {
    if (!cierresReady) return [];
    if (findCierreForCurrentPeriod()) return [];
    if (!isCajaMarcadaAbierta() || isNaN(getAperturaAtMs())) return [];
    return gastosCache.filter(movimientoInSesionTurno);
  }

  function ingresosVisiblesTurno() {
    if (!cierresReady) return [];
    if (findCierreForCurrentPeriod()) return [];
    if (!isCajaMarcadaAbierta() || isNaN(getAperturaAtMs())) return [];
    return ingresosCache.filter(movimientoInSesionTurno);
  }

  function updateMovimientosChrome() {
    var btnG = $('btn-add-gasto');
    var btnI = $('btn-add-ingreso');
    var active = isCajaTurnoActivo();
    if (btnG) {
      btnG.disabled = !active;
      btnG.title = active ? '' : 'Abrí la caja para agregar egresos del turno';
    }
    if (btnI) {
      btnI.disabled = !active;
      btnI.title = active ? '' : 'Abrí la caja para agregar ingresos del turno';
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
    var iTotal = 0;
    ingresosCache.forEach(function (g) {
      if (!movimientoInFilterRange(g)) return;
      iTotal += Number(g.monto) || 0;
    });
    gastosCache.forEach(function (g) {
      gTotal += Number(g.monto) || 0;
    });
    return {
      ef: ef,
      mp: mp,
      ventas: ventas,
      cancel: cancel,
      efIng: 0,
      mpIng: 0,
      iTotal: iTotal,
      gTotal: gTotal,
      resultado: ventas + iTotal - gTotal,
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

  /** Hora con segundos para el ticket impreso (apertura vs cierre). */
  function formatCierreTicketWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    return dd + '/' + mm + ' ' + hh + ':' + mi + ':' + ss;
  }

  function formatCierreMetaWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-AR');
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

  function updateTurnoToolbarUI() {
    var badge = $('turno-toolbar-badge');
    var label = $('turno-toolbar-label');
    var btnAbrir = $('btn-turno-abrir');
    var btnCerrar = $('btn-turno-cerrar');
    var abierta = cierresReady && isCajaTurnoActivo();
    if (badge) {
      badge.className = 'turno-pill ' + (abierta ? 'turno-pill--open' : 'turno-pill--closed');
    }
    if (label) {
      label.textContent = abierta ? 'Turno abierto' : 'Turno cerrado';
    }
    if (btnAbrir) btnAbrir.classList.toggle('hidden', abierta);
    if (btnCerrar) btnCerrar.classList.toggle('hidden', !abierta);
  }

  function initDefaultAlertSound() {
    soundOn = true;
    try {
      getAlertAudio().load();
    } catch (e) {}
    if (!window.__bravaSoundUnlock) {
      window.__bravaSoundUnlock = true;
      document.addEventListener(
        'pointerdown',
        function () {
          if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
          var a = getAlertAudio();
          if (a && a.paused) {
            var p = a.play();
            if (p && p.then) {
              p.then(function () {
                a.pause();
                a.currentTime = 0;
              }).catch(function () {});
            }
          }
        },
        { once: true, capture: true }
      );
    }
  }

  function updateCierreStatusUI() {
    var cierre = cierresReady ? findCierreForCurrentPeriod() : null;
    var abierta = cierresReady && isCajaTurnoActivo();
    var btnCierre = $('btn-cierre-caja');
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
    } else if (abierta) {
      if (estado) {
        estado.textContent = 'Caja abierta';
        estado.classList.add('abierta');
        estado.classList.remove('cerrada');
      }
      if (detalle) detalle.hidden = true;
      if (btnCierre) btnCierre.classList.remove('hidden');
    } else {
      if (estado) {
        estado.textContent = 'Caja sin abrir';
        estado.classList.remove('abierta', 'cerrada');
      }
      if (detalle) detalle.hidden = true;
      if (btnCierre) btnCierre.classList.add('hidden');
    }
  }

  function updateCajaUI() {
    if (!$('caja-ventas') && !$('caja-ef')) return;
    var st = computeCajaDisplayStats();
    var efTxt = '$' + fmt(st.ef);
    var mpTxt = '$' + fmt(st.mp);
    if ($('caja-ef')) $('caja-ef').textContent = efTxt;
    if ($('caja-mp')) $('caja-mp').textContent = mpTxt;
    if ($('caja-ventas-ef')) $('caja-ventas-ef').textContent = efTxt;
    if ($('caja-ventas-mp')) $('caja-ventas-mp').textContent = mpTxt;
    if ($('caja-ventas')) $('caja-ventas').textContent = '$' + fmt(st.ventas);
    if ($('caja-cancel')) $('caja-cancel').textContent = '$' + fmt(st.cancel);
    $('caja-gastos').textContent = '−$' + fmt(st.gTotal);
    $('caja-resultado').textContent = (st.resultado < 0 ? '−$' : '$') + fmt(Math.abs(st.resultado));
    var resRow = $('caja-resultado') && $('caja-resultado').closest('.aside-row');
    if (resRow) {
      resRow.classList.remove('aside-row--pos', 'aside-row--neg');
      resRow.classList.add(st.resultado >= 0 ? 'aside-row--pos' : 'aside-row--neg');
    }
    var row = $('row-resultado');
    if (row) {
      row.classList.remove('pos', 'neg');
      row.classList.add(st.resultado >= 0 ? 'pos' : 'neg');
    }
    if ($('ventas-hamb-simples')) $('ventas-hamb-simples').textContent = String(Math.round(st.simples));
    if ($('ventas-hamb-dobles')) $('ventas-hamb-dobles').textContent = String(Math.round(st.dobles));
    if ($('ventas-hamb-total')) $('ventas-hamb-total').textContent = String(Math.round(st.hambTotal));
    renderVentasSidebarList('ventas-acomp-list', st.acompanamientosVentas);
    renderVentasSidebarList('ventas-extras-list', st.extrasVentas);
    renderVentasSidebarList('ventas-bebidas-list', st.bebidasVentas);
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
    updateTurnoToolbarUI();
    updateViewSubtitle();
    updateMovimientosChrome();
    syncTurnoPedidosUi();
    updateStockChrome();
  }

  function loadCierres(force, limitOpt) {
    if (cierresFetchInFlight && !force) return cierresFetchInFlight;
    var lim = Math.min(Math.max(Number(limitOpt) || 50, 1), 100);
    cierresFetchInFlight = api({ action: 'listCierres', token: token, limit: lim })
      .then(function (res) {
        if (res.data.ok) {
          cierresCache = res.data.cierres || [];
          syncCajaLocalConServidor();
          updateCajaUI();
          renderMovimientosList();
          return true;
        }
        if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
        return false;
      })
      .finally(function () {
        cierresReady = true;
        cierresFetchInFlight = null;
        renderMovimientosList();
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
      var cierreId = cierre.id;
      openStockAperturaModal('apertura', function () {
        api({ action: 'deleteCierre', token: token, id: cierreId }).then(function (res) {
          if (res.data.ok) {
            cierresCache = cierresCache.filter(function (x) {
              return x.id !== cierreId;
            });
            setCajaMarcadaAbierta(true);
            setAperturaNow();
            updateCajaUI();
            renderMovimientosList();
            loadCierres(true);
          } else {
            if (res.status === 401) handleAuthFailure();
            else alert('No se pudo abrir la caja.');
          }
        });
      });
      return;
    }
    openStockAperturaModal('apertura', function () {
      setCajaMarcadaAbierta(true);
      setAperturaNow();
      updateCajaUI();
      renderMovimientosList();
    });
  }

  function cierrePeriodoLabel() {
    readDateFiltersFromUi();
    var d1 = filterDesde ? filterDesde.split('-').reverse().join('/') : '…';
    var d2 = filterHasta ? filterHasta.split('-').reverse().join('/') : '…';
    return d1 === d2 ? d1 : d1 + ' — ' + d2;
  }

  function gastoPagadoLabel(g) {
    var pagado = (g && g.pagado_con) || '';
    if (pagado === 'efectivo') return 'Efectivo';
    if (pagado === 'transferencia') return 'Transferencia';
    return pagado;
  }

  function movMedioAbbr(cobOrPagado) {
    var v = String(cobOrPagado || '').trim();
    if (v === 'transferencia') return 'MP';
    if (v === 'efectivo') return 'EFT';
    if (v === 'otro') return 'Otro';
    return 'EFT';
  }

  function movConceptoConMedio(concepto, cobOrPagado) {
    var abbr = movMedioAbbr(cobOrPagado);
    var c = String(concepto || '').trim();
    return c + (abbr ? ' (' + abbr + ')' : '');
  }

  function ingresoCobroLabel(g) {
    var cob = (g && g.cobrado_con) || '';
    if (cob === 'efectivo') return 'Efectivo';
    if (cob === 'transferencia') return 'Mercado Pago';
    if (cob === 'otro') return 'Otro';
    return cob;
  }

  function movimientosEnTurnoParaCierre() {
    var desdeMs = getAperturaAtMs();
    if (isNaN(desdeMs)) return { ingresos: [], gastos: [] };
    var hastaMs = Date.now();
    function inWin(g) {
      if (!movimientoInFilterRange(g)) return false;
      var gt = movimientoTimestampMs(g);
      return gt >= desdeMs && gt <= hastaMs;
    }
    return {
      ingresos: ingresosCache.filter(inWin),
      gastos: gastosCache.filter(inWin),
    };
  }

  function gastosEnTurnoParaCierre() {
    return movimientosEnTurnoParaCierre().gastos;
  }

  function ingresosEnTurnoParaCierre() {
    return movimientosEnTurnoParaCierre().ingresos;
  }

  function buildCierreConfirmMessage(st, periodoLbl, arqueo) {
    var msg =
      'Turno: ' +
      periodoLbl +
      '\n\n' +
      'Ventas netas del turno: $' +
      fmt(st.ventas) +
      ' (EF $' +
      fmt(st.ef) +
      ' · MP $' +
      fmt(st.mp) +
      ')\n' +
      'Incluye pedidos entregados + ingresos − egresos por medio de pago.\n' +
      'Egresos registrados: $' +
      fmt(st.gTotal) +
      '\n' +
      'Resultado: $' +
      fmt(st.resultado) +
      '\n\n' +
      'Hamburguesas Simples: ' +
      Math.round(st.simples) +
      '\n' +
      'Hamburguesas Dobles: ' +
      Math.round(st.dobles) +
      '\n' +
      'Cantidad total: ' +
      Math.round(st.hambTotal) +
      ' Hamburguesas';
    if (arqueo) {
      msg +=
        '\n\nControl de caja:\n' +
        'EF contado $' +
        fmt(arqueo.efContado) +
        ' (' +
        arqueoDiffMeta(arqueo.efDiff, 'cierre').text +
        ')\n' +
        'MP contado $' +
        fmt(arqueo.mpContado) +
        ' (' +
        arqueoDiffMeta(arqueo.mpDiff, 'cierre').text +
        ')';
      if (arqueo.notaEf) msg += '\nObs EF: ' + arqueo.notaEf;
      if (arqueo.notaMp) msg += '\nObs MP: ' + arqueo.notaMp;
    }
    return msg;
  }

  function arqueoMediosSinObservacion(arqueo) {
    var missing = [];
    if (!arqueo) return missing;
    if (arqueo.efDiff !== 0 && !arqueo.notaEf) missing.push('efectivo');
    if (arqueo.mpDiff !== 0 && !arqueo.notaMp) missing.push('Mercado Pago');
    return missing;
  }

  function arqueoDiffMeta(diff, mode) {
    var d = Number(diff) || 0;
    if (mode === 'apertura') {
      if (d === 0) return { text: 'Sin fondo', cls: 'arqueo-diff--ok', money: '$0' };
      return { text: 'Fondo inicial', cls: 'arqueo-diff--ok', money: '$' + fmt(d) };
    }
    if (d === 0) return { text: 'Cuadrado', cls: 'arqueo-diff--ok', money: '$0' };
    if (d > 0) return { text: 'Sobrante', cls: 'arqueo-diff--sobr', money: '$' + fmt(d) };
    return { text: 'Faltante', cls: 'arqueo-diff--falt', money: '−$' + fmt(Math.abs(d)) };
  }

  function readArqueoContadoInput(id) {
    var el = $(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(',', '.'), 10);
    return isNaN(v) || v < 0 ? 0 : Math.round(v);
  }

  function paintArqueoDiffCell(cellId, diff) {
    var cell = $(cellId);
    if (!cell) return;
    var m = arqueoDiffMeta(diff, cashArqueoMode);
    cell.textContent = m.text + ' · ' + m.money;
    cell.className = 'arqueo-diff ' + m.cls;
  }

  function updateCashArqueoDiffUI() {
    var efCont = readArqueoContadoInput('arqueo-ef-contado');
    var mpCont = readArqueoContadoInput('arqueo-mp-contado');
    paintArqueoDiffCell('arqueo-ef-diff', efCont - cashArqueoEsperadoEf);
    paintArqueoDiffCell('arqueo-mp-diff', mpCont - cashArqueoEsperadoMp);
  }

  function setCashArqueoModalUi(mode) {
    cashArqueoMode = mode === 'apertura' ? 'apertura' : 'cierre';
    var isApertura = cashArqueoMode === 'apertura';
    if ($('cierre-arqueo-title')) {
      $('cierre-arqueo-title').textContent = isApertura ? 'Arqueo inicial de caja' : 'Control de caja';
    }
    if ($('cierre-arqueo-sub')) {
      $('cierre-arqueo-sub').textContent = isApertura
        ? 'Contá efectivo en caja y saldo MP al abrir. Las ventas del turno arrancan en $0.'
        : 'Compará los totales del sistema con lo que contás antes de cerrar el turno.';
    }
    if ($('cierre-arqueo-ok')) {
      $('cierre-arqueo-ok').textContent = isApertura ? 'Confirmar apertura' : 'Continuar al cierre';
    }
    var thDiff = document.querySelector('#cierre-arqueo-modal .arqueo-tbl thead th.col-diff');
    if (thDiff) thDiff.textContent = isApertura ? 'Declarado' : 'Diferencia';
  }

  function fillCashArqueoForm(esperadoEf, esperadoMp, contadoEf, contadoMp) {
    if ($('arqueo-ef-esperado')) $('arqueo-ef-esperado').textContent = '$' + fmt(esperadoEf);
    if ($('arqueo-mp-esperado')) $('arqueo-mp-esperado').textContent = '$' + fmt(esperadoMp);
    if ($('arqueo-ef-contado')) {
      $('arqueo-ef-contado').value =
        contadoEf === '' || contadoEf == null ? '' : String(Math.round(contadoEf));
    }
    if ($('arqueo-mp-contado')) {
      $('arqueo-mp-contado').value =
        contadoMp === '' || contadoMp == null ? '' : String(Math.round(contadoMp));
    }
    if ($('arqueo-nota-ef')) $('arqueo-nota-ef').value = '';
    if ($('arqueo-nota-mp')) $('arqueo-nota-mp').value = '';
    cashArqueoEsperadoEf = esperadoEf;
    cashArqueoEsperadoMp = esperadoMp;
    updateCashArqueoDiffUI();
  }

  function buildCierreArqueoObject() {
    var efContado = readArqueoContadoInput('arqueo-ef-contado');
    var mpContado = readArqueoContadoInput('arqueo-mp-contado');
    var notaEf = ($('arqueo-nota-ef') && $('arqueo-nota-ef').value.trim()) || '';
    var notaMp = ($('arqueo-nota-mp') && $('arqueo-nota-mp').value.trim()) || '';
    var efEsp = cashArqueoEsperadoEf;
    var mpEsp = cashArqueoEsperadoMp;
    return {
      efEsperado: efEsp,
      mpEsperado: mpEsp,
      efContado: efContado,
      mpContado: mpContado,
      efDiff: efContado - efEsp,
      mpDiff: mpContado - mpEsp,
      notaEf: notaEf,
      notaMp: notaMp,
    };
  }

  function arqueoFinalTicketCell(arqueo, medio) {
    if (!arqueo) return '—';
    var cont = medio === 'ef' ? arqueo.efContado : arqueo.mpContado;
    var diff = medio === 'ef' ? arqueo.efDiff : arqueo.mpDiff;
    var esp = medio === 'ef' ? arqueo.efEsperado : arqueo.mpEsperado;
    var nota = medio === 'ef' ? arqueo.notaEf : arqueo.notaMp;
    var r;
    if (diff === 0) {
      r = 'Cuadrado ($0 dif.)';
    } else {
      var m = arqueoDiffMeta(diff, 'cierre');
      r = '$' + fmt(cont) + ' · ' + m.text + ' ' + m.money + ' (sis $' + fmt(esp) + ')';
    }
    if (nota) r += ' — ' + escapeHtml(nota);
    return r;
  }

  function arqueoCompactNotasMedio(arqueo, medio, mode, prefix) {
    var cont = medio === 'ef' ? arqueo.efContado : arqueo.mpContado;
    var esp = medio === 'ef' ? arqueo.efEsperado : arqueo.mpEsperado;
    var diff = medio === 'ef' ? arqueo.efDiff : arqueo.mpDiff;
    var nota = medio === 'ef' ? arqueo.notaEf : arqueo.notaMp;
    var tag = medio === 'ef' ? 'EF' : 'MP';
    if (mode === 'apertura') {
      var s = prefix + ' ' + tag + ' $' + fmt(cont);
      if (nota) s += ' — ' + nota;
      return s;
    }
    var m = arqueoDiffMeta(diff, 'cierre');
    var s2 = prefix + ' ' + tag + ' $' + fmt(cont) + ' / sis $' + fmt(esp);
    s2 += diff === 0 ? ' OK' : ' ' + m.text + ' ' + m.money;
    if (nota) s2 += ' — ' + nota;
    return s2;
  }

  function cierreMovSeccionHtml(label, rows) {
    return (
      '<div class="cierre-seccion">' +
      '<p class="cierre-seccion-label">' +
      label +
      '</p>' +
      resumenTblRows(rows) +
      '</div>'
    );
  }

  function cierreArqueoContadoRow(tag, contado, esperado) {
    var diff = Math.round(Number(contado) || 0) - Math.round(Number(esperado) || 0);
    var r = '$' + fmt(contado);
    if (diff === 0) r += ' · 0 ✓';
    else if (diff > 0) r += ' · Sobra $' + fmt(diff);
    else r += ' · Falta −$' + fmt(Math.abs(diff));
    return { l: 'Contado ' + tag, r: r, c: diff === 0 ? 'res-ok' : 'res-falt' };
  }

  function cierreIngresoEsMp(g) {
    return String(g.cobrado_con || '').trim() === 'transferencia';
  }

  function cierreFlujoCajaTicketHtml(snapshot, st, cierreWhenIso) {
    var ap = snapshot.aperturaArqueo;
    var arq = snapshot.arqueo;
    var gastosList = snapshot.gastos || [];
    var ingresosList = snapshot.ingresos || [];
    var cierreWhen = formatCierreMetaWhen(cierreWhenIso || new Date().toISOString());
    var aperturaWhen = snapshot.aperturaIso
      ? formatCierreMetaWhen(snapshot.aperturaIso)
      : '—';
    var html = '<div class="resumen-block"><h3>Flujo de caja</h3>';

    html += resumenTblRows([
      { l: 'Fecha · hora cierre', r: escapeHtml(cierreWhen) },
      { l: 'Apertura turno', r: escapeHtml(aperturaWhen), c: 'res-muted' },
    ]);
    html += '<hr class="cierre-rule">';
    html += '<p class="cierre-seccion-label">Apertura del turno</p>';
    html += resumenTblRows([
      {
        l: 'Inicio arqueo EF',
        r: ap ? '$' + fmt(ap.efContado) : '< Sin saldo >',
        c: ap ? '' : 'res-muted',
      },
      {
        l: 'Inicio arqueo MP',
        r: ap ? '$' + fmt(ap.mpContado) : '< Sin saldo >',
        c: ap ? '' : 'res-muted',
      },
      {
        l: 'Total en caja (EF)',
        r: ap ? '$' + fmt(ap.efContado) : '—',
        c: 'res-grand',
      },
    ]);

    html += '<hr class="cierre-rule cierre-rule--dashed">';
    var efIngresos = ingresosList.filter(function (g) {
      return !cierreIngresoEsMp(g);
    });
    var mpIngresos = ingresosList.filter(function (g) {
      return cierreIngresoEsMp(g);
    });
    var efPedidos = Number(st.efPedidos) || 0;
    var mpPedidos = Number(st.mpPedidos) || 0;
    var totalEfMov =
      efPedidos +
      efIngresos.reduce(function (a, g) {
        return a + (Number(g.monto) || 0);
      }, 0);
    var totalMpMov =
      mpPedidos +
      mpIngresos.reduce(function (a, g) {
        return a + (Number(g.monto) || 0);
      }, 0);

    var efRows = [{ l: '· Ventas entregadas EF', r: '$' + fmt(efPedidos), c: 'res-sub' }];
    efIngresos.forEach(function (g) {
      efRows.push({
        l: '· + ' + escapeHtml(movConceptoConMedio(g.concepto, g.cobrado_con)),
        r: '+$' + fmt(g.monto),
        c: 'res-sub',
      });
    });
    efRows.push({ l: 'Total EF', r: '$' + fmt(totalEfMov), c: 'res-grand' });

    var mpRows = [{ l: '· Ventas entregadas MP', r: '$' + fmt(mpPedidos), c: 'res-sub' }];
    mpIngresos.forEach(function (g) {
      mpRows.push({
        l: '· + ' + escapeHtml(movConceptoConMedio(g.concepto, g.cobrado_con)),
        r: '+$' + fmt(g.monto),
        c: 'res-sub',
      });
    });
    mpRows.push({ l: 'Total MP', r: '$' + fmt(totalMpMov), c: 'res-grand' });

    var egRows = gastosList.map(function (g) {
      return {
        l: '· ' + escapeHtml(g.concepto || 'Egreso'),
        r: '−$' + fmt(g.monto),
        c: 'res-sub',
      };
    });
    if (!egRows.length) {
      egRows.push({ l: '· Sin egresos', r: '—', c: 'res-muted' });
    }
    egRows.push({ l: 'Egresos totales', r: '−$' + fmt(st.gTotal || 0), c: 'res-grand' });

    html += cierreMovSeccionHtml('Cobranzas · Efectivo', efRows);
    html += cierreMovSeccionHtml('Cobranzas · Mercado Pago', mpRows);
    html += cierreMovSeccionHtml('Egresos del turno', egRows);

    html += '<hr class="cierre-rule">';
    html += '<p class="cierre-seccion-label">Cierre en caja</p>';
    var cierreRows = [{ l: 'TOTAL EF caja', r: '$' + fmt(st.ef), c: 'res-grand' }];
    if (arq) {
      cierreRows.push(cierreArqueoContadoRow('EF', arq.efContado, st.ef));
    } else {
      cierreRows.push({ l: 'Contado EF', r: 'Sin arqueo', c: 'res-muted' });
    }
    cierreRows.push({ l: 'TOTAL MP caja', r: '$' + fmt(st.mp), c: 'res-grand' });
    if (arq) {
      cierreRows.push(cierreArqueoContadoRow('MP', arq.mpContado, st.mp));
    } else {
      cierreRows.push({ l: 'Contado MP', r: 'Sin arqueo', c: 'res-muted' });
    }
    html += resumenTblRows(cierreRows);

    html += '<div class="cierre-seccion">';
    html += '<p class="cierre-seccion-label">Saldo del turno</p>';
    html += resumenTblRows([
      { l: 'SALDO FINAL', r: '$' + fmt(st.ventas), c: 'res-grand' },
      { l: 'Resultado (ventas − egresos)', r: '$' + fmt(st.resultado), c: 'res-total' },
    ]);
    html += '</div>';

    html += '</div>';
    return html;
  }

  function buildCierreNotasFromArqueo(cierreArqueo, aperturaArqueo) {
    var lines = [];
    if (aperturaArqueo) {
      lines.push(arqueoCompactNotasMedio(aperturaArqueo, 'ef', 'apertura', 'Abrir'));
      lines.push(arqueoCompactNotasMedio(aperturaArqueo, 'mp', 'apertura', 'Abrir'));
    }
    if (cierreArqueo) {
      lines.push(arqueoCompactNotasMedio(cierreArqueo, 'ef', 'cierre', 'Cerrar'));
      lines.push(arqueoCompactNotasMedio(cierreArqueo, 'mp', 'cierre', 'Cerrar'));
    }
    return lines.join('\n');
  }

  function openAperturaArqueoModal(done) {
    readDateFiltersFromUi();
    pendingAperturaArqueoDone = typeof done === 'function' ? done : null;
    setCashArqueoModalUi('apertura');
    fillCashArqueoForm(0, 0, '', '');
    var modal = $('cierre-arqueo-modal');
    if (modal) modal.classList.remove('hidden');
    if ($('arqueo-ef-contado')) $('arqueo-ef-contado').focus();
  }

  function openCierreArqueoModal() {
    if (!pendingCierreSnapshot) return;
    var st = pendingCierreSnapshot.st;
    setCashArqueoModalUi('cierre');
    fillCashArqueoForm(st.ef, st.mp, st.ef, st.mp);
    var modal = $('cierre-arqueo-modal');
    if (modal) modal.classList.remove('hidden');
    if ($('arqueo-ef-contado')) $('arqueo-ef-contado').focus();
  }

  function closeCierreArqueoModal() {
    var modal = $('cierre-arqueo-modal');
    if (modal) modal.classList.add('hidden');
  }

  function cancelCierreArqueoModal() {
    closeCierreArqueoModal();
    if (cashArqueoMode === 'apertura') {
      pendingAperturaArqueoDone = null;
    } else {
      pendingCierreSnapshot = null;
    }
  }

  function confirmCierreArqueoModal() {
    var arqueo = buildCierreArqueoObject();
    if (cashArqueoMode === 'apertura') {
      saveArqueoAperturaTurno(arqueo);
      closeCierreArqueoModal();
      var done = pendingAperturaArqueoDone;
      pendingAperturaArqueoDone = null;
      if (done) done();
      return;
    }
    if (!pendingCierreSnapshot) return;
    var sinObs = arqueoMediosSinObservacion(arqueo);
    if (sinObs.length) {
      if (
        !confirm(
          'Hay diferencia en ' +
            sinObs.join(' y ') +
            ' sin observación. ¿Continuar igual?'
        )
      ) {
        return;
      }
    }
    pendingCierreSnapshot.arqueo = arqueo;
    closeCierreArqueoModal();
    openCierreConfirmModal();
  }

  function resumenTblRows(rows) {
    var html = '<table class="resumen-tbl" role="presentation"><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html +=
        '<tr class="' +
        (r.c || '') +
        '"><td class="res-l">' +
        r.l +
        '</td><td class="res-r">' +
        r.r +
        '</td></tr>';
    }
    return html + '</tbody></table>';
  }

  function splitProductosSimplesDobles(productos) {
    var simples = [];
    var dobles = [];
    (productos || []).forEach(function (x) {
      if (!x || !(Number(x.qty) > 0)) return;
      if (productoNombreEsDoble(x.nombre)) dobles.push(x);
      else simples.push(x);
    });
    simples.sort(function (a, b) {
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    dobles.sort(function (a, b) {
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    return { simples: simples, dobles: dobles };
  }

  function cierreProductosTblRows(list) {
    if (!list.length) {
      return resumenTblRows([{ l: '—', r: '0', c: 'res-muted' }]);
    }
    return resumenTblRows(
      list.map(function (x) {
        return { l: escapeHtml(x.nombre) + ':', r: String(Math.round(x.qty)) };
      })
    );
  }

  function cierreCatalogoVentasTblRows(list) {
    var rows = list || [];
    if (!rows.length) {
      return resumenTblRows([{ l: '—', r: '0', c: 'res-muted' }]);
    }
    return resumenTblRows(
      rows.map(function (x) {
        return { l: escapeHtml(x.nombre) + ':', r: String(Math.round(x.qty || 0)) };
      })
    );
  }

  function cierreRegistroVentasHtml(productos, st) {
    var split = splitProductosSimplesDobles(productos);
    var html = '<p class="res-group-title">Simples:</p>';
    html += cierreProductosTblRows(split.simples);
    html += '<p class="res-group-title">Dobles:</p>';
    html += cierreProductosTblRows(split.dobles);
    html += resumenTblRows([
      { l: 'Vendidas total', r: Math.round(st.hambTotal) + ' u.', c: 'res-total' },
    ]);
    html += '<p class="res-group-title">Acompañamientos:</p>';
    html += cierreCatalogoVentasTblRows(st.acompanamientosVentas);
    html += '<p class="res-group-title">Extras:</p>';
    html += cierreCatalogoVentasTblRows(st.extrasVentas);
    html += '<p class="res-group-title">Bebidas:</p>';
    html += cierreCatalogoVentasTblRows(st.bebidasVentas);
    return html;
  }

  function buildCierreResumenHtml(snapshot, cierreId, cierreWhenIso) {
    var st = snapshot.st;
    var cierreIso = cierreWhenIso || new Date().toISOString();
    var productos = (st.productosVentas || []).filter(function (x) {
      return x.qty > 0;
    });
    return (
      '<div class="resumen-top">' +
      '<div class="brand">BRAVA BURGERS</div>' +
      '<div class="meta">' +
      escapeHtml(cierreId || '—') +
      ' · ' +
      escapeHtml(snapshot.periodoLbl) +
      '<br>Apertura ' +
      escapeHtml(formatCierreMetaWhen(snapshot.aperturaIso)) +
      ' · Cierre ' +
      escapeHtml(formatCierreMetaWhen(cierreIso)) +
      '</div></div>' +
      cierreFlujoCajaTicketHtml(snapshot, st, cierreIso) +
      '<div class="resumen-block"><h3>Registro de ventas</h3>' +
      cierreRegistroVentasHtml(productos, st) +
      '</div>' +
      '<div class="resumen-foot">Brava Burgers · Cierre operativo</div>'
    );
  }

  function cierreSnapshotForStorage(snapshot) {
    if (!snapshot) return null;
    return {
      st: snapshot.st,
      gastos: snapshot.gastos || [],
      ingresos: snapshot.ingresos || [],
      aperturaArqueo: snapshot.aperturaArqueo || null,
      arqueo: snapshot.arqueo || null,
      periodoLbl: snapshot.periodoLbl || '',
      aperturaIso: snapshot.aperturaIso || null,
    };
  }

  function parseCierreSnapshotJson(raw) {
    if (raw == null || raw === '') return null;
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || typeof o !== 'object' || !o.st) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function cierrePeriodoLabelFromRecord(c) {
    if (!c) return '—';
    var d1 = c.periodo_desde ? c.periodo_desde.split('-').reverse().join('/') : '…';
    var d2 = c.periodo_hasta ? c.periodo_hasta.split('-').reverse().join('/') : '…';
    return d1 === d2 ? d1 : d1 + ' — ' + d2;
  }

  function cierreHistorialFechaIso(c) {
    if (!c) return '';
    if (c.cerrado_at && String(c.cerrado_at).length >= 10) return String(c.cerrado_at).slice(0, 10);
    return c.periodo_hasta || c.periodo_desde || '';
  }

  function buildCierreOperativoLegacyHtml(c) {
    var ingresos = Math.max(0, Number(c.ingresos) || 0);
    var ventasPed = Math.max(0, (Number(c.ventas_total) || 0) - ingresos);
    var st = {
      ef: Number(c.efectivo) || 0,
      mp: Number(c.mercado_pago) || 0,
      ventas: Number(c.ventas_total) || 0,
      ventasPedidos: ventasPed,
      efPedidos: Number(c.efectivo) || 0,
      mpPedidos: Number(c.mercado_pago) || 0,
      gTotal: Number(c.gastos) || 0,
      iTotal: ingresos,
      resultado: Number(c.resultado) || 0,
      simples: Number(c.hamb_simples) || 0,
      dobles: Number(c.hamb_dobles) || 0,
      hambTotal: Number(c.hamb_total) || 0,
      productosVentas: [],
      bebidasVentas: [],
      acompanamientosVentas: [],
      extrasVentas: [],
    };
    var snap = {
      st: st,
      gastos: [],
      ingresos: [],
      aperturaArqueo: null,
      arqueo: null,
      periodoLbl: cierrePeriodoLabelFromRecord(c),
      aperturaIso: c.ventana_desde || null,
    };
    var html = buildCierreResumenHtml(snap, c.id, c.cerrado_at);
    if (c.notas) {
      html = html.replace(
        '<div class="resumen-foot">',
        '<div class="resumen-block"><h3>Notas</h3><p class="resumen-note" style="white-space:pre-wrap">' +
          escapeHtml(String(c.notas)) +
          '</p></div><div class="resumen-foot">'
      );
    }
    return html;
  }

  function buildCierreOperativoHtmlFromRecord(c) {
    if (!c) return '';
    var snap = parseCierreSnapshotJson(c.snapshot_json);
    if (snap) {
      if (!snap.periodoLbl) snap.periodoLbl = cierrePeriodoLabelFromRecord(c);
      if (!snap.aperturaIso && c.ventana_desde) snap.aperturaIso = c.ventana_desde;
      return buildCierreResumenHtml(snap, c.id, c.cerrado_at);
    }
    return buildCierreOperativoLegacyHtml(c);
  }

  function matchCierreHistorialSearch(c, q) {
    if (!q) return true;
    var s = String(q).trim().toLowerCase();
    if (!s) return true;
    var hay = [
      c.id,
      c.periodo_desde,
      c.periodo_hasta,
      cierrePeriodoLabelFromRecord(c),
      c.notas,
      c.cerrado_at,
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(s) >= 0;
  }

  function findHistorialCierreById(id) {
    if (!id) return null;
    for (var i = 0; i < cierresHistorialList.length; i++) {
      if (cierresHistorialList[i].id === id) return cierresHistorialList[i];
    }
    for (var j = 0; j < cierresCache.length; j++) {
      if (cierresCache[j].id === id) return cierresCache[j];
    }
    return null;
  }

  function loadCierresHistorial(reset) {
    if (cierresHistorialFetchInFlight && !reset) return cierresHistorialFetchInFlight;
    var offset = reset ? 0 : cierresHistorialList.length;
    if (reset) cierresHistorialList = [];
    cierresHistorialFetchInFlight = api({
      action: 'listCierres',
      token: token,
      limit: 80,
      offset: offset,
    })
      .then(function (res) {
        if (!res.data.ok) {
          if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
          return false;
        }
        var batch = res.data.cierres || [];
        if (reset) cierresHistorialList = batch.slice();
        else cierresHistorialList = cierresHistorialList.concat(batch);
        cierresHistorialHasMore = !!res.data.hasMore;
        if ($('cohist-load-more-wrap')) {
          $('cohist-load-more-wrap').classList.toggle('hidden', !cierresHistorialHasMore);
        }
        renderCierreHistorialTable();
        return true;
      })
      .finally(function () {
        cierresHistorialFetchInFlight = null;
      });
    return cierresHistorialFetchInFlight;
  }

  function renderCierreHistorialPreview(c) {
    var slot = $('cohist-preview');
    var btnPrint = $('cohist-print');
    if (!slot) return;
    if (btnPrint) btnPrint.disabled = !c;
    if (!c) {
      slot.innerHTML = '<p class="caja-hint" style="margin:0;">Elegí un cierre operativo de la lista.</p>';
      return;
    }
    slot.innerHTML =
      '<div class="cierre-resumen-wrap"><div class="resumen resumen-ticket resumen-cierre">' +
      buildCierreOperativoHtmlFromRecord(c) +
      '</div></div>';
  }

  function renderCierreHistorialTable() {
    var tbody = $('cohist-tbody');
    if (!tbody) return;
    var desde = ($('cohist-desde') && $('cohist-desde').value) || '';
    var hasta = ($('cohist-hasta') && $('cohist-hasta').value) || '';
    var q = ($('cohist-buscar') && $('cohist-buscar').value) || '';
    var visible = 0;
    var html = '';
    cierresHistorialList.forEach(function (c) {
      var dia = cierreHistorialFechaIso(c);
      if (desde && dia && dia < desde) return;
      if (hasta && dia && dia > hasta) return;
      if (!matchCierreHistorialSearch(c, q)) return;
      visible++;
      html +=
        '<tr data-id="' +
        escapeHtml(c.id) +
        '" class="' +
        (selectedHistorialCierreId === c.id ? 'row-active' : '') +
        '">' +
        '<td>' +
        escapeHtml(formatCierreMetaWhen(c.cerrado_at || c.periodo_hasta)) +
        '</td><td><strong>' +
        escapeHtml(c.id || '—') +
        '</strong></td><td>' +
        escapeHtml(cierrePeriodoLabelFromRecord(c)) +
        '</td><td>' +
        '$' +
        fmt(c.ventas_total) +
        '</td><td>$' +
        fmt(c.efectivo) +
        '</td><td>$' +
        fmt(c.mercado_pago) +
        '</td></tr>';
    });
    tbody.innerHTML = html;
    if ($('cohist-count')) $('cohist-count').textContent = String(visible);
    if ($('cohist-total')) {
      $('cohist-total').textContent = String(cierresHistorialList.length) + (cierresHistorialHasMore ? '+' : '');
    }
    if ($('cohist-empty')) $('cohist-empty').classList.toggle('hidden', visible > 0);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selectedHistorialCierreId = tr.getAttribute('data-id');
        renderCierreHistorialPreview(findHistorialCierreById(selectedHistorialCierreId));
        renderCierreHistorialTable();
      });
    });
    if (selectedHistorialCierreId) {
      var still = findHistorialCierreById(selectedHistorialCierreId);
      if (!still) {
        selectedHistorialCierreId = null;
        renderCierreHistorialPreview(null);
      }
    }
  }

  function openCierreHistorialModal() {
    selectedHistorialCierreId = null;
    renderCierreHistorialPreview(null);
    if ($('cohist-desde')) $('cohist-desde').value = '';
    if ($('cohist-hasta')) $('cohist-hasta').value = '';
    if ($('cohist-buscar')) $('cohist-buscar').value = '';
    var modal = $('cierre-historial-modal');
    if (modal) modal.classList.remove('hidden');
    loadCierresHistorial(true);
    if ($('cohist-buscar')) $('cohist-buscar').focus();
  }

  function closeCierreHistorialModal() {
    var modal = $('cierre-historial-modal');
    if (modal) modal.classList.add('hidden');
  }

  function printCierreHistorialPreview() {
    var c = findHistorialCierreById(selectedHistorialCierreId);
    if (!c) return;
    var wrap = $('cohist-preview');
    if (!wrap) return;
    var inner = wrap.querySelector('.resumen.resumen-cierre');
    if (!inner) return;
    printCierreResumenThermal(inner.outerHTML);
  }

  function orderProformaFechaIso(o) {
    if (!o || !o.fecha_creado) return '';
    return String(o.fecha_creado).slice(0, 10);
  }

  function formatOrderProformaWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('es-AR');
  }

  function findProformaOrder(orn) {
    if (!orn) return null;
    for (var i = 0; i < proformasList.length; i++) {
      if (proformasList[i].orn === orn) return proformasList[i];
    }
    return findOrderByOrn(orn);
  }

  function renderProfComandaPreview(o) {
    var slot = $('prof-comanda-slot');
    var btnPrint = $('prof-print');
    if (!slot) return;
    if (btnPrint) btnPrint.disabled = !o;
    if (!o) {
      slot.innerHTML = '<p class="caja-hint" style="margin:0;">Elegí una fila.</p>';
      return;
    }
    if (window.BravaComanda && window.BravaComanda.renderTicketHtml) {
      slot.innerHTML =
        '<div class="comanda-preview-wrap"><article class="ticket ticket-comanda">' +
        window.BravaComanda.renderTicketHtml(o) +
        '</article></div>';
      return;
    }
    slot.innerHTML =
      '<p class="caja-hint">' +
      escapeHtml(orderDisplayOrn(o)) +
      ' · ' +
      escapeHtml(o.cliente || '') +
      '</p>';
  }

  function renderProformasTable() {
    var tbody = $('proformas-tbody');
    if (!tbody) return;
    var visible = proformasList.length;
    var html = '';
    proformasList.forEach(function (o) {
      html +=
        '<tr data-orn="' +
        escapeHtml(o.orn) +
        '" class="' +
        (selectedProformaOrn === o.orn ? 'row-active' : '') +
        '">' +
        '<td>' +
        escapeHtml(formatOrderProformaWhen(o.fecha_creado)) +
        '</td><td>' +
        escapeHtml(o.cliente || '—') +
        '</td><td>' +
        escapeHtml(o.telefono || '—') +
        '</td><td>$' +
        fmt(Number(o.total) || 0) +
        '</td><td><strong>' +
        escapeHtml(orderDisplayOrn(o)) +
        '</strong></td><td>' +
        escapeHtml(normalizeEstado(o.estado)) +
        '</td></tr>';
    });
    tbody.innerHTML = html;
    if ($('prof-count')) $('prof-count').textContent = String(visible);
    if ($('prof-total')) {
      $('prof-total').textContent = String(proformasList.length) + (proformasHasMore ? '+' : '');
    }
    if ($('prof-empty')) $('prof-empty').classList.toggle('hidden', visible > 0);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selectedProformaOrn = tr.getAttribute('data-orn');
        renderProfComandaPreview(findProformaOrder(selectedProformaOrn));
        renderProformasTable();
      });
    });
    if (selectedProformaOrn && !findProformaOrder(selectedProformaOrn)) {
      selectedProformaOrn = null;
      renderProfComandaPreview(null);
    }
  }

  function fetchProformas(reset) {
    if (proformasFetchInFlight && !reset) return proformasFetchInFlight;
    var offset = reset ? 0 : proformasList.length;
    if (reset) proformasList = [];
    var q = ($('prof-buscar') && $('prof-buscar').value) || '';
    var desde = ($('prof-desde') && $('prof-desde').value) || '';
    var hasta = ($('prof-hasta') && $('prof-hasta').value) || '';
    proformasFetchInFlight = api({
      action: 'searchOrders',
      token: token,
      q: q,
      desde: desde,
      hasta: hasta,
      limit: 100,
      offset: offset,
    })
      .then(function (res) {
        if (!res.data.ok) {
          if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
          return false;
        }
        var batch = res.data.orders || [];
        if (reset) proformasList = batch.slice();
        else proformasList = proformasList.concat(batch);
        proformasHasMore = !!res.data.hasMore;
        if ($('prof-load-more-wrap')) {
          $('prof-load-more-wrap').classList.toggle('hidden', !proformasHasMore);
        }
        renderProformasTable();
        return true;
      })
      .finally(function () {
        proformasFetchInFlight = null;
      });
    return proformasFetchInFlight;
  }

  function scheduleProformasSearch() {
    if (proformasSearchTimer) clearTimeout(proformasSearchTimer);
    proformasSearchTimer = setTimeout(function () {
      proformasSearchTimer = null;
      selectedProformaOrn = null;
      renderProfComandaPreview(null);
      fetchProformas(true);
    }, 350);
  }

  function openProformasModal() {
    selectedProformaOrn = null;
    renderProfComandaPreview(null);
    if ($('prof-desde')) $('prof-desde').value = '';
    if ($('prof-hasta')) $('prof-hasta').value = '';
    if ($('prof-buscar')) $('prof-buscar').value = '';
    var modal = $('proformas-modal');
    if (modal) modal.classList.remove('hidden');
    fetchProformas(true);
    if ($('prof-buscar')) $('prof-buscar').focus();
  }

  function closeProformasModal() {
    var modal = $('proformas-modal');
    if (modal) modal.classList.add('hidden');
  }

  function printProformaPreview() {
    var o = findProformaOrder(selectedProformaOrn);
    if (!o || !window.BravaComanda || !window.BravaComanda.printOrderTicket) return;
    window.BravaComanda.printOrderTicket(o);
  }

  function openCierreConfirmModal() {
    var el = $('cierre-confirm-text');
    var modal = $('cierre-confirm-modal');
    if (!el || !modal || !pendingCierreSnapshot) return;
    el.textContent = buildCierreConfirmMessage(
      pendingCierreSnapshot.st,
      pendingCierreSnapshot.periodoLbl,
      pendingCierreSnapshot.arqueo
    );
    modal.classList.remove('hidden');
  }

  function closeCierreConfirmModal() {
    var modal = $('cierre-confirm-modal');
    if (modal) modal.classList.add('hidden');
  }

  function openCierreResumenModal(html) {
    var content = $('cierre-resumen-content');
    var modal = $('cierre-resumen-modal');
    if (!content || !modal) return;
    content.innerHTML = html;
    modal.classList.remove('hidden');
  }

  function closeCierreResumenModal() {
    var modal = $('cierre-resumen-modal');
    if (modal) modal.classList.add('hidden');
    document.documentElement.classList.remove('printing-cierre-caja');
    document.body.classList.remove('printing-cierre-caja');
  }

  function getCierreThermalPrintCss() {
    return (
      '@page { size: 80mm auto; margin: 0; }' +
      'html, body { margin: 0; padding: 0; width: 100%; max-width: 100%; height: auto; min-height: 0; overflow: visible; box-sizing: border-box; background: #fff; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '.resumen.resumen-cierre { width: 100%; max-width: none; margin: 0; padding: 0; box-sizing: border-box; border: none; border-radius: 0; background: #fff; color: #000; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 12px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '.resumen-cierre .resumen-top { background: #000; color: #fff; padding: 8px 2mm; text-align: center; width: 100%; box-sizing: border-box; }' +
      '.resumen-cierre .resumen-top .brand { font-size: 13px; font-weight: 800; letter-spacing: 0.04em; color: #fff; }' +
      '.resumen-cierre .resumen-top .meta { font-size: 11px; margin-top: 4px; line-height: 1.4; color: #fff; opacity: 1; }' +
      '.resumen-cierre .resumen-block { padding: 8px 2mm; border-bottom: 1px solid #ddd; background: #fff; box-sizing: border-box; }' +
      '.resumen-cierre .resumen-block h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; }' +
      '.resumen-cierre .cierre-rule { border: 0; border-top: 1px solid #000; margin: 8px 0; }' +
      '.resumen-cierre .cierre-rule--dashed { border-top-style: dashed; border-color: #666; }' +
      '.resumen-cierre .cierre-seccion { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #888; }' +
      '.resumen-cierre .cierre-seccion:first-child { margin-top: 0; padding-top: 0; border-top: 0; }' +
      '.resumen-cierre .cierre-seccion-label { margin: 0 0 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #000; }' +
      '.resumen-cierre .resumen-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }' +
      '.resumen-cierre .res-l { width: 58%; text-align: left; vertical-align: top; padding: 2px 0; word-break: break-word; font-size: 12px; color: #000; }' +
      '.resumen-cierre .res-r { width: 42%; text-align: right; vertical-align: top; padding: 2px 0; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 12px; color: #000; }' +
      '.resumen-cierre tr.res-sub .res-l, .resumen-cierre tr.res-sub .res-r { font-size: 11px; color: #444; padding-left: 8px; }' +
      '.resumen-cierre tr.res-total .res-l, .resumen-cierre tr.res-total .res-r { font-weight: 700; font-size: 12px; border-top: 1px dashed #000; padding-top: 5px; }' +
      '.resumen-cierre tr.res-muted .res-l, .resumen-cierre tr.res-muted .res-r { color: #777; font-size: 11px; }' +
      '.resumen-cierre tr.res-grand .res-l, .resumen-cierre tr.res-grand .res-r { font-weight: 800; font-size: 13px; padding-top: 4px; }' +
      '.resumen-cierre tr.res-ok .res-r, .resumen-cierre tr.res-falt .res-r { font-weight: 700; }' +
      '.resumen-cierre tr.res-result .res-l, .resumen-cierre tr.res-result .res-r { font-weight: 700; font-size: 12px; color: #000; }' +
      '.resumen-cierre .res-group-title { margin: 8px 0 3px; font-size: 11px; font-weight: 700; color: #000; }' +
      '.resumen-cierre .res-group-title:first-of-type { margin-top: 2px; }' +
      '.resumen-cierre .resumen-foot { padding: 8px 2mm; font-size: 11px; color: #fff; background: #000; text-align: center; width: 100%; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
    );
  }

  function printCierreResumenThermal(resumenOuterHtml) {
    if (!resumenOuterHtml) return false;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Impresión cierre de caja');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;width:0;height:0;border:0;margin:0;padding:0;left:0;top:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    var win = iframe.contentWindow;
    var doc = iframe.contentDocument || (win && win.document);
    if (!doc || !win) {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      return false;
    }
    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cierre de caja</title><style>' +
        getCierreThermalPrintCss() +
        '</style></head><body>' +
        resumenOuterHtml +
        '</body></html>'
    );
    doc.close();
    var cleanup = function () {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    win.onafterprint = function () {
      cleanup();
      win.onafterprint = null;
    };
    setTimeout(function () {
      try {
        win.focus();
        win.print();
      } catch (e) {
        cleanup();
      }
    }, 200);
    return true;
  }

  function printCierreResumenModal() {
    var content = $('cierre-resumen-content');
    if (!content || !content.innerHTML.trim()) return;
    printCierreResumenThermal(content.outerHTML);
  }

  function printCierreResumenCompleto() {
    var content = $('cierre-resumen-content');
    if (!content || !content.innerHTML) return;
    var modal = $('cierre-resumen-modal');
    if (modal) modal.classList.remove('hidden');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        printCierreResumenModal();
      });
    });
  }

  function commitCierreCaja() {
    closeCierreConfirmModal();
    var snapshot = pendingCierreSnapshot;
    pendingCierreSnapshot = null;
    if (!snapshot) return;
    var st = snapshot.st;
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
      ingresos: st.iTotal || 0,
      resultado: st.resultado,
      cancelados: st.cancel,
      hamb_simples: Math.round(st.simples),
      hamb_dobles: Math.round(st.dobles),
      hamb_total: Math.round(st.hambTotal),
      notas: buildCierreNotasFromArqueo(snapshot.arqueo, snapshot.aperturaArqueo),
      snapshot_json: JSON.stringify(cierreSnapshotForStorage(snapshot)),
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.data.ok && res.data.cierre) {
        var c = res.data.cierre;
        setCajaMarcadaAbierta(false);
        clearApertura();
        cierresCache.unshift(c);
        cierresHistorialList.unshift(c);
        updateCajaUI();
        renderMovimientosList();
        loadCierres(true);
        var html = buildCierreResumenHtml(snapshot, c.id, c.cerrado_at);
        openCierreResumenModal(html);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            printCierreResumenModal();
          });
        });
        if (res.data.warning === 'ingresos_column_missing') {
          alert(
            'Cierre guardado.\n\nPara guardar ingresos en Supabase y usar + Ingreso, ejecutá una vez:\n' +
              'supabase/ingresos_migration.sql (SQL Editor).'
          );
        } else if (res.data.warning === 'snapshot_column_missing') {
          alert(
            'Cierre operativo guardado.\n\nPara reimprimir el detalle completo desde Historial, ejecutá una vez:\n' +
              'supabase/BRAVA_SUPABASE_RUN_ONCE.sql o cierres_caja_snapshot_migration.sql (SQL Editor).'
          );
        }
      } else {
        if (res.status === 401) handleAuthFailure();
        else {
          var errHint =
            'No se pudo guardar el cierre.\n\n' +
            'En Supabase → SQL Editor pegá y ejecutá:\n' +
            'supabase/ingresos_migration.sql\n\n' +
            '(Si nunca tuviste cierres de caja: supabase/cierres_caja_migration.sql)';
          if (res.data.error) {
            errHint += '\n\nDetalle: ' + res.data.error;
          }
          if (res.data.detail) {
            errHint += '\n' + String(res.data.detail).slice(0, 280);
          }
          alert(errHint);
        }
        updateCierreStatusUI();
      }
    });
  }

  function performCierreCaja() {
    if (findCierreForCurrentPeriod()) {
      alert('Este período ya está cerrado. Usá «Abrir turno» (✓ arriba) si querés operar de nuevo.');
      return;
    }
    if (!isCajaMarcadaAbierta()) {
      alert('Primero abrí el turno con el botón ✓ arriba.');
      return;
    }
    readDateFiltersFromUi();
    var st = computeSesionStats();
    var apMs = getAperturaAtMs();
    pendingCierreSnapshot = {
      st: st,
      periodoLbl: cierrePeriodoLabel(),
      aperturaIso: isNaN(apMs) ? null : new Date(apMs).toISOString(),
      gastos: gastosEnTurnoParaCierre(),
      ingresos: ingresosEnTurnoParaCierre(),
      aperturaArqueo: getArqueoAperturaTurno(),
    };
    openCierreArqueoModal();
  }

  function renderMovimientosList() {
    var ul = $('mov-list');
    var empty = $('mov-empty');
    if (!ul) return;
    updateMovimientosChrome();
    var items = [];
    ingresosVisiblesTurno().forEach(function (x) {
      items.push({
        kind: 'ing',
        id: x.id,
        concepto: x.concepto,
        monto: x.monto,
        medio: x.cobrado_con,
        seq: movimientoTimestampMs(x),
      });
    });
    gastosVisiblesTurno().forEach(function (x) {
      items.push({
        kind: 'eg',
        id: x.id,
        concepto: x.concepto,
        monto: x.monto,
        medio: x.pagado_con,
        seq: movimientoTimestampMs(x),
      });
    });
    items.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'ing' ? -1 : 1;
      return b.seq - a.seq;
    });
    if (!items.length) {
    ul.innerHTML = '';
      if (empty) {
        empty.classList.remove('hidden');
        if (!isCajaTurnoActivo()) {
          empty.textContent =
            'Sin movimientos — abrí la caja para cargar ingresos y egresos del turno (ahora $0).';
        } else {
          empty.textContent = 'Sin movimientos en este turno.';
        }
      }
      updateCajaUI();
      return;
    }
    if (empty) empty.classList.add('hidden');
    ul.innerHTML = items
      .map(function (x) {
        var tag = x.kind === 'ing' ? 'Ingreso' : 'Egreso';
        var mClass = x.kind === 'ing' ? 'ing' : 'eg';
        var sign = x.kind === 'ing' ? '+' : '−';
        return (
          '<li><div class="concept"><span class="tag ' +
          mClass +
          '">' +
          tag +
          '</span><span class="concept-text">' +
          escapeHtml(movConceptoConMedio(x.concepto, x.medio)) +
          '</span></div><div class="monto-row"><span class="monto ' +
          mClass +
          '">' +
          sign +
          '$' +
          fmt(x.monto) +
          '</span><button type="button" class="btn-del" data-del-kind="' +
          x.kind +
          '" data-del-id="' +
          escapeHtml(x.id) +
          '" title="Eliminar">✕</button></div></li>'
        );
      })
      .join('');
    ul.querySelectorAll('[data-del-id]').forEach(function (btn) {
      btn.onclick = function () {
        var kind = btn.getAttribute('data-del-kind');
        var id = btn.getAttribute('data-del-id');
        if (!id) return;
        var label = kind === 'ing' ? 'ingreso' : 'egreso';
        if (!confirm('¿Eliminar ' + label + ' ' + id + '?')) return;
        if (kind === 'ing') {
          var prevI = ingresosCache.slice();
          ingresosCache = ingresosCache.filter(function (g) {
            return g.id !== id;
          });
          renderMovimientosList();
          api({ action: 'deleteIngreso', token: token, id: id }).then(function (res) {
            if (res.data.ok) loadIngresos(true);
            else {
              ingresosCache = prevI;
              renderMovimientosList();
              if (res.status === 401) handleAuthFailure();
              else alert('No se pudo eliminar el ingreso.');
            }
          });
        } else {
          var prevG = gastosCache.slice();
        gastosCache = gastosCache.filter(function (g) {
            return g.id !== id;
        });
          renderMovimientosList();
          api({ action: 'deleteGasto', token: token, id: id }).then(function (res) {
          if (res.data.ok) loadGastos(true);
          else {
              gastosCache = prevG;
              renderMovimientosList();
            if (res.status === 401) handleAuthFailure();
              else alert('No se pudo eliminar el egreso.');
          }
        });
        }
      };
    });
    updateCajaUI();
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function movimientoInFilterRange(g) {
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
          renderMovimientosList();
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

  function loadIngresos(force) {
    readDateFiltersFromUi();
    if (ingresosFetchInFlight && !force) return ingresosFetchInFlight;
    ingresosFetchInFlight = api({
      action: 'listIngresos',
      token: token,
      desde: filterDesde,
      hasta: filterHasta,
    })
      .then(function (res) {
        if (res.data.ok) {
          ingresosCache = res.data.ingresos || [];
          renderMovimientosList();
          return true;
        }
        if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();
        return false;
      })
      .finally(function () {
        ingresosFetchInFlight = null;
      });
    return ingresosFetchInFlight;
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

    updateViewSubtitle();

    paintCurrentTab();

    loadOrders();

    cierresReady = false;
    loadCierres(true).then(function () {
      loadGastos(true);
      loadIngresos(true);
    });
    loadHambMenuMeta().then(function () {
      updateCajaUI();
    });

    refreshSupabaseSession().finally(function () {

      startPolling();

    });

    ensureIngresosSchemaOnce();
    ensurePendOrnDelOnce();
    ensureWaMessagesOnce();
    initDefaultAlertSound();

    if (window.BravaWaPanel) {
      if (typeof BravaWaPanel.setOrdersProvider === 'function') {
        BravaWaPanel.setOrdersProvider(function () {
          return allOrdersCache;
        });
      }
      if (typeof BravaWaPanel.init === 'function') BravaWaPanel.init();
      syncWaPanelOrders();
    }

  }

  /** Una vez por sesión: migración ingresos si Vercel tiene SUPABASE_DB_PASSWORD o POSTGRES_URL. */
  function ensureIngresosSchemaOnce() {
    if (!token) return;
    try {
      if (sessionStorage.getItem('brava_ingresos_schema_try') === '1') return;
      sessionStorage.setItem('brava_ingresos_schema_try', '1');
    } catch (e) {
      return;
    }
    api({ action: 'migrateIngresosSchema', token: token }).then(function (res) {
      if (res.data && res.data.ok) {
        try {
          sessionStorage.setItem('brava_ingresos_schema_ok', '1');
        } catch (e2) {}
        loadIngresos(true);
        loadCierres(true);
      }
    });
  }



  /** Una vez por sesión: tabla wa_messages si falta (Vercel: SUPABASE_DB_PASSWORD). */
  function ensureWaMessagesOnce() {
    if (!token) return;
    try {
      if (sessionStorage.getItem('brava_wa_messages_try') === '1') return;
      sessionStorage.setItem('brava_wa_messages_try', '1');
    } catch (e) {
      return;
    }
    api({ action: 'migrateWaMessages', token: token }).then(function (res) {
      if (res.data && res.data.ok) {
        try {
          sessionStorage.setItem('brava_wa_messages_ok', '1');
        } catch (e2) {}
      }
    });
  }

  /** Una vez por sesión: next_pend_del() si falta en Supabase (Vercel: SUPABASE_DB_PASSWORD). */
  function ensurePendOrnDelOnce() {
    if (!token) return;
    try {
      if (sessionStorage.getItem('brava_pend_orn_try') === '1') return;
      sessionStorage.setItem('brava_pend_orn_try', '1');
    } catch (e) {
      return;
    }
    api({ action: 'migratePendOrnDel', token: token }).then(function (res) {
      if (res.data && res.data.ok) {
        try {
          sessionStorage.setItem('brava_pend_orn_ok', '1');
        } catch (e2) {}
      }
    });
  }



  function playAlertTone(ctx, startTime, note) {

      var o = ctx.createOscillator();

      var g = ctx.createGain();

    o.type = note.wave || 'sine';

    o.frequency.value = note.freq;

      o.connect(g);

      g.connect(ctx.destination);

    var t0 = startTime + (note.at || 0);

    var dur = note.dur || 0.3;

    var peak = note.vol != null ? note.vol : 0.25;

      g.gain.setValueAtTime(0.001, t0);

    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.025);

    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      o.start(t0);

    o.stop(t0 + dur + 0.06);

  }



  function playDingSynth() {

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    var ctx = audioCtx;

    if (ctx.state === 'suspended') ctx.resume();

    var t = ctx.currentTime;

    ALERT_SOUND_NOTES.forEach(function (note) {

      playAlertTone(ctx, t, note);

    });

  }



  function getAlertAudio() {

    if (alertAudio) return alertAudio;

    var el = document.getElementById('alert-sound-mp3');

    if (el) {

      alertAudio = el;

    } else {

      alertAudio = new Audio(ALERT_SOUND_URL);

      alertAudio.preload = 'auto';

    }

    alertAudio.volume = 1;

    if (!alertAudio.dataset.bound) {

      alertAudio.dataset.bound = '1';

      alertAudio.addEventListener(

        'error',

        function () {

          alertMp3Broken = true;

        },

        { once: true }

      );

    }

    return alertAudio;

  }



  function playMp3Alert(retry) {

    var a = getAlertAudio();

    a.currentTime = 0;

    var played = a.play();

    if (!played || !played.then) return;

    played.catch(function () {

      if (!retry) {

        a.load();

        a.addEventListener(

          'canplaythrough',

          function () {

            playMp3Alert(true);

          },

          { once: true }

        );

      } else {

        playDingSynth();

      }

    });

  }



  function playDing() {

    if (!soundOn) return;

    if (ALERT_SOUND_URL && !alertMp3Broken) {

      playMp3Alert(false);

      return;

    }

    playDingSynth();

  }



  function telWa(tel) {

    var d = String(tel || '').replace(/\D/g, '');

    if (d.startsWith('549')) return d;

    if (d.startsWith('54')) return d;

    if (d.startsWith('11') || d.startsWith('15')) return '549' + d.replace(/^15/, '11');

    return '54911' + d;

  }



  function orderHasWaPhone(o) {

    return String(o && o.telefono ? o.telefono : '').replace(/\D/g, '').length >= 8;

  }



  function syncWaPanelOrders() {

    if (window.BravaWaPanel && typeof BravaWaPanel.syncOrders === 'function') {

      BravaWaPanel.syncOrders(allOrdersCache);

    }

  }



  function maybeWaAutoNotify(orn, newEstado) {

    if (!window.BravaWaPanel || typeof BravaWaPanel.autoNotify !== 'function') return;

    var o = findOrder(orn);

    if (!o || !orderHasWaPhone(o)) return;

    var est = normalizeEstado(newEstado);

    if (est === 'aceptado') BravaWaPanel.autoNotify(o, 'confirmado');

    else if (est === 'en_camino') BravaWaPanel.autoNotify(o, 'camino');

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

    var counts = { pendiente: 0, aceptado: 0, en_preparacion: 0, en_camino: 0, rechazado: 0, entregada: 0, cancelada: 0 };

    orders.forEach(function (o) {

      var e = normalizeEstado(o.estado);

      if (Object.prototype.hasOwnProperty.call(counts, e)) counts[e]++;

    });

    var mutedEstados = ['entregada', 'cancelada', 'rechazado'];

    document.querySelectorAll('#view-pedidos .pipeline .tab').forEach(function (btn) {

      var est = btn.dataset.estado;

      var short = btn.getAttribute('data-short') || btn.getAttribute('data-label') || est;

      var n = counts[est] || 0;

      btn.textContent = '';

      btn.appendChild(document.createTextNode(short + ' '));

      var countEl = document.createElement('span');

      countEl.className = 'n';

      countEl.textContent = String(n);

      btn.appendChild(countEl);

      btn.classList.toggle('tab-alert', est === 'pendiente' && n > 0);

      btn.classList.toggle('tab-muted', mutedEstados.indexOf(est) >= 0);

    });

    var navPed = document.querySelector('.nav-btn[data-view="pedidos"]');

    if (navPed) {

      var pending = counts.pendiente || 0;

      var badge = navPed.querySelector('.nav-pending-badge');

      if (pending > 0) {

        if (!badge) {

          badge = document.createElement('span');

          badge.className = 'nav-pending-badge';

          navPed.appendChild(badge);

        }

        badge.textContent = String(pending);

        badge.hidden = false;

      } else if (badge) {

        badge.hidden = true;

      }

    }

  }



  function ordersTableColspan(panelEstado) {

    if (panelEstado === 'en_preparacion') return 10;

    return 9;

  }

  function formatOrderTurnoShort(turno) {
    var s = String(turno || '').trim();
    if (!s) return '—';
    var m = s.match(/turno\s*(\d+)/i);
    if (m) return 'T' + m[1];
    m = s.match(/noche\s*(\d+)/i);
    if (m) return 'T' + m[1];
    return '—';
  }

  function formatOrderTurnCell(o) {
    var t = formatOrderTurnoShort(o.turno);
    if (t === '—') return '<span class="orders-turno-muted">—</span>';
    return '<span class="orders-turno-badge">' + escapeHtml(t) + '</span>';
  }

  function formatOrderItemsTooltip(o) {
    var items = parseOrderItems(o);
    if (!items.length) return '';
    return items
      .map(function (it) {
        var qty = editItemQty(it);
        var name = String(it.nombre || it.name || 'Ítem').trim();
        var parts = [];
        if (it.variedad) parts.push(String(it.variedad).trim());
        if (it.acl) parts.push(String(it.acl).trim());
        var extra = parts.length ? ' (' + parts.join(' · ') + ')' : '';
        return qty + '× ' + name + extra;
      })
      .join('\n');
  }

  function formatOrderClientCell(o, panelEstado) {
    var tip = formatOrderItemsTooltip(o);
    var tipAttr = tip ? ' title="' + escapeAttr(tip) + '"' : '';
    var html =
      '<span class="order-name orders-client-name"' +
      tipAttr +
      '>' +
      escapeHtml(o.cliente || '') +
      '</span>';
    if (panelEstado === 'pendiente' && o.orn && newPendingOrns.has(o.orn)) {
      html += ' <span class="badge-nuevo">Nuevo</span>';
    }
    return html;
  }

  function updateOrdersTableHead(panelEstado) {}

  function formatOrderAddressCell(o) {
    var dir = String(o.direccion || '').trim();
    var sub = [o.piso, o.localidad]
      .filter(function (x) {
        return String(x || '').trim();
      })
      .join(' · ');
    if (!dir && !sub) return '<span class="orders-addr-muted">—</span>';
    var html = dir ? '<div class="orders-addr">' + escapeHtml(dir) + '</div>' : '';
    if (sub) html += '<div class="orders-addr-sub">' + escapeHtml(sub) + '</div>';
    return html;
  }

  function repartoCheckboxCellHtml(o, tr) {
    var hasDir = String(o.direccion || '').trim().length > 0;
    if (!hasDir) return '<td class="td-reparto-chk"></td>';
    var on =
      window.BravaReparto &&
      typeof window.BravaReparto.isOrnSelected === 'function' &&
      window.BravaReparto.isOrnSelected(o.orn);
    if (on) tr.className = (tr.className ? tr.className + ' ' : '') + 'row-reparto-on';
    return (
      '<td class="td-reparto-chk"><input type="checkbox" class="reparto-order-cb" data-orn="' +
      escapeHtml(o.orn) +
      '"' +
      (on ? ' checked' : '') +
      ' title="Incluir en ruta (Reparto)"></td>'
    );
  }

  function appendEmptyRow(parent, panelEstado) {

    var hints = {

      pendiente:

        'No hay pedidos pendientes. Los nuevos aparecen acá con aviso de sonido (si está activado).',

      aceptado: 'No hay pedidos aceptados. Aceptá uno desde <strong>Pendientes</strong>.',

      en_preparacion: 'No hay pedidos en preparación. Usá <strong>Preparar</strong> desde <strong>Aceptados</strong>.',

      en_camino: 'No hay pedidos en camino. Marcá <strong>En camino</strong> desde <strong>En preparación</strong>.',

      rechazado: 'No hay pedidos rechazados.',

      entregada: 'No hay pedidos entregados.',

      cancelada: 'No hay pedidos cancelados.',

    };

    var empty = document.createElement('div');

    empty.className = 'orders-empty-msg';

    empty.innerHTML = hints[panelEstado] || 'No hay pedidos en esta pestaña.';

    parent.appendChild(empty);

  }



  function orderStripeClass(panelEstado) {

    if (panelEstado === 'aceptado') return 'st-aceptado';

    if (panelEstado === 'en_preparacion') return 'st-prep';

    if (panelEstado === 'en_camino') return 'st-camino';

    if (panelEstado === 'pendiente') return '';

    return 'st-muted';

  }



  function repartoCheckboxMetaHtml(o, card) {

    var hasDir = String(o.direccion || '').trim().length > 0;

    if (!hasDir) return '';

    var on =

      window.BravaReparto &&

      typeof window.BravaReparto.isOrnSelected === 'function' &&

      window.BravaReparto.isOrnSelected(o.orn);

    if (on) card.className += (card.className ? ' ' : '') + 'row-reparto-on';

    return (

      '<span class="order-ruta-chk"><label class="order-chk-label"><input type="checkbox" class="reparto-order-cb" data-orn="' +

      escapeHtml(o.orn) +

      '"' +

      (on ? ' checked' : '') +

      '> Ruta</label></span>'

    );

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

      var card = document.createElement('article');

      card.className = 'order-card';

      if (o.orn) card.setAttribute('data-orn', o.orn);

      if (panelEstado === 'pendiente' && o.orn && newPendingOrns.has(o.orn)) {

        card.className += ' row-pendiente-nuevo';

      }

      var stripe = document.createElement('div');

      stripe.className = 'order-stripe ' + orderStripeClass(panelEstado);

      card.appendChild(stripe);

      var body = document.createElement('div');

      body.className = 'order-body';

      var head = document.createElement('div');

      head.className = 'order-head';

      head.innerHTML =

        '<span class="order-orn">' +

        orderDisplayOrn(o) +

        '</span>' +

        formatOrderClientCell(o, panelEstado) +

        paymentTagHtml(o.pago) +

        (String(o.modificado || '').toUpperCase() === 'SI' ? ' <span class="badge-mod">editado</span>' : '');

      body.appendChild(head);

      var meta = document.createElement('div');

      meta.className = 'order-meta';

      var rel = formatOrderRelativeTime(o.fecha_creado);

      var addrInline = formatOrderAddressInline(o);

      var rutaChk = panelEstado === 'en_preparacion' ? repartoCheckboxMetaHtml(o, card) : '';

      var addrBlock = '';

      if (addrInline || rutaChk) {

        addrBlock =

          '<span class="order-meta-addr">' +

          (addrInline ? '<i class="fas fa-location-dot" aria-hidden="true"></i> ' + addrInline : '') +

          rutaChk +

          '</span>';

      }

      meta.innerHTML =

        (rel ? '<span><i class="fas fa-clock" aria-hidden="true"></i> ' + escapeHtml(rel) + '</span>' : '') +

        (o.telefono ? '<span class="wa-open" role="button" tabindex="0" data-wa-tel="' + escapeAttr(telWa(o.telefono)) + '"><i class="fab fa-whatsapp" aria-hidden="true"></i> ' + escapeHtml(o.telefono) + '</span>' : '') +

        addrBlock;

      body.appendChild(meta);

      card.appendChild(body);

      var side = document.createElement('div');

      side.className = 'order-side';

      var total = document.createElement('div');

      total.className = 'order-total';

      total.textContent = '$' + fmt(o.total);

      side.appendChild(total);

      var actions = document.createElement('div');

      actions.className = 'order-actions actions';

      var cajaOk = isCajaTurnoActivo();

      if (panelEstado === 'pendiente') {

        addActionBtn(
          actions,
          'Aceptar',
          'btn-sm btn-accent',
          'accept',
          o.orn,
          cajaOk ? 'Aceptar pedido' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

        addActionBtn(actions, 'Rechazar', 'btn-sm btn-x', 'reject', o.orn, 'Rechazar pedido');

      }

      if (panelEstado === 'aceptado') {

        addActionBtn(
          actions,
          'Preparar',
          'btn-sm btn-accent',
          'prep',
          o.orn,
          cajaOk ? 'Pasar a preparación en cocina' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

        addActionBtn(actions, 'Cancelar', 'btn-sm btn-x', 'cancel', o.orn, 'Cancelar pedido');

      }

      if (panelEstado === 'en_preparacion') {

        addActionBtn(actions, 'Editar', 'btn-sm btn-edit', 'edit', o.orn, 'Editar comanda');

        addActionBtn(
          actions,
          'En camino',
          'btn-sm btn-accent',
          'dispatch',
          o.orn,
          cajaOk ? 'Marcar en camino (sale a reparto)' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

        addActionBtn(actions, 'Cancelar', 'btn-sm btn-x', 'cancel', o.orn, 'Cancelar pedido');

      }

      if (panelEstado === 'en_camino') {

        addActionBtn(
          actions,
          'Entregar',
          'btn-sm btn-ok',
          'deliver',
          o.orn,
          cajaOk ? 'Marcar entregado' : mensajeBloqueoOperarPedidos(),
          !cajaOk
        );

        addActionBtn(actions, 'Cancelar', 'btn-sm btn-x', 'cancel', o.orn, 'Cancelar pedido');

      }

      side.appendChild(actions);

      card.appendChild(side);

      frag.appendChild(card);

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

    updateOrdersTableHead(currentEstado);

    var list = $('orders-list');

    if (!list) return;

    list.replaceChildren();

    var frag = panelFrags[currentEstado];

    if (frag) list.appendChild(frag.cloneNode(true));

    else appendEmptyRow(list, currentEstado);

    syncWaPanelOrders();

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



  function seedPendingBaseline() {

    ordersForEstado(allOrdersCache, 'pendiente').forEach(function (o) {

          if (o.orn) knownOrns.add(o.orn);

    });

    hasSeededPendingBaseline = true;

  }



  function dismissPendingAlert(orn) {

    if (!orn) return;

    newPendingOrns.delete(orn);

    knownOrns.add(orn);

  }



  function applyCacheFromServer(orders) {

    var prevPendientes = new Set();

    allOrdersCache.forEach(function (o) {

      if (normalizeEstado(o.estado) === 'pendiente' && o.orn) prevPendientes.add(o.orn);

    });

    allOrdersCache = orders || [];

    normalizeOrdersInCache(allOrdersCache);

    var alertAdded = false;

    if (!hasSeededPendingBaseline) {

      seedPendingBaseline();

    } else {

      allOrdersCache.forEach(function (o) {

        if (normalizeEstado(o.estado) === 'pendiente' && o.orn && !prevPendientes.has(o.orn)) {

          newPendingOrns.add(o.orn);

          alertAdded = true;

        }

      });

      if (alertAdded) playDing();

    }

    var sig = buildCacheSignature(allOrdersCache);

    if (sig !== cacheSignature || alertAdded) {

      cacheSignature = sig;

      rebuildAllPanelFrags();

      paintCurrentTab();

    }

    updateCajaUI();

    updatePollStatusLabel();

    if (window.BravaReparto && typeof window.BravaReparto.onOrdersUpdated === 'function') {
      window.BravaReparto.onOrdersUpdated(allOrdersCache);
    }

  }



  function updatePollStatusLabel() {

    var el = $('poll-status');

    if (!el) return;

    if (realtimeLive) el.textContent = 'En vivo';

    else el.textContent = 'Sync automático';

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

    if (pollTick % gastosPollEvery === 0) {
      loadGastos();
      loadIngresos();
    }

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

    fetchOrdersFromServer().then(function (ok) {

      if (!ok) return;

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

        var prevEst = normalizeEstado(allOrdersCache[i].estado);

        Object.keys(patch).forEach(function (k) {

          allOrdersCache[i][k] = patch[k];

        });

        if (patch.orn && patch.orn !== orn) {

          if (newPendingOrns.has(orn)) {

            newPendingOrns.delete(orn);

            newPendingOrns.add(patch.orn);

          }

          dismissPendingAlert(orn);

        }

        var est = patch.estado ? normalizeEstado(patch.estado) : prevEst;

        var now = new Date().toISOString();

        if (est === 'entregada' && !allOrdersCache[i].entregado_at) allOrdersCache[i].entregado_at = now;

        if (est === 'aceptado' && !allOrdersCache[i].aceptado_at) allOrdersCache[i].aceptado_at = now;

        if (est === 'en_preparacion' && !allOrdersCache[i].en_preparacion_at) allOrdersCache[i].en_preparacion_at = now;

        if (est === 'en_camino' && !allOrdersCache[i].en_camino_at) allOrdersCache[i].en_camino_at = now;

        if (est === 'cancelada' && !allOrdersCache[i].cancelado_at) allOrdersCache[i].cancelado_at = now;

        if (est === 'rechazado' && !allOrdersCache[i].rechazado_at) allOrdersCache[i].rechazado_at = now;

        if (est === 'en_preparacion' && prevEst !== 'en_preparacion') {
          deductStockForPreparationOrder(allOrdersCache[i]);
        }

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



  function editItemBasePrecio(it) {

    var p = parseFloat(it.precio);

    return isNaN(p) ? 0 : p;

  }



  function editItemLineUnit(it) {

    var ad = parseFloat(it.adicionales);

    if (isNaN(ad) || ad < 0) ad = 0;

    return editItemBasePrecio(it) + ad;

  }



  function editItemIsManual(it) {

    return it && it.addedInEdit === true;

  }



  function escapeEditHtml(s) {

    return String(s || '')

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;');

  }



  function syncEditManualAcls() {

    var box = $('edit-items');

    if (!box) return;

    editItems.forEach(function (it, idx) {

      if (!editItemIsManual(it)) return;

      var ta = box.querySelector('[data-edit-acl][data-idx="' + idx + '"]');

      if (ta) it.acl = ta.value.trim();

    });

  }



  function applyEditItemAcl(idx) {

    var it = editItems[idx];

    if (!it || !editItemIsManual(it)) return;

    syncEditManualAcls();

  }



  function editItemPrecio(it) {

    return editItemLineUnit(it);

  }



  function normalizeItemsForSave(items) {

    return (items || []).map(function (it) {

      return {

        nombre: it.nombre || it.name || 'Ítem',

        variedad: it.variedad || '',

        categoria: it.categoria || '',

        subcategoria: it.subcategoria || '',

        acl: (it.acl || it.aclaraciones || '').trim(),

        qty: editItemQty(it),

        precio: editItemBasePrecio(it),

        adicionales: (function () {

          var ad = parseFloat(it.adicionales);

          return isNaN(ad) || ad < 0 ? 0 : ad;

        })(),

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



  function editSheetCsvUrl(sheetName) {

    return (

      'https://docs.google.com/spreadsheets/d/' +

      EDIT_MENU_SHEET_ID +

      '/gviz/tq?tqx=out:csv&sheet=' +

      encodeURIComponent(sheetName)

    );

  }



  function editConfigGet(cfg, key) {

    if (!cfg) return '';

    if (cfg[key] !== undefined) return cfg[key];

    var lower = key.toLowerCase();

    var k;

    for (k in cfg) {

      if (Object.prototype.hasOwnProperty.call(cfg, k) && k.toLowerCase() === lower) return cfg[k];

    }

    return '';

  }



  function buildEditConfigMap(rows) {

    var cfg = {};

    (rows || []).forEach(function (r) {

      var k = editRowVal(r, ['Nombre', 'nombre', 'llave', 'key']);

      var v = editRowVal(r, ['Valor', 'valor', 'value']);

      if (k) cfg[k] = v;

    });

    return cfg;

  }



  function editParsePrice(raw) {

    if (raw == null || raw === '') return 0;

    var s = String(raw).replace(/[^\d.,-]/g, '').replace(',', '.');

    var n = parseFloat(s);

    return isNaN(n) ? 0 : n;

  }



  function buildEditDeliveryZones(cfg) {

    var zones = [];

    var i;

    for (i = 1; i <= 10; i++) {

      var nombre =

        editConfigGet(cfg, 'Zona ' + i + ' - Nombre') || editConfigGet(cfg, 'Zona ' + i + '- Nombre');

      if (!nombre || !String(nombre).trim()) continue;

      var costoRaw =

        editConfigGet(cfg, 'Zona ' + i + ' - Costo de envío') ||

        editConfigGet(cfg, 'Zona ' + i + '- Costo de envío') ||

        editConfigGet(cfg, 'Zona ' + i + ' - Costo de envio');

      zones.push({ nombre: String(nombre).trim(), costo: editParsePrice(costoRaw) });

    }

    return zones;

  }



  function editEnvioForZonaName(nombre) {

    var name = String(nombre || '').trim();

    if (!name) return 0;

    var i;

    for (i = 0; i < (editDeliveryZones || []).length; i++) {

      if (editDeliveryZones[i].nombre === name) return editDeliveryZones[i].costo;

    }

    return null;

  }



  function fillEditZonaSelect(currentZona) {

    var sel = $('edit-zona');

    if (!sel) return;

    var cur = String(currentZona || '').trim();

    var html = '<option value="">— Sin zona —</option>';

    (editDeliveryZones || []).forEach(function (z) {

      html +=

        '<option value="' +

        escapeHtml(z.nombre) +

        '">' +

        escapeHtml(z.nombre) +

        ' ($' +

        fmt(z.costo) +

        ')</option>';

    });

    if (cur && !editEnvioForZonaName(cur) && cur !== '') {

      html +=

        '<option value="' + escapeHtml(cur) + '">' + escapeHtml(cur) + ' (actual)</option>';

    }

    sel.innerHTML = html;

    sel.value = cur;

  }



  function setEditDeliveryForm(o) {

    if ($('edit-direccion')) $('edit-direccion').value = o.direccion || '';

    if ($('edit-localidad')) $('edit-localidad').value = o.localidad || '';

    if ($('edit-piso')) $('edit-piso').value = o.piso || '';

    fillEditZonaSelect(o.zona || '');

  }



  function readEditDeliveryPatch(baseOrder) {

    var patch = {};

    if ($('edit-direccion')) patch.direccion = ($('edit-direccion').value || '').trim();

    if ($('edit-localidad')) patch.localidad = ($('edit-localidad').value || '').trim();

    if ($('edit-piso')) patch.piso = ($('edit-piso').value || '').trim();

    if ($('edit-zona')) patch.zona = ($('edit-zona').value || '').trim();

    var envFromZona = editEnvioForZonaName(patch.zona);

    if (envFromZona != null) patch.envio = envFromZona;

    else if (baseOrder) patch.envio = Number(baseOrder.envio) || 0;

    var b = baseOrder || {};

    if (

      patch.direccion !== (b.direccion || '').trim() ||

      patch.localidad !== (b.localidad || '').trim() ||

      patch.piso !== (b.piso || '').trim() ||

      patch.zona !== (b.zona || '').trim() ||

      Number(patch.envio) !== (Number(b.envio) || 0)

    ) {

      patch.deliveryChanged = true;

    }

    return patch;

  }



  function onEditZonaChange() {

    var z = $('edit-zona') ? $('edit-zona').value : '';

    var cost = editEnvioForZonaName(z);

    if (cost != null) editEnvio = cost;

    renderEditModalItems();

  }



  function editRowVal(row, keys) {

    if (!row) return '';

    var rowKeys = Object.keys(row);

    var i;

    var j;

    for (i = 0; i < keys.length; i++) {

      var want = keys[i].toLowerCase().trim();

      for (j = 0; j < rowKeys.length; j++) {

        if (rowKeys[j].toLowerCase().trim() !== want) continue;

        var v = row[rowKeys[j]];

        if (v != null && String(v).trim() !== '') return String(v).trim();

      }

    }

    return '';

  }



  function editParsePrecio(raw) {

    return parseInt(String(raw || '0').replace(/[^0-9]/g, ''), 10) || 0;

  }



  function buildEditProductGroups(rows) {

    var map = {};

    var order = [];

    (rows || []).forEach(function (row) {

      var nombre = editRowVal(row, ['nombre']);

      if (!nombre) return;

      var oculto = editRowVal(row, ['ocultar']).toLowerCase();

      if (oculto === 'si' || oculto === 'sí') return;

      var precio = editParsePrecio(row.precio || row.Precio);

      if (precio <= 0) return;

      var variedad = editRowVal(row, ['variedades', 'variedad']) || 'Sin Extra';

      var key = nombre.toLowerCase();

      if (!map[key]) {

        order.push(key);

        map[key] = {

          key: key,

          nombre: nombre,

          categoria: editRowVal(row, ['categoria']),

          subcategoria: editRowVal(row, ['subcategoria']),

          extrasGrupo: '',

          rows: [],

        };

      }

      var g = map[key];

      var eg = editRowVal(row, ['grupo extras', 'grupo_extras', 'extras_grupo']);

      if (eg && !g.extrasGrupo) g.extrasGrupo = eg;

      g.rows.push({ variedad: variedad, precio: precio });

    });

    return order

      .map(function (k) {

        var g = map[k];

        var base = null;

        g.rows.forEach(function (r) {

          if (/^sin\s*extra/i.test(r.variedad)) base = r.precio;

        });

        if (base == null) {

          g.rows.forEach(function (r) {

            if (base == null || r.precio < base) base = r.precio;

          });

        }

        g.basePrecio = base || 0;

        return g;

      })

      .sort(function (a, b) {

        return a.nombre.localeCompare(b.nombre, 'es');

      });

  }



  function editSplitExtraGrupos(raw) {

    var s = String(raw || '')

      .toLowerCase()

      .trim();

    if (!s || s === 'all' || s === 'todos') return ['all'];

    return s.split(/[,;|/]+/).map(function (x) {

      return x.trim();

    });

  }



  function buildEditExtrasCatalog(rows) {

    var out = [];

    (rows || []).forEach(function (row) {

      var nombre = editRowVal(row, ['nombre', 'extra', 'titulo']);

      if (!nombre) return;

      var oculto = editRowVal(row, ['ocultar']).toLowerCase();

      if (oculto === 'si' || oculto === 'sí') return;

      var precio = editParsePrecio(row.precio || row.Precio);

      out.push({

        nombre: nombre,

        precio: precio,

        grupos: editSplitExtraGrupos(editRowVal(row, ['grupo', 'grupos', 'aplica'])),

      });

    });

    return out.sort(function (a, b) {

      return a.nombre.localeCompare(b.nombre, 'es');

    });

  }



  function findEditProductGroup(nombre) {

    if (!editProductGroups || !nombre) return null;

    var key = String(nombre).trim().toLowerCase();

    for (var i = 0; i < editProductGroups.length; i++) {

      if (editProductGroups[i].key === key) return editProductGroups[i];

    }

    return null;

  }



  function extrasForEditItem(it) {

    if (!editExtrasCatalog || !editExtrasCatalog.length) return [];

    var g = findEditProductGroup(it && it.nombre);

    var need = g && g.extrasGrupo ? g.extrasGrupo.toLowerCase() : '';

    return editExtrasCatalog.filter(function (ex) {

      if (!ex.grupos || !ex.grupos.length || ex.grupos.indexOf('all') >= 0) return true;

      if (!need) return true;

      return ex.grupos.indexOf(need) >= 0;

    });

  }



  function parseExtrasFromVariedad(variedad) {

    var v = String(variedad || '').trim();

    if (!v || /^sin\s*extra/i.test(v)) return [];

    return v

      .split(/\s*\+\s*/)

      .map(function (s) {

        return s.trim();

      })

      .filter(Boolean);

  }



  function editItemExtrasKey(it) {

    return (

      String(it.nombre || '') +

      '\x1e' +

      String(it.variedad || '') +

      '\x1e' +

      String((it.acl || it.aclaraciones || '').trim()) +

      '\x1e' +

      (editItemIsManual(it) ? 'm' : 'o')

    );

  }



  function applyEditItemExtras(idx) {

    var it = editItems[idx];

    if (!it) return;

    var box = $('edit-items');

    if (!box) return;

    var selected = [];

    box.querySelectorAll('[data-edit-extra][data-idx="' + idx + '"]:checked').forEach(function (cb) {

      selected.push(cb.getAttribute('data-extra-name') || '');

    });

    selected = selected.filter(Boolean);

    var sum = 0;

    selected.forEach(function (name) {

      var ex = (editExtrasCatalog || []).find(function (e) {

        return e.nombre === name;

      });

      if (ex) sum += ex.precio;

    });

    it.adicionales = sum;

    it.variedad = selected.length ? selected.join(' + ') : 'Sin extra';

  }



  function loadEditMenu(done) {

    if (editProductGroups && editExtrasCatalog && editDeliveryZones !== null) {

      done(editProductGroups);

      return;

    }

    if (typeof Papa === 'undefined') {

      editProductGroups = [];

      editExtrasCatalog = [];

      editDeliveryZones = [];

      done([]);

      return;

    }

    if (editMenuLoadPromise) {

      editMenuLoadPromise.then(function () {

        done(editProductGroups || []);

      });

      return;

    }

    editMenuLoadPromise = Promise.all([

      fetch(editSheetCsvUrl('productos')).then(function (r) {

        return r.text();

      }),

      fetch(editSheetCsvUrl('extras')).then(function (r) {

        return r.text();

      }),

      fetch(editSheetCsvUrl('configuracion')).then(function (r) {

        return r.text();

      }),

    ])

      .then(function (pair) {

        var prod = Papa.parse(pair[0], { header: true, skipEmptyLines: true });

        var ext = Papa.parse(pair[1], { header: true, skipEmptyLines: true });

        var cfgRows = Papa.parse(pair[2], { header: true, skipEmptyLines: true });

        editProductGroups = buildEditProductGroups(prod.data || []);

        editExtrasCatalog = buildEditExtrasCatalog(ext.data || []);

        editDeliveryZones = buildEditDeliveryZones(buildEditConfigMap(cfgRows.data || []));

        editCatalog = editProductGroups;

      })

      .catch(function () {

        editProductGroups = [];

        editExtrasCatalog = [];

        editDeliveryZones = [];

        editCatalog = [];

      })

      .finally(function () {

        editMenuLoadPromise = null;

      });

    editMenuLoadPromise.then(function () {

      done(editProductGroups || []);

    });

  }



  function fillEditAddSelect(groups) {

    var sel = $('edit-add-select');

    if (!sel) return;

    if (!groups.length) {

      sel.innerHTML = '<option value="">(Menú no cargado — igual podés +/- ítems)</option>';

      return;

    }

    sel.innerHTML = groups

      .map(function (g) {

        var label = g.nombre + ' — ' + fmt(g.basePrecio);

        return '<option value="' + g.key + '">' + label + '</option>';

      })

      .join('');

  }



  function renderEditExtrasHtml(idx, it) {

    var list = extrasForEditItem(it);

    if (!list.length) return '';

    var picked = parseExtrasFromVariedad(it.variedad);

    var summary = picked.length

      ? picked.join(', ')

      : 'Sin extras';

    var inner = '';

    list.forEach(function (ex) {

      var checked = picked.indexOf(ex.nombre) >= 0 ? ' checked' : '';

      inner +=

        '<label><input type="checkbox" data-edit-extra data-idx="' +

        idx +

        '" data-extra-name="' +

        escapeEditHtml(ex.nombre) +

        '"' +

        checked +

        '> ' +

        escapeEditHtml(ex.nombre) +

        (ex.precio > 0 ? ' (+' + fmt(ex.precio) + ')' : '') +

        '</label>';

    });

    return (

      '<details class="edit-extras-fold">' +

      '<summary>Extras <span class="edit-extras-summary">· ' +

      escapeEditHtml(summary) +

      '</span></summary>' +

      '<div class="edit-extras">' +

      inner +

      '</div></details>'

    );

  }



  function renderEditAclHtml(idx, it) {

    var acl = (it.acl || it.aclaraciones || '').trim();

    if (editItemIsManual(it)) {

      return (

        '<div class="edit-acl">' +

        '<label class="edit-acl-label" for="edit-acl-' +

        idx +

        '">Aclaración (cocina)</label>' +

        '<textarea id="edit-acl-' +

        idx +

        '" class="edit-acl-input" data-edit-acl data-idx="' +

        idx +

        '" rows="2" placeholder="Ej: Bien cocida, sin cebolla crispy…">' +

        escapeEditHtml(acl) +

        '</textarea></div>'

      );

    }

    if (acl) return '<small class="edit-acl-readonly">Acl.: ' + escapeEditHtml(acl) + '</small>';

    return '';

  }



  function renderEditModalItems() {

    syncEditManualAcls();

    var box = $('edit-items');

    if (!box) return;

    var html = '';

    editItems.forEach(function (it, idx) {

      html +=

        '<div class="modal-item modal-item-stack">' +

        '<div class="modal-item-top">' +

        '<div><strong>' +

        (it.nombre || 'Ítem') +

        '</strong>' +

        (!editItemIsManual(it) ? renderEditAclHtml(idx, it) : '') +

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

        fmt(editItemQty(it) * editItemLineUnit(it)) +

        '</span></div>' +

        (editItemIsManual(it) ? renderEditAclHtml(idx, it) : '') +

        renderEditExtrasHtml(idx, it) +

        '</div>';

    });

    html +=

      '<div class="modal-item modal-item-muted"><div>Envío</div><div></div><span>' +

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

    if (normalizeEstado(o.estado) !== 'en_preparacion') {

      alert('Solo podés editar pedidos en En preparación.');

      return;

    }

    editOrn = orn;

    editItems = normalizeItemsForSave(parseOrderItems(o));

    editItems.forEach(function (it) {

      it.addedInEdit = false;

    });

    editEnvio = Number(o.envio) || 0;

    $('edit-sub').textContent =

      o.orn +

      ' · ' +

      (o.cliente || '') +

      ' — Si pidieron más por WhatsApp, ajustá acá (mismo ORN).';

    loadEditMenu(function (groups) {

      editItems.forEach(function (it) {

        if (it.adicionales == null || isNaN(parseFloat(it.adicionales))) {

          var names = parseExtrasFromVariedad(it.variedad);

          var sum = 0;

          names.forEach(function (n) {

            var ex = (editExtrasCatalog || []).find(function (e) {

              return e.nombre === n;

            });

            if (ex) sum += ex.precio;

          });

          it.adicionales = sum;

        }

      });

      fillEditAddSelect(groups);

      setEditDeliveryForm(o);

      var envZ = editEnvioForZonaName(o.zona);

      if (envZ != null) editEnvio = envZ;

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

    if (!sel || !editProductGroups || !editProductGroups.length) return;

    var g = editProductGroups.find(function (x) {

      return x.key === sel.value;

    });

    if (!g) return;

    var newLine = {

      nombre: g.nombre,

      categoria: g.categoria,

      subcategoria: g.subcategoria,

      variedad: 'Sin extra',

      acl: '',

      qty: 1,

      precio: g.basePrecio,

      adicionales: 0,

      addedInEdit: true,

    };

    var key = editItemExtrasKey(newLine);

    var found = editItems.find(function (it) {

      return editItemExtrasKey(it) === key;

    });

    if (found) found.qty = editItemQty(found) + 1;

    else editItems.push(newLine);

    renderEditModalItems();

  }



  function saveEditModal() {

    syncEditManualAcls();

    if (!editOrn || !editItems.length) {

      alert('Agregá al menos un ítem.');

      return;

    }

    var totals = recalcEditTotals();

    var items = normalizeItemsForSave(editItems);

    var now = new Date().toISOString();

    var baseOrder = findOrderByOrn(editOrn);

    var deliveryPatch = readEditDeliveryPatch(baseOrder);

    editEnvio = deliveryPatch.envio != null ? deliveryPatch.envio : editEnvio;

    totals = recalcEditTotals();

    var patch = {

      items: items,

      subtotal: totals.subtotal,

      total: totals.subtotal + (Number(editEnvio) || 0),

      modificado: 'SI',

      modificado_at: now,

      items_json: JSON.stringify(items),

      direccion: deliveryPatch.direccion,

      localidad: deliveryPatch.localidad,

      piso: deliveryPatch.piso,

      zona: deliveryPatch.zona,

      envio: Number(editEnvio) || 0,

    };

    sendOrderUpdate(editOrn, patch);

    closeEditModal();

  }



  function sendOrderUpdate(orn, patch) {

    if (patch.estado && normalizeEstado(patch.estado) !== 'pendiente') dismissPendingAlert(orn);

    patchOrderInCache(orn, patch);

    var body = { action: 'updateOrder', token: token, orn: orn };

    if (patch.estado) body.estado = patch.estado;

    if (patch.rechazo_mensaje != null) body.rechazoMensaje = patch.rechazo_mensaje;

    if (patch.items) body.items = patch.items;

    if (patch.subtotal != null) body.subtotal = patch.subtotal;

    if (patch.total != null) body.total = patch.total;

    if (patch.direccion != null) body.direccion = patch.direccion;

    if (patch.localidad != null) body.localidad = patch.localidad;

    if (patch.piso != null) body.piso = patch.piso;

    if (patch.zona != null) body.zona = patch.zona;

    if (patch.envio != null) body.envio = patch.envio;

    if (patch.modificado != null) body.modificado = patch.modificado;

    if (patch.modificado_at != null) body.modificadoAt = patch.modificado_at;

    return api(body).then(function (res) {

      if (res.data.ok) {
        var serverOrn = res.data.orn || orn;
        if (serverOrn !== orn) {
          patchOrderInCache(orn, { orn: serverOrn });
        }
        if (patch.estado) maybeWaAutoNotify(serverOrn, patch.estado);
        updateCajaUI();
        return { ok: true, orn: serverOrn };
      }

      if (res.status === 401 || res.data.error === 'unauthorized') handleAuthFailure();

      else {

        $('app-err').textContent = listErrorMessage(res.data.error);

        $('app-err').hidden = false;

        fetchOrdersFromServer(true);

      }

      return { ok: false, orn: orn, error: res.data.error };

    });

  }

  function batchSendEnCamino(orns, done) {

    if (!orns || !orns.length) {
      if (done) done({ ok: 0, fail: 0 });
      return;
    }

    if (!isCajaTurnoActivo()) {
      alert(mensajeBloqueoOperarPedidos());
      if (done) done(null);
      return;
    }

    var queue = orns.slice();
    var ok = 0;
    var fail = 0;

    function step() {
      if (!queue.length) {
        fetchOrdersFromServer(true);
        if (done) done({ ok: ok, fail: fail });
        return;
      }
      var orn = queue.shift();
      sendOrderUpdate(orn, { estado: 'en_camino' }).then(function (r) {
        if (r && r.ok) ok++;
        else fail++;
        step();
      });
    }

    step();

  }

  window.BravaAdminBatchEnCamino = batchSendEnCamino;



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

    var lines = [
      'Hola ' + first + ', somos Brava Burgers.',
      '',
      'Lamentamos informarte que no podemos tomar tu pedido.',
    ];

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

    $('rechazo-sub').textContent = orderDisplayOrn(o) + ' · ' + (o.cliente || '') + ' · ' + (o.telefono || '');

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

    if (!confirm('¿Confirmar rechazo de ' + (orderDisplayOrn(o) !== '—' ? orderDisplayOrn(o) : (o.cliente || o.orn)) + '?')) return;

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

        newPendingOrns = new Set();

        hasSeededPendingBaseline = false;

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

    var comandaVer = window.BravaComanda.COMANDA_VER || 0;
    if (!window.BravaComanda.printOrderTicket || comandaVer < 12) {

      alert('Versión vieja de comanda.js. Recargá el admin con Ctrl+Shift+R.');

      return;

    }

    window.BravaComanda.storeOrderForPrint(o);

    $('comanda-ticket-inner').innerHTML = window.BravaComanda.renderTicketHtml(o);
    if ($('comanda-modal-title')) {
      $('comanda-modal-title').textContent = 'Comanda ' + o.orn;
    }

    $('comanda-modal').classList.remove('hidden');

  }



  function closeComandaModal() {

    $('comanda-modal').classList.add('hidden');

    document.documentElement.classList.remove('printing-comanda');
    document.body.classList.remove('printing-comanda');

  }

  var COMANDA_AUTO_PRINT_KEY = 'brava_comanda_auto_print';

  function isComandaAutoPrintOn() {
    try {
      return localStorage.getItem(COMANDA_AUTO_PRINT_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }

  function setComandaAutoPrintOn(on) {
    try {
      localStorage.setItem(COMANDA_AUTO_PRINT_KEY, on ? '1' : '0');
    } catch (e2) {}
    var cb = $('comanda-auto-print');
    if (cb) cb.checked = !!on;
  }

  function syncComandaAutoPrintCheckbox() {
    var cb = $('comanda-auto-print');
    if (cb) cb.checked = isComandaAutoPrintOn();
  }

  function printComandaForOrder(order) {
    if (!order || !window.BravaComanda) return false;
    if (window.BravaComanda.storeOrderForPrint) window.BravaComanda.storeOrderForPrint(order);
    if (window.BravaComanda.printOrderTicket && window.BravaComanda.printOrderTicket(order)) return true;
    return false;
  }

  function autoPrintComandaOnAccept(orn) {
    if (!isComandaAutoPrintOn()) return;
    var comandaVer = window.BravaComanda && window.BravaComanda.COMANDA_VER ? window.BravaComanda.COMANDA_VER : 0;
    if (!window.BravaComanda || !window.BravaComanda.printOrderTicket || comandaVer < 12) return;
    var o = findOrderByOrn(orn);
    if (!o) return;
    printComandaForOrder(o);
  }



  function printComandaModal() {
    var order =
      window.BravaComanda && window.BravaComanda.readStoredOrder
        ? window.BravaComanda.readStoredOrder()
        : null;
    if (window.BravaComanda && order && window.BravaComanda.printOrderTicket) {
      if (window.BravaComanda.printOrderTicket(order)) return;
    }
    var ticket = $('comanda-ticket-inner');
    if (window.BravaComanda && window.BravaComanda.printTicketElement && ticket) {
      if (window.BravaComanda.printTicketElement(ticket)) return;
    }

    document.documentElement.classList.add('printing-comanda');
    document.body.classList.add('printing-comanda');
    var done = function () {
      document.documentElement.classList.remove('printing-comanda');
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



  function onOrdersListChange(e) {
    var cb = e.target;
    if (!cb || !cb.classList) return;
    if (cb.classList.contains('reparto-order-cb')) {
      var orn = cb.getAttribute('data-orn');
      if (!orn || !window.BravaReparto || typeof window.BravaReparto.setOrderSelected !== 'function') return;
      window.BravaReparto.setOrderSelected(orn, cb.checked);
    }
  }

  function onOrdersListClick(e) {
    var waLink = e.target.closest('.wa-open');
    if (waLink) {
      e.preventDefault();
      var tel = waLink.getAttribute('data-wa-tel');
      if (tel && window.BravaWaPanel && typeof BravaWaPanel.openChat === 'function') {
        BravaWaPanel.openChat(tel, { manual: true });
      }
      return;
    }
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'edit') {
      var ornEdit = btn.dataset.orn;
      if (ornEdit) openEditModal(ornEdit);
      return;
    }
    if (action === 'comanda') {
      var ornCom = btn.dataset.orn;
      if (ornCom) openComanda(ornCom);
      return;
    }
    var orn = btn.dataset.orn;
    if (!orn) return;
    if (action === 'accept') {
      if (!isCajaTurnoActivo()) {
        alert(mensajeBloqueoOperarPedidos());
        return;
      }
      sendOrderUpdate(orn, { estado: 'aceptado' }).then(function (r) {
        if (r && r.ok) autoPrintComandaOnAccept(r.orn || orn);
      });
    }
    if (action === 'reject') openRechazoModal(orn);
    if (action === 'prep') {
      if (!isCajaTurnoActivo()) {
        alert(mensajeBloqueoOperarPedidos());
        return;
      }
      sendOrderUpdate(orn, { estado: 'en_preparacion' });
    }
    if (action === 'dispatch') {
      if (!isCajaTurnoActivo()) {
        alert(mensajeBloqueoOperarPedidos());
        return;
      }
      sendOrderUpdate(orn, { estado: 'en_camino' });
    }
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
  }

  var ordersListEl = $('orders-list');

  if (ordersListEl) {
    ordersListEl.addEventListener('change', onOrdersListChange);
    ordersListEl.addEventListener('click', onOrdersListClick);
  }



  $('login-btn').onclick = doLogin;

  $('login-pass').addEventListener('keydown', function (e) {

    if (e.key === 'Enter') doLogin();

  });

  $('login-user').addEventListener('keydown', function (e) {

    if (e.key === 'Enter') doLogin();

  });



  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function updateThemeToggleButtons() {
    var dark = isDarkTheme();
    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      if (btn.id === 'theme-toggle-nav') {
        btn.innerHTML = dark
          ? '<i class="fas fa-sun" aria-hidden="true"></i>'
          : '<i class="fas fa-moon" aria-hidden="true"></i>';
        btn.title = dark ? 'Modo claro' : 'Modo noche';
        return;
      }
      btn.innerHTML =
        (dark ? '<i class="fas fa-sun" aria-hidden="true"></i> Claro' : '<i class="fas fa-moon" aria-hidden="true"></i> Noche');
    });
  }

  function setAdminTheme(theme) {
    var dark = theme === 'dark';
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('brava_admin_theme', dark ? 'dark' : 'light');
    } catch (e) {}
    updateThemeToggleButtons();
  }

  function toggleAdminTheme() {
    setAdminTheme(isDarkTheme() ? 'light' : 'dark');
  }

  function initAdminShell() {
    var titles = {
      pedidos: 'Pedidos',
      reparto: 'Reparto',
      caja: 'Caja y turno',
      historial: 'Historial',
    };
    document.querySelectorAll('.nav-btn[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-view');
        document.querySelectorAll('.nav-btn[data-view]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        document.querySelectorAll('.admin-view').forEach(function (v) {
          v.hidden = v.id !== 'view-' + view;
        });
        if ($('view-title')) $('view-title').textContent = titles[view] || 'Admin';
        var aside = $('wa-aside');
        var showAside = view === 'pedidos' || view === 'reparto';
        if (aside) aside.hidden = !showAside;
        var appMain = document.querySelector('.app-main');
        if (appMain) {
          appMain.classList.toggle('app-main--full', view === 'caja' || view === 'historial');
        }
        if (view === 'reparto' && window.BravaReparto && typeof window.BravaReparto.onViewShow === 'function') {
          window.BravaReparto.onViewShow();
        }
      });
    });
  }

  initAdminShell();

  if (window.BravaReparto && typeof window.BravaReparto.init === 'function') {
    window.BravaReparto.init();
  }

  updateThemeToggleButtons();
  document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', toggleAdminTheme);
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



  if ($('btn-turno-abrir')) $('btn-turno-abrir').onclick = performAbrirCaja;
  if ($('btn-turno-cerrar')) $('btn-turno-cerrar').onclick = performCierreCaja;

  if ($('comanda-close')) $('comanda-close').onclick = closeComandaModal;

  if ($('comanda-print')) $('comanda-print').onclick = printComandaModal;

  syncComandaAutoPrintCheckbox();
  if ($('comanda-auto-print')) {
    $('comanda-auto-print').addEventListener('change', function () {
      setComandaAutoPrintOn(!!this.checked);
    });
  }

  if ($('comanda-modal')) {

    $('comanda-modal').addEventListener('click', function (e) {

      if (e.target === $('comanda-modal')) closeComandaModal();

    });

  }

  if ($('edit-close')) $('edit-close').onclick = closeEditModal;

  if ($('edit-save')) $('edit-save').onclick = saveEditModal;

  if ($('edit-zona')) $('edit-zona').addEventListener('change', onEditZonaChange);

  if ($('edit-add-btn')) $('edit-add-btn').onclick = addEditCatalogLine;

  if ($('edit-items')) {

    $('edit-items').addEventListener('click', function (e) {

      var b = e.target.closest('[data-edit-qty]');

      if (!b) return;

      changeEditQty(parseInt(b.getAttribute('data-edit-qty'), 10), parseInt(b.getAttribute('data-delta'), 10));

    });

    $('edit-items').addEventListener('change', function (e) {

      var cb = e.target.closest('[data-edit-extra]');

      if (!cb) return;

      applyEditItemExtras(parseInt(cb.getAttribute('data-idx'), 10));

      renderEditModalItems();

    });

    $('edit-items').addEventListener('input', function (e) {

      var ta = e.target.closest('[data-edit-acl]');

      if (!ta) return;

      applyEditItemAcl(parseInt(ta.getAttribute('data-idx'), 10));

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


  if ($('btn-stock-recontar')) {
    $('btn-stock-recontar').onclick = function () {
      if (!isCajaTurnoActivo()) return;
      openStockAperturaModal('recontar');
    };
  }
  if ($('stock-apertura-cancel')) $('stock-apertura-cancel').onclick = closeStockAperturaModal;
  if ($('stock-apertura-ok')) $('stock-apertura-ok').onclick = confirmStockAperturaModal;
  document.querySelectorAll('[data-stock-field]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-stock-field');
      var step = parseInt(btn.getAttribute('data-stock-step'), 10);
      var input = $(id);
      if (!input) return;
      var cur = parseInt(input.value, 10);
      if (isNaN(cur)) cur = 0;
      input.value = String(Math.max(0, cur + step));
    };
  });
  document.querySelectorAll('.stock-mini-btns button[data-stock-delta]').forEach(function (btn) {
    btn.onclick = function () {
      var row = btn.closest('.stock-live-row');
      if (!row) return;
      var key = row.getAttribute('data-stock-key');
      var d = parseInt(btn.getAttribute('data-stock-delta'), 10);
      adjustStockTurnoKey(key, d);
    };
  });

  if ($('btn-cierre-caja')) $('btn-cierre-caja').onclick = performCierreCaja;

  if ($('cierre-arqueo-cancel')) $('cierre-arqueo-cancel').onclick = cancelCierreArqueoModal;
  if ($('cierre-arqueo-ok')) $('cierre-arqueo-ok').onclick = confirmCierreArqueoModal;
  if ($('cierre-arqueo-modal')) {
    $('cierre-arqueo-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-arqueo-modal')) cancelCierreArqueoModal();
    });
  }
  ['arqueo-ef-contado', 'arqueo-mp-contado'].forEach(function (id) {
    var inp = $(id);
    if (inp) {
      inp.addEventListener('input', updateCashArqueoDiffUI);
      inp.addEventListener('change', updateCashArqueoDiffUI);
    }
  });

  if ($('cierre-confirm-cancel')) {
    $('cierre-confirm-cancel').onclick = function () {
      pendingCierreSnapshot = null;
      closeCierreConfirmModal();
    };
  }
  if ($('cierre-confirm-ok')) $('cierre-confirm-ok').onclick = commitCierreCaja;
  if ($('cierre-resumen-close')) $('cierre-resumen-close').onclick = closeCierreResumenModal;
  if ($('cierre-resumen-print')) $('cierre-resumen-print').onclick = printCierreResumenCompleto;

  if ($('btn-open-cierre-historial')) $('btn-open-cierre-historial').onclick = openCierreHistorialModal;
  if ($('cohist-close')) $('cohist-close').onclick = closeCierreHistorialModal;
  if ($('cohist-print')) $('cohist-print').onclick = printCierreHistorialPreview;
  if ($('cohist-load-more')) $('cohist-load-more').onclick = function () { loadCierresHistorial(false); };
  if ($('cohist-aplicar')) $('cohist-aplicar').onclick = function () { loadCierresHistorial(true); };
  if ($('cohist-limpiar')) {
    $('cohist-limpiar').onclick = function () {
      if ($('cohist-buscar')) $('cohist-buscar').value = '';
      if ($('cohist-desde')) $('cohist-desde').value = '';
      if ($('cohist-hasta')) $('cohist-hasta').value = '';
      selectedHistorialCierreId = null;
      renderCierreHistorialPreview(null);
      loadCierresHistorial(true);
    };
  }
  if ($('cohist-buscar')) $('cohist-buscar').addEventListener('input', renderCierreHistorialTable);
  if ($('cohist-desde')) $('cohist-desde').addEventListener('change', function () { loadCierresHistorial(true); });
  if ($('cohist-hasta')) $('cohist-hasta').addEventListener('change', function () { loadCierresHistorial(true); });
  if ($('cierre-historial-modal')) {
    $('cierre-historial-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-historial-modal')) closeCierreHistorialModal();
    });
  }

  if ($('btn-open-proformas')) $('btn-open-proformas').onclick = openProformasModal;
  if ($('btn-pipeline-search')) $('btn-pipeline-search').onclick = openProformasModal;
  if ($('prof-close')) $('prof-close').onclick = closeProformasModal;
  if ($('prof-print')) $('prof-print').onclick = printProformaPreview;
  if ($('prof-load-more')) $('prof-load-more').onclick = function () { fetchProformas(false); };
  if ($('prof-aplicar')) $('prof-aplicar').onclick = function () { fetchProformas(true); };
  if ($('prof-limpiar')) {
    $('prof-limpiar').onclick = function () {
      if ($('prof-buscar')) $('prof-buscar').value = '';
      if ($('prof-desde')) $('prof-desde').value = '';
      if ($('prof-hasta')) $('prof-hasta').value = '';
      selectedProformaOrn = null;
      renderProfComandaPreview(null);
      fetchProformas(true);
    };
  }
  if ($('prof-buscar')) $('prof-buscar').addEventListener('input', scheduleProformasSearch);
  if ($('prof-desde')) $('prof-desde').addEventListener('change', function () { fetchProformas(true); });
  if ($('prof-hasta')) $('prof-hasta').addEventListener('change', function () { fetchProformas(true); });
  if ($('proformas-modal')) {
    $('proformas-modal').addEventListener('click', function (e) {
      if (e.target === $('proformas-modal')) closeProformasModal();
    });
  }

  if ($('btn-add-ingreso')) {
    $('btn-add-ingreso').onclick = function () {
      if (!isCajaTurnoActivo()) {
        alert('Abrí la caja antes de agregar ingresos. Sin apertura la lista queda en 0.');
        return;
      }
      $('i-concepto').value = '';
      $('i-monto').value = '';
      $('i-fecha').value = filterHasta || todayIsoLocal();
      $('i-cobro').value = 'efectivo';
      $('ingreso-modal').classList.remove('hidden');
      $('i-concepto').focus();
    };
  }

  if ($('i-cancel')) {
    $('i-cancel').onclick = function () {
      $('ingreso-modal').classList.add('hidden');
    };
  }

  if ($('i-save')) {
    $('i-save').onclick = function () {
      var concepto = $('i-concepto').value.trim();
      var monto = parseFloat($('i-monto').value, 10);
      var fecha = $('i-fecha').value || todayIsoLocal();
      var cobroCon = $('i-cobro').value;
      if (!concepto || !monto || monto <= 0) {
        alert('Completá concepto y monto.');
        return;
      }
      var tempId = 'tmp-i-' + Date.now();
      var optimistic = {
        id: tempId,
        fecha: fecha,
        concepto: concepto,
        monto: monto,
        cobrado_con: cobroCon,
        creado_at: new Date().toISOString(),
      };
      if (isCajaTurnoActivo()) {
        ingresosCache.unshift(optimistic);
        renderMovimientosList();
      }
      $('ingreso-modal').classList.add('hidden');
      api({
        action: 'createIngreso',
        token: token,
        concepto: concepto,
        monto: monto,
        fecha: fecha,
        cobroCon: cobroCon,
      }).then(function (res) {
        if (res.data.ok) {
          ingresosCache = ingresosCache.filter(function (g) {
            return g.id !== tempId;
          });
          if (res.data.ingreso) {
            var ing = res.data.ingreso;
            if (!ing.creado_at) ing.creado_at = new Date().toISOString();
            if (movimientoInSesionTurno(ing)) ingresosCache.unshift(ing);
          }
          renderMovimientosList();
          loadIngresos(true);
        } else {
          ingresosCache = ingresosCache.filter(function (g) {
            return g.id !== tempId;
          });
          renderMovimientosList();
          if (res.status === 401) handleAuthFailure();
          else {
            alert(
              res.data.error === 'invalid_ingreso'
                ? 'Concepto y monto inválidos.'
                : 'No se pudo guardar el ingreso. ¿Ejecutaste supabase/ingresos_migration.sql?'
            );
          }
        }
      });
    };
  }

  if ($('ingreso-modal')) {
    $('ingreso-modal').addEventListener('click', function (e) {
      if (e.target === $('ingreso-modal')) $('ingreso-modal').classList.add('hidden');
    });
  }

  if ($('btn-add-gasto')) {
    $('btn-add-gasto').onclick = function () {
      if (!isCajaTurnoActivo()) {
        alert('Abrí la caja antes de agregar egresos. Sin apertura la lista queda en 0.');
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
      if (pagadoCon !== 'efectivo' && pagadoCon !== 'transferencia') {
        alert('Elegí si salió de Efectivo o Mercado Pago.');
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
        renderMovimientosList();
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
            if (movimientoInSesionTurno(g)) gastosCache.unshift(g);
          }
          renderMovimientosList();
          loadGastos(true);
        } else {
          gastosCache = gastosCache.filter(function (g) {
            return g.id !== tempId;
          });
          renderMovimientosList();
          if (res.status === 401) handleAuthFailure();
          else alert('No se pudo guardar el egreso.');
        }
      });
    };
  }

  if ($('gasto-modal')) {
    $('gasto-modal').addEventListener('click', function (e) {
      if (e.target === $('gasto-modal')) $('gasto-modal').classList.add('hidden');
    });
  }

  document.addEventListener('visibilitychange', function () {

    if (document.visibilityState === 'visible' && token && !$('app-view').classList.contains('hidden')) {

      fetchOrdersFromServer(true);
      loadGastos();
      loadIngresos();

    }

  });



  if (token) showApp();

  else showLogin();

})();


