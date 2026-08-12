const { restSelect } = require('./supabaseServer');

const SHEET_ID =
	process.env.BRAVA_SHEET_ID ||
	process.env.PEDILO_SHEET_ID ||
	'1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';
const TZ = 'America/Argentina/Buenos_Aires';

const DEFAULT_SLOTS = [
	{ start: '20:00', end: '21:00', cutoff: '20:30', bucket: 20 },
	{ start: '21:00', end: '22:00', cutoff: '21:30', bucket: 21 },
	{ start: '22:00', end: '23:00', cutoff: '22:40', bucket: 22 },
];

function configGet(cfg, key) {
	if (!cfg) return '';
	if (cfg[key] !== undefined) return cfg[key];
	const lower = key.toLowerCase();
	for (const k in cfg) {
		if (k.toLowerCase() === lower) return cfg[k];
	}
	return '';
}

function normalizeTime(val, fallback) {
	if (val === undefined || val === null || String(val).trim() === '') return fallback;
	let s = String(val).trim().replace(/\./g, ':');
	const m = s.match(/^(\d{1,2}):(\d{2})/);
	if (!m) return fallback;
	const h = parseInt(m[1], 10);
	const min = parseInt(m[2], 10) || 0;
	return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
}

function parseIntConfig(val, fallback) {
	const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10);
	return isNaN(n) || n < 1 ? fallback : n;
}

function parseConfigCSV(csv) {
	const cfg = {};
	const lines = String(csv || '').split(/\r?\n/);
	let start = 0;
	if (lines[0]) {
		const a = lines[0].split(',')[0].replace(/^"|"$/g, '').toLowerCase().trim();
		const b = (lines[0].split(',')[1] || '').replace(/^"|"$/g, '').toLowerCase().trim();
		if (a === 'nombre' && b === 'valor') start = 1;
	}
	for (let i = start; i < lines.length; i++) {
		const row = parseCsvLine(lines[i]);
		if (!row.length) continue;
		const k = String(row[0] || '').trim();
		const v = String(row[1] != null ? row[1] : '').trim();
		if (k) cfg[k] = v;
	}
	return cfg;
}

function parseCsvLine(line) {
	const out = [];
	let cur = '';
	let inQ = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			inQ = !inQ;
			continue;
		}
		if (c === ',' && !inQ) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += c;
	}
	out.push(cur);
	return out.map(function (s) {
		return s.trim();
	});
}

function buildDeliveryConfig(cfg, turnCount) {
	const enabled =
		String(
			configGet(cfg, 'Control turnos delivery') || configGet(cfg, 'Control turnos de delivery')
		).toUpperCase() === 'SI';
	const n = Math.max(1, Math.min(turnCount || 3, 5));
	const turnos = [];
	for (let i = 1; i <= n; i++) {
		const def = DEFAULT_SLOTS[i - 1] || DEFAULT_SLOTS[DEFAULT_SLOTS.length - 1];
		const deliveryStart = normalizeTime(configGet(cfg, 'Turno ' + i + ' - Entrega desde'), def.start);
		const deliveryEnd = normalizeTime(configGet(cfg, 'Turno ' + i + ' - Entrega hasta'), def.end);
		const orderCutoff = normalizeTime(configGet(cfg, 'Turno ' + i + ' - Cierre pedidos'), def.cutoff);
		turnos.push({
			index: i,
			deliveryStart: deliveryStart,
			deliveryEnd: deliveryEnd,
			orderCutoff: orderCutoff,
			hourBucket: def.bucket,
			customerLabel: 'Turno ' + i + ' — ' + deliveryStart + ' a ' + deliveryEnd,
		});
	}
	return {
		enabled: enabled,
		pedidosDesde: normalizeTime(configGet(cfg, 'Pedidos web desde'), '19:00'),
		maxPorHora: parseIntConfig(configGet(cfg, 'Máx pedidos por hora') || configGet(cfg, 'Max pedidos por hora'), 4),
		turnos: turnos,
	};
}

let configCache = { at: 0, cfg: null, delivery: null };

async function fetchSheetConfigMap() {
	const now = Date.now();
	if (configCache.cfg && now - configCache.at < 120000) return configCache.cfg;
	const url =
		'https://docs.google.com/spreadsheets/d/' +
		SHEET_ID +
		'/gviz/tq?tqx=out:csv&sheet=' +
		encodeURIComponent('configuracion');
	const r = await fetch(url);
	if (!r.ok) throw new Error('sheet_config_http_' + r.status);
	const cfg = parseConfigCSV(await r.text());
	configCache = { at: now, cfg: cfg, delivery: null };
	return cfg;
}

async function getDeliveryConfig(turnCount) {
	const cfg = await fetchSheetConfigMap();
	return buildDeliveryConfig(cfg, turnCount || 3);
}

function argentinaDayBounds(date) {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const parts = fmt.formatToParts(date || new Date());
	let y = '';
	let m = '';
	let d = '';
	parts.forEach(function (p) {
		if (p.type === 'year') y = p.value;
		if (p.type === 'month') m = p.value;
		if (p.type === 'day') d = p.value;
	});
	const startIso = new Date(y + '-' + m + '-' + d + 'T00:00:00-03:00').toISOString();
	const endIso = new Date(y + '-' + m + '-' + d + 'T00:00:00-03:00').getTime() + 86400000;
	return { startIso: startIso, endIso: new Date(endIso).toISOString() };
}

