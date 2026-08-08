const { cors } = require('../lib/gasFetch');

/** Olivos / zona norte GBA — sesgo de búsqueda */
const PROXIMITY = '-58.489,-34.513';

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token = (process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || '').trim();
  if (!token) {
    return res.status(503).json({ ok: false, error: 'mapbox_not_configured' });
  }

  const q = String(req.query.q || '')
    .trim()
    .slice(0, 120);
  if (q.length < 3) {
    return res.status(200).json({ ok: true, suggestions: [] });
  }

  const url =
    'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(q) +
    '.json?country=ar&proximity=' +
    PROXIMITY +
    '&types=address,place&limit=6&language=es&access_token=' +
    encodeURIComponent(token);

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        error: 'geocode_failed',
        detail: data.message || String(r.status),
      });
    }
    const suggestions = (data.features || []).map(function (f) {
      return parseFeature(f);
    });
    return res.status(200).json({ ok: true, suggestions: suggestions });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'geocode_network', detail: String(e.message || e) });
  }
};

function parseFeature(f) {
  var street = String(f.text || '').trim();
  if (f.address) street = (street + ' ' + f.address).trim();
  var locality = '';
  (f.context || []).forEach(function (c) {
    var id = String(c.id || '');
    if (!locality && (id.indexOf('locality.') === 0 || id.indexOf('place.') === 0)) {
      locality = String(c.text || '').trim();
    }
  });
  if (!locality) {
    var parts = String(f.place_name || '')
      .split(',')
      .map(function (p) {
        return p.trim();
      });
    if (parts.length >= 2) locality = parts[1];
  }
  return {
    label: f.place_name || street,
    direccion: street || String(f.place_name || '').split(',')[0].trim(),
    localidad: locality,
    lng: f.center && f.center[0],
    lat: f.center && f.center[1],
  };
}
