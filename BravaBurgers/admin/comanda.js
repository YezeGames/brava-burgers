(function (global) {
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
    return (it.acl || it.aclaraciones || it.aclaracion || it.ACL || '').trim();
  }

  function itemVariedad(it) {
    return (it.variedad || it.var || '').trim();
  }

  function isSinExtraVariedad(nombre) {
    var n = String(nombre || '')
      .toLowerCase()
      .trim();
    return n === 'sin extra' || n === 'sin extras';
  }

  /** "Sin: A, B · nota libre" → una sola línea Acl: para cocina */
  function splitAclaracionesComanda(acl) {
    var raw = String(acl || '').trim();
    if (!raw) return { sin: '', nota: '' };
    var parts = raw.split(/\s*·\s*/);
    var sin = '';
    var notas = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (/^Sin:/i.test(p)) sin = p.replace(/^Sin:\s*/i, '').trim();
      else notas.push(p);
    });
    if (!sin && /^Sin:/i.test(raw)) {
      sin = raw.replace(/^Sin:\s*/i, '').trim();
      notas = [];
    }
    return { sin: sin, nota: notas.join(' · ') };
  }

  function formatAclLineComanda(acl) {
    var raw = String(acl || '').trim();
    if (!raw) return '';
    var p = splitAclaracionesComanda(raw);
    var out = '';
    if (p.sin) {
      var items = p.sin
        .split(',')
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      out = items
        .map(function (ing) {
          if (/^sin\s/i.test(ing)) {
            return ing.charAt(0).toUpperCase() + ing.slice(1);
          }
          return 'Sin ' + ing;
        })
        .join(', ');
      out += '.';
    }
    if (p.nota) {
      out += (out ? ' ' : '') + p.nota;
    }
    if (!out) return raw;
    return out;
  }

  function itemUnitPrecio(it) {
    var p = parseFloat(it.precio);
    if (isNaN(p)) p = 0;
    var ad = parseFloat(it.adicionales);
    if (!isNaN(ad) && ad > 0) p += ad;
    return p;
  }

  function renderItemsHtml(items) {
    if (!items.length) {
      return '<div class="item"><div class="item-name">(Sin ítems en el pedido)</div></div>';
    }
    var html = '';
    items.forEach(function (it) {
      var qty = itemQty(it);
      var precio = itemUnitPrecio(it);
      var lineTotal = qty * precio;
      var variedad = itemVariedad(it);
      var acl = itemAcl(it);
      var aclLine = formatAclLineComanda(acl);
      html += '<div class="item">';
      html += '<div class="item-name">' + esc(qty) + ' x ' + esc(itemName(it)) + '</div>';
      if (variedad && !isSinExtraVariedad(variedad)) {
        html += '<div class="item-detail item-extras">Extras: ' + esc(variedad) + '</div>';
      }
      if (aclLine) {
        html += '<div class="item-aclaracion">Acl: ' + esc(aclLine) + '</div>';
      }
      html += '<div class="row"><span></span><span>Subtotal ' + esc(fmtMoney(lineTotal)) + '</span></div>';
      html += '</div>';
    });
    return html;
  }

  function renderTicketHtml(order) {
    var items = parseItems(order);
    var sub = Number(order.subtotal);
    if (isNaN(sub) || sub <= 0) {
      sub = 0;
      items.forEach(function (it) {
        sub += itemQty(it) * itemUnitPrecio(it);
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
      '<div class="comanda-top">' +
      '<div class="brand">BRAVA BURGERS</div>' +
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
      '</div></div>' +
      '<div class="comanda-body">' +
      '<div class="line"></div>' +
      '<div class="section-title">Cliente</div>' +
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
      '<div class="section-title">Ítems</div>' +
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
      '</div>' +
      '<div class="comanda-foot">Documento no válido como factura</div>'
    );
  }

  function readStoredOrder() {
    var raw = null;
    try {
      raw = localStorage.getItem('brava_comanda_print');
      var at = parseInt(localStorage.getItem('brava_comanda_print_at') || '0', 10);
      if (raw && at && Date.now() - at > 15 * 60 * 1000) raw = null;
    } catch (e) {}
    if (!raw) {
      try {
        raw = sessionStorage.getItem('brava_comanda_print');
      } catch (e2) {}
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e3) {
      return null;
    }
  }

  function storeOrderForPrint(order) {
    var payload = JSON.stringify(order);
    try {
      localStorage.setItem('brava_comanda_print', payload);
      localStorage.setItem('brava_comanda_print_at', String(Date.now()));
    } catch (e) {}
    try {
      sessionStorage.setItem('brava_comanda_print', payload);
    } catch (e2) {}
  }

  global.BravaComanda = {
    renderTicketHtml: renderTicketHtml,
    readStoredOrder: readStoredOrder,
    storeOrderForPrint: storeOrderForPrint,
  };

  function showStandaloneError(msg) {
    var err = $('bar-err');
    if (err) {
      err.textContent = msg;
      err.classList.remove('hidden');
    }
    var root = $('ticket-root');
    if (root) root.innerHTML = '<div class="center">No hay datos de comanda.</div>';
  }

  function initStandalonePage() {
    if (!$('ticket-root')) return;
    var order = readStoredOrder();
    if (!order || !order.orn) {
      var params = new URLSearchParams(window.location.search);
      showStandaloneError(
        params.get('orn')
          ? 'Usá Ticket en el panel admin (misma pestaña). Si abrís comanda.html aparte, recargá el admin con Ctrl+Shift+R.'
          : 'Abrí el ticket desde el panel admin (Órdenes → Ticket).'
      );
      return;
    }
    document.title = 'Comanda ' + order.orn;
    if ($('bar-title')) $('bar-title').textContent = 'Comanda ' + order.orn;
    $('ticket-root').innerHTML = renderTicketHtml(order);
    if ($('btn-print')) {
      $('btn-print').onclick = function () {
        window.print();
      };
    }
  }

  initStandalonePage();
})(typeof window !== 'undefined' ? window : this);
