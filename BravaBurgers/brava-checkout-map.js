/**
 * Mapa checkout: pin arrastrable + polígonos de entrega. La zona se valida con el pin.
 */
(function (global) {
  'use strict';

  var CENTER = [-58.489, -34.513];
  var map = null;
  var marker = null;
  var token = null;
  var bootPromise = null;
  var mapReady = false;
  var pinLngLat = null;
  var zoneOk = false;
  var reverseSeq = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function zonesGeoJSON() {
    var zones = global.BravaDeliveryZone && global.BravaDeliveryZone.getZones();
    if (!zones || !zones.length) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: zones.map(function (z) {
        return {
          type: 'Feature',
          properties: { nombre: z.nombre },
          geometry: { type: 'Polygon', coordinates: [z.ring] },
        };
      }),
    };
  }

  function setZoneOk(ok) {
    zoneOk = !!ok;
  }

  function validatePin(lng, lat) {
    var zona = global.BravaDeliveryZone ? global.BravaDeliveryZone.findZona(lng, lat) : null;
    if (typeof global.bravaApplyPinZone === 'function') {
      global.bravaApplyPinZone(zona, lng, lat);
    }
    setZoneOk(!!zona);
    return zona;
  }

  function reverseGeocode(lng, lat) {
    if (!token) return Promise.resolve();
    var seq = ++reverseSeq;
    var url =
      'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
      encodeURIComponent(lng + ',' + lat) +
      '.json?types=address&limit=1&language=es&access_token=' +
      encodeURIComponent(token);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (seq !== reverseSeq) return;
        var f = data.features && data.features[0];
        if (!f) return;
        var inp = $('pregunta_2_respuesta');
        var loc = $('pregunta_3_respuesta');
        var street = String(f.text || '').trim();
        var num = f.address ? String(f.address).trim() : '';
        var line = num ? street + ' ' + num : street;
        if (!line) line = String(f.place_name || '').split(',')[0].trim();
        if (inp) {
          inp.value = line;
          inp.dataset.lat = String(f.center[1]);
          inp.dataset.lng = String(f.center[0]);
        }
        if (loc && f.context) {
          var locality = '';
          (f.context || []).forEach(function (c) {
            var id = String(c.id || '');
            if (!locality && (id.indexOf('place.') === 0 || id.indexOf('locality.') === 0)) {
              locality = c.text || '';
            }
          });
          if (locality) loc.value = locality;
        }
      })
      .catch(function () {});
  }

  function buildMap() {
    if (mapReady || !token || !global.mapboxgl) return;
    var shell = $('brava-checkout-map');
    if (!shell) return;

    global.mapboxgl.accessToken = token;
    map = new global.mapboxgl.Map({
      container: 'brava-checkout-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CENTER,
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new global.mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', function () {
      var geo = zonesGeoJSON();
      if (geo.features.length) {
        map.addSource('brava-zones', { type: 'geojson', data: geo });
        map.addLayer({
          id: 'brava-zones-fill',
          type: 'fill',
          source: 'brava-zones',
          paint: { 'fill-color': '#ff6b35', 'fill-opacity': 0.18 },
        });
        map.addLayer({
          id: 'brava-zones-line',
          type: 'line',
          source: 'brava-zones',
          paint: { 'line-color': '#ff6b35', 'line-width': 2 },
        });
      }

      marker = new global.mapboxgl.Marker({ color: '#ff6b35', draggable: true })
        .setLngLat(CENTER)
        .addTo(map);

      pinLngLat = { lng: CENTER[0], lat: CENTER[1] };

      marker.on('dragend', function () {
        var ll = marker.getLngLat();
        pinLngLat = { lng: ll.lng, lat: ll.lat };
        reverseGeocode(ll.lng, ll.lat).then(function () {
          validatePin(ll.lng, ll.lat);
        });
      });

      map.on('click', function (e) {
        pinLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        marker.setLngLat(e.lngLat);
        reverseGeocode(e.lngLat.lng, e.lngLat.lat).then(function () {
          validatePin(e.lngLat.lng, e.lngLat.lat);
        });
      });

      mapReady = true;
      setBannerPending();
    });
  }

  function setBannerPending() {
    if (typeof global.bravaResetZoneDelivery === 'function') {
      global.bravaResetZoneDelivery();
    }
  }

  function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = fetch('/api/mapbox-config')
      .then(function (r) {
        return r.json();
      })
      .then(function (cfg) {
        if (!cfg.ok || !cfg.token) throw new Error('no_mapbox');
        token = cfg.token;
        if (global.BravaDeliveryZone) return global.BravaDeliveryZone.loadZones();
      })
      .then(function () {
        buildMap();
      })
      .catch(function () {
        var shell = $('brava-checkout-map-wrap');
        if (shell) {
          shell.innerHTML =
            '<p class="brava-map-error">No se pudo cargar el mapa. Recargá la página.</p>';
        }
      });
    return bootPromise;
  }

  function ensureMap() {
    return boot().then(function () {
      if (map && mapReady) {
        setTimeout(function () {
          map.resize();
        }, 120);
      }
    });
  }

  function setPin(lng, lat, opts) {
    opts = opts || {};
    if (!mapReady || !marker) {
      pinLngLat = { lng: lng, lat: lat };
      return ensureMap().then(function () {
        setPin(lng, lat, opts);
      });
    }
    pinLngLat = { lng: lng, lat: lat };
    marker.setLngLat([lng, lat]);
    if (!opts.skipFly && map) {
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.5), duration: 700 });
    }
    validatePin(lng, lat);
  }

  function getPin() {
    return pinLngLat;
  }

  function isZoneOk() {
    return zoneOk;
  }

  function resize() {
    if (map) map.resize();
  }

  global.bravaCheckoutMap = {
    boot: boot,
    ensureMap: ensureMap,
    setPin: setPin,
    getPin: getPin,
    isZoneOk: isZoneOk,
    setZoneOk: setZoneOk,
    resize: resize,
  };
})(typeof window !== 'undefined' ? window : this);
