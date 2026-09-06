(function () {
  'use strict';

  var SHEET_ID = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';
  var apiFn = null;
  var getToken = function () {
    return '';
  };
  var canEmit = function () {
    return false;
  };
  var blockedMessage = function () {
    return 'Abrí la caja para emitir pedidos manuales.';
  };

  var catalogo = [];
  var catalogLoading = null;
  var state = {
    cliente: null,
    items: [],
    nota: '',
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return '$ ' + (n || 0).toLocaleString('es-AR');
  }

  function normTel(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function hide(el) {
    if (el) el.classList.add('hidden');
  }

  function show(el) {
    if (el) el.classList.remove('hidden');
  }

  function limpiarPrecio(precio) {
    if (precio === undefined || precio === null || precio === '') return 0;
    return parseInt(String(precio).replace(/[^0-9]/g, ''), 10) || 0;
  }

  function isAgotado(val) {
    var s = String(val || '')
      .toLowerCase()
      .trim();
    return s === 'si' || s === 'sí';
  }

  function isOcultar(val) {
    var s = String(val || '')
      .toLowerCase()
      .trim();
    return s === 'si' || s === 'sí';
  }

  function rowVal(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function loadCatalogo() {
    if (catalogo.length) return Promise.resolve(catalogo);
    if (catalogLoading) return catalogLoading;
    if (typeof Papa === 'undefined') return Promise.resolve([]);
    var base =
      'https://docs.google.com/spreadsheets/d/' +
      SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=';
    catalogLoading = Promise.all([
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
      fetch(base + encodeURIComponent('configuracion'))
        .then(function (r) {
          return r.text();
        })
        .catch(function () {
          return '';
        }),
    ])
      .then(function (parts) {
        var list = [];
        var prodParsed = Papa.parse(parts[0], { header: true, skipEmptyLines: true });
        (prodParsed.data || []).forEach(function (row, idx) {
          var nombre = rowVal(row, ['nombre', 'Nombre']);
          if (!nombre || isOcultar(rowVal(row, ['ocultar', 'Ocultar']))) return;
          if (isAgotado(rowVal(row, ['agotado', 'Agotado']))) return;
          var code = rowVal(row, ['atajo', 'Atajo']) || String(100 + idx * 100);
          list.push({
            code: code,
            nombre: nombre,
            precio: limpiarPrecio(row.precio || row.Precio),
            tipo: 'producto',
          });
        });
        if (parts[1]) {
          var extraParsed = Papa.parse(parts[1], { header: true, skipEmptyLines: true });
          (extraParsed.data || []).forEach(function (row, idx) {
            var nombre = rowVal(row, ['nombre', 'Nombre']);
            if (!nombre || isOcultar(rowVal(row, ['ocultar', 'Ocultar']))) return;
            if (isAgotado(rowVal(row, ['agotado', 'Agotado']))) return;
            var code = rowVal(row, ['atajo', 'Atajo']) || String(501 + idx);
            list.push({
              code: code,
              nombre: nombre,
              precio: limpiarPrecio(row.precio || row.Precio),
              tipo: 'extra',
            });
          });
        }
        if (parts[2]) {
          var cfgParsed = Papa.parse(parts[2], { header: true, skipEmptyLines: true });
          var cfg = (cfgParsed.data || [])[0] || {};
          var i = 1;
          while (i <= 12) {
            var zona =
              cfg['Zona ' + i + ' - Nombre'] ||
              cfg['Zona ' + i + ' - Titulo'] ||
              cfg['Zona ' + i + ' - Título'] ||
              '';
            var costo =
              cfg['Zona ' + i + ' - Costo de envio'] ||
              cfg['Zona ' + i + ' - Costo de envío'] ||
              '';
            if (zona && costo) {
              list.push({
                code: String(600 + i),
                nombre: 'Envío ' + String(zona).trim(),
                precio: limpiarPrecio(costo),
                tipo: 'envio',
                zona: String(zona).trim(),
              });
            }
            i += 1;
          }
        }
        catalogo = list;
        return list;
      })
      .catch(function () {
        catalogo = [];
        return [];
      })
      .finally(function () {
        catalogLoading = null;
      });
    return catalogLoading;
  }

  function api(body) {
    if (!apiFn) return Promise.reject(new Error('api_not_ready'));
    body.token = getToken();
    return apiFn(body);
  }

  function parseProductQuery(raw) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    var lead = raw.match(/^(\d+)/);
    if (lead) return lead[1];
    var beforeDash = raw.split(/\s*[—–-]\s*/)[0].trim();
    if (/^\d+$/.test(beforeDash)) return beforeDash;
    return raw.toLowerCase();
  }

  function findCatalogItem(raw) {
    var q = parseProductQuery(raw);
    if (!q) return null;
    var byCode = catalogo.find(function (p) {
      return p.code === q;
    });
    if (byCode) return byCode;
    return (
      catalogo.find(function (p) {
        return p.nombre.toLowerCase().indexOf(q) !== -1;
      }) || null
    );
  }

  function clienteFromApi(c) {
    if (!c) return null;
    return {
      tel: c.telefono || c.tel || '',
      nombre: c.nombre || '',
      dir: c.direccion || c.dir || '',
      loc: c.localidad || c.loc || '',
      piso: c.piso || '',
    };
  }

  function subtotalItems() {
    return state.items.reduce(function (s, it) {
      var unit = (it.precio || 0) + (it.adicionales || 0);
      return s + it.qty * unit;
    }, 0);
  }

  function lineSubtotal(it) {
    return it.qty * ((it.precio || 0) + (it.adicionales || 0));
  }

  function syncClienteField() {
    var telInp = $('pm-tel-buscar');
    var loaded = $('pm-cliente-loaded');
    if (!state.cliente) {
      show(telInp);
      hide(loaded);
      if (loaded) loaded.textContent = '';
      updateEmisionStatus();
      return;
    }
    if (telInp) telInp.value = state.cliente.tel;
    if (loaded) {
      loaded.innerHTML =
        '<strong>' +
        state.cliente.nombre +
        '</strong> · ' +
        state.cliente.tel +
        ' · ' +
        (state.cliente.dir || '—') +
        ', ' +
        (state.cliente.loc || '') +
        (state.cliente.piso ? ' · ' + state.cliente.piso : '');
      loaded.title = 'Clic para editar cliente';
    }
    hide(telInp);
    show(loaded);
    updateEmisionStatus();
  }

  function updateEmisionStatus() {
    var el = $('pm-emision-status');
    if (!el) return;
    var missing = [];
    if (!state.cliente) missing.push('cliente (tel + Enter o 🔍 — si no está, se abre el alta)');
    if (!state.items.length) missing.push('al menos un producto (+ Agregar)');
    if (!missing.length) {
      el.className = 'emision-status ok';
      el.textContent = 'Listo para emitir · Total ' + fmt(subtotalItems());
      if ($('pm-btn-emitir')) $('pm-btn-emitir').disabled = false;
      return;
    }
    el.className = 'emision-status warn';
    el.textContent = 'Falta: ' + missing.join(' · ');
    if ($('pm-btn-emitir')) $('pm-btn-emitir').disabled = true;
  }

  function splitItemLine(idx) {
    var it = state.items[idx];
    if (!it || it.qty <= 1) return;
    var acl = it.acl || '';
    it.qty -= 1;
    it.acl = '';
    state.items.splice(idx + 1, 0, {
      qty: 1,
      nombre: it.nombre,
      code: it.code,
      tipo: it.tipo,
      zona: it.zona,
      variedad: it.variedad,
      acl: acl,
      precio: it.precio,
      adicionales: it.adicionales || 0,
    });
    renderItems();
  }

  function renderItems() {
    var tbody = $('pm-items-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.items.forEach(function (it, idx) {
      var tr = document.createElement('tr');
      var sub = lineSubtotal(it);
      var tipoTag =
        it.tipo === 'extra'
          ? ' <span class="badge-wa">extra</span>'
          : it.tipo === 'envio'
            ? ' <span class="badge-envio">envío</span>'
            : '';

      var tdQty = document.createElement('td');
      var qtyWrap = document.createElement('div');
      qtyWrap.className = 'qty-ctrl';
      var btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.textContent = '−';
      btnMinus.setAttribute('data-d', '-1');
      btnMinus.setAttribute('data-i', String(idx));
      var qtySpan = document.createElement('span');
      qtySpan.textContent = String(it.qty);
      var btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.textContent = '+';
      btnPlus.setAttribute('data-d', '1');
      btnPlus.setAttribute('data-i', String(idx));
      qtyWrap.appendChild(btnMinus);
      qtyWrap.appendChild(qtySpan);
      qtyWrap.appendChild(btnPlus);
      if (it.qty > 1) {
        var btnSplit = document.createElement('button');
        btnSplit.type = 'button';
        btnSplit.className = 'btn-split';
        btnSplit.title = 'Separar 1 unidad';
        btnSplit.textContent = '1↗';
        btnSplit.setAttribute('data-split', String(idx));
        qtyWrap.appendChild(btnSplit);
      }
      tdQty.appendChild(qtyWrap);

      var tdProd = document.createElement('td');
      tdProd.innerHTML = it.nombre + (it.code ? ' <small>(' + it.code + ')</small>' : '') + tipoTag;

      var tdAcl = document.createElement('td');
      var aclInp = document.createElement('input');
      aclInp.type = 'text';
      aclInp.className = 'item-acl-input';
      aclInp.placeholder = 'Aclaración…';
      aclInp.value = it.acl || '';
      aclInp.addEventListener('input', function () {
        state.items[idx].acl = aclInp.value.trim();
      });

      var tdSub = document.createElement('td');
      tdSub.textContent = fmt(sub);

      var tdDel = document.createElement('td');
      var btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'icon-btn';
      btnDel.setAttribute('data-del', String(idx));
      btnDel.innerHTML = '<i class="fas fa-trash"></i>';

      tdAcl.appendChild(aclInp);
      tdDel.appendChild(btnDel);
      tr.appendChild(tdQty);
      tr.appendChild(tdProd);
      tr.appendChild(tdAcl);
      tr.appendChild(tdSub);
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });
    if ($('pm-emision-total')) $('pm-emision-total').textContent = fmt(subtotalItems());

    tbody.querySelectorAll('[data-d]').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var d = parseInt(btn.getAttribute('data-d'), 10);
        state.items[i].qty = Math.max(1, state.items[i].qty + d);
        renderItems();
      };
    });
    tbody.querySelectorAll('[data-split]').forEach(function (btn) {
      btn.onclick = function () {
        splitItemLine(parseInt(btn.getAttribute('data-split'), 10));
      };
    });
    tbody.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.onclick = function () {
        state.items.splice(parseInt(btn.getAttribute('data-del'), 10), 1);
        renderItems();
      };
    });
    updateEmisionStatus();
  }

  function resetEmision() {
    state.cliente = null;
    state.items = [];
    state.nota = '';
    if ($('pm-tel-buscar')) $('pm-tel-buscar').value = '';
    if ($('pm-nota-pedido')) $('pm-nota-pedido').value = '';
    syncClienteField();
    renderItems();
  }

  function openEmision() {
    if (!canEmit()) {
      alert(blockedMessage());
      return;
    }
    loadCatalogo().then(function () {
      show($('modal-emision-manual'));
      setTimeout(function () {
        var tel = $('pm-tel-buscar');
        if (tel) tel.focus();
      }, 80);
    });
  }

  function closeEmision() {
    hide($('modal-emision-manual'));
    hideProductoSuggest();
  }

  function openClienteModal(existing) {
    if ($('pm-cli-tel')) $('pm-cli-tel').value = existing ? existing.tel : $('pm-tel-buscar').value || '';
    if ($('pm-cli-nombre')) $('pm-cli-nombre').value = existing ? existing.nombre : '';
    if ($('pm-cli-dir')) $('pm-cli-dir').value = existing ? existing.dir : '';
    if ($('pm-cli-loc')) $('pm-cli-loc').value = existing ? existing.loc : '';
    if ($('pm-cli-piso')) $('pm-cli-piso').value = existing ? existing.piso : '';
    if ($('pm-modal-cliente-sub')) {
      $('pm-modal-cliente-sub').textContent = existing
        ? 'Modificá los datos del cliente en agenda.'
        : 'Cliente nuevo — completá teléfono, nombre y dirección.';
    }
    show($('modal-cliente-manual'));
  }

  function itemsToComandaRows() {
    return state.items.map(function (it) {
      return {
        cantidad: it.qty,
        nombre: it.nombre,
        variedad: it.variedad || 'Sin extra',
        acl: it.acl || '',
        precio: String(it.precio),
        adicionales: it.adicionales || 0,
        tipo: it.tipo,
        zona: it.zona || '',
      };
    });
  }

  function calcTotalConAjuste() {
    var sub = subtotalItems();
    var tipo = $('pm-ajuste-tipo') ? $('pm-ajuste-tipo').value : '';
    var val = $('pm-ajuste-val') ? parseFloat($('pm-ajuste-val').value) || 0 : 0;
    var motivo = $('pm-ajuste-motivo') ? $('pm-ajuste-motivo').value.trim() : '';
    var total = sub;
    var label = '';
    if (tipo === 'pct-desc') {
      total = sub * (1 - val / 100);
      if (val) label = 'Descuento ' + val + '%';
    } else if (tipo === 'pesos-desc') {
      total = sub - val;
      if (val) label = 'Descuento $' + val.toLocaleString('es-AR');
    } else if (tipo === 'pct-rec') {
      total = sub * (1 + val / 100);
      if (val) label = 'Recargo ' + val + '%';
    } else if (tipo === 'pesos-rec') {
      total = sub + val;
      if (val) label = 'Recargo $' + val.toLocaleString('es-AR');
    }
    var totalRounded = Math.max(0, Math.round(total));
    return {
      sub: sub,
      total: totalRounded,
      label: label,
      ajuste_monto: totalRounded - sub,
      motivo: motivo,
    };
  }

  function getPagoPreview() {
    var cobrarEl = document.querySelector('input[name=pm-cobrar]:checked');
    if (cobrarEl && cobrarEl.value === 'no') return 'NO COBRADO';
    var p1 = parseFloat($('pm-pay1-monto').value) || 0;
    var p2 = parseFloat($('pm-pay2-monto').value) || 0;
    var m1 = $('pm-pay1-medio').value;
    var m2 = $('pm-pay2-medio').value;
    if (p2 > 0 && m2) return m1 + ' $' + p1 + ' + ' + m2 + ' $' + p2;
    return m1 || 'Efectivo';
  }

  function buildOrderForComanda(pago, orn) {
    var calc = calcTotalConAjuste();
    return {
      orn: orn || 'PEND-DEL',
      fecha_creado: new Date().toISOString(),
      cliente: state.cliente ? state.cliente.nombre : '—',
      telefono: state.cliente ? state.cliente.tel : '',
      direccion: state.cliente ? state.cliente.dir : '',
      localidad: state.cliente ? state.cliente.loc : '',
      piso: state.cliente ? state.cliente.piso : '',
      zona: '',
      envio: 0,
      turno: '',
      nota: ($('pm-nota-pedido') && $('pm-nota-pedido').value.trim()) || state.nota || '',
      pago: pago || '—',
      subtotal: calc.sub,
      total: calc.total,
      ajuste_label: calc.label,
      ajuste_monto: calc.ajuste_monto,
      ajuste_motivo: calc.motivo,
      items: itemsToComandaRows(),
    };
  }

  function togglePayBlock() {
    var cobrarEl = document.querySelector('input[name=pm-cobrar]:checked');
    var showPay = !cobrarEl || cobrarEl.value === 'si';
    if ($('pm-pay-block')) $('pm-pay-block').classList.toggle('hidden', !showPay);
  }

  function refreshProformaPreview() {
    var calc = calcTotalConAjuste();
    var order = buildOrderForComanda(getPagoPreview());
    var inner = $('pm-comanda-ticket-inner');
    if (window.BravaComanda && inner) {
      inner.innerHTML = BravaComanda.renderTicketHtml(order);
    }
    if ($('pm-proforma-total')) $('pm-proforma-total').textContent = fmt(calc.total);
    updateCobranzaPendiente();
  }

  function updateCobranzaPendiente() {
    var total = calcTotalConAjuste().total;
    var p1 = parseFloat($('pm-pay1-monto').value) || 0;
    var p2 = parseFloat($('pm-pay2-monto').value) || 0;
    var pend = total - p1 - p2;
    var el = $('pm-cobrar-pendiente');
    if (!el) return;
    var cobrarEl = document.querySelector('input[name=pm-cobrar]:checked');
    el.textContent =
      cobrarEl && cobrarEl.value === 'no'
        ? 'Sin cobro — queda NO COBRADO'
        : pend === 0
          ? '✓ Montos cubren el total'
          : 'Pendiente: ' + fmt(pend);
  }

  function buscarClienteAsync(opts) {
    opts = opts || {};
    var tel = normTel($('pm-tel-buscar') && $('pm-tel-buscar').value);
    if (!tel || tel.length < 8) {
      if (!opts.silent) alert('Ingresá un teléfono válido (mín. 8 dígitos).');
      return Promise.resolve(false);
    }
    return api({ action: 'getCliente', telefono: tel }).then(function (res) {
      if (!res.data || !res.data.ok) {
        state.cliente = null;
        syncClienteField();
        if (!opts.silent) {
          if (
            confirm(
              'No se pudo consultar la agenda (¿corriste la migración al entrar al admin?). ¿Cargar cliente manualmente?'
            )
          ) {
            openClienteModal(null);
          }
        } else if (opts.autoModal) {
          openClienteModal(null);
        }
        return false;
      }
      if (res.data.cliente) {
        state.cliente = clienteFromApi(res.data.cliente);
        syncClienteField();
        return true;
      }
      state.cliente = null;
      syncClienteField();
      if (opts.autoModal) {
        openClienteModal(null);
      } else if (!opts.silent && opts.promptNew !== false) {
        if (confirm('No está en agenda. ¿Cargar cliente nuevo con dirección?')) openClienteModal(null);
      }
      return false;
    });
  }

  function buscarClienteClick() {
    return buscarClienteAsync({ silent: false, autoModal: false, promptNew: true });
  }

  function ensureClienteBeforeEmit(done) {
    if (state.cliente) {
      done(true);
      return;
    }
    var tel = normTel($('pm-tel-buscar') && $('pm-tel-buscar').value);
    if (tel.length < 8) {
      alert('Ingresá el teléfono del cliente (mín. 8 dígitos) y completá nombre + dirección.');
      if ($('pm-tel-buscar')) $('pm-tel-buscar').focus();
      done(false);
      return;
    }
    buscarClienteAsync({ silent: true, autoModal: true, promptNew: true }).then(function (found) {
      if (found || state.cliente) done(true);
      else {
        alert('Completá nombre y dirección del cliente en el formulario que se abrió.');
        done(false);
      }
    });
  }

  function addLineFromForm() {
    var raw = $('pm-line-producto').value.trim();
    if (!raw) {
      alert('Escribí producto, extra o atajo.');
      return;
    }
    var p = findCatalogItem(raw);
    if (!p) {
      alert('No encontrado. Probá un atajo numérico o parte del nombre.');
      return;
    }
    state.items.push({
      qty: parseInt($('pm-line-qty').value, 10) || 1,
      nombre: p.nombre,
      code: p.code,
      tipo: p.tipo || 'producto',
      zona: p.zona || '',
      variedad: 'Sin extra',
      acl: $('pm-line-acl').value.trim(),
      precio: p.precio,
      adicionales: 0,
    });
    $('pm-line-producto').value = '';
    $('pm-line-acl').value = '';
    $('pm-line-qty').value = '1';
    hideProductoSuggest();
    renderItems();
  }

  var productoSuggestIdx = -1;

  function hideProductoSuggest() {
    productoSuggestIdx = -1;
    var box = $('pm-producto-suggest');
    if (!box) return;
    box.classList.add('hidden');
    box.innerHTML = '';
    box.style.transform = '';
  }

  function catalogLabel(p) {
    var tag = p.tipo === 'extra' ? ' (extra)' : p.tipo === 'envio' ? ' (envío)' : '';
    return p.code + ' — ' + p.nombre + tag;
  }

  function filterCatalogo(q) {
    q = String(q || '')
      .trim()
      .toLowerCase();
    if (!q) return [];
    var lead = q.match(/^(\d+)/);
    if (lead) {
      var code = lead[1];
      return catalogo
        .filter(function (p) {
          return p.code === code || p.code.indexOf(code) === 0;
        })
        .slice(0, 8);
    }
    return catalogo
      .filter(function (p) {
        return p.nombre.toLowerCase().indexOf(q) !== -1 || p.code.indexOf(q) !== -1;
      })
      .slice(0, 8);
  }

  function positionProductoSuggest() {
    var inp = $('pm-line-producto');
    var box = $('pm-producto-suggest');
    if (!inp || !box || box.classList.contains('hidden')) return;
    var r = inp.getBoundingClientRect();
    var gap = 4;
    var maxH = Math.min(280, window.innerHeight * 0.42);
    box.style.width = Math.max(r.width, 260) + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8) + 'px';
    box.style.maxHeight = maxH + 'px';
    var spaceBelow = window.innerHeight - r.bottom - gap;
    if (spaceBelow < 120 && r.top > spaceBelow) {
      box.style.top = r.top - gap + 'px';
      box.style.transform = 'translateY(-100%)';
    } else {
      box.style.top = r.bottom + gap + 'px';
      box.style.transform = '';
    }
  }

  function renderProductoSuggest() {
    var inp = $('pm-line-producto');
    var box = $('pm-producto-suggest');
    if (!inp || !box) return;
    var q = inp.value.trim();
    if (!q) {
      hideProductoSuggest();
      return;
    }
    var matches = filterCatalogo(q);
    if (!matches.length) {
      hideProductoSuggest();
      return;
    }
    productoSuggestIdx = -1;
    box.innerHTML = '';
    matches.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'producto-suggest-item';
      btn.textContent = catalogLabel(p);
      btn.onmousedown = function (e) {
        e.preventDefault();
        inp.value = p.code;
        hideProductoSuggest();
      };
      box.appendChild(btn);
    });
    box.classList.remove('hidden');
    positionProductoSuggest();
  }

  function showToast(msg) {
    var t = $('pm-toast');
    if (!t) return;
    t.textContent = msg;
    show(t);
    setTimeout(function () {
      hide(t);
    }, 4500);
  }

  function confirmManualOrder() {
    var calc = calcTotalConAjuste();
    var noCobrar = document.querySelector('input[name=pm-cobrar]:checked').value === 'no';
    var pago = 'NO COBRADO';
    if (!noCobrar) {
      var p1 = parseFloat($('pm-pay1-monto').value) || 0;
      var p2 = parseFloat($('pm-pay2-monto').value) || 0;
      if (Math.abs(p1 + p2 - calc.total) > 0.01) {
        alert('La suma de pagos debe igualar el total (' + fmt(calc.total) + ').');
        return;
      }
      pago = getPagoPreview();
    }
    if ($('pm-proforma-ok')) $('pm-proforma-ok').disabled = true;
    api({
      action: 'createManualOrder',
      cliente: state.cliente.nombre,
      telefono: state.cliente.tel,
      direccion: state.cliente.dir,
      localidad: state.cliente.loc,
      piso: state.cliente.piso,
      items: itemsToComandaRows(),
      subtotal: calc.sub,
      total: calc.total,
      pago: pago,
      nota_pedido: ($('pm-nota-pedido') && $('pm-nota-pedido').value.trim()) || '',
      ajuste_label: calc.label,
      ajuste_monto: calc.ajuste_monto,
      ajuste_motivo: calc.motivo,
    })
      .then(function (res) {
        if ($('pm-proforma-ok')) $('pm-proforma-ok').disabled = false;
        if (!res.data || !res.data.ok) {
          var err = (res.data && res.data.error) || 'error';
          if (err === 'turno_cupo_lleno' || err === 'turno_cerrado') {
            alert('Turno no disponible. Revisá la nota (ej. TURNO 2) o la config de turnos.');
          } else if (err === 'cliente_insert_failed' || err === 'insert_failed') {
            alert('No se pudo crear el pedido. ¿Corriste la migración manual en Supabase?');
          } else {
            alert('No se pudo crear el pedido: ' + err);
          }
          return;
        }
        var orn = res.data.orn;
        var order = buildOrderForComanda(pago, orn);
        hide($('modal-emision-confirm'));
        var imprimir =
          ($('pm-chk-imprimir-modal') && $('pm-chk-imprimir-modal').checked) ||
          ($('pm-chk-imprimir') && $('pm-chk-imprimir').checked);
        if (imprimir && window.BravaComanda) {
          BravaComanda.printOrderTicket(order);
        }
        showToast('Pedido ' + orn + ' creado · ' + pago + ' · Pendientes');
        resetEmision();
        closeEmision();
      })
      .catch(function () {
        if ($('pm-proforma-ok')) $('pm-proforma-ok').disabled = false;
        alert('Error de red al crear pedido.');
      });
  }

  function bindEvents() {
    if ($('btn-pedido-manual')) {
      $('btn-pedido-manual').onclick = openEmision;
    }
    if ($('pm-btn-cerrar-emision')) {
      $('pm-btn-cerrar-emision').onclick = function () {
        if (state.items.length || state.cliente) {
          if (!confirm('¿Cerrar emisión manual?')) return;
          resetEmision();
        }
        closeEmision();
      };
    }
    if ($('pm-btn-cancel-emision')) {
      $('pm-btn-cancel-emision').onclick = function () {
        if (confirm('¿Cancelar emisión?')) {
          resetEmision();
          closeEmision();
        }
      };
    }
    if ($('modal-emision-manual')) {
      $('modal-emision-manual').addEventListener('click', function (e) {
        if (e.target === $('modal-emision-manual')) {
          if (state.items.length || state.cliente) {
            if (!confirm('¿Cerrar emisión manual?')) return;
            resetEmision();
          }
          closeEmision();
        }
      });
    }
    if ($('pm-btn-buscar-cliente')) {
      $('pm-btn-buscar-cliente').onclick = function () {
        if (state.cliente) {
          state.cliente = null;
          syncClienteField();
          if ($('pm-tel-buscar')) $('pm-tel-buscar').focus();
          return;
        }
        buscarClienteClick();
      };
    }
    if ($('pm-cliente-loaded')) {
      $('pm-cliente-loaded').onclick = function () {
        if (state.cliente) openClienteModal(state.cliente);
      };
    }
    if ($('pm-tel-buscar')) {
      $('pm-tel-buscar').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          buscarClienteClick();
        }
      });
      $('pm-tel-buscar').addEventListener('blur', function () {
        if (state.cliente) return;
        if (normTel($('pm-tel-buscar').value).length >= 8) {
          buscarClienteAsync({ silent: true, autoModal: true, promptNew: true });
        }
      });
    }
    if ($('pm-cli-cancel')) {
      $('pm-cli-cancel').onclick = function () {
        hide($('modal-cliente-manual'));
      };
    }
    if ($('pm-cli-save')) {
      $('pm-cli-save').onclick = function () {
        var tel = normTel($('pm-cli-tel').value);
        var nombre = $('pm-cli-nombre').value.trim();
        if (!tel || !nombre) {
          alert('Teléfono y nombre son obligatorios.');
          return;
        }
        api({
          action: 'saveCliente',
          telefono: tel,
          nombre: nombre,
          direccion: $('pm-cli-dir').value.trim(),
          localidad: $('pm-cli-loc').value.trim(),
          piso: $('pm-cli-piso').value.trim(),
        }).then(function (res) {
          if (!res.data || !res.data.ok) {
            var err = (res.data && res.data.error) || '';
            if (err.indexOf('cliente') >= 0 || err.indexOf('insert') >= 0) {
              alert(
                'No se pudo guardar en agenda. Entrá de nuevo al admin para correr la migración, o revisá SUPABASE_DB_PASSWORD en Vercel.'
              );
            } else {
              alert('No se pudo guardar el cliente.');
            }
            return;
          }
          state.cliente = {
            tel: tel,
            nombre: nombre,
            dir: $('pm-cli-dir').value.trim(),
            loc: $('pm-cli-loc').value.trim(),
            piso: $('pm-cli-piso').value.trim(),
          };
          if ($('pm-tel-buscar')) $('pm-tel-buscar').value = tel;
          syncClienteField();
          hide($('modal-cliente-manual'));
        });
      };
    }
    if ($('pm-line-qty-minus')) {
      $('pm-line-qty-minus').onclick = function () {
        var n = Math.max(1, (parseInt($('pm-line-qty').value, 10) || 1) - 1);
        $('pm-line-qty').value = n;
      };
    }
    if ($('pm-line-qty-plus')) {
      $('pm-line-qty-plus').onclick = function () {
        $('pm-line-qty').value = (parseInt($('pm-line-qty').value, 10) || 1) + 1;
      };
    }
    if ($('pm-btn-add-line')) $('pm-btn-add-line').onclick = addLineFromForm;
    if ($('pm-btn-emitir')) {
      $('pm-btn-emitir').onclick = function () {
        ensureClienteBeforeEmit(function (ok) {
          if (!ok) return;
          if (!state.items.length) {
            alert('Agregá líneas con + Agregar.');
            return;
          }
          if ($('pm-ajuste-val')) $('pm-ajuste-val').value = '0';
          if ($('pm-ajuste-motivo')) $('pm-ajuste-motivo').value = '';
          var si = document.querySelector('input[name=pm-cobrar][value=si]');
          if (si) si.checked = true;
          togglePayBlock();
          var calc = calcTotalConAjuste();
          if ($('pm-pay1-monto')) $('pm-pay1-monto').value = calc.total;
          if ($('pm-pay2-monto')) $('pm-pay2-monto').value = '';
          if ($('pm-pay2-medio')) $('pm-pay2-medio').value = '';
          refreshProformaPreview();
          show($('modal-emision-confirm'));
        });
      };
    }
    ['pm-ajuste-tipo', 'pm-ajuste-val', 'pm-ajuste-motivo'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', refreshProformaPreview);
      el.addEventListener('input', refreshProformaPreview);
    });
    document.querySelectorAll('input[name=pm-cobrar]').forEach(function (r) {
      r.onchange = function () {
        togglePayBlock();
        refreshProformaPreview();
        if (r.value === 'si' && $('pm-pay1-monto')) {
          $('pm-pay1-monto').value = calcTotalConAjuste().total;
        }
      };
    });
    ['pm-pay1-monto', 'pm-pay2-monto', 'pm-pay1-medio', 'pm-pay2-medio'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', refreshProformaPreview);
      el.addEventListener('change', refreshProformaPreview);
    });
    if ($('pm-ajuste-tipo')) {
      $('pm-ajuste-tipo').onchange = function () {
        var t = $('pm-ajuste-tipo').value;
        var isPct = t.indexOf('pct') !== -1;
        if ($('pm-ajuste-suffix')) $('pm-ajuste-suffix').textContent = isPct ? '%' : '$';
        if ($('pm-ajuste-val')) $('pm-ajuste-val').max = isPct ? '100' : '999999';
        refreshProformaPreview();
      };
    }
    if ($('pm-ajuste-minus')) {
      $('pm-ajuste-minus').onclick = function () {
        var t = $('pm-ajuste-tipo').value;
        var step = t.indexOf('pct') !== -1 ? 5 : 500;
        var v = Math.max(0, (parseFloat($('pm-ajuste-val').value) || 0) - step);
        $('pm-ajuste-val').value = v;
        refreshProformaPreview();
      };
    }
    if ($('pm-ajuste-plus')) {
      $('pm-ajuste-plus').onclick = function () {
        var t = $('pm-ajuste-tipo').value;
        var step = t.indexOf('pct') !== -1 ? 5 : 500;
        $('pm-ajuste-val').value = (parseFloat($('pm-ajuste-val').value) || 0) + step;
        refreshProformaPreview();
      };
    }
    if ($('pm-proforma-cancel')) {
      $('pm-proforma-cancel').onclick = function () {
        hide($('modal-emision-confirm'));
      };
    }
    if ($('pm-proforma-ok')) $('pm-proforma-ok').onclick = confirmManualOrder;
    if ($('pm-line-producto')) {
      $('pm-line-producto').addEventListener('input', renderProductoSuggest);
      $('pm-line-producto').addEventListener('focus', function () {
        if ($('pm-line-producto').value.trim()) renderProductoSuggest();
      });
      $('pm-line-producto').addEventListener('blur', function () {
        setTimeout(hideProductoSuggest, 120);
      });
      $('pm-line-producto').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addLineFromForm();
        }
        if (e.key === 'Escape') hideProductoSuggest();
      });
    }
    var emisionScroll = document.querySelector('#modal-emision-manual .emision-modal-scroll');
    if (emisionScroll) {
      emisionScroll.addEventListener('scroll', positionProductoSuggest, { passive: true });
    }
    window.addEventListener('resize', positionProductoSuggest);
  }

  window.BravaPedidoManual = {
    init: function (opts) {
      apiFn = opts.api;
      getToken = opts.getToken || getToken;
      canEmit = opts.canEmit || canEmit;
      blockedMessage = opts.blockedMessage || blockedMessage;
      bindEvents();
      renderItems();
    },
  };
})();
