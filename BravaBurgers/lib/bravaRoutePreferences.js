/**
 * Criterio único de routing Brava: **menor distancia** en cada tramo A→B
 * (parada 1, 2, 3…, recálculo GPS, proxy y admin).
 */
var VALHALLA_COSTING_OPTIONS = {
  auto: {
    shortest: true,
    disable_hierarchy_pruning: true,
  },
};

var OSRM_ROUTE_QUERY =
  '?overview=full&geometries=geojson&steps=true&alternatives=2';

function pickShortestOsrmRoute(routes) {
  if (!routes || !routes.length) return null;
  var best = routes[0];
  for (var i = 1; i < routes.length; i++) {
    var r = routes[i];
    if ((Number(r.distance) || 0) < (Number(best.distance) || 0)) best = r;
  }
  return best;
}

/** Sufijo de cache: al cambiar criterio, invalidar entradas viejas. */
var ROUTE_CACHE_PROFILE = 'shortest-v1';

module.exports = {
  VALHALLA_COSTING_OPTIONS,
  OSRM_ROUTE_QUERY,
  pickShortestOsrmRoute,
  ROUTE_CACHE_PROFILE,
};
