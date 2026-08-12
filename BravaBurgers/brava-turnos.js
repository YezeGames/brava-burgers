/**
 * Turnos delivery: filtra #pregunta_6_respuesta y muestra #brava-turno-cupo-notice.
 * Activo solo si g_control_turnos_delivery === true (Sheet).
 */
(function () {
	'use strict';

	var cuposCache = null;
	var cuposCacheAt = 0;
	var CUPOS_TTL_MS = 25000;
	var refreshTimer = null;

	function parseTimeToMinutes(hhmm) {
		var p = String(hhmm || '').split(':');
		return parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
	}

	function formatMinutes(m) {
		var h = Math.floor(m / 60) % 24;
		var min = m % 60;
		return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
	}

	function argentinaNowMinutes() {
		var d = new Date();
		try {
			var fmt = new Intl.DateTimeFormat('en-GB', {
				timeZone: 'America/Argentina/Buenos_Aires',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			});
			var parts = fmt.formatToParts(d);
			var h = 0;
			var min = 0;
			parts.forEach(function (p) {
				if (p.type === 'hour') h = parseInt(p.value, 10);
				if (p.type === 'minute') min = parseInt(p.value, 10);
			});
			return h * 60 + min;
		} catch (eTz) {
			return d.getHours() * 60 + d.getMinutes();
		}
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

	function mergeApiWithLocal(apiData) {
		var cfg = window.g_turnos_delivery || { turnos: [], pedidosDesde: '19:00', maxPorHora: 4 };
		var nowMin = argentinaNowMinutes();
		var pedidosDesdeMin = parseTimeToMinutes(apiData.pedidosDesde || cfg.pedidosDesde);
		var maxH = apiData.maxPorHora || cfg.maxPorHora || 4;
		var counts = apiData.counts || {};
		var apiTurnos = apiData.turnos || [];

		return cfg.turnos.map(function (slot) {
			var apiRow = null;
			for (var i = 0; i < apiTurnos.length; i++) {
				if (apiTurnos[i].customerLabel === slot.customerLabel) {
					apiRow = apiTurnos[i];
					break;
				}
			}
			if (apiRow) {
				return {
					customerLabel: slot.customerLabel,
					available: !!apiRow.available,
					full: !!apiRow.full,
					closedByTime: !!apiRow.closedByTime,
					notYetOpen: !!apiRow.notYetOpen,
				};
			}
			var cutoff = parseTimeToMinutes(slot.orderCutoff);
			var count = counts[slot.hourBucket] || 0;
			var cuposRest = Math.max(0, maxH - count);
			var closedByTime = nowMin >= cutoff;
			var notYetOpen = nowMin < pedidosDesdeMin;
			var full = cuposRest <= 0;
			return {
				customerLabel: slot.customerLabel,
				available: !closedByTime && !notYetOpen && !full,
				full: full,
				closedByTime: closedByTime,
				notYetOpen: notYetOpen,
			};
		});
	}

	function fetchCupos() {
		var n = (window.g_turnos_delivery && window.g_turnos_delivery.turnos) || 3;
		var now = Date.now();
		if (cuposCache && now - cuposCacheAt < CUPOS_TTL_MS) {
			return Promise.resolve(cuposCache);
		}
		return fetch('/api/turno-cupos?n=' + encodeURIComponent(n), { cache: 'no-store' })
			.then(function (r) {
				return r.json();
			})
			.then(function (data) {
				if (data && data.ok) {
					cuposCache = data;
					cuposCacheAt = Date.now();
				}
				return data;
			})
			.catch(function () {
				return { ok: false };
			});
	}

	function applyTurnosUI(results, pedidosDesdeMin, nowMin) {
		var sel = document.getElementById('pregunta_6_respuesta');
		var notice = document.getElementById('brava-turno-cupo-notice');
		var submit = document.querySelector('.brava-btn-submit');
		if (!sel) return;

		var available = results.filter(function (r) {
			return r.available;
		});

		sel.innerHTML = '';
		if (nowMin < pedidosDesdeMin) {
			sel.appendChild(new Option('— Pedidos desde las ' + formatMinutes(pedidosDesdeMin) + ' —', ''));
			sel.disabled = true;
			if (notice) {
				notice.classList.remove('hidden');
				notice.innerHTML =
					'<span class="brava-turno-cupo-notice-title">Todavía no abrimos pedidos</span>Volvé a las ' +
					formatMinutes(pedidosDesdeMin) +
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

		if (!notice) return;
		var lines = results
			.filter(function (r) {
				return !r.available;
			})
			.map(unavailableMessage)
			.filter(Boolean);

		if (!lines.length) {
			notice.classList.add('hidden');
			notice.innerHTML = '';
			return;
		}
		var onlyFull =
			!available.length &&
			results.every(function (r) {
				return !r.available && r.full && !r.closedByTime;
			});
		var title = onlyFull ? 'No hay cupo en ningún turno ahora' : 'Algunos turnos no están disponibles';
		notice.innerHTML =
			'<span class="brava-turno-cupo-notice-title">' +
			title +
			'</span><ul><li>' +
			lines.join('</li><li>') +
			'</li></ul>';
		notice.classList.remove('hidden');
	}

	function fillTurnosLegacy() {
		var p = window.g_preguntas || {};
		var $ = window.jQuery;
		if (!$) return;
		var turno = $('#pregunta_6_respuesta');
		turno.empty();
		turno.append('<option value="">-- Selecciona --</option>');
		(p.opcionesTurno || []).forEach(function (o) {
			turno.append($('<option></option>').val(o).text(o));
		});
	}

	window.bravaResetTurnoCupoNotice = function () {
		var el = document.getElementById('brava-turno-cupo-notice');
		if (!el) return;
		el.classList.add('hidden');
		el.innerHTML = '';
	};

	window.bravaTurnosDeliveryActivo = function () {
		return !!window.g_control_turnos_delivery;
	};

	window.bravaRefreshTurnosCheckout = function () {
		if (!window.bravaTurnosDeliveryActivo()) {
			window.bravaResetTurnoCupoNotice();
			fillTurnosLegacy();
			return;
		}

		var cfg = window.g_turnos_delivery || {};
		var pedidosDesdeMin = parseTimeToMinutes(cfg.pedidosDesde || '19:00');
		var nowMin = argentinaNowMinutes();

		fetchCupos().then(function (data) {
			if (!data || !data.ok || !data.enabled) {
				fillTurnosLegacy();
				window.bravaResetTurnoCupoNotice();
				return;
			}
			var results = mergeApiWithLocal(data);
			applyTurnosUI(results, pedidosDesdeMin, nowMin);
		});
	};

	window.bravaMensajeErrorTurno = function (code) {
		if (code === 'turno_cupo_lleno') {
			return 'El cupo de ese turno se completó. Elegí otro turno o actualizá la página.';
		}
		if (code === 'turno_cerrado') {
			return 'Ese turno ya no acepta pedidos. Elegí otro horario.';
		}
		if (code === 'turno_no_abierto') {
			return 'Todavía no abrimos pedidos para ese turno.';
		}
		if (code === 'turno_invalid' || code === 'turno_no_disponible') {
			return 'El turno elegido no está disponible. Actualizá y probá de nuevo.';
		}
		return '';
	};

	window.bravaStartTurnosCheckoutTimer = function () {
		if (refreshTimer) clearInterval(refreshTimer);
		if (!window.bravaTurnosDeliveryActivo()) return;
		refreshTimer = setInterval(function () {
			if (document.getElementById('pregunta_6_respuesta')) {
				window.bravaRefreshTurnosCheckout();
			}
		}, 60000);
	};

	window.bravaStopTurnosCheckoutTimer = function () {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
	};
})();
