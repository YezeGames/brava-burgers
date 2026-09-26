/**
 * Admin — gratificación / cupones de compensación
 */
(function (global) {
  'use strict';

  var modalOrn = null;
  var modalOrder = null;
  var activeCuponCodigo = null;
  var reenvioOrn = null;
  var reenvioOrder = null;
  var reenvioItems = [];

  function $(id) {
    return document.getElementById(id);
  }

  function telNorm(t) {
    return String(t || '').replace(/\D/g, '').slice(-10);
  }

  function telWa(t) {
    var n = telNorm(t);
    if (!n) return '';
    if (n.length === 10) return '549' + n;
    return n;
  }

  function suggestComp(motivo) {
    if (motivo === 'faltante' || motivo === 'demora') return { tipo: 'pct', valor: 15 };
    if (motivo === 'frio') return { tipo: 'item', valor: 0 };
    if (motivo === 'item_mal') return { tipo: 'pct', valor: 20 };
    return { tipo: 'pct', valor: 10 };
  }

  function couponLabelComanda(c) {
    if (!c) return '';
    if (c.tipo === 'pct') return (c.valor || 0) + '% de descuento';
    if (c.tipo === 'monto') return '$' + Number(c.valor || 0).toLocaleString('es-AR') + ' de descuento';
    if (c.tipo === 'envio') return 'Envío gratis';
    if (c.tipo === 'item') return 'Papas Brava gratis';
    return c.tipo;
  }

  function buildPreview(order, tipo, valor) {
    var nombre = (order && order.cliente ? order.cliente : 'Cliente').split(/\s+/)[0];
    var beneficio = couponLabelComanda({ tipo: tipo, valor: valor });
    var msg1 =
      '¡' +
      nombre +
      '! Lamentamos lo de tu pedido ' +
      (order ? order.orn : '') +
      '.\n\n' +
      'Te dejamos ' +
      beneficio +
      ' en tu próximo pedido.\n' +
      'Código: BRAVA-XXXX\n' +
      'Pedí acá: https://www.bravaburgers.com.ar\n\n' +
      'Válido 1 uso · próximo sábado. 🍔';
    var msg2 =
      'Gracias por tu paciencia, ' +
      nombre +
      ' 💛\nCualquier duda respondé por acá. ¡Nos vemos en el próximo pedido!';
    return msg1 + '\n\n---\n\n' + msg2;
  }

  function updateValorField() {
    var tipo = $('comp-tipo').value;
    var wrap = $('comp-valor-wrap');
    var lab = $('comp-valor-label');
    if (tipo === 'envio' || tipo === 'item') {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    lab.textContent = tipo === 'monto' ? 'Monto ($)' : 'Porcentaje (%)';
    if (tipo === 'monto' && Number($('comp-valor').value) > 100) {
      $('comp-valor').value = 2000;
    }
  }

  function updatePreview() {
    if (!modalOrder) return;
    var tipo = $('comp-tipo').value;
    var valor = Number($('comp-valor').value) || 0;
    $('comp-wa-preview').textContent = buildPreview(modalOrder, tipo, valor);
  }

  function openModal(orn) {
    if (!global.getAdminToken || !global.findOrderByOrn) return;
    var o = global.findOrderByOrn(orn);
    if (!o) return;
    modalOrn = orn;
    modalOrder = o;
    $('comp-orn-ref').textContent = o.orn + ' · ' + (o.cliente || '') + ' · ' + (o.telefono || '');
    var sug = suggestComp('faltante');
    $('comp-motivo').value = 'faltante';
    $('comp-tipo').value = sug.tipo;
    $('comp-valor').value = sug.valor || 15;
    updateValorField();
    updatePreview();
    $('comp-modal').classList.remove('hidden');
    refreshActiveCuponForModal();
  }

  function closeModal() {
    $('comp-modal').classList.add('hidden');
    modalOrn = null;
    modalOrder = null;
    activeCuponCodigo = null;
    setActiveCuponBanner(null);
  }

  function setActiveCuponBanner(c) {
    var banner = $('comp-active-banner');
    var textEl = $('comp-active-text');
    if (!banner || !textEl) return;
    if (!c || !c.codigo) {
      banner.classList.add('hidden');
      activeCuponCodigo = null;
      textEl.textContent = '';
      return;
    }
    activeCuponCodigo = c.codigo;
    var parts = ['Cupón *' + c.codigo + '* pendiente (' + (c.label || couponLabelComanda(c)) + ')'];
    if (c.orn_origen) parts.push('Pedido ' + c.orn_origen);
    parts.push('Anulalo si fue de prueba o ya no aplica — así podés emitir otro.');
    textEl.textContent = parts.join(' · ');
    banner.classList.remove('hidden');
  }

  function refreshActiveCuponForModal() {
    if (!modalOrder || !modalOrder.telefono) {
      setActiveCuponBanner(null);
      return Promise.resolve();
    }
    return adminApi({ action: 'getCuponActivo', telefono: modalOrder.telefono }).then(function (data) {
      if (data.ok && data.compensacion) setActiveCuponBanner(data.compensacion);
      else setActiveCuponBanner(null);
    });
  }

  function anularCuponActivo(codigo) {
    if (!modalOrder) return Promise.resolve({ ok: false });
    var btn = $('comp-anular');
    if (btn) btn.disabled = true;
    return adminApi({
      action: 'anularCompensacion',
      telefono: modalOrder.telefono,
      codigo: codigo || activeCuponCodigo || '',
    })
      .then(function (data) {
        if (!data.ok) {
          alert('No se pudo anular: ' + (data.error || 'error'));
          return data;
        }
        setActiveCuponBanner(null);
        alert('Cupón ' + (data.codigo || codigo) + ' anulado. Ya podés crear uno nuevo.');
        return data;
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function adminApi(body) {
    body.token = global.getAdminToken();
    return fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function sendWa(to, text) {
    return fetch('/api/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: global.getAdminToken(), to: to, text: text }),
    }).then(function (r) {
      return r.json();
    });
  }

  function confirmGratificar() {
    if (!modalOrder || !modalOrn) return;
    var btn = $('comp-confirm');
    btn.disabled = true;
    adminApi({
      action: 'createCompensacion',
      orn: modalOrn,
      telefono: modalOrder.telefono,
      cliente: modalOrder.cliente,
      tipo: $('comp-tipo').value,
      valor: Number($('comp-valor').value) || 0,
      motivo: $('comp-motivo').value,
    })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === 'cupon_activo_existe') {
            setActiveCuponBanner({ codigo: data.codigo, label: '' });
            if (
              confirm(
                'Ya hay un cupón activo (' +
                  (data.codigo || '') +
                  '). ¿Anularlo y crear uno nuevo para este pedido?'
              )
            ) {
              return anularCuponActivo(data.codigo).then(function (an) {
                if (an && an.ok) confirmGratificar();
              });
            }
            return;
          }
          if (data.error === 'reclamo_ya_gratificado') {
            alert('Este pedido ya tiene cupón de reclamo (' + (data.codigo || '') + ').');
            return;
          }
          if (data.error === 'reclamo_ya_reenvio') {
            alert('Este pedido ya tiene reenvío (' + (data.orn || '') + '). Usá cupón o reenvío, no ambos.');
            return;
          }
          if (data.error === 'cupon_lookup_failed' || data.detail) {
            alert(
              'Error al crear cupón. ¿Ejecutaste la migración compensaciones en Supabase?\n' +
                (data.detail || data.error || '')
            );
            return;
          }
          alert('No se pudo crear el cupón: ' + (data.error || 'error'));
          return;
        }
        if (global.markCompensacionOrigen) global.markCompensacionOrigen(modalOrn);
        var codigo = data.compensacion.codigo;
        if (data.waSent && data.waFarewellSent) {
          alert('Cupón ' + codigo + ' creado. WhatsApp enviado (cupón + despedida).');
          closeModal();
          if (global.BravaWaPanel && typeof BravaWaPanel.refreshInbox === 'function') {
            BravaWaPanel.refreshInbox();
          }
          return;
        }
        if (data.waSent && !data.waFarewellSent) {
          alert(
            'Cupón ' +
              codigo +
              ' creado. Llegó el mensaje del cupón; falló la despedida: ' +
              (data.waError || 'error')
          );
          closeModal();
          return;
        }
        if (!telWa(modalOrder.telefono)) {
          alert('Cupón ' + codigo + ' creado (sin teléfono para WA).');
        } else {
          alert(
            'Cupón ' +
              codigo +
              ' creado, pero no se pudo mandar WhatsApp: ' +
              (data.waError || data.waHint || 'error')
          );
        }
        closeModal();
      })
      .catch(function () {
        alert('Error de red al crear cupón.');
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function bindUi() {
    var modal = $('comp-modal');
    if (!modal) return;
    $('comp-cancel').addEventListener('click', closeModal);
    $('comp-confirm').addEventListener('click', confirmGratificar);
    var anularBtn = $('comp-anular');
    if (anularBtn) {
      anularBtn.addEventListener('click', function () {
        if (!activeCuponCodigo) return;
        if (
          !confirm(
            '¿Anular el cupón ' +
              activeCuponCodigo +
              '? No podrá usarse en la tienda (queda marcado como usado).'
          )
        ) {
          return;
        }
        anularCuponActivo(activeCuponCodigo);
      });
    }
    $('comp-motivo').addEventListener('change', function () {
      var sug = suggestComp(this.value);
      $('comp-tipo').value = sug.tipo;
      $('comp-valor').value = sug.valor || 15;
      updateValorField();
      updatePreview();
    });
    $('comp-tipo').addEventListener('change', function () {
      updateValorField();
      updatePreview();
    });
    $('comp-valor').addEventListener('input', updatePreview);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  bindUi();

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseOrderItemsSimple(o) {
    if (!o) return [];
    if (Array.isArray(o.items) && o.items.length) return JSON.parse(JSON.stringify(o.items));
    if (!o.items_json) return [];
    try {
      var j = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json;
      return Array.isArray(j) ? JSON.parse(JSON.stringify(j)) : [];
    } catch (e) {
      return [];
    }
  }

  function reenvioItemQty(it) {
    var q = it && it.qty != null ? it.qty : it && it.cantidad;
    q = parseFloat(q);
    return isNaN(q) || q <= 0 ? 1 : q;
  }

  function reenvioItemLabel(it) {
    var name = String((it && (it.nombre || it.name)) || 'Ítem').trim();
    var parts = [];
    if (it && it.variedad) parts.push(String(it.variedad).trim());
    if (it && it.acl) parts.push(String(it.acl).trim());
    var extra = parts.length ? ' · ' + parts.join(' · ') : '';
    return name + extra;
  }

  function closeReenvioModal() {
    $('reenvio-modal').classList.add('hidden');
    reenvioOrn = null;
    reenvioOrder = null;
    reenvioItems = [];
    $('reenvio-items').innerHTML = '';
  }

  function setReenvioQty(idx, delta) {
    var wrap = $('reenvio-items');
    var row = wrap && wrap.querySelector('.reenvio-item[data-idx="' + idx + '"]');
    if (!row) return;
    var max = reenvioItemQty(reenvioItems[idx]);
    var qtyEl = row.querySelector('[data-reenvio-qty]');
    var cur = parseInt(qtyEl.textContent, 10) || 1;
    cur = Math.max(1, Math.min(max, cur + delta));
    qtyEl.textContent = String(cur);
  }

  function renderReenvioItems() {
    var box = $('reenvio-items');
    if (!box) return;
    if (!reenvioItems.length) {
      box.innerHTML = '<p class="reenvio-hint">Este pedido no tiene ítems cargados.</p>';
      return;
    }
    box.innerHTML = reenvioItems
      .map(function (it, idx) {
        var maxQty = reenvioItemQty(it);
        var label = reenvioItemLabel(it);
        var qtyCtrl =
          maxQty > 1
            ? '<div class="modal-qty reenvio-item-qty">' +
              '<button type="button" data-reenvio-minus="' +
              idx +
              '" aria-label="Menos">−</button>' +
              '<span data-reenvio-qty>' +
              maxQty +
              '</span>' +
              '<button type="button" data-reenvio-plus="' +
              idx +
              '" aria-label="Más">+</button>' +
              '</div>'
            : '<div class="modal-qty reenvio-item-qty is-disabled"><span data-reenvio-qty">1</span></div>';
        return (
          '<label class="modal-item reenvio-item" data-idx="' +
          idx +
          '">' +
          '<input type="checkbox" class="reenvio-item-cb" data-reenvio-idx="' +
          idx +
          '" checked>' +
          '<span class="reenvio-item-label">' +
          escapeHtml(maxQty + '× ' + label) +
          (maxQty > 1 ? '<small class="reenvio-item-sub">Cantidad a reenviar</small>' : '') +
          '</span>' +
          qtyCtrl +
          '</label>'
        );
      })
      .join('');
  }

  function setReenvioChecks(checked) {
    var box = $('reenvio-items');
    if (!box) return;
    box.querySelectorAll('.reenvio-item-cb').forEach(function (cb) {
      cb.checked = !!checked;
    });
  }

  function collectReenvioSelection() {
    var box = $('reenvio-items');
    var out = [];
    if (!box) return out;
    box.querySelectorAll('.reenvio-item').forEach(function (row) {
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      var cb = row.querySelector('.reenvio-item-cb');
      if (!cb || !cb.checked || isNaN(idx)) return;
      var qtyEl = row.querySelector('[data-reenvio-qty]');
      var qty = parseInt(qtyEl && qtyEl.textContent, 10) || reenvioItemQty(reenvioItems[idx]);
      out.push({ index: idx, qty: qty });
    });
    return out;
  }

  function openReenvioModal(orn) {
    if (!global.getAdminToken || !global.findOrderByOrn) return;
    var o = global.findOrderByOrn(orn);
    if (!o) return;
    if (o.reenvio_de) {
      alert('Este pedido ya es un reenvío.');
      return;
    }
    reenvioOrn = orn;
    reenvioOrder = o;
    reenvioItems = parseOrderItemsSimple(o);
    $('reenvio-orn-ref').textContent = o.orn + ' · ' + (o.cliente || '') + ' · ' + (o.telefono || '');
    renderReenvioItems();
    $('reenvio-modal').classList.remove('hidden');
  }

  function submitReenvio() {
    if (!reenvioOrder || !reenvioOrn) return;
    var selection = collectReenvioSelection();
    if (!selection.length) {
      alert('Marcá al menos un ítem para el reenvío.');
      return;
    }
    var btn = $('reenvio-confirm');
    btn.disabled = true;
    adminApi({ action: 'createReenvio', orn: reenvioOrn, itemsSelection: selection })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === 'items_requeridos') {
            alert('Marcá al menos un ítem para el reenvío.');
            return;
          }
          if (data.error === 'reenvio_pendiente_existe' || data.error === 'reenvio_ya_existe') {
            alert('Ya hay un reenvío para este pedido: ' + (data.orn || ''));
            return;
          }
          if (data.error === 'reclamo_ya_gratificado') {
            alert('Este pedido ya tiene cupón de reclamo (' + (data.codigo || '') + ').');
            return;
          }
          if (data.error === 'order_lookup_failed' || (data.detail && /reenvio_de|compensaciones/.test(data.detail))) {
            alert(
              'Error al crear reenvío. Abrí el admin de nuevo (migración Supabase) o ejecutá compensaciones.sql.\n' +
                (data.detail || data.error || '')
            );
            return;
          }
          alert('No se pudo crear el reenvío: ' + (data.error || 'error'));
          return;
        }
        var orderRef = reenvioOrder;
        closeReenvioModal();
        var waTo = telWa(orderRef.telefono);
        if (!waTo) {
          alert('Reenvío ' + data.orn + ' creado en Pendientes (sin teléfono para WA).');
          if (global.fetchOrdersFromServer) global.fetchOrdersFromServer(true);
          return;
        }
        return sendWa(waTo, data.waText).then(function (waRes) {
          if (!waRes.ok) {
            alert('Reenvío ' + data.orn + ' en Pendientes, pero falló WhatsApp: ' + (waRes.error || 'error'));
          } else {
            alert('Reenvío ' + data.orn + ' creado y avisado por WhatsApp.');
          }
          if (global.fetchOrdersFromServer) global.fetchOrdersFromServer(true);
        });
      })
      .catch(function () {
        alert('Error de red al crear reenvío.');
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function bindReenvioUi() {
    var modal = $('reenvio-modal');
    if (!modal) return;
    $('reenvio-cancel').addEventListener('click', closeReenvioModal);
    $('reenvio-confirm').addEventListener('click', submitReenvio);
    $('reenvio-select-all').addEventListener('click', function () {
      setReenvioChecks(true);
    });
    $('reenvio-select-none').addEventListener('click', function () {
      setReenvioChecks(false);
    });
    $('reenvio-items').addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var minus = t.getAttribute('data-reenvio-minus');
      var plus = t.getAttribute('data-reenvio-plus');
      if (minus != null) {
        e.preventDefault();
        setReenvioQty(parseInt(minus, 10), -1);
      }
      if (plus != null) {
        e.preventDefault();
        setReenvioQty(parseInt(plus, 10), 1);
      }
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeReenvioModal();
    });
  }

  bindReenvioUi();

  function confirmReenvio(orn) {
    openReenvioModal(orn);
  }

  global.BravaCompensaciones = {
    openModal: openModal,
    confirmReenvio: confirmReenvio,
  };
})(window);