function argentinaNowMinutes(date) {
	const fmt = new Intl.DateTimeFormat('en-GB', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
	const parts = fmt.formatToParts(date || new Date());
	let h = 0;
	let min = 0;
	parts.forEach(function (p) {
		if (p.type === 'hour') h = parseInt(p.value, 10);
		if (p.type === 'minute') min = parseInt(p.value, 10);
	});
	return h * 60 + min;
}

function parseTimeToMinutes(hhmm) {
	const p = String(hhmm || '').split(':');
	return parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
}

function isExcludedEstado(estado) {
	const e = String(estado || '').toLowerCase();
	return e === 'cancelado' || e === 'cancelada' || e === 'rechazado' || e === 'rechazada';
}

function hourBucketFromTurno(turnoStr, deliveryConfig) {
	const t = String(turnoStr || '').trim();
	if (!t) return null;
	if (deliveryConfig && deliveryConfig.turnos) {
		for (let i = 0; i < deliveryConfig.turnos.length; i++) {
			const slot = deliveryConfig.turnos[i];
			if (t === slot.customerLabel) return slot.hourBucket;
		}
	}
	const mTurno = t.match(/turno\s*(\d)/i);
	if (mTurno && deliveryConfig && deliveryConfig.turnos) {
		const idx = parseInt(mTurno[1], 10) - 1;
		if (deliveryConfig.turnos[idx]) return deliveryConfig.turnos[idx].hourBucket;
	}
	const mTime = t.match(/(\d{1,2})[:.](\d{2})/);
	if (mTime) return parseInt(mTime[1], 10);
	return null;
}

function countBucketsFromOrders(orders, deliveryConfig) {
	const counts = {};
	(orders || []).forEach(function (o) {
		if (isExcludedEstado(o.estado)) return;
		const b = hourBucketFromTurno(o.turno, deliveryConfig);
		if (b == null) return;
		counts[b] = (counts[b] || 0) + 1;
	});
	return counts;
}

async function fetchTodayOrderCounts(deliveryConfig) {
	const bounds = argentinaDayBounds();
	const q =
		'select=turno,estado&fecha_creado=gte.' +
		encodeURIComponent(bounds.startIso) +
		'&fecha_creado=lt.' +
		encodeURIComponent(bounds.endIso) +
		'&limit=500';
	const r = await restSelect('orders', q);
	if (!r.ok) return { ok: false, error: r.error, detail: r.detail };
	return { ok: true, counts: countBucketsFromOrders(r.data || [], deliveryConfig) };
}

function evaluateTurn(slot, nowMin, pedidosDesdeMin, maxH, counts) {
	const cutoff = parseTimeToMinutes(slot.orderCutoff);
	const count = counts[slot.hourBucket] || 0;
	const cuposRest = Math.max(0, maxH - count);
	const closedByTime = nowMin >= cutoff;
	const notYetOpen = nowMin < pedidosDesdeMin;
	const full = cuposRest <= 0;
	return {
		slot: slot,
		available: !closedByTime && !notYetOpen && !full,
		full: full,
		closedByTime: closedByTime,
		notYetOpen: notYetOpen,
		count: count,
		cuposRest: cuposRest,
	};
}

function findTurnByCustomerLabel(config, label) {
	const t = String(label || '').trim();
	if (!config || !config.turnos) return null;
	for (let i = 0; i < config.turnos.length; i++) {
		if (config.turnos[i].customerLabel === t) return config.turnos[i];
	}
	return null;
}

async function validateShopOrder(order) {
	const turno = String(order.turno || '').trim();
	if (!turno) return { ok: true };

	const config = await getDeliveryConfig(3);
	if (!config.enabled) return { ok: true };

	const countsRes = await fetchTodayOrderCounts(config);
	if (!countsRes.ok) return { ok: false, error: 'cupos_unavailable', detail: countsRes.detail };

	const slot = findTurnByCustomerLabel(config, turno);
	if (!slot) {
		const bucket = hourBucketFromTurno(turno, config);
		if (bucket == null) return { ok: false, error: 'turno_invalid' };
	}

	const useSlot = slot || config.turnos.find(function (s) {
		return s.hourBucket === hourBucketFromTurno(turno, config);
	});
	if (!useSlot) return { ok: false, error: 'turno_invalid' };

	const nowMin = argentinaNowMinutes();
	const pedidosDesdeMin = parseTimeToMinutes(config.pedidosDesde);
	const ev = evaluateTurn(useSlot, nowMin, pedidosDesdeMin, config.maxPorHora, countsRes.counts);

	if (!ev.available) {
		if (ev.full) return { ok: false, error: 'turno_cupo_lleno', turno: useSlot.customerLabel };
		if (ev.closedByTime) return { ok: false, error: 'turno_cerrado', turno: useSlot.customerLabel };
		if (ev.notYetOpen) return { ok: false, error: 'turno_no_abierto' };
		return { ok: false, error: 'turno_no_disponible' };
	}

	return { ok: true };
}

module.exports = {
	buildDeliveryConfig: buildDeliveryConfig,
	getDeliveryConfig: getDeliveryConfig,
	fetchTodayOrderCounts: fetchTodayOrderCounts,
	countBucketsFromOrders: countBucketsFromOrders,
	hourBucketFromTurno: hourBucketFromTurno,
	validateShopOrder: validateShopOrder,
	argentinaNowMinutes: argentinaNowMinutes,
	parseTimeToMinutes: parseTimeToMinutes,
	evaluateTurn: evaluateTurn,
};
