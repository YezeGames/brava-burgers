const { cors } = require('../lib/gasFetch');
const {
	getDeliveryConfig,
	fetchTodayOrderCounts,
	argentinaNowMinutes,
	parseTimeToMinutes,
	evaluateTurn,
} = require('../lib/turnosDelivery');

module.exports = async function handler(req, res) {
	cors(res);
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
	if (req.method === 'OPTIONS') return res.status(204).end();
	if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

	try {
		const turnCount = parseInt(req.query.n || '3', 10) || 3;
		const config = await getDeliveryConfig(turnCount);
		if (!config.enabled) {
			return res.status(200).json({ ok: true, enabled: false });
		}

		const countsRes = await fetchTodayOrderCounts(config);
		if (!countsRes.ok) {
			return res.status(502).json({ ok: false, error: countsRes.error, detail: countsRes.detail });
		}

		const nowMin = argentinaNowMinutes();
		const pedidosDesdeMin = parseTimeToMinutes(config.pedidosDesde);
		const turnos = config.turnos.map(function (slot) {
			const ev = evaluateTurn(slot, nowMin, pedidosDesdeMin, config.maxPorHora, countsRes.counts);
			return {
				customerLabel: slot.customerLabel,
				hourBucket: slot.hourBucket,
				available: ev.available,
				full: ev.full,
				closedByTime: ev.closedByTime,
				notYetOpen: ev.notYetOpen,
				count: ev.count,
				cuposRest: ev.cuposRest,
				orderCutoff: slot.orderCutoff,
			};
		});

		return res.status(200).json({
			ok: true,
			enabled: true,
			pedidosDesde: config.pedidosDesde,
			maxPorHora: config.maxPorHora,
			counts: countsRes.counts,
			turnos: turnos,
		});
	} catch (e) {
		return res.status(502).json({ ok: false, error: 'turno_cupos_failed', detail: String(e.message || e) });
	}
};
