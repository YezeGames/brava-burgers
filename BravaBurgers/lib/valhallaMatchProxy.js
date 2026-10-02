const { decodeValhallaPolyline } = require('./valhallaPolyline');
const { bravaValhallaServiceBase } = require('./valhallaServiceBase');

function endpoint(path) {
  var base = bravaValhallaServiceBase();
  if (!base) return null;
  return base.replace(/\/+$/, '') + path;
}

/** Un fix GPS → calle más cercana (Valhalla /locate). */
async function valhallaLocate(lat, lng) {
  var url = endpoint('/locate');
  if (!url) return { ok: false, error: 'valhalla_not_configured' };
  var body = {
    locations: [{ lat: lat, lon: lng }],
    costing: 'auto',
  };
  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'BravaBurgers-Repartidor/1.0 (valhalla-locate)',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, error: 'locate_upstream', detail: text.slice(0, 200) };
    }
    var data = JSON.parse(text);
    var edge = null;
    if (data && data.edges && data.edges.length) {
      edge = data.edges[0];
    } else if (Array.isArray(data) && data[0] && data[0][0]) {
      var row = data[0][0];
      return {
        ok: true,
        lat: Number(row.lat),
        lng: Number(row.lon),
        matched: true,
      };
    }
    if (!edge || edge.correlated_lat == null || edge.correlated_lon == null) {
      return { ok: false, error: 'locate_empty' };
    }
    return {
      ok: true,
      lat: Number(edge.correlated_lat),
      lng: Number(edge.correlated_lon),
      matched: true,
    };
  } catch (e) {
    return { ok: false, error: 'locate_failed', detail: String(e.message || e) };
  }
}

/**
 * Varios fixes → shape map-matched; devuelve último punto del shape (posición en calle).
 */
async function valhallaTraceSnap(points) {
  var url = endpoint('/trace_route');
  if (!url) return { ok: false, error: 'valhalla_not_configured' };
  var shape = (points || [])
    .filter(function (p) {
      return p && !isNaN(p.lat) && !isNaN(p.lng);
    })
    .map(function (p) {
      return { lat: p.lat, lon: p.lng };
    });
  if (shape.length < 2) {
    if (shape.length === 1) {
      return valhallaLocate(shape[0].lat, shape[0].lon);
    }
    return { ok: false, error: 'trace_need_points' };
  }
  var body = {
    shape: shape,
    costing: 'auto',
    shape_match: 'map_snap',
    shape_format: 'polyline6',
    directions_options: { language: 'es-ES' },
  };
  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'BravaBurgers-Repartidor/1.0 (valhalla-trace)',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, error: 'trace_upstream', detail: text.slice(0, 200) };
    }
    var data = JSON.parse(text);
    if (data.error) {
      return { ok: false, error: 'trace_no_match', detail: String(data.error_message || data.error) };
    }
    var leg = data.trip && data.trip.legs && data.trip.legs[0];
    var decoded = decodeValhallaPolyline(leg && leg.shape ? leg.shape : '');
    if (decoded.length < 1) {
      return valhallaLocate(shape[shape.length - 1].lat, shape[shape.length - 1].lon);
    }
    var last = decoded[decoded.length - 1];
    return { ok: true, lat: last.lat, lng: last.lng, matched: true };
  } catch (e) {
    return { ok: false, error: 'trace_failed', detail: String(e.message || e) };
  }
}

/** API app: puck en vivo → solo /locate (trace_route salta maniobras). */
async function valhallaMatchForApp(body) {
  var lat = parseFloat(body.lat);
  var lng = parseFloat(body.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return { ok: false, error: 'missing_coords', status: 400 };
  }
  if (body.mode === 'trace' && Array.isArray(body.trail) && body.trail.length >= 2) {
    return valhallaTraceSnap(body.trail);
  }
  return valhallaLocate(lat, lng);
}

module.exports = { valhallaLocate, valhallaTraceSnap, valhallaMatchForApp };
