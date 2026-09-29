const { cors } = require('../lib/gasFetch');

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

/** Proxy OSRM para repartidor nativo (evita bloqueos/rate-limit desde móvil). */
module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const fromLng = parseFloat(req.query.fromLng);
  const fromLat = parseFloat(req.query.fromLat);
  const toLng = parseFloat(req.query.toLng);
  const toLat = parseFloat(req.query.toLat);
  if ([fromLng, fromLat, toLng, toLat].some(function (v) { return isNaN(v); })) {
    return res.status(400).json({ ok: false, error: 'missing_coords' });
  }

  const path = fromLng + ',' + fromLat + ';' + toLng + ',' + toLat;
  const url =
    OSRM + path + '?overview=full&geometries=geojson&steps=true&language=es';

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'BravaBurgers-Repartidor/1.0 (osrm-proxy)' },
      cache: 'no-store',
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        error: 'osrm_upstream',
        status: upstream.status,
        detail: text.slice(0, 240),
      });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'osrm_failed', detail: String(e.message || e) });
  }
};
