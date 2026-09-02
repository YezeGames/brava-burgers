const { cors } = require('../lib/gasFetch');
const { findDeliveryZoneName } = require('../lib/deliveryZone');

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ ok: false, error: 'missing_coords' });
  }

  try {
    const zona = findDeliveryZoneName(lng, lat);
    return res.status(200).json({
      ok: true,
      dentro: zona != null,
      zona: zona,
      lat: lat,
      lng: lng,
    });
  } catch (e) {
    console.error('delivery-zone error', e);
    return res.status(500).json({ ok: false, error: 'zone_check_failed' });
  }
};
