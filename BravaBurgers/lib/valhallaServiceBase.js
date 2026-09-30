const { bravaValhallaRouteUrl } = require('./valhallaRouteProxy');

/** Origen del servicio (sin /route) para locate, trace_route, etc. */
function bravaValhallaServiceBase() {
  var routeUrl = bravaValhallaRouteUrl();
  if (!routeUrl) return null;
  return routeUrl.replace(/\/route\/?$/i, '');
}

function valhallaOnlyRouting() {
  var v = String(process.env.BRAVA_ROUTING_ENGINE || process.env.BRAVA_ROUTING || '')
    .trim()
    .toLowerCase();
  return v === 'valhalla' || v === 'valhalla_only';
}

module.exports = { bravaValhallaServiceBase, valhallaOnlyRouting };
