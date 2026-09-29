const OSRM_PUBLIC = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/',
];

/** PC del local (Cloudflare Tunnel) u otro OSRM propio — ver infra/osrm-local-pc/README.md */
function osrmHostList() {
  var custom = String(process.env.BRAVA_OSRM_BASE_URL || process.env.OSRM_BASE_URL || '').trim();
  var hosts = [];
  if (custom) {
    var base = custom.replace(/\/+$/, '');
    if (base.indexOf('/route/v1/driving') < 0) {
      base = base + '/route/v1/driving';
    }
    hosts.push(base.endsWith('/') ? base : base + '/');
  }
  return hosts.concat(OSRM_PUBLIC);
}

function maneuverTextFromStep(step) {
  if (!step || !step.maneuver) return 'Seguí por la ruta resaltada';
  var m = step.maneuver;
  var street = String(m.name || step.name || '').trim();
  var t = m.type || '';
  var mod = m.modifier || '';
  if (t === 'arrive') return 'Llegaste al destino';
  if (t === 'depart') return 'Salí hacia ' + (street || 'la ruta');
  if (mod === 'left') return 'Girá a la izquierda' + (street ? ' en ' + street : '');
  if (mod === 'right') return 'Girá a la derecha' + (street ? ' en ' + street : '');
  if (mod === 'slight left') return 'Mantenete a la izquierda';
  if (mod === 'slight right') return 'Mantenete a la derecha';
  if (t === 'roundabout') return 'Tomá la rotonda';
  if (t === 'continue') return 'Continuá' + (street ? ' por ' + street : '');
  return m.instruction || 'Seguí la ruta resaltada';
}

/** Menos llamadas a ORS/OSRM: misma ruta ~90 s (reroute GPS redondeado). */
var routeCache = new Map();
var ROUTE_CACHE_TTL_MS = 90000;
var ROUTE_CACHE_MAX = 250;

function routeCacheKey(pathCoords) {
  var parts = String(pathCoords || '').split(';');
  if (parts.length < 2) return pathCoords;
  function roundPart(p) {
    var xy = p.split(',');
    if (xy.length < 2) return p;
    return (
      (Math.round(parseFloat(xy[0]) * 1000) / 1000) +
      ',' +
      (Math.round(parseFloat(xy[1]) * 1000) / 1000)
    );
  }
  return roundPart(parts[0]) + ';' + roundPart(parts[1]);
}

function getRouteCached(pathCoords) {
  var k = routeCacheKey(pathCoords);
  var hit = routeCache.get(k);
  if (!hit || Date.now() > hit.exp) return null;
  return hit.data;
}

function setRouteCached(pathCoords, data) {
  var k = routeCacheKey(pathCoords);
  if (routeCache.size >= ROUTE_CACHE_MAX) {
    var first = routeCache.keys().next().value;
    if (first) routeCache.delete(first);
  }
  routeCache.set(k, { exp: Date.now() + ROUTE_CACHE_TTL_MS, data: data });
}

async function fetchOsrmFromHosts(pathCoords, list) {
  var lastErr = { ok: false, error: 'osrm_failed' };
  for (var h = 0; h < list.length; h++) {
    var url =
      list[h] +
      pathCoords +
      '?overview=full&geometries=geojson&steps=true&alternatives=false';
    try {
      var upstream = await fetch(url, {
        headers: { 'User-Agent': 'BravaBurgers-Repartidor/1.0 (osrm-proxy)' },
        cache: 'no-store',
        signal: AbortSignal.timeout(22000),
      });
      var text = await upstream.text();
      if (!upstream.ok) {
        lastErr = {
          ok: false,
          error: 'osrm_upstream',
          status: 502,
          detail: text.slice(0, 240),
        };
        continue;
      }
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        lastErr = { ok: false, error: 'osrm_parse', status: 502 };
        continue;
      }
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        return { ok: true, data: data };
      }
      lastErr = {
        ok: false,
        error: 'osrm_no_route',
        status: 502,
        detail: data.message || data.code || '',
      };
    } catch (e) {
      lastErr = { ok: false, error: 'osrm_failed', status: 502, detail: String(e.message || e) };
    }
  }
  return lastErr;
}

function osrmCustomHosts() {
  var custom = String(process.env.BRAVA_OSRM_BASE_URL || process.env.OSRM_BASE_URL || '').trim();
  if (!custom) return [];
  var base = custom.replace(/\/+$/, '');
  if (base.indexOf('/route/v1/driving') < 0) base = base + '/route/v1/driving';
  return [base.endsWith('/') ? base : base + '/'];
}

