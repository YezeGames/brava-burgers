/**
 * Cliente: zona de entrega (7 polígonos My Maps).
 */
(function (global) {
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

  var zones = null;
  var loadPromise = null;

  function loadZones(url) {
    url = url || 'data/zonas-entrega.geojson';
    if (zones) return Promise.resolve(zones);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(url, { cache: 'default' })
      .then(function (r) {
        if (!r.ok) throw new Error('geojson_load_failed');
        return r.json();
      })
      .then(function (geo) {
        if (!geo.features || !geo.features.length) throw new Error('invalid_geojson');
        zones = geo.features
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
        if (!zones.length) throw new Error('invalid_geojson');
        return zones;
      });
    return loadPromise;
  }

  /** @returns {string|null} */
  function findZona(lng, lat) {
    if (!zones) return null;
    var matches = zones.filter(function (z) {
      return pointInRing(Number(lng), Number(lat), z.ring);
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return a.area - b.area;
    });
    return matches[0].nombre;
  }

  function check(lng, lat) {
    if (!zones) return null;
    return findZona(lng, lat) != null;
  }

  function checkViaApi(lat, lng) {
    return fetch(
      '/api/delivery-zone?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng),
      { cache: 'no-store' }
    ).then(function (r) {
      return r.json();
    });
  }

  global.BravaDeliveryZone = {
    pointInRing: pointInRing,
    loadZones: loadZones,
    loadRing: loadZones,
    findZona: findZona,
    check: check,
    checkViaApi: checkViaApi,
    getZones: function () {
      return zones;
    },
  };
})(typeof window !== 'undefined' ? window : this);
