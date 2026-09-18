const { cors } = require('../lib/gasFetch');
const {
	getDeliveryConfig,
	fetchTodayOrderCounts,
	argentinaNowMinutes,
	parseTimeToMinutes,
	evaluateTurn,
} = require('../lib/turnosDelivery');
const { getPublishedShopCatalog, storeCatalogHealth } = require('../lib/storeCatalog');

async function handleCatalog(req, res) {
	if (req.query.health === '1') {
		const health = await storeCatalogHealth();
		return res.status(health.ok ? 200 : 503).json(health);
	}

	const catalog = await getPublishedShopCatalog();
	if (!catalog.ok) {
		if (catalog.error === 'store_catalog_not_migrated') {
			return res.status(503).json({ ok: false, error: catalog.error, hint: catalog.hint });
		}
		return res.status(502).json(catalog);
	}
	const payload = {
		ok: true,
		source: 'supabase',
		publishedAt: catalog.publishedAt || null,
		productos: catalog.productos || [],
		extras: catalog.extras || [],
	};
	if (catalog.storeConfig) payload.storeConfig = catalog.storeConfig;
	if (catalog.empty) {
		payload.empty = true;
		return res.status(200).json(payload);
	}
	return res.status(200).json(payload);
}

module.exports = async function handler(req, res) {
	cors(res);
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	if (req.method === 'OPTIONS') return res.status(204).end();
	if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

	if (req.query.mode === 'catalog') {
		res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=30');
		try {
			return await handleCatalog(req, res);
		} catch (e) {
			return res.status(500).json({ ok: false, error: 'catalog_failed', detail: String(e.message || e) });
		}
	}

	res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');

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
