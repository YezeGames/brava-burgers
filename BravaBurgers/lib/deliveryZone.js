/**
 * Zona de entrega Brava — 7 polígonos My Maps (point-in-polygon).
 * Datos: data/zonas-entrega.geojson
 */
const fs = require('fs');
const path = require('path');

const GEOJSON_PATH = path.join(__dirname, '..', 'data', 'zonas-entrega.geojson');

let cachedZones = null;

function pointInRing(lng, lat, ring) {
  if (lng == null || lat == null || !ring || !ring.length) return false;
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0];
    var yi = ring[i][1];
    var xj = ring[j][0];
    var yj = ring[j][1];
    var intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringArea(ring) {
  var a = 0;
  for (var i = 0; i < ring.length; i++) {
    var j = i === 0 ? ring.length - 1 : i - 1;
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

function loadDeliveryZones() {
  if (cachedZones) return cachedZones;
  var raw = fs.readFileSync(GEOJSON_PATH, 'utf8');
  var geo = JSON.parse(raw);
  if (!geo.features || !geo.features.length) {
    throw new Error('invalid_zones_geojson');
  }
  cachedZones = geo.features
    .filter(function (f) {
      return f.geometry && f.geometry.type === 'Polygon';
    })
    .map(function (f) {
      var ring = f.geometry.coordinates[0];
      return {
        nombre: (f.properties && f.properties.nombre) || 'Zona',
        ring: ring,
        area: ringArea(ring),
      };
    });
  if (!cachedZones.length) throw new Error('invalid_zones_geojson');
  return cachedZones;
}

/** @returns {string|null} nombre de zona o null si fuera de las 7 */
function findDeliveryZoneName(lng, lat) {
  var zones = loadDeliveryZones();
  var matches = zones.filter(function (z) {
    return pointInRing(Number(lng), Number(lat), z.ring);
  });
  if (!matches.length) return null;
  matches.sort(function (a, b) {
    return a.area - b.area;
  });
  return matches[0].nombre;
}

function pointInDeliveryZone(lng, lat) {
  return findDeliveryZoneName(lng, lat) != null;
}

function getDeliveryZoneMeta() {
  var raw = fs.readFileSync(GEOJSON_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Bounding box de las 7 zonas — para Mapbox bbox */
function getDeliveryBbox(padRatio) {
  padRatio = padRatio == null ? 0.02 : padRatio;
  var zones = loadDeliveryZones();
  var minLng = Infinity;
  var maxLng = -Infinity;
  var minLat = Infinity;
  var maxLat = -Infinity;
  zones.forEach(function (z) {
    z.ring.forEach(function (c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[1] > maxLat) maxLat = c[1];
    });
  });
  var padLng = (maxLng - minLng) * padRatio || 0.01;
  var padLat = (maxLat - minLat) * padRatio || 0.01;
  return {
    minLng: minLng - padLng,
    minLat: minLat - padLat,
    maxLng: maxLng + padLng,
    maxLat: maxLat + padLat,
  };
}

function getDeliveryBboxString() {
  var b = getDeliveryBbox();
  return [b.minLng, b.minLat, b.maxLng, b.maxLat].join(',');
}

function getDeliveryProximityString() {
  var b = getDeliveryBbox();
  var lng = (b.minLng + b.maxLng) / 2;
  var lat = (b.minLat + b.maxLat) / 2;
  return lng + ',' + lat;
}

/** Polígono My Maps → nombre en Sheet configuracion */
function mapaZonaToSheet(mapaNombre) {
  var m = {
    Olivos: 'Olivos',
    'La Lucila': 'La Lucila',
    Martinez: 'Martinez',
    Acasusso: 'Acasusso',
    Munro: 'Munro / F. Oeste',
    Carapachay: 'Carapachay',
    'Villa Adelina': 'Villa Adelina',
  };
  return m[mapaNombre] || mapaNombre || '';
}

/** Compat: primer anillo (legacy) — preferir findDeliveryZoneName */
function loadDeliveryRing() {
  return loadDeliveryZones()[0].ring;
}

module.exports = {
  pointInRing: pointInRing,
  ringArea: ringArea,
  loadDeliveryZones: loadDeliveryZones,
  loadDeliveryRing: loadDeliveryRing,
  findDeliveryZoneName: findDeliveryZoneName,
  pointInDeliveryZone: pointInDeliveryZone,
  getDeliveryZoneMeta: getDeliveryZoneMeta,
  getDeliveryBbox: getDeliveryBbox,
  getDeliveryBboxString: getDeliveryBboxString,
  getDeliveryProximityString: getDeliveryProximityString,
  mapaZonaToSheet: mapaZonaToSheet,
  GEOJSON_PATH: GEOJSON_PATH,
};
