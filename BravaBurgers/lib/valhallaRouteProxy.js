const { tripShapeAndSteps } = require('./valhallaManeuverMap');
const { maneuverTextFromOsrmStep } = require('./navManeuverEs');

function bravaValhallaRouteUrl() {
  var custom = String(
    process.env.BRAVA_VALHALLA_BASE_URL || process.env.VALHALLA_BASE_URL || '',
  ).trim();
  if (!custom) return null;
  var base = custom.replace(/\/+$/, '');
  if (!/\/route$/i.test(base)) base = base + '/route';
  return base;
}

function buildValhallaBody(fromLng, fromLat, toLng, toLat) {
  return {
    locations: [
      { lon: fromLng, lat: fromLat, type: 'break' },
      { lon: toLng, lat: toLat, type: 'break' },
    ],
    costing: 'auto',
    units: 'kilometers',
    language: 'es-ES',
    directions_options: { units: 'kilometers', language: 'es-ES' },
    shape_match: 'edge_walk',
    shape_format: 'polyline6',
  };
}

/**
 * Ruta Valhalla con shape completo + maniobras en índices reales del shape.
 */
async function fetchValhallaRoute(fromLng, fromLat, toLng, toLat, opts) {
  var url = (opts && opts.url) || bravaValhallaRouteUrl();
  if (!url) return { ok: false, error: 'valhalla_not_configured' };

  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'BravaBurgers-Repartidor/1.0 (valhalla-proxy)',
      },
      body: JSON.stringify(buildValhallaBody(fromLng, fromLat, toLng, toLat)),
      cache: 'no-store',
      signal: AbortSignal.timeout((opts && opts.timeoutMs) || 14000),
    });
    var text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: 'valhalla_upstream',
        status: 502,
        detail: text.slice(0, 280),
      };
    }
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'valhalla_parse', status: 502 };
    }
    if (data.error) {
      return {
        ok: false,
        error: 'valhalla_no_route',
        status: 502,
        detail: String(data.error_message || data.error || ''),
      };
    }
    var trip = data.trip;
    if (!trip || !trip.legs || !trip.legs.length) {
      return { ok: false, error: 'valhalla_no_route', status: 502 };
    }

    var parts = tripShapeAndSteps(trip);
    var shapeCoords = parts.shapeCoords;
    var steps = parts.steps;
    if (shapeCoords.length < 2) {
      return { ok: false, error: 'valhalla_empty_shape', status: 502 };
    }
    var summary = trip.summary || {};
    var distM =
      summary.length != null
        ? Number(summary.length) * 1000
        : shapeCoords.reduce(function (acc, pt, i) {
            if (i === 0) return 0;
            return acc + haversineM(shapeCoords[i - 1], pt);
          }, 0);
    var durSec = Number(summary.time) || 0;

    var osrmLike = {
      code: 'Ok',
      routes: [
        {
          distance: distM,
          duration: durSec,
          geometry: {
            type: 'LineString',
            coordinates: shapeCoords.map(function (c) {
              return [c.lng, c.lat];
            }),
          },
          legs: [{ steps: steps }],
        },
      ],
    };

    return {
      ok: true,
      data: osrmLike,
      routeSource: 'valhalla',
      shapePointCount: shapeCoords.length,
    };
  } catch (e) {
    return { ok: false, error: 'valhalla_failed', status: 502, detail: String(e.message || e) };
  }
}

function haversineM(a, b) {
  var r = 6371000;
  var dLat = ((b.lat - a.lat) * Math.PI) / 180;
  var dLng = ((b.lng - a.lng) * Math.PI) / 180;
  var lat1 = (a.lat * Math.PI) / 180;
  var lat2 = (b.lat * Math.PI) / 180;
  var x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Misma forma que fetchOsrmRouteForApp (APK / web). */
async function fetchValhallaRouteForApp(query) {
  var fromLng = parseFloat(query.fromLng);
  var fromLat = parseFloat(query.fromLat);
  var toLng = parseFloat(query.toLng);
  var toLat = parseFloat(query.toLat);
  if ([fromLng, fromLat, toLng, toLat].some(function (v) {
    return isNaN(v);
  })) {
    return { ok: false, error: 'missing_coords', status: 400 };
  }
  var raw = await fetchValhallaRoute(fromLng, fromLat, toLng, toLat);
  if (!raw.ok) return raw;

  var route = raw.data.routes[0];
  var geom = route.geometry && route.geometry.coordinates;
  var coordinates = geom.map(function (c) {
    return { lat: c[1], lng: c[0] };
  });
  var steps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
  var step = steps.length ? steps[0] : null;
  return {
    ok: true,
    coordinates: coordinates,
    distance_m: Number(route.distance) || 0,
    duration_sec: Number(route.duration) || 0,
    maneuver: maneuverTextFromOsrmStep(step),
    route_source: raw.routeSource || 'valhalla',
    steps: steps.map(function (s) {
      return {
        distance: s.distance,
        name: s.name,
        maneuver: s.maneuver,
      };
    }),
  };
}

module.exports = {
  bravaValhallaRouteUrl,
  fetchValhallaRoute,
  fetchValhallaRouteForApp,
  buildValhallaBody,
};
