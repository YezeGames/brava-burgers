const { cors } = require('../lib/gasFetch');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) {
    return res.status(503).json({ ok: false, error: 'maps_not_configured' });
  }

  const body = req.body || {};
  const origin = String(body.origin || '').trim();
  const stops = Array.isArray(body.stops) ? body.stops.map(function (s) { return String(s || '').trim(); }).filter(Boolean) : [];

  if (!origin || !stops.length) {
    return res.status(400).json({ ok: false, error: 'invalid_route', status: 'INVALID_REQUEST' });
  }

  const destination = stops[stops.length - 1];
  const params = new URLSearchParams({
    origin: origin,
    destination: destination,
    mode: 'driving',
    region: 'ar',
    language: 'es',
    key: key,
  });

  if (stops.length > 1) {
    params.set('waypoints', stops.slice(0, -1).join('|'));
  }

  try {
    const url = 'https://maps.googleapis.com/maps/api/directions/json?' + params.toString();
    const upstream = await fetch(url, { cache: 'no-store' });
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'directions_failed', message: String(e.message || e) });
  }
};
