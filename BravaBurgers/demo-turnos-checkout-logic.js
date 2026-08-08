/**
 * Demo: turnos + cupos en checkout (#pregunta_6_respuesta).
 * En producción: mover a pedilo-shop.js como refreshTurnosCheckout() tras abrir modal y cada ~60s.
 */
(function () {
	'use strict';

	var TURNOS = [
		{ deliveryStart: '20:00', deliveryEnd: '21:00', orderCutoff: '20:30', hourBucket: 20 },
		{ deliveryStart: '21:00', deliveryEnd: '22:00', orderCutoff: '21:30', hourBucket: 21 },
		{ deliveryStart: '22:00', deliveryEnd: '23:00', orderCutoff: '22:40', hourBucket: 22 },
	];

	var pedidosPorHora = { 20: 1, 21: 4, 22: 0 };

	function $(id) {
		return document.getElementById(id);
	}

	function parseTimeToMinutes(hhmm) {
		var p = String(hhmm || '').split(':');
		return parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
	}

	function formatMinutes(m) {
		var h = Math.floor(m / 60) % 24;
		var min = m % 60;
		return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
	}

	function customerTurnLabel(turn, index) {
		return 'Turno ' + (index + 1) + ' — ' + turn.deliveryStart + ' a ' + turn.deliveryEnd;
	}

	function pedidosDesdeMin() {
		var el = $('pedidos-desde');
		return parseTimeToMinutes(el && el.value ? el.value : '19:00');
	}

	function maxPorHora() {
		var n = parseInt($('max-hora').value, 10);
		return isNaN(n) || n < 1 ? 4 : n;
	}

	function getSimNowMinutes() {
		var t = $('sim-time').value || '19:00';
		return parseTimeToMinutes(t);
	}

	function evaluateTurn(turn, index, nowMin, maxH) {
		var cutoff = parseTimeToMinutes(turn.orderCutoff);
		var opens = pedidosDesdeMin();
		var count = pedidosPorHora[turn.hourBucket] || 0;
		var cuposRest = Math.max(0, maxH - count);
		var closedByTime = nowMin >= cutoff;
		var notYetOpen = nowMin < opens;
		var full = cuposRest <= 0;
		var available = !closedByTime && !notYetOpen && !full;
		return {
			turn: turn,
			index: index,
			customerLabel: customerTurnLabel(turn, index),
			available: available,
			closedByTime: closedByTime,
			notYetOpen: notYetOpen,
			full: full,
			cuposRest: cuposRest,
		};
	}

	function unavailableMessage(r) {
		if (r.full) {
			return (
				'<strong>' +
				r.customerLabel +
				'</strong>: el cupo de este turno está completo. Elegí otro turno con entrega en otro horario.'
			);
		}
		if (r.closedByTime) {
			return '<strong>' + r.customerLabel + '</strong>: ya no tomamos pedidos para este turno.';
		}
		return '';
	}

	/** Integración tienda: rellena #pregunta_6_respuesta + #brava-turno-cupo-notice */
	function refreshTurnosCheckout() {
		var nowMin = getSimNowMinutes();
		var maxH = maxPorHora();
		var sel = $('pregunta_6_respuesta');
		var notice = $('brava-turno-cupo-notice');
		var submit = $('demo-submit');
		if (!sel) return;

		var results = TURNOS.map(function (t, i) {
			return evaluateTurn(t, i, nowMin, maxH);
		});
		var available = results.filter(function (r) {
			return r.available;
		});

		sel.innerHTML = '';
		if (nowMin < pedidosDesdeMin()) {
			sel.appendChild(new Option('— Pedidos desde las ' + formatMinutes(pedidosDesdeMin()) + ' —', ''));
			sel.disabled = true;
			if (notice) {
				notice.classList.remove('hidden');
				notice.innerHTML =
					'<span class="brava-turno-cupo-notice-title">Todavía no abrimos pedidos</span>Volvé a las ' +
					formatMinutes(pedidosDesdeMin()) +
					' para elegir turno.';
			}
			if (submit) submit.disabled = true;
			return;
		}

		if (!available.length) {
			sel.appendChild(new Option('— Sin turnos disponibles —', ''));
			sel.disabled = true;
			if (submit) submit.disabled = true;
		} else {
			sel.disabled = false;
			sel.appendChild(new Option('-- Selecciona --', ''));
			available.forEach(function (r) {
				sel.appendChild(new Option(r.customerLabel, r.customerLabel));
			});
			if (available.length === 1) {
				sel.value = available[0].customerLabel;
			}
			if (submit) submit.disabled = false;
		}

		if (notice) {
			var lines = results
				.filter(function (r) {
					return !r.available;
				})
				.map(unavailableMessage)
				.filter(Boolean);
			if (!lines.length) {
				notice.classList.add('hidden');
				notice.innerHTML = '';
			} else {
				var onlyFull =
					!available.length &&
					results.every(function (r) {
						return !r.available && r.full && !r.closedByTime;
					});
				var title = onlyFull
					? 'No hay cupo en ningún turno ahora'
					: 'Algunos turnos no están disponibles';
				notice.innerHTML =
					'<span class="brava-turno-cupo-notice-title">' +
					title +
					'</span><ul><li>' +
					lines.join('</li><li>') +
					'</li></ul>';
				notice.classList.remove('hidden');
			}
		}
	}

	function renderCuposTable() {
		var tbody = $('cupos-body');
		if (!tbody) return;
		var maxH = maxPorHora();
		tbody.innerHTML = '';
		[20, 21, 22].forEach(function (h) {
			var count = pedidosPorHora[h] || 0;
			var tr = document.createElement('tr');
			tr.innerHTML =
				'<td>' +
				h +
				':00</td><td>' +
				count +
				'/' +
				maxH +
				'</td><td><button type="button" data-h="' +
				h +
				'" style="font-size:0.7rem;padding:2px 6px;">+</button></td>';
			tbody.appendChild(tr);
		});
		tbody.querySelectorAll('button[data-h]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var h = parseInt(btn.getAttribute('data-h'), 10);
				pedidosPorHora[h] = (pedidosPorHora[h] || 0) + 1;
				renderCuposTable();
				refreshTurnosCheckout();
			});
		});
	}

	function bind() {
		['sim-time', 'pedidos-desde', 'max-hora'].forEach(function (id) {
			var el = $(id);
			if (el) el.addEventListener('change', refreshTurnosCheckout);
		});
		$('btn-refresh').addEventListener('click', refreshTurnosCheckout);
		$('btn-now').addEventListener('click', function () {
			var n = new Date();
			$('sim-time').value =
				(n.getHours() < 10 ? '0' : '') + n.getHours() + ':' + (n.getMinutes() < 10 ? '0' : '') + n.getMinutes();
			refreshTurnosCheckout();
		});
		$('demo-checkout-form').addEventListener('submit', function (e) {
			e.preventDefault();
			var t = $('pregunta_6_respuesta').value;
			if (!t || t.indexOf('—') === 0) {
				alert('Elegí un turno disponible.');
				return;
			}
			alert('Demo OK — turno: ' + t + '\n\nEn producción: calcular_total() + finalizar_pedido().');
		});
	}

	bind();
	renderCuposTable();
	refreshTurnosCheckout();

	window.BravaDemoRefreshTurnos = refreshTurnosCheckout;
})();
