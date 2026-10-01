const {
  OSRM_ROUTE_QUERY,
  pickShortestOsrmRoute,
  ROUTE_CACHE_PROFILE,
} = require('./bravaRoutePreferences');

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

var maneuverTextFromOsrmStep = require('./navManeuverEs').maneuverTextFromOsrmStep;

function maneuverTextFromStep(step) {
  return maneuverTextFromOsrmStep(step);
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
  return roundPart(parts[0]) + ';' + roundPart(parts[1]) + ';' + ROUTE_CACHE_PROFILE;
}

function getRouteCached(pathCoords) {
  var k = routeCacheKey(pathCoords);
  var hit = routeCache.get(k);
  if (!hit || Date.now() > hit.exp) return null;
  return hit;
}

function setRouteCached(pathCoords, data, routeSource) {
  var k = routeCacheKey(pathCoords);
  if (routeCache.size >= ROUTE_CACHE_MAX) {
    var first = routeCache.keys().next().value;
    if (first) routeCache.delete(first);
  }
  routeCache.set(k, {
    exp: Date.now() + ROUTE_CACHE_TTL_MS,
    data: data,
    routeSource: routeSource || 'brava_pc',
  });
}

async function fetchOsrmFromHosts(pathCoords, list) {
  var lastErr = { ok: false, error: 'osrm_failed' };
  for (var h = 0; h < list.length; h++) {
    var url =
      list[h] +
      pathCoords +
      OSRM_ROUTE_QUERY;
    try {
      var upstream = await fetch(url, {
        headers: { 'User-Agent': 'BravaBurgers-Repartidor/1.0 (osrm-proxy)' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
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
      if (data.code === 'Ok' && data.routes && data.routes.length) {
        var shortest = pickShortestOsrmRoute(data.routes);
        return { ok: true, data: { code: data.code, routes: [shortest] } };
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

function bravaOsrmPublicBase() {
  var custom = String(process.env.BRAVA_OSRM_BASE_URL || process.env.OSRM_BASE_URL || '').trim();
  if (!custom) return null;
  var base = custom.replace(/\/+$/, '');
  if (base.indexOf('/route/v1/driving') < 0) base = base + '/route/v1/driving';
  return base.endsWith('/') ? base : base + '/';
}

function osrmCustomHosts() {
  var one = bravaOsrmPublicBase();
  return one ? [one] : [];
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
    preference: 'shortest',
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
 * API Brava de rutas: cache → Valhalla (PC) → OSRM propio → OSRM público → ORS.
 */
async function fetchOsrmRaw(pathCoords) {
  var cached = getRouteCached(pathCoords);
  if (cached) {
    return {
      ok: true,
      data: cached.data,
      routeSource: cached.routeSource || 'brava_pc',
      cached: true,
    };
  }

  var valhallaMod = require('./valhallaRouteProxy');
  if (valhallaMod.bravaValhallaRouteUrl()) {
    var parts = String(pathCoords || '').split(';');
    if (parts.length >= 2) {
      var a = parts[0].split(',');
      var b = parts[1].split(',');
      if (a.length >= 2 && b.length >= 2) {
        var v = await valhallaMod.fetchValhallaRoute(
          parseFloat(a[0]),
          parseFloat(a[1]),
          parseFloat(b[0]),
          parseFloat(b[1]),
        );
        if (v.ok) {
          setRouteCached(pathCoords, v.data, 'valhalla');
          return { ok: true, data: v.data, routeSource: 'valhalla' };
        }
      }
    }
  }

  var valhallaOnly = require('./valhallaServiceBase').valhallaOnlyRouting();

  var custom = osrmCustomHosts();
  if (!valhallaOnly && custom.length) {
    var own = await fetchOsrmFromHosts(pathCoords, custom);
    if (own.ok) {
      setRouteCached(pathCoords, own.data, 'brava_pc');
      return { ok: true, data: own.data, routeSource: 'brava_pc' };
    }
  }

  if (valhallaOnly) {
    return {
      ok: false,
      error: 'valhalla_unavailable',
      status: 502,
      detail: 'BRAVA_ROUTING_ENGINE=valhalla and Valhalla did not return a route',
    };
  }

  var pub = await fetchOsrmFromHosts(pathCoords, OSRM_PUBLIC);
  if (pub.ok) {
    setRouteCached(pathCoords, pub.data, 'osrm_public');
    return { ok: true, data: pub.data, routeSource: 'osrm_public' };
  }

  var ors = await fetchOpenRouteService(pathCoords);
  if (ors.ok) {
    setRouteCached(pathCoords, ors.data, 'ors');
    return { ok: true, data: ors.data, routeSource: 'ors' };
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
  var routeSource = raw.routeSource || 'osrm_public';
  return {
    ok: true,
    coordinates: coordinates,
    distance_m: Number(route.distance) || 0,
    duration_sec: Number(route.duration) || 0,
    maneuver: maneuverTextFromStep(step),
    route_source: routeSource,
    steps: steps.map(function (s) {
      return {
        distance: s.distance,
        name: s.name,
        maneuver: s.maneuver,
      };
    }),
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

function bravaRouteBases() {
  var valhallaMod = require('./valhallaRouteProxy');
  var valhalla = valhallaMod.bravaValhallaRouteUrl();
  var osrm = bravaOsrmPublicBase();
  return {
    ok: true,
    /** Legacy APK: solo GET OSRM; no poner Valhalla acá. */
    primary: osrm,
    valhalla: valhalla,
    osrm: osrm,
    engine: valhalla ? 'valhalla' : osrm ? 'osrm' : null,
  };
}

module.exports = {
  fetchOsrmRouteJson,
  fetchOsrmRouteForApp,
  bravaOsrmPublicBase,
  bravaRouteBases,
};