async function fetchOpenRouteService(pathCoords) {
  var key = String(process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'ors_not_configured' };
  var parts = String(pathCoords || '').split(';');
  if (parts.length < 2) return { ok: false, error: 'ors_bad_coords' };
  var a = parts[0].split(',');
  var b = parts[1].split(',');
  if (a.length < 2 || b.length < 2) return { ok: false, error: 'ors_bad_coords' };
  var body = {
    coordinates: [
      [parseFloat(a[0]), parseFloat(a[1])],
      [parseFloat(b[0]), parseFloat(b[1])],
    ],
  };
  try {
    var res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    var text = await res.text();
    if (!res.ok) {
      return { ok: false, error: 'ors_upstream', status: 502, detail: text.slice(0, 240) };
    }
    var geo = JSON.parse(text);
    var feat = geo.features && geo.features[0];
    var coords = feat && feat.geometry && feat.geometry.coordinates;
    if (!coords || !coords.length) {
      return { ok: false, error: 'ors_no_route', status: 502 };
    }
    var dist = (feat.properties && feat.properties.summary && feat.properties.summary.distance) || 0;
    var dur = (feat.properties && feat.properties.summary && feat.properties.summary.duration) || 0;
    var steps = [];
    var segs =
      feat.properties &&
      feat.properties.segments &&
      feat.properties.segments[0] &&
      feat.properties.segments[0].steps;
    if (segs && segs.length) {
      for (var si = 0; si < segs.length; si++) {
        var st = segs[si];
        steps.push({
          distance: st.distance,
          duration: st.duration,
          name: st.name || '',
          maneuver: {
            type: st.type === 10 ? 'arrive' : 'turn',
            modifier: st.instruction || '',
            instruction: st.instruction || '',
            location: st.way_points ? null : null,
          },
        });
      }
    }
    var osrmLike = {
      code: 'Ok',
      routes: [
        {
          distance: dist,
          duration: dur,
          geometry: { type: 'LineString', coordinates: coords },
          legs: [{ steps: steps }],
        },
      ],
    };
    return { ok: true, data: osrmLike };
  } catch (e) {
    return { ok: false, error: 'ors_failed', detail: String(e.message || e) };
  }
}

/**
 * API Brava de rutas: cache → OSRM propio (PC) → ORS (cuota) → OSRM público.
 * No es clonar ORS: ORS sigue contando; el cache y OSRM local reducen el tope.
 */
async function fetchOsrmRaw(pathCoords) {
  var cached = getRouteCached(pathCoords);
  if (cached) return { ok: true, data: cached, cached: true };

  var custom = osrmCustomHosts();
  if (custom.length) {
    var own = await fetchOsrmFromHosts(pathCoords, custom);
    if (own.ok) {
      setRouteCached(pathCoords, own.data);
      return own;
    }
  }

  var pub = await fetchOsrmFromHosts(pathCoords, OSRM_PUBLIC);
  if (pub.ok) {
    setRouteCached(pathCoords, pub.data);
    return pub;
  }

  var ors = await fetchOpenRouteService(pathCoords);
  if (ors.ok) {
    setRouteCached(pathCoords, ors.data);
    return ors;
  }

  return ors.ok ? ors : pub;
}

/** Respuesta lista para la APK nativa (polyline + maniobra). */
async function fetchOsrmRouteForApp(query) {
  const fromLng = parseFloat(query.fromLng);
  const fromLat = parseFloat(query.fromLat);
  const toLng = parseFloat(query.toLng);
  const toLat = parseFloat(query.toLat);
  if ([fromLng, fromLat, toLng, toLat].some(function (v) { return isNaN(v); })) {
    return { ok: false, error: 'missing_coords', status: 400 };
  }
  const pathCoords = fromLng + ',' + fromLat + ';' + toLng + ',' + toLat;
  const raw = await fetchOsrmRaw(pathCoords);
  if (!raw.ok) return raw;

  const route = raw.data.routes[0];
  const geom = route.geometry && route.geometry.coordinates;
  if (!geom || !geom.length) {
    return { ok: false, error: 'osrm_empty_geometry', status: 502 };
  }
  const coordinates = geom.map(function (c) {
    return { lat: c[1], lng: c[0] };
  });
  const leg = route.legs && route.legs[0];
  const steps = (leg && leg.steps) || [];
  const step = steps.length ? steps[0] : null;
  return {
    ok: true,
    coordinates: coordinates,
    distance_m: Number(route.distance) || 0,
    duration_sec: Number(route.duration) || 0,
    maneuver: maneuverTextFromStep(step),
  };
}

/** Passthrough JSON crudo OSRM (compat). */
async function fetchOsrmRouteJson(query) {
  const fromLng = parseFloat(query.fromLng);
  const fromLat = parseFloat(query.fromLat);
  const toLng = parseFloat(query.toLng);
  const toLat = parseFloat(query.toLat);
  if ([fromLng, fromLat, toLng, toLat].some(function (v) { return isNaN(v); })) {
    return { ok: false, error: 'missing_coords', status: 400 };
  }
  const pathCoords = fromLng + ',' + fromLat + ';' + toLng + ',' + toLat;
  const raw = await fetchOsrmRaw(pathCoords);
  if (!raw.ok) return raw;
  return {
    ok: true,
    status: 200,
    body: JSON.stringify(raw.data),
    contentType: 'application/json; charset=utf-8',
  };
}

module.exports = { fetchOsrmRouteJson, fetchOsrmRouteForApp };
