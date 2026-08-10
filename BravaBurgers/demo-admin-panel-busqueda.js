/**
 * Demo: panel admin + Proformas (modal búsqueda comandas).
 */
(function () {
  var panelEstado = 'pendiente';
  var selectedArchiveId = null;
  var selectedArchiveRow = null;

  function $(id) {
    return document.getElementById(id);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(iso, delta) {
    var p = iso.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d.setDate(d.getDate() + delta);
    return isoDate(d);
  }

  function fmtDisplay(iso) {
    var p = iso.split('-');
    return pad(parseInt(p[2], 10)) + '/' + pad(parseInt(p[1], 10)) + '/' + p[0];
  }

  function fmtMoney(n) {
    return '$' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function digitsOnly(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function padOrn(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }

  var today = isoDate(new Date());

  function buildArchive() {
    var list = [];
    var clientes = [
      { n: 'Mario López', tel: '11 7372-1945', wa: '5491173721945' },
      { n: 'Camila Ruiz', tel: '11 6234-5678', wa: '5491162345678' },
      { n: 'Lucas Pérez', tel: '11 5555-1234', wa: '5491155551234' },
      { n: 'Sofía Díaz', tel: '11 6012-8899', wa: '5491160128899' }
    ];
    var fechas = [today, addDays(today, -7), addDays(today, -14), addDays(today, -21)];
    fechas.forEach(function (fecha, fi) {
      for (var seq = 1; seq <= (fi === 0 ? 4 : 6); seq++) {
        var c = clientes[(seq + fi) % clientes.length];
        var orn = 'ORN-DEL-' + padOrn(seq, 4);
        list.push({
          id: fecha + '|' + orn,
          orn: orn,
          dia: fecha,
          cliente: c.n,
          telefono: c.tel,
          wa: c.wa,
          pago: seq % 2 ? 'Efectivo' : 'Mercado Pago',
          total: 12800 + seq * 900 + fi * 100,
          estado: seq % 5 === 0 ? 'cancelada' : 'entregada',
          order: {
            orn: orn,
            cliente: c.n,
            telefono: c.tel,
            direccion: 'Calle demo 123',
            localidad: 'Munro',
            fecha_creado: fecha + 'T21:' + pad((seq * 5) % 60) + ':00-03:00',
            subtotal: 12000 + seq * 500,
            envio: 800,
            total: 12800 + seq * 900,
            pago: seq % 2 ? 'Efectivo' : 'Mercado Pago',
            estado: 'entregada',
            items: [{ nombre: 'Cheese Clásica Simple', qty: 1, precio: 8500 }]
          }
        });
      }
    });
    return list;
  }

  var ARCHIVE = buildArchive();

  var OPERACION = [
    {
      orn: 'ORN-DEL-0001',
      estado: 'pendiente',
      cliente: 'Ana Torres',
      tel: '11 4444-9999',
      wa: '5491144449999',
      dir: 'Maipú 450, Munro',
      pago: 'Efectivo',
      total: 18500
    },
    {
      orn: 'ORN-DEL-0002',
      estado: 'aceptado',
      cliente: 'Mario López',
      tel: '11 7372-1945',
      wa: '5491173721945',
      dir: 'Libertador 2100',
      pago: 'Mercado Pago',
      total: 22100
    },
    {
      orn: 'ORN-DEL-0003',
      estado: 'en_preparacion',
      cliente: 'Lucas Pérez',
      tel: '11 5555-1234',
      wa: '5491155551234',
      dir: 'Vito Dumas 88',
      pago: 'Efectivo',
      total: 15200
    }
  ];

  function matchSearch(row, q) {
    if (!q) return true;
    var ql = q.toLowerCase().trim();
    var qDigits = digitsOnly(q);
    if (row.orn.toLowerCase().indexOf(ql) !== -1) return true;
    if (row.cliente.toLowerCase().indexOf(ql) !== -1) return true;
    var telD = digitsOnly(row.telefono);
    if (qDigits.length >= 3 && telD.indexOf(qDigits) !== -1) return true;
    if (qDigits.length >= 4 && telD.slice(-4) === qDigits.slice(-4)) return true;
    return false;
  }

  function renderOperacionTable() {
    var tbody = $('tbody');
    if (!tbody) return;
    var rows = OPERACION.filter(function (o) {
      return o.estado === panelEstado;
    });
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="orders-empty-msg">Sin pedidos en esta pestaña (demo).</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (o) {
        return (
          '<tr><td>' +
          fmtDisplay(today) +
          ' 21:05</td><td>' +
          o.cliente +
          '</td><td><a href="https://wa.me/' +
          o.wa +
          '" target="_blank" rel="noopener">' +
          o.tel +
          '</a></td><td class="orders-addr">' +
          o.dir +
          '</td><td>' +
          o.pago +
          '</td><td>' +
          fmtMoney(o.total) +
          '</td><td><strong>' +
          o.orn +
          '</strong></td><td><button type="button" class="btn-sm">Ticket</button></td></tr>'
        );
      })
      .join('');
  }

  function renderProfComanda(row) {
    var slot = $('prof-comanda-slot');
    var btnPrint = $('prof-print');
    if (!slot) return;
    selectedArchiveRow = row || null;
    if (btnPrint) btnPrint.disabled = !row;
    if (!row) {
      slot.innerHTML = '<p class="caja-hint" style="margin:0;">Elegí una fila.</p>';
      return;
    }
    if (window.BravaComanda && window.BravaComanda.renderTicketHtml) {
      slot.innerHTML =
        '<div class="comanda-preview-wrap"><article class="ticket ticket-comanda">' +
        window.BravaComanda.renderTicketHtml(row.order) +
        '</article></div>';
      return;
    }
    slot.innerHTML =
      '<div class="comanda-preview-wrap"><article class="ticket ticket-comanda"><div style="text-align:center;font-weight:800;padding:8px">BRAVA BURGERS</div><div style="padding:8px;font-size:11px">' +
      row.orn +
      ' · ' +
      row.cliente +
      '</div></article></div>';
  }

  function renderProformasTable() {
    var tbody = $('proformas-tbody');
    if (!tbody) return;
    var desde = ($('prof-desde') && $('prof-desde').value) || '';
    var hasta = ($('prof-hasta') && $('prof-hasta').value) || '';
    var q = ($('prof-buscar') && $('prof-buscar').value) || '';
    var visible = 0;
    var html = '';
    ARCHIVE.slice()
      .sort(function (a, b) {
        if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1;
        return a.orn < b.orn ? 1 : -1;
      })
      .forEach(function (row) {
        var ok = true;
        if (desde && row.dia < desde) ok = false;
        if (hasta && row.dia > hasta) ok = false;
        if (!matchSearch(row, q)) ok = false;
        if (!ok) return;
        visible++;
        html +=
          '<tr data-id="' +
          row.id +
          '" class="' +
          (selectedArchiveId === row.id ? 'row-active' : '') +
          '">' +
          '<td>' +
          fmtDisplay(row.dia) +
          '</td><td>' +
          row.cliente +
          '</td><td>' +
          row.telefono +
          '</td><td>' +
          fmtMoney(row.total) +
          '</td><td><strong>' +
          row.orn +
          '</strong></td><td>' +
          row.estado +
          '</td></tr>';
      });
    tbody.innerHTML = html;
    $('prof-count').textContent = String(visible);
    $('prof-total').textContent = String(ARCHIVE.length);
    $('prof-empty').classList.toggle('hidden', visible > 0);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selectedArchiveId = tr.getAttribute('data-id');
        var row = ARCHIVE.find(function (x) {
          return x.id === selectedArchiveId;
        });
        renderProfComanda(row);
        renderProformasTable();
      });
    });
    if (selectedArchiveId) {
      var still = ARCHIVE.find(function (x) {
        return x.id === selectedArchiveId;
      });
      if (!still || !matchVisible(still, desde, hasta, q)) {
        selectedArchiveId = null;
        renderProfComanda(null);
      }
    }
  }

  function matchVisible(row, desde, hasta, q) {
    if (desde && row.dia < desde) return false;
    if (hasta && row.dia > hasta) return false;
    return matchSearch(row, q);
  }

  function openProformasModal() {
    selectedArchiveId = null;
    renderProfComanda(null);
    if ($('prof-desde')) $('prof-desde').value = '';
    if ($('prof-hasta')) $('prof-hasta').value = '';
    if ($('prof-buscar')) $('prof-buscar').value = '';
    $('proformas-modal').classList.remove('hidden');
    renderProformasTable();
    if ($('prof-buscar')) $('prof-buscar').focus();
  }

  function closeProformasModal() {
    $('proformas-modal').classList.add('hidden');
  }

  var demoCierresHistorial = [];
  var selectedDemoCierreHistId = null;

  function demoCierreHistFechaIso(c) {
    if (c && c.periodo_hasta) return c.periodo_hasta;
    if (c && c.cerrado_at) return String(c.cerrado_at).slice(0, 10);
    return today;
  }

  function demoCierreHistPeriodo(c) {
    if (!c) return '—';
    if (c.periodo_desde && c.periodo_hasta && c.periodo_desde !== c.periodo_hasta) {
      return fmtDisplay(c.periodo_desde) + ' → ' + fmtDisplay(c.periodo_hasta);
    }
    return fmtDisplay(c.periodo_hasta || c.periodo_desde || today);
  }

  function matchDemoCierreHistSearch(c, q) {
    if (!q) return true;
    var s = String(q).trim().toLowerCase();
    if (!s) return true;
    var hay = [c.id, c.periodo_desde, c.periodo_hasta, c.notas, c.cerrado_at, demoCierreHistPeriodo(c)]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(s) >= 0;
  }

  function findDemoCierreHist(id) {
    if (!id) return null;
    for (var i = 0; i < demoCierresHistorial.length; i++) {
      if (demoCierresHistorial[i].id === id) return demoCierresHistorial[i];
    }
    return null;
  }

  function buildDemoCierreHtmlFromRecord(c) {
    if (!c) return '';
    try {
      var snap = typeof c.snapshot_json === 'string' ? JSON.parse(c.snapshot_json) : c.snapshot_json;
      if (snap && snap.st) return buildDemoCierreResumenHtml(snap, c.id, c.cerrado_at);
    } catch (e) {}
    return (
      '<div class="resumen-top"><div class="brand">BRAVA BURGERS</div><div class="meta">' +
      escHtml(c.id || '—') +
      '</div></div><p class="caja-hint">Sin detalle guardado (cerrá caja de nuevo en demo).</p>'
    );
  }

  function renderDemoCierreHistPreview(c) {
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
      buildDemoCierreHtmlFromRecord(c) +
      '</div></div>';
  }

  function renderDemoCierreHistTable() {
    var tbody = $('cohist-tbody');
    if (!tbody) return;
    var desde = ($('cohist-desde') && $('cohist-desde').value) || '';
    var hasta = ($('cohist-hasta') && $('cohist-hasta').value) || '';
    var q = ($('cohist-buscar') && $('cohist-buscar').value) || '';
    var visible = 0;
    var html = '';
    demoCierresHistorial.forEach(function (c) {
      var dia = demoCierreHistFechaIso(c);
      if (desde && dia && dia < desde) return;
      if (hasta && dia && dia > hasta) return;
      if (!matchDemoCierreHistSearch(c, q)) return;
      visible++;
      html +=
        '<tr data-id="' +
        escHtml(c.id) +
        '" class="' +
        (selectedDemoCierreHistId === c.id ? 'row-active' : '') +
        '">' +
        '<td>' +
        escHtml(demoFormatWhen(c.cerrado_at)) +
        '</td><td><strong>' +
        escHtml(c.id || '—') +
        '</strong></td><td>' +
        escHtml(demoCierreHistPeriodo(c)) +
        '</td><td>' +
        fmtMoney(c.ventas_total) +
        '</td><td>' +
        fmtMoney(c.efectivo) +
        '</td><td>' +
        fmtMoney(c.mercado_pago) +
        '</td></tr>';
    });
    tbody.innerHTML = html;
    if ($('cohist-count')) $('cohist-count').textContent = String(visible);
    if ($('cohist-total')) $('cohist-total').textContent = String(demoCierresHistorial.length);
    if ($('cohist-empty')) $('cohist-empty').classList.toggle('hidden', visible > 0);
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selectedDemoCierreHistId = tr.getAttribute('data-id');
        renderDemoCierreHistPreview(findDemoCierreHist(selectedDemoCierreHistId));
        renderDemoCierreHistTable();
      });
    });
    if (selectedDemoCierreHistId && !findDemoCierreHist(selectedDemoCierreHistId)) {
      selectedDemoCierreHistId = null;
      renderDemoCierreHistPreview(null);
    }
  }

  function openDemoCierreHistorialModal() {
    selectedDemoCierreHistId = null;
    renderDemoCierreHistPreview(null);
    if ($('cohist-desde')) $('cohist-desde').value = '';
    if ($('cohist-hasta')) $('cohist-hasta').value = '';
    if ($('cohist-buscar')) $('cohist-buscar').value = '';
    if ($('cierre-historial-modal')) $('cierre-historial-modal').classList.remove('hidden');
    renderDemoCierreHistTable();
    if ($('cohist-buscar')) $('cohist-buscar').focus();
  }

  function closeDemoCierreHistorialModal() {
    if ($('cierre-historial-modal')) $('cierre-historial-modal').classList.add('hidden');
  }

  function printDemoCierreHistorial() {
    var slot = $('cohist-preview');
    if (!slot) return;
    var inner = slot.querySelector('.resumen.resumen-cierre');
    if (!inner || !inner.innerHTML.trim()) return;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Impresión cierre historial demo');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(iframe);
    var win = iframe.contentWindow;
    var doc = iframe.contentDocument || (win && win.document);
    if (!doc || !win) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cierre operativo</title><style>' +
        getDemoCierrePrintCss() +
        '</style></head><body>' +
        inner.outerHTML +
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
      win.focus();
      win.print();
      setTimeout(cleanup, 3000);
    }, 200);
  }

  function setActiveTab(est) {
    panelEstado = est;
    document.querySelectorAll('.tabs .tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-estado') === est);
    });
    renderOperacionTable();
  }

  var demoCajaAbierta = true;
  var demoStock = { panes: 40, medallones: 50, queso: 80 };
  var demoArqueoApertura = null;
  var demoCashArqueoMode = 'cierre';
  var demoCashArqueoEsperadoEf = 0;
  var demoCashArqueoEsperadoMp = 0;
  var demoPendingAperturaArqueoDone = null;
  var demoPendingStockDone = null;
  var demoStockModalMode = 'apertura';
  var DEMO_STOCK_MED_POR_SIMPLE = 1;
  var DEMO_STOCK_MED_POR_DOBLE = 2;
  var DEMO_STOCK_LONCHAS_POR_MED = 2;
  var DEMO_VENTAS = 173600;
  var DEMO_SALDO_EF = 125400;
  var DEMO_SALDO_MP = 48200;
  var demoMovs = [
    { kind: 'ing', concepto: 'Reciclaje grasa', monto: 12345, cobro: 'efectivo', sub: 'EF' },
    { kind: 'eg', concepto: 'Jabón', monto: 1234, cobro: '', pagado: 'efectivo', sub: '' },
  ];

  function fmtNumAr(n) {
    return (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function demoMedioAbbr(cobOrPagado) {
    var v = String(cobOrPagado || '').trim();
    if (v === 'transferencia') return 'MP';
    if (v === 'efectivo') return 'EFT';
    return 'EFT';
  }

  function demoMovConcepto(concepto, kind, cobroOrPagado) {
    var raw = kind === 'ing' ? cobroOrPagado || 'efectivo' : cobroOrPagado || 'efectivo';
    return String(concepto || '').trim() + ' (' + demoMedioAbbr(raw) + ')';
  }

  function renderDemoMovList() {
    var ul = $('mov-list');
    var empty = $('mov-empty');
    if (!ul) return;
    if (!demoMovs.length) {
      ul.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    var sorted = demoMovs.slice().sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'ing' ? -1 : 1;
      return 0;
    });
    ul.innerHTML = sorted
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
          demoMovConcepto(x.concepto, x.kind, x.kind === 'ing' ? x.cobro : x.pagado) +
          '</span></div><div class="monto-row"><span class="monto ' +
          mClass +
          '">' +
          sign +
          fmtMoney(x.monto) +
          '</span></div></li>'
        );
      })
      .join('');
  }

  function recalcDemoCaja() {
    var efNet = DEMO_SALDO_EF;
    var mpNet = DEMO_SALDO_MP;
    var gTotal = 0;
    demoMovs.forEach(function (x) {
      if (x.kind === 'ing') {
        var cob = x.cobro || 'efectivo';
        if (cob === 'transferencia') mpNet += x.monto;
        else efNet += x.monto;
      } else {
        gTotal += x.monto;
        var pag = x.pagado || 'efectivo';
        if (pag === 'transferencia') mpNet -= x.monto;
        else efNet -= x.monto;
      }
    });
    var ventas = efNet + mpNet;
    var efTxt = fmtMoney(efNet);
    var mpTxt = fmtMoney(mpNet);

    if ($('caja-ef-ing')) $('caja-ef-ing').textContent = '+$0';
    if ($('caja-mp-ing')) $('caja-mp-ing').textContent = '+$0';
    if ($('caja-ing-total')) $('caja-ing-total').textContent = '+$0';
    if ($('caja-ef')) $('caja-ef').textContent = efTxt;
    if ($('caja-mp')) $('caja-mp').textContent = mpTxt;
    if ($('caja-ventas-ef')) $('caja-ventas-ef').textContent = efTxt;
    if ($('caja-ventas-mp')) $('caja-ventas-mp').textContent = mpTxt;
    if ($('caja-ventas')) $('caja-ventas').textContent = fmtMoney(ventas);
    if ($('caja-gastos')) $('caja-gastos').textContent = '−$' + fmtNumAr(gTotal);
    if ($('caja-resultado')) $('caja-resultado').textContent = fmtMoney(ventas);
    var row = $('row-resultado');
    if (row) {
      row.classList.remove('pos', 'neg');
      row.classList.add(ventas >= 0 ? 'pos' : 'neg');
    }
    renderDemoMovList();
  }

  function ingresoCobroDemoLabel(v) {
    if (v === 'transferencia') return 'Mercado Pago';
    if (v === 'efectivo') return 'EF';
    return 'Otro';
  }

  function openIngresoModal() {
    if (!demoCajaAbierta) {
      alert('Abrí la caja antes de agregar ingresos.');
      return;
    }
    if ($('i-concepto')) $('i-concepto').value = '';
    if ($('i-monto')) $('i-monto').value = '';
    if ($('i-fecha')) $('i-fecha').value = today;
    if ($('i-cobro')) $('i-cobro').value = 'efectivo';
    if ($('ingreso-modal')) $('ingreso-modal').classList.remove('hidden');
    if ($('i-concepto')) $('i-concepto').focus();
  }

  function closeIngresoModal() {
    if ($('ingreso-modal')) $('ingreso-modal').classList.add('hidden');
  }

  function openGastoModal() {
    if (!demoCajaAbierta) {
      alert('Abrí la caja antes de agregar egresos.');
      return;
    }
    if ($('g-concepto')) $('g-concepto').value = '';
    if ($('g-monto')) $('g-monto').value = '';
    if ($('g-fecha')) $('g-fecha').value = today;
    if ($('g-pagado')) $('g-pagado').value = '';
    if ($('gasto-modal')) $('gasto-modal').classList.remove('hidden');
    if ($('g-concepto')) $('g-concepto').focus();
  }

  function closeGastoModal() {
    if ($('gasto-modal')) $('gasto-modal').classList.add('hidden');
  }

  function demoStockLonchasBaseSimple() {
    return DEMO_STOCK_MED_POR_SIMPLE * DEMO_STOCK_LONCHAS_POR_MED;
  }

  function demoStockLonchasBaseDoble() {
    return DEMO_STOCK_MED_POR_DOBLE * DEMO_STOCK_LONCHAS_POR_MED;
  }

  function demoStockCapacidad(st) {
    var p = st.panes;
    var m = st.medallones;
    var q = st.queso;
    var simples = Math.min(p, m, Math.floor(q / demoStockLonchasBaseSimple()));
    var dobles = Math.min(p, Math.floor(m / DEMO_STOCK_MED_POR_DOBLE), Math.floor(q / demoStockLonchasBaseDoble()));
    return { simples: simples, dobles: dobles };
  }

  function demoStockApplyRowLevel(row, qty) {
    if (!row) return;
    var low = parseInt(row.getAttribute('data-stock-low'), 10);
    var crit = parseInt(row.getAttribute('data-stock-critical'), 10);
    row.classList.remove('ok', 'low', 'critical');
    if (qty < crit) row.classList.add('critical');
    else if (qty < low) row.classList.add('low');
    else row.classList.add('ok');
  }

  function updateDemoStockChrome() {
    var block = $('stock-cocina-block');
    var capBox = $('burger-capacity-box');
    var activo = demoCajaAbierta && demoStock;
    if (block) block.classList.toggle('hidden', !activo);
    if (activo && demoStock) {
      if ($('stock-live-panes')) $('stock-live-panes').textContent = String(demoStock.panes);
      if ($('stock-live-med')) $('stock-live-med').textContent = String(demoStock.medallones);
      if ($('stock-live-queso')) $('stock-live-queso').textContent = String(demoStock.queso);
      document.querySelectorAll('.stock-live-row[data-stock-key]').forEach(function (row) {
        var key = row.getAttribute('data-stock-key');
        demoStockApplyRowLevel(row, demoStock[key]);
      });
    }
    if (capBox) {
      if (!activo) {
        capBox.classList.add('is-off');
        if ($('burger-cap-sub')) $('burger-cap-sub').textContent = 'Abrí caja y cargá stock.';
        if ($('burger-cap-simples')) $('burger-cap-simples').textContent = '—';
        if ($('burger-cap-dobles')) $('burger-cap-dobles').textContent = '—';
      } else {
        capBox.classList.remove('is-off');
        var cap = demoStockCapacidad(demoStock);
        if ($('burger-cap-sub')) $('burger-cap-sub').textContent = 'Según pan, med y lonchas en Stock cocina:';
        if ($('burger-cap-simples')) {
          $('burger-cap-simples').textContent = String(cap.simples);
          $('burger-cap-simples').classList.toggle('zero', cap.simples === 0);
        }
        if ($('burger-cap-dobles')) {
          $('burger-cap-dobles').textContent = String(cap.dobles);
          $('burger-cap-dobles').classList.toggle('zero', cap.dobles === 0);
        }
      }
    }
  }

  function fillDemoStockModalForm(st) {
    var s = st || { panes: '', medallones: '', queso: '' };
    if ($('stock-qty-panes')) {
      $('stock-qty-panes').value = s.panes !== '' && s.panes != null ? s.panes : '';
    }
    if ($('stock-qty-med')) {
      $('stock-qty-med').value = s.medallones !== '' && s.medallones != null ? s.medallones : '';
    }
    if ($('stock-qty-queso')) {
      $('stock-qty-queso').value = s.queso !== '' && s.queso != null ? s.queso : '';
    }
  }

  function readDemoStockModalForm() {
    function num(id) {
      var el = $(id);
      var v = el ? parseInt(el.value, 10) : 0;
      return isNaN(v) || v < 0 ? 0 : v;
    }
    return {
      panes: num('stock-qty-panes'),
      medallones: num('stock-qty-med'),
      queso: num('stock-qty-queso'),
    };
  }

  function closeDemoStockModal() {
    if ($('stock-apertura-modal')) $('stock-apertura-modal').classList.add('hidden');
    demoPendingStockDone = null;
  }

  function openDemoStockModal(mode, afterSave) {
    demoStockModalMode = mode === 'recontar' ? 'recontar' : 'apertura';
    demoPendingStockDone = typeof afterSave === 'function' ? afterSave : null;
    var modal = $('stock-apertura-modal');
    if (!modal) {
      if (demoPendingStockDone) demoPendingStockDone();
      return;
    }
    if ($('stock-apertura-title')) {
      $('stock-apertura-title').textContent =
        demoStockModalMode === 'recontar' ? 'Recontar stock cocina' : 'Abrir caja — stock cocina';
    }
    if ($('stock-apertura-sub')) {
      $('stock-apertura-sub').textContent =
        demoStockModalMode === 'recontar'
          ? 'Actualizá panes, medallones y lonchas.'
          : 'Contá lo que hay ahora (demo: no guarda en Supabase).';
    }
    if ($('stock-apertura-ok')) {
      $('stock-apertura-ok').textContent =
        demoStockModalMode === 'recontar' ? 'Guardar conteo' : 'Confirmar y abrir caja';
    }
    if (demoStockModalMode === 'recontar') fillDemoStockModalForm(demoStock || {});
    else fillDemoStockModalForm({ panes: '', medallones: '', queso: '' });
    modal.classList.remove('hidden');
    if ($('stock-qty-panes')) $('stock-qty-panes').focus();
  }

  function confirmDemoStockModal() {
    var st = readDemoStockModalForm();
    if (demoStockModalMode === 'apertura' && !st.panes && !st.medallones && !st.queso) {
      if (!confirm('Los tres ítems están en 0. ¿Abrir caja igual?')) return;
    }
    demoStock = st;
    var done = demoPendingStockDone;
    closeDemoStockModal();
    updateDemoStockChrome();
    if (demoStockModalMode === 'apertura' && done) {
      openDemoAperturaArqueo(done);
    } else if (done) {
      done();
    }
  }

  function demoAdjustStockKey(key, delta) {
    if (!demoCajaAbierta || !demoStock || !key) return;
    demoStock[key] = Math.max(0, (demoStock[key] || 0) + delta);
    updateDemoStockChrome();
  }

  function updateDemoTurnoToolbar() {
    var badge = $('turno-toolbar-badge');
    var btnAbrir = $('btn-turno-abrir');
    var btnCerrar = $('btn-turno-cerrar');
    if (badge) {
      if (demoCajaAbierta) {
        badge.textContent = 'Turno abierto';
        badge.className = 'turno-badge turno-badge--open';
      } else {
        badge.textContent = 'Turno cerrado';
        badge.className = 'turno-badge turno-badge--closed';
      }
    }
    if (btnAbrir) btnAbrir.classList.toggle('hidden', demoCajaAbierta);
    if (btnCerrar) btnCerrar.classList.toggle('hidden', !demoCajaAbierta);
  }

  function setCajaSidebarTeaser(abierta) {
    demoCajaAbierta = !!abierta;
    if (!abierta) {
      demoStock = null;
      demoArqueoApertura = null;
    }
    updateDemoTurnoToolbar();
    var openBlock = $('caja-sidebar-open-block');
    var closedHint = $('caja-sidebar-closed-hint');
    var btnAbrir = $('btn-sidebar-abrir-caja');
    var btnPanel = $('btn-open-caja-panel');
    if ($('caja-sidebar-estado')) {
      $('caja-sidebar-estado').textContent = abierta ? 'Caja abierta · ventas entregadas ✓' : 'Caja cerrada';
    }
    if (openBlock) openBlock.classList.toggle('hidden', !abierta);
    if (closedHint) closedHint.classList.toggle('hidden', abierta);
    if (btnAbrir) btnAbrir.classList.toggle('hidden', abierta);
    if (btnPanel) btnPanel.classList.toggle('hidden', !abierta);
    if ($('btn-abrir-caja')) $('btn-abrir-caja').classList.toggle('hidden', abierta);
    if ($('btn-cierre-caja')) $('btn-cierre-caja').classList.toggle('hidden', !abierta);
    updateDemoStockChrome();
  }

  function mockSidebar() {
    if ($('poll-status')) $('poll-status').textContent = 'Demo local · sin Supabase';
    if ($('caja-range')) $('caja-range').textContent = 'Turno demo · ' + fmtDisplay(today);
    if ($('caja-estado')) {
      $('caja-estado').textContent = demoCajaAbierta ? 'Caja abierta (mock)' : 'Caja cerrada';
    }
    $('ventas-hamb-simples').textContent = '24';
    $('ventas-hamb-dobles').textContent = '3';
    $('ventas-hamb-total').textContent = '27';
    recalcDemoCaja();
    setCajaSidebarTeaser(demoCajaAbierta);
  }

  function demoAbrirCaja() {
    if (demoCajaAbierta) return;
    openDemoStockModal('apertura', function () {
      demoCajaAbierta = true;
      if ($('caja-estado')) $('caja-estado').textContent = 'Caja abierta (mock)';
      setCajaSidebarTeaser(true);
      recalcDemoCaja();
    });
  }

  function openCajaPanelModal() {
    $('caja-panel-modal').classList.remove('hidden');
  }

  function closeCajaPanelModal() {
    $('caja-panel-modal').classList.add('hidden');
  }

  function escHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function demoResumenTblRows(rows) {
    var html = '<table class="resumen-tbl" role="presentation"><tbody>';
    rows.forEach(function (r) {
      html +=
        '<tr class="' +
        (r.c || '') +
        '"><td class="res-l">' +
        r.l +
        '</td><td class="res-r">' +
        r.r +
        '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function demoFormatWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString('es-AR') +
      ' ' +
      d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  var DEMO_PRODUCTOS_VENTAS = [
    { nombre: 'Cheese Classic Simple', qty: 4 },
    { nombre: 'Vegan Crispy Simple', qty: 2 },
    { nombre: 'Cuarto Simple', qty: 8 },
    { nombre: 'Cheese Classic Doble', qty: 5 },
    { nombre: 'Vegan Crispy Doble', qty: 1 },
    { nombre: 'Cuarto Doble', qty: 2 },
  ];

  function demoNombreEsDoble(nombre) {
    var t = String(nombre || '').toLowerCase();
    return t.indexOf('doble') >= 0 || t.indexOf('triple') >= 0;
  }

  function demoSplitProductos(productos) {
    var simples = [];
    var dobles = [];
    (productos || []).forEach(function (x) {
      if (!x || !(Number(x.qty) > 0)) return;
      if (demoNombreEsDoble(x.nombre)) dobles.push(x);
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

  function demoProductosTblRows(list) {
    if (!list.length) {
      return demoResumenTblRows([{ l: '—', r: '0', c: 'res-muted' }]);
    }
    return demoResumenTblRows(
      list.map(function (x) {
        return { l: escHtml(x.nombre) + ':', r: String(Math.round(x.qty)) };
      })
    );
  }

  function demoRegistroVentasHtml(st) {
    var productos = st.productosVentas || DEMO_PRODUCTOS_VENTAS;
    var split = demoSplitProductos(productos);
    var html = '<p class="res-group-title">Simples:</p>';
    html += demoProductosTblRows(split.simples);
    html += '<p class="res-group-title">Dobles:</p>';
    html += demoProductosTblRows(split.dobles);
    html += demoResumenTblRows([
      { l: 'Vendidas total', r: st.hambTotal + ' u.', c: 'res-total' },
    ]);
    return html;
  }

  function demoComputeNetStats() {
    var efPedidos = DEMO_SALDO_EF;
    var mpPedidos = DEMO_SALDO_MP;
    var efNet = DEMO_SALDO_EF;
    var mpNet = DEMO_SALDO_MP;
    var gTotal = 0;
    var gEf = 0;
    var gMp = 0;
    var iTotal = 0;
    demoMovs.forEach(function (x) {
      if (x.kind === 'ing') {
        iTotal += x.monto;
        var cob = x.cobro || 'efectivo';
        if (cob === 'transferencia') mpNet += x.monto;
        else efNet += x.monto;
      } else {
        gTotal += x.monto;
        var pag = x.pagado || 'efectivo';
        if (pag === 'transferencia') {
          mpNet -= x.monto;
          gMp += x.monto;
        } else {
          efNet -= x.monto;
          gEf += x.monto;
        }
      }
    });
    var ventas = efNet + mpNet;
    return {
      ef: efNet,
      mp: mpNet,
      ventas: ventas,
      ventasPedidos: efPedidos + mpPedidos,
      efPedidos: efPedidos,
      mpPedidos: mpPedidos,
      gTotal: gTotal,
      gEf: gEf,
      gMp: gMp,
      iTotal: iTotal,
      resultado: ventas,
      simples: 24,
      dobles: 3,
      hambTotal: 27,
      productosVentas: DEMO_PRODUCTOS_VENTAS,
    };
  }

  function demoMedioAbbr(v) {
    if (v === 'transferencia') return 'MP';
    if (v === 'efectivo') return 'EFT';
    return 'EFT';
  }

  function demoCierreFlujoCajaTicketHtml(snapshot, st) {
    var ap = snapshot.aperturaArqueo;
    var arq = snapshot.arqueo;
    var gastosList = snapshot.gastos || [];
    var ingresosList = snapshot.ingresos || [];
    var html = '<div class="resumen-block"><h3>Flujo de caja</h3>';

    html += '<p class="res-group-title">Entrada (inicial)</p>';
    html += demoResumenTblRows([
      {
        l: 'Efectivo',
        r: ap ? '$' + fmtNumAr(ap.efContado) : '< Sin saldo >',
        c: ap ? '' : 'res-muted',
      },
      {
        l: 'Mercado Pago',
        r: ap ? '$' + fmtNumAr(ap.mpContado) : '< Sin saldo >',
        c: ap ? '' : 'res-muted',
      },
    ]);

    html += '<p class="res-group-title">Cobranzas del turno</p>';
    var cobRows = [
      { l: 'Ventas entregadas EF', r: '$' + fmtNumAr(st.efPedidos || 0) },
      { l: 'Ventas entregadas MP', r: '$' + fmtNumAr(st.mpPedidos || 0) },
    ];
    ingresosList.forEach(function (g) {
      cobRows.push({
        l: '+ ' + demoMovConcepto(g.concepto, 'ing', g.cobrado_con),
        r: '+$' + fmtNumAr(g.monto),
      });
    });
    cobRows.push({
      l: 'Total entradas',
      r: '$' + fmtNumAr((st.ventasPedidos || 0) + (st.iTotal || 0)),
      c: 'res-total',
    });
    html += demoResumenTblRows(cobRows);

    html += '<p class="res-group-title">Egresos</p>';
    var egRows = gastosList.map(function (g) {
      return {
        l: escHtml(g.concepto || 'Egreso') + ' (' + demoMedioAbbr(g.pagado_con) + ')',
        r: '−$' + fmtNumAr(g.monto),
      };
    });
    if (!egRows.length) {
      egRows.push({ l: 'Sin egresos', r: '—', c: 'res-muted' });
    }
    egRows.push({ l: 'Total egresos', r: '−$' + fmtNumAr(st.gTotal || 0), c: 'res-total' });
    html += demoResumenTblRows(egRows);

    html += '<p class="res-group-title">Saldo turno (sistema)</p>';
    html += demoResumenTblRows([
      { l: 'Efectivo', r: '$' + fmtNumAr(st.ef) },
      { l: 'Mercado Pago', r: '$' + fmtNumAr(st.mp) },
      { l: 'Total', r: '$' + fmtNumAr(st.ventas), c: 'res-total' },
    ]);

    html += '<p class="res-group-title">Final (arqueo al cerrar)</p>';
    html += '<p class="res-sub">Diferencia contado vs sistema. Cuadrado = no falta ni sobra.</p>';
    if (arq) {
      html += demoResumenTblRows([
        { l: 'Efectivo', r: demoArqueoFinalTicketCell(arq, 'ef') },
        { l: 'Mercado Pago', r: demoArqueoFinalTicketCell(arq, 'mp') },
      ]);
    } else {
      html += demoResumenTblRows([{ l: 'Sin arqueo', r: '—', c: 'res-muted' }]);
    }

    html += '</div>';
    return html;
  }

  function demoSnapshotForCierre() {
    var st = demoComputeNetStats();
    var ingresos = [];
    var gastos = [];
    demoMovs.forEach(function (x) {
      if (x.kind === 'ing') {
        ingresos.push({ concepto: x.concepto, monto: x.monto, cobrado_con: x.cobro || 'efectivo' });
      } else {
        gastos.push({ concepto: x.concepto, monto: x.monto, pagado_con: x.pagado || 'efectivo' });
      }
    });
    return {
      st: st,
      ingresos: ingresos,
      gastos: gastos,
      periodoLbl: fmtDisplay(today),
      aperturaIso: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      aperturaArqueo: demoArqueoApertura,
    };
  }

  function buildDemoCierreResumenHtml(snapshot, cierreId, cierreIso) {
    var st = snapshot.st;
    return (
      '<div class="resumen-top">' +
      '<div class="brand">BRAVA BURGERS</div>' +
      '<div class="meta">' +
      escHtml(cierreId) +
      ' · ' +
      escHtml(snapshot.periodoLbl) +
      '<br>Apertura ' +
      escHtml(demoFormatWhen(snapshot.aperturaIso)) +
      ' · Cierre ' +
      escHtml(demoFormatWhen(cierreIso)) +
      '</div></div>' +
      demoCierreFlujoCajaTicketHtml(snapshot, st) +
      '<div class="resumen-block"><h3>Registro de ventas</h3>' +
      demoRegistroVentasHtml(st) +
      '</div>' +
      '<div class="resumen-foot">Brava Burgers · Cierre operativo · DEMO</div>'
    );
  }

  function getDemoCierrePrintCss() {
    return (
      '@page { margin: 0; }' +
      'html, body { margin: 0; padding: 0; width: 100%; background: #fff; }' +
      '.resumen.resumen-cierre { width: 100%; margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.35; }' +
      '.resumen-cierre .resumen-top { background: #000; color: #fff; padding: 8px 2mm; text-align: center; }' +
      '.resumen-cierre .resumen-top .brand { font-size: 13px; font-weight: 800; letter-spacing: 0.04em; }' +
      '.resumen-cierre .resumen-top .meta { font-size: 10px; margin-top: 4px; line-height: 1.4; }' +
      '.resumen-cierre .resumen-block { padding: 6px 2mm; border-bottom: 1px solid #ddd; }' +
      '.resumen-cierre .resumen-block h3 { margin: 0 0 6px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }' +
      '.resumen-cierre .res-sub { margin: 0 0 6px; font-size: 9px; color: #666; }' +
      '.resumen-cierre .resumen-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }' +
      '.resumen-cierre .res-l { width: 62%; text-align: left; padding: 2px 0; font-size: 11px; word-break: break-word; }' +
      '.resumen-cierre .res-r { width: 38%; text-align: right; padding: 2px 0; font-size: 11px; white-space: nowrap; }' +
      '.resumen-cierre tr.res-total .res-l, .resumen-cierre tr.res-total .res-r { font-weight: 700; border-top: 1px dashed #000; padding-top: 5px; }' +
      '.resumen-cierre tr.res-result .res-l, .resumen-cierre tr.res-result .res-r { font-weight: 700; font-size: 12px; }' +
      '.resumen-cierre .res-group-title { margin: 8px 0 3px; font-size: 10px; font-weight: 700; }' +
      '.resumen-cierre .res-group-title:first-of-type { margin-top: 2px; }' +
      '.resumen-cierre .resumen-note { margin: 6px 0 0; font-size: 9px; color: #666; }' +
      '.resumen-cierre .resumen-foot { padding: 8px 2mm; font-size: 9px; color: #fff; background: #000; text-align: center; }'
    );
  }

  function printDemoCierreResumen() {
    var content = $('cierre-resumen-content');
    if (!content || !content.innerHTML.trim()) return;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Impresión cierre demo');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(iframe);
    var win = iframe.contentWindow;
    var doc = iframe.contentDocument || (win && win.document);
    if (!doc || !win) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cierre demo</title><style>' +
        getDemoCierrePrintCss() +
        '</style></head><body>' +
        content.outerHTML +
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
  }

  var demoPendingCierre = null;

  function demoArqueoDiffMeta(diff, mode) {
    var d = Number(diff) || 0;
    if (mode === 'apertura') {
      if (d === 0) return { text: 'Sin fondo', cls: 'arqueo-diff--ok', money: '$0' };
      return { text: 'Fondo inicial', cls: 'arqueo-diff--ok', money: '$' + fmtNumAr(d) };
    }
    if (d === 0) return { text: 'Cuadrado', cls: 'arqueo-diff--ok', money: '$0' };
    if (d > 0) return { text: 'Sobrante', cls: 'arqueo-diff--sobr', money: '$' + fmtNumAr(d) };
    return { text: 'Faltante', cls: 'arqueo-diff--falt', money: '−$' + fmtNumAr(Math.abs(d)) };
  }

  function demoReadArqueoContado(id) {
    var el = $(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(',', '.'), 10);
    return isNaN(v) || v < 0 ? 0 : Math.round(v);
  }

  function demoPaintArqueoDiff(cellId, diff) {
    var cell = $(cellId);
    if (!cell) return;
    var m = demoArqueoDiffMeta(diff, demoCashArqueoMode);
    cell.textContent = m.text + ' · ' + m.money;
    cell.className = 'arqueo-diff ' + m.cls;
  }

  function setDemoCashArqueoModalUi(mode) {
    demoCashArqueoMode = mode === 'apertura' ? 'apertura' : 'cierre';
    var isApertura = demoCashArqueoMode === 'apertura';
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

  function fillDemoCashArqueoForm(esperadoEf, esperadoMp, contadoEf, contadoMp) {
    if ($('arqueo-ef-esperado')) $('arqueo-ef-esperado').textContent = fmtMoney(esperadoEf);
    if ($('arqueo-mp-esperado')) $('arqueo-mp-esperado').textContent = fmtMoney(esperadoMp);
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
    demoCashArqueoEsperadoEf = esperadoEf;
    demoCashArqueoEsperadoMp = esperadoMp;
    updateDemoCashArqueoDiffUI();
  }

  function updateDemoCashArqueoDiffUI() {
    var efCont = demoReadArqueoContado('arqueo-ef-contado');
    var mpCont = demoReadArqueoContado('arqueo-mp-contado');
    demoPaintArqueoDiff('arqueo-ef-diff', efCont - demoCashArqueoEsperadoEf);
    demoPaintArqueoDiff('arqueo-mp-diff', mpCont - demoCashArqueoEsperadoMp);
  }

  function buildDemoArqueoObject() {
    var efContado = demoReadArqueoContado('arqueo-ef-contado');
    var mpContado = demoReadArqueoContado('arqueo-mp-contado');
    var notaEf = ($('arqueo-nota-ef') && $('arqueo-nota-ef').value.trim()) || '';
    var notaMp = ($('arqueo-nota-mp') && $('arqueo-nota-mp').value.trim()) || '';
    return {
      efEsperado: demoCashArqueoEsperadoEf,
      mpEsperado: demoCashArqueoEsperadoMp,
      efContado: efContado,
      mpContado: mpContado,
      efDiff: efContado - demoCashArqueoEsperadoEf,
      mpDiff: mpContado - demoCashArqueoEsperadoMp,
      notaEf: notaEf,
      notaMp: notaMp,
    };
  }

  function demoArqueoMediosSinObs(arqueo) {
    var missing = [];
    if (!arqueo) return missing;
    if (arqueo.efDiff !== 0 && !arqueo.notaEf) missing.push('efectivo');
    if (arqueo.mpDiff !== 0 && !arqueo.notaMp) missing.push('Mercado Pago');
    return missing;
  }

  function demoArqueoFinalTicketCell(arqueo, medio) {
    if (!arqueo) return '—';
    var cont = medio === 'ef' ? arqueo.efContado : arqueo.mpContado;
    var diff = medio === 'ef' ? arqueo.efDiff : arqueo.mpDiff;
    var esp = medio === 'ef' ? arqueo.efEsperado : arqueo.mpEsperado;
    var nota = medio === 'ef' ? arqueo.notaEf : arqueo.notaMp;
    var r;
    if (diff === 0) {
      r = 'Cuadrado ($0 dif.)';
    } else {
      var m = demoArqueoDiffMeta(diff, 'cierre');
      r = '$' + fmtNumAr(cont) + ' · ' + m.text + ' ' + m.money + ' (sis $' + fmtNumAr(esp) + ')';
    }
    if (nota) r += ' — ' + escHtml(nota);
    return r;
  }

  function openDemoAperturaArqueo(done) {
    demoPendingAperturaArqueoDone = typeof done === 'function' ? done : null;
    setDemoCashArqueoModalUi('apertura');
    fillDemoCashArqueoForm(0, 0, '', '');
    if ($('cierre-arqueo-modal')) $('cierre-arqueo-modal').classList.remove('hidden');
    if ($('arqueo-ef-contado')) $('arqueo-ef-contado').focus();
  }

  function openDemoCierreArqueo() {
    demoPendingCierre = demoSnapshotForCierre();
    var st = demoPendingCierre.st;
    setDemoCashArqueoModalUi('cierre');
    fillDemoCashArqueoForm(st.ef, st.mp, st.ef, st.mp);
    if ($('cierre-arqueo-modal')) $('cierre-arqueo-modal').classList.remove('hidden');
    if ($('arqueo-ef-contado')) $('arqueo-ef-contado').focus();
  }

  function closeDemoCierreArqueo() {
    if ($('cierre-arqueo-modal')) $('cierre-arqueo-modal').classList.add('hidden');
  }

  function cancelDemoCierreArqueo() {
    closeDemoCierreArqueo();
    if (demoCashArqueoMode === 'apertura') {
      demoPendingAperturaArqueoDone = null;
    } else {
      demoPendingCierre = null;
    }
  }

  function confirmDemoCierreArqueo() {
    var arqueo = buildDemoArqueoObject();
    if (demoCashArqueoMode === 'apertura') {
      demoArqueoApertura = arqueo;
      closeDemoCierreArqueo();
      var done = demoPendingAperturaArqueoDone;
      demoPendingAperturaArqueoDone = null;
      if (done) done();
      return;
    }
    if (!demoPendingCierre) return;
    var sinObs = demoArqueoMediosSinObs(arqueo);
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
    demoPendingCierre.arqueo = arqueo;
    closeDemoCierreArqueo();
    openDemoCierreConfirm();
  }

  function openDemoCierreConfirm() {
    var snap = demoPendingCierre;
    if (!snap) return;
    var st = snap.st;
    var msg =
      'Turno demo: ' +
      snap.periodoLbl +
      '\n\nVentas netas: $' +
      fmtNumAr(st.ventas) +
      ' (EFT $' +
      fmtNumAr(st.ef) +
      ' · MP $' +
      fmtNumAr(st.mp) +
      ')\nEgresos: $' +
      fmtNumAr(st.gTotal) +
      '\nResultado: $' +
      fmtNumAr(st.resultado);
    if (snap.arqueo) {
      msg +=
        '\n\nControl de caja:\n' +
        'EF contado $' +
        fmtNumAr(snap.arqueo.efContado) +
        ' (' +
        demoArqueoDiffMeta(snap.arqueo.efDiff, 'cierre').text +
        ')\n' +
        'MP contado $' +
        fmtNumAr(snap.arqueo.mpContado) +
        ' (' +
        demoArqueoDiffMeta(snap.arqueo.mpDiff, 'cierre').text +
        ')';
      if (snap.arqueo.notaEf) msg += '\nObs EF: ' + snap.arqueo.notaEf;
      if (snap.arqueo.notaMp) msg += '\nObs MP: ' + snap.arqueo.notaMp;
    }
    msg += '\n\n(Demo: no guarda en Supabase; muestra ticket e impresión.)';
    if ($('cierre-confirm-text')) $('cierre-confirm-text').textContent = msg;
    if ($('cierre-confirm-modal')) $('cierre-confirm-modal').classList.remove('hidden');
  }

  function closeDemoCierreConfirmModalOnly() {
    if ($('cierre-confirm-modal')) $('cierre-confirm-modal').classList.add('hidden');
  }

  function closeDemoCierreConfirm() {
    closeDemoCierreConfirmModalOnly();
    demoPendingCierre = null;
  }

  function commitDemoCierre() {
    closeDemoCierreConfirmModalOnly();
    var snap = demoPendingCierre;
    demoPendingCierre = null;
    if (!snap) return;
    var cierreId = 'DEMO-' + today.replace(/-/g, '') + '-001';
    var cierreIso = new Date().toISOString();
    var html = buildDemoCierreResumenHtml(snap, cierreId, cierreIso);
    if ($('cierre-resumen-content')) $('cierre-resumen-content').innerHTML = html;
    if ($('cierre-resumen-modal')) $('cierre-resumen-modal').classList.remove('hidden');
    demoCierresHistorial.unshift({
      id: cierreId,
      cerrado_at: cierreIso,
      periodo_desde: today,
      periodo_hasta: today,
      ventas_total: snap.st.ventas,
      efectivo: snap.st.ef,
      mercado_pago: snap.st.mp,
      notas: '',
      snapshot_json: JSON.stringify(snap),
    });
    setTimeout(function () {
      printDemoCierreResumen();
    }, 400);
    setCajaSidebarTeaser(false);
  }

  function closeDemoCierreResumen() {
    if ($('cierre-resumen-modal')) $('cierre-resumen-modal').classList.add('hidden');
  }

  function bindTheme() {
    function toggle() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'dark');
      try {
        localStorage.setItem('brava_admin_theme', dark ? 'light' : 'dark');
      } catch (e) {}
    }
    if ($('theme-toggle-app')) $('theme-toggle-app').onclick = toggle;
  }

  document.querySelectorAll('.tabs .tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActiveTab(btn.getAttribute('data-estado'));
    });
  });

  if ($('btn-open-proformas')) $('btn-open-proformas').onclick = openProformasModal;
  if ($('btn-open-cierre-historial')) $('btn-open-cierre-historial').onclick = openDemoCierreHistorialModal;
  if ($('btn-open-caja-panel')) $('btn-open-caja-panel').onclick = openCajaPanelModal;
  if ($('btn-add-ingreso')) $('btn-add-ingreso').onclick = openIngresoModal;
  if ($('btn-add-gasto')) $('btn-add-gasto').onclick = openGastoModal;
  if ($('i-cancel')) $('i-cancel').onclick = closeIngresoModal;
  if ($('g-cancel')) $('g-cancel').onclick = closeGastoModal;
  if ($('ingreso-modal')) {
    $('ingreso-modal').addEventListener('click', function (e) {
      if (e.target === $('ingreso-modal')) closeIngresoModal();
    });
  }
  if ($('gasto-modal')) {
    $('gasto-modal').addEventListener('click', function (e) {
      if (e.target === $('gasto-modal')) closeGastoModal();
    });
  }
  if ($('i-save')) {
    $('i-save').onclick = function () {
      var concepto = ($('i-concepto') && $('i-concepto').value.trim()) || '';
      var monto = parseFloat(($('i-monto') && $('i-monto').value) || '', 10);
      var cobro = ($('i-cobro') && $('i-cobro').value) || 'efectivo';
      if (!concepto || !monto || monto <= 0) {
        alert('Completá concepto y monto.');
        return;
      }
      demoMovs.unshift({
        kind: 'ing',
        concepto: concepto,
        monto: monto,
        cobro: cobro,
        sub: ingresoCobroDemoLabel(cobro),
      });
      recalcDemoCaja();
      closeIngresoModal();
    };
  }
  if ($('g-save')) {
    $('g-save').onclick = function () {
      var concepto = ($('g-concepto') && $('g-concepto').value.trim()) || '';
      var monto = parseFloat(($('g-monto') && $('g-monto').value) || '', 10);
      var pagado = ($('g-pagado') && $('g-pagado').value) || '';
      if (!concepto || !monto || monto <= 0) {
        alert('Completá concepto y monto.');
        return;
      }
      if (pagado !== 'efectivo' && pagado !== 'transferencia') {
        alert('Elegí si salió de Efectivo o Mercado Pago.');
        return;
      }
      demoMovs.unshift({ kind: 'eg', concepto: concepto, monto: monto, cobro: '', pagado: pagado, sub: '' });
      recalcDemoCaja();
      closeGastoModal();
    };
  }
  if ($('btn-sidebar-abrir-caja')) $('btn-sidebar-abrir-caja').onclick = demoAbrirCaja;
  if ($('btn-abrir-caja')) $('btn-abrir-caja').onclick = demoAbrirCaja;
  if ($('btn-turno-abrir')) $('btn-turno-abrir').onclick = demoAbrirCaja;
  if ($('btn-turno-cerrar')) $('btn-turno-cerrar').onclick = openDemoCierreArqueo;
  if ($('stock-apertura-cancel')) $('stock-apertura-cancel').onclick = closeDemoStockModal;
  if ($('stock-apertura-ok')) $('stock-apertura-ok').onclick = confirmDemoStockModal;
  if ($('stock-apertura-modal')) {
    $('stock-apertura-modal').addEventListener('click', function (e) {
      if (e.target === $('stock-apertura-modal')) closeDemoStockModal();
    });
  }
  if ($('btn-stock-recontar')) {
    $('btn-stock-recontar').onclick = function () {
      if (!demoCajaAbierta) {
        alert('Abrí la caja antes de recontar stock.');
        return;
      }
      openDemoStockModal('recontar');
    };
  }
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
      demoAdjustStockKey(key, d);
    };
  });
  if ($('caja-panel-close')) $('caja-panel-close').onclick = closeCajaPanelModal;
  if ($('caja-panel-modal')) {
    $('caja-panel-modal').addEventListener('click', function (e) {
      if (e.target === $('caja-panel-modal')) closeCajaPanelModal();
    });
  }
  if ($('prof-close')) $('prof-close').onclick = closeProformasModal;
  if ($('proformas-modal')) {
    $('proformas-modal').addEventListener('click', function (e) {
      if (e.target === $('proformas-modal')) closeProformasModal();
    });
  }
  if ($('prof-aplicar')) $('prof-aplicar').onclick = renderProformasTable;
  if ($('prof-limpiar')) {
    $('prof-limpiar').onclick = function () {
      $('prof-buscar').value = '';
      $('prof-desde').value = '';
      $('prof-hasta').value = '';
      selectedArchiveId = null;
      renderProfComanda(null);
      renderProformasTable();
    };
  }
  if ($('prof-buscar')) {
    $('prof-buscar').addEventListener('input', renderProformasTable);
  }
  if ($('prof-desde')) $('prof-desde').addEventListener('change', renderProformasTable);
  if ($('prof-hasta')) $('prof-hasta').addEventListener('change', renderProformasTable);
  if ($('prof-print')) {
    $('prof-print').onclick = function () {
      if (!selectedArchiveRow || !window.BravaComanda || !window.BravaComanda.printOrderTicket) return;
      window.BravaComanda.printOrderTicket(selectedArchiveRow.order);
    };
  }

  if ($('cohist-close')) $('cohist-close').onclick = closeDemoCierreHistorialModal;
  if ($('cohist-print')) $('cohist-print').onclick = printDemoCierreHistorial;
  if ($('cohist-aplicar')) $('cohist-aplicar').onclick = renderDemoCierreHistTable;
  if ($('cohist-limpiar')) {
    $('cohist-limpiar').onclick = function () {
      if ($('cohist-buscar')) $('cohist-buscar').value = '';
      if ($('cohist-desde')) $('cohist-desde').value = '';
      if ($('cohist-hasta')) $('cohist-hasta').value = '';
      selectedDemoCierreHistId = null;
      renderDemoCierreHistPreview(null);
      renderDemoCierreHistTable();
    };
  }
  if ($('cohist-buscar')) $('cohist-buscar').addEventListener('input', renderDemoCierreHistTable);
  if ($('cohist-desde')) $('cohist-desde').addEventListener('change', renderDemoCierreHistTable);
  if ($('cohist-hasta')) $('cohist-hasta').addEventListener('change', renderDemoCierreHistTable);
  if ($('cierre-historial-modal')) {
    $('cierre-historial-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-historial-modal')) closeDemoCierreHistorialModal();
    });
  }

  if ($('btn-cierre-caja')) $('btn-cierre-caja').onclick = openDemoCierreArqueo;
  if ($('cierre-arqueo-cancel')) $('cierre-arqueo-cancel').onclick = cancelDemoCierreArqueo;
  if ($('cierre-arqueo-ok')) $('cierre-arqueo-ok').onclick = confirmDemoCierreArqueo;
  if ($('cierre-arqueo-modal')) {
    $('cierre-arqueo-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-arqueo-modal')) cancelDemoCierreArqueo();
    });
  }
  ['arqueo-ef-contado', 'arqueo-mp-contado'].forEach(function (id) {
    var inp = $(id);
    if (inp) {
      inp.addEventListener('input', updateDemoCashArqueoDiffUI);
      inp.addEventListener('change', updateDemoCashArqueoDiffUI);
    }
  });
  if ($('cierre-confirm-cancel')) $('cierre-confirm-cancel').onclick = closeDemoCierreConfirm;
  if ($('cierre-confirm-ok')) $('cierre-confirm-ok').onclick = commitDemoCierre;
  if ($('cierre-resumen-close')) $('cierre-resumen-close').onclick = closeDemoCierreResumen;
  if ($('cierre-resumen-print')) $('cierre-resumen-print').onclick = printDemoCierreResumen;
  if ($('cierre-confirm-modal')) {
    $('cierre-confirm-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-confirm-modal')) closeDemoCierreConfirm();
    });
  }
  if ($('cierre-resumen-modal')) {
    $('cierre-resumen-modal').addEventListener('click', function (e) {
      if (e.target === $('cierre-resumen-modal')) closeDemoCierreResumen();
    });
  }

  mockSidebar();
  bindTheme();
  setActiveTab('pendiente');
})();
