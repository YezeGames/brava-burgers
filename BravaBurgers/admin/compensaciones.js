/**
 * Admin — gratificación / cupones de compensación
 */
(function (global) {
  'use strict';

  var modalOrn = null;
  var modalOrder = null;

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

  function couponLabel(c) {
    if (!c) return '';
    if (c.tipo === 'pct') return (c.valor || 0) + '% off';
    if (c.tipo === 'monto') return '$' + Number(c.valor || 0).toLocaleString('es-AR') + ' off';
    if (c.tipo === 'envio') return 'Envío gratis';
    if (c.tipo === 'item') return 'Papas Brava gratis';
    return c.tipo;
  }

  function buildPreview(order, tipo, valor) {
    var nombre = (order && order.cliente ? order.cliente : 'Cliente').split(/\s+/)[0];
    var beneficio = couponLabel({ tipo: tipo, valor: valor });
    return (
      '¡' +
      nombre +
      '! Lamentamos lo de tu pedido ' +
      (order ? order.orn : '') +
      '.\n\n' +
      'Te dejamos ' +
      beneficio +
      ' en tu próximo pedido.\n' +
      'Código: BRAVA-XXXX\n' +
      'Pedí acá: https://linktr.ee/bravaburgers\n\n' +
      'Válido 1 uso · próximo sábado. 🍔'
    );
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
  }

  function closeModal() {
    $('comp-modal').classList.add('hidden');
    modalOrn = null;
    modalOrder = null;
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
            alert('Ya hay un cupón activo para este teléfono (' + (data.codigo || '') + ').');
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
        var waTo = telWa(modalOrder.telefono);
        if (!waTo) {
          alert('Cupón ' + data.compensacion.codigo + ' creado (sin teléfono para WA).');
          closeModal();
          return;
        }
        return sendWa(waTo, data.waText).then(function (waRes) {
          if (!waRes.ok) {
            alert(
              'Cupón ' +
                data.compensacion.codigo +
                ' creado, pero falló el envío por WhatsApp: ' +
                (waRes.error || 'error')
            );
          } else {
            alert('Cupón ' + data.compensacion.codigo + ' creado y enviado por WhatsApp.');
          }
          closeModal();
        });
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

  global.BravaCompensaciones = {
    openModal: openModal,
  };
})(window);
