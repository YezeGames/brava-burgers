(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    var x = Number(n) || 0;
    return '$' + x.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function fmtFecha(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return (
      dias[d.getDay()] +
      ' ' +
      d.toLocaleDateString('es-AR') +
      '  ' +
      d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function parseItems(order) {
    var items = order.items;
    if (Array.isArray(items) && items.length) return items;
    if (order.items_json) {
      try {
        var j = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
        if (Array.isArray(j)) return j;
      } catch (e) {}
    }
    return [];
  }

  function itemQty(it) {
    var q = it.qty != null ? it.qty : it.cantidad;
    q = parseFloat(q);
    return isNaN(q) || q <= 0 ? 1 : q;
  }

  function itemName(it) {
    return it.nombre || it.name || 'Ítem';
  }

  function itemAcl(it) {
    return (it.acl || it.aclaraciones || '').trim();
  }

  function itemVariedad(it) {
    return (it.variedad || '').trim();
  }

  function itemPrecio(it) {
    var p = parseFloat(it.precio);
    return isNaN(p) ? 0 : p;
  }

  function renderItemsHtml(items) {
    if (!items.length) {
      return '<div class="item"><div class="item-name">(Sin ítems en el pedido)</div></div>';
    }
    var html = '';
    items.forEach(function (it) {
      var qty = itemQty(it);
      var precio = itemPrecio(it);
      var lineTotal = qty * precio;
      var variedad = itemVariedad(it);
      var acl = itemAcl(it);
      html += '<div class="item">';
      html += '<div class="item-name">' + esc(qty) + ' x ' + esc(itemName(it)) + '</div>';
      if (variedad) {
        html += '<div class="item-detail">(' + esc(variedad) + ')</div>';
      }
      if (acl) {
        html += '<div class="item-aclaracion">Acl.: ' + esc(acl) + '</div>';
      }
      html += '<div class="row"><span></span><span>Subtotal ' + esc(fmtMoney(lineTotal)) + '</span></div>';
      html += '</div>';
    });
    return html;
  }

  function renderTicket(order) {
    var items = parseItems(order);
    var sub = Number(order.subtotal);
    if (isNaN(sub) || sub <= 0) {
      sub = 0;
      items.forEach(function (it) {
        sub += itemQty(it) * itemPrecio(it);
      });
    }
    var envio = Number(order.envio) || 0;
    var total = Number(order.total);
    if (isNaN(total)) total = sub + envio;

    var zonaLine = order.zona ? 'Zona: ' + esc(order.zona) : '';
    var pisoLine = order.piso ? esc(order.piso) : '';
    var locLine = [order.localidad, pisoLine].filter(Boolean).join(' — ');

    var editNote = '';
    if (String(order.modificado || '').toUpperCase() === 'SI') {
      editNote =
        '<div class="edit-note">*** COMANDA EDITADA ' +
        esc(fmtFecha(order.modificado_at)) +
        ' ***</div>';
    }

    var envioLabel = envio > 0 ? 'Envío' + (order.zona ? ' (' + esc(order.zona) + ')' : '') : 'Envío';

    return (
      '<div class="center line-solid"><div class="brand">BRAVA BURGERS</div></div>' +
      '<div class="meta">' +
      '<div>Pedido: <span class="bold">' +
      esc(order.orn || '—') +
      '</span></div>' +
      '<div>Fecha: ' +
      esc(fmtFecha(order.fecha_creado)) +
      '</div>' +
      (order.turno ? '<div>Turno: ' + esc(order.turno) + '</div>' : '') +
      '<div>Tipo: DELIVERY</div>' +
      editNote +
      '</div>' +
      '<div class="line"></div>' +
      '<div class="section-title">CLIENTE</div>' +
      '<div>' +
      esc(order.cliente || '—') +
      '</div>' +
      '<div>Tel: ' +
      esc(order.telefono || '—') +
      '</div>' +
      (order.direccion ? '<div>' + esc(order.direccion) + '</div>' : '') +
      (locLine ? '<div>' + locLine + '</div>' : '') +
      (zonaLine ? '<div>' + zonaLine + '</div>' : '') +
      '<div class="line"></div>' +
      '<div class="section-title">ÍTEMS</div>' +
      renderItemsHtml(items) +
      '<div class="line"></div>' +
      '<div class="row"><span>Subtotal productos</span><span>' +
      esc(fmtMoney(sub)) +
      '</span></div>' +
      (envio > 0
        ? '<div class="row"><span>' + envioLabel + '</span><span>' + esc(fmtMoney(envio)) + '</span></div>'
        : '') +
      '<div class="line"></div>' +
      '<div class="pago-line">Medio de pago: ' +
      esc(order.pago || '—') +
      '</div>' +
      '<div class="row total-row"><span>TOTAL</span><span>' +
      esc(fmtMoney(total)) +
      '</span></div>' +
      '<div class="line-solid"></div>' +
      '<div class="footer-note">Documento no válido como factura</div>'
    );
  }

  function showError(msg) {
    $('bar-err').textContent = msg;
    $('bar-err').classList.remove('hidden');
    $('ticket-root').innerHTML = '<div class="center">No hay datos de comanda.</div>';
  }

  function load() {
    var raw = sessionStorage.getItem('brava_comanda_print');
    if (!raw) {
      showError('Abrí el ticket desde el panel admin (Órdenes → Ticket).');
      return;
    }
    var order;
    try {
      order = JSON.parse(raw);
    } catch (e) {
      showError('Datos de pedido inválidos.');
      return;
    }
    if (!order || !order.orn) {
      showError('Falta el número de pedido (ORN).');
      return;
    }
    document.title = 'Comanda ' + order.orn;
    $('bar-title').textContent = 'Comanda ' + order.orn;
    $('ticket-root').innerHTML = renderTicket(order);
    $('btn-print').onclick = function () {
      window.print();
    };
  }

  load();
})();
