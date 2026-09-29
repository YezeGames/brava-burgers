const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

async function fetchOsrmRouteJson(query) {
  const fromLng = parseFloat(query.fromLng);
  const fromLat = parseFloat(query.fromLat);
  const toLng = parseFloat(query.toLng);
  const toLat = parseFloat(query.toLat);
  if ([fromLng, fromLat, toLng, toLat].some(function (v) { return isNaN(v); })) {
    return { ok: false, error: 'missing_coords', status: 400 };
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
      return {
        ok: false,
        error: 'osrm_upstream',
        status: 502,
        detail: text.slice(0, 240),
      };
    }
    return { ok: true, status: 200, body: text, contentType: 'application/json; charset=utf-8' };
  } catch (e) {
    return { ok: false, error: 'osrm_failed', status: 502, detail: String(e.message || e) };
  }
}

module.exports = { fetchOsrmRouteJson };
