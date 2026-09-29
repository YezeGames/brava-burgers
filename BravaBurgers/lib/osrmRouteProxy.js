const OSRM_HOSTS = [
  'https://router.project-osrm.org/route/v1/driving/',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
];

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

async function fetchOsrmRaw(pathCoords) {
  var lastErr = { ok: false, error: 'osrm_failed' };
  for (var h = 0; h < OSRM_HOSTS.length; h++) {
    var url =
      OSRM_HOSTS[h] +
      pathCoords +
      '?overview=full&geometries=geojson&steps=true&language=es&alternatives=false';
    try {
      var upstream = await fetch(url, {
        headers: { 'User-Agent': 'BravaBurgers-Repartidor/1.0 (osrm-proxy)' },
        cache: 'no-store',
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
