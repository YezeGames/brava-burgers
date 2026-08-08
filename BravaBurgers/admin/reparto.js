(function () {
  'use strict';

  var ORIGIN_KEY = 'brava_reparto_origin_v1';
  var DEFAULT_ORIGIN = 'Diaz Velez 3231, Olivos';
  var DELI_WA_KEY = 'brava_demo_deli_wa_v1';
  var geocodeCache = Object.create(null);

  var candidates = [];
  var selected = [];
  var routeOrder = [];
  var map = null;
  var mapReady = false;
  var accessToken = '';
  var mapInitStarted = false;
  var refreshTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function normEst(est) {
    var e = String(est || '').trim().toLowerCase();
    if (e === 'activa') return 'pendiente';
    return e;
  }

  function fmt(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
  }

  function payLine(o) {
    if (/efectivo/i.test(o.pago)) return fmt(o.total) + ' (COBRAR EN EFECTIVO)';
    if (/mercado/i.test(o.pago)) return 'PAGO (MERCADO PAGO)';
    return 'PAGO (' + String(o.pago || '').toUpperCase() + ')';
  }

  function fullAddr(o) {
    var p = [o.direccion];
    if (o.piso) p.push('Piso ' + o.piso);
    if (o.localidad) p.push(o.localidad);
    p.push('Provincia de Buenos Aires', 'Argentina');
    return p.filter(Boolean).join(', ');
  }

  function originText() {
    var el = $('reparto-origin');
    return el ? el.value.trim() : '';
  }

  function stops() {
    return routeOrder
      .map(function (orn) {
        return candidates.find(function (c) {
          return c.orn === orn;
        });
      })
      .filter(Boolean);
  }

  function buildHoja(list) {
    if (!list.length) return '';
    return list
      .map(function (o) {
        return (o.direccion || '').toUpperCase() + ' — ' + payLine(o);
      })
      .join('\n');
  }

  function gmapsUrl(list) {
    if (!list.length) return '';
    var parts = [];
    var orig = originText();
    if (orig) parts.push(encodeURIComponent(orig + ', Provincia de Buenos Aires, Argentina'));
    list.forEach(function (o) {
      parts.push(encodeURIComponent(fullAddr(o)));
    });
    if (!parts.length) return '';
    return 'https://www.google.com/maps/dir/' + parts.join('/') + '/?travelmode=driving';
  }

  function buildDeliWhatsAppText(list) {
    var lines = ['*Ruta delivery — Brava*', ''];
    list.forEach(function (o, i) {
      lines.push((i + 1) + '. ' + (o.direccion || '').toUpperCase() + ' — ' + payLine(o));
    });
    var g = gmapsUrl(list);
    if (g) {
      lines.push('');
      lines.push('*Navegar (Google Maps, mismo orden):*');
      lines.push(g);
    }
    return lines.join('\n');
  }

  function normalizeWaPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('54') !== 0) d = '54' + d.replace(/^0+/, '');
    return d;
  }

  function whatsAppSendUrl(text, phone) {
    var q = 'text=' + encodeURIComponent(text);
    var p = normalizeWaPhone(phone);
    if (p) return 'https://wa.me/' + p + '?' + q;
    return 'https://wa.me/?' + q;
  }

  function setStatus(msg, err) {
    var el = $('reparto-route-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'reparto-route-status' + (err ? ' is-err' : '');
  }

  function coordPair(lng, lat) {
    return lng.toFixed(6) + ',' + lat.toFixed(6);
  }

  function geocode(query) {
    var q = String(query || '').trim();
    if (!q) return Promise.reject(new Error('Dirección vacía'));
    if (geocodeCache[q]) return Promise.resolve(geocodeCache[q]);
    if (!accessToken) return Promise.reject(new Error('Sin token Mapbox'));
    var url =
      'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
      encodeURIComponent(q) +
      '.json?country=ar&limit=1&language=es&access_token=' +
      encodeURIComponent(accessToken);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.features || !data.features.length) {
          throw new Error('No se encontró: ' + q);
        }
        var f = data.features[0];
        var c = { lng: f.center[0], lat: f.center[1] };
        geocodeCache[q] = c;
        return c;
      });
  }

  function clearMapLayers() {
    if (!map) return;
    if (map._repartoMarkers) {
      map._repartoMarkers.forEach(function (m) {
        m.remove();
      });
    }
    map._repartoMarkers = [];
    if (map.getLayer('reparto-route-line')) map.removeLayer('reparto-route-line');
    if (map.getSource('reparto-route')) map.removeSource('reparto-route');
  }

  function addPin(lng, lat, label, isStart) {
    var el = document.createElement('div');
    el.className = 'reparto-pin ' + (isStart ? 'start' : 'stop');
    el.textContent = label;
    var m = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    if (!map._repartoMarkers) map._repartoMarkers = [];
    map._repartoMarkers.push(m);
  }

  function scheduleRefreshRoute() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshRoute, 280);
  }

  function refreshRoute() {
    if (!mapReady || !accessToken) return;
    var list = stops();
    clearMapLayers();
    if (!list.length) {
      setStatus('Elegí al menos una parada.');
      return;
    }
    var orig = originText();
    if (!orig) {
      setStatus('Completá «Salida cocina» para calcular la ruta en el mapa.', true);
      return;
    }

    setStatus('Geocodificando…');
    var originQuery = orig + ', Provincia de Buenos Aires, Argentina';
    Promise.all([geocode(originQuery)].concat(list.map(function (o) { return geocode(fullAddr(o)); })))
      .then(function (coords) {
        var origin = coords[0];
        var stopCoords = coords.slice(1);
        addPin(origin.lng, origin.lat, 'S', true);
        stopCoords.forEach(function (c, i) {
          addPin(c.lng, c.lat, String(i + 1), false);
        });
        var pairs = [coordPair(origin.lng, origin.lat)];
        stopCoords.forEach(function (c) {
          pairs.push(coordPair(c.lng, c.lat));
        });
        var url =
          'https://api.mapbox.com/directions/v5/mapbox/driving/' +
          encodeURIComponent(pairs.join(';')) +
          '?geometries=geojson&overview=full&language=es&access_token=' +
          encodeURIComponent(accessToken);
        setStatus('Calculando ruta…');
        return fetch(url).then(function (r) {
          return r.json();
        });
      })
      .then(function (data) {
        if (!data || !data.routes || !data.routes.length) {
          setStatus((data && data.message) || 'Sin ruta' + (data && data.code ? ' (' + data.code + ')' : ''), true);
          return;
        }
        var route = data.routes[0];
        map.addSource('reparto-route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: route.geometry }
        });
        map.addLayer({
          id: 'reparto-route-line',
          type: 'line',
          source: 'reparto-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#4285F4', 'line-width': 4, 'line-opacity': 0.85 }
        });
        var bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach(function (c) {
          bounds.extend(c);
        });
        map.fitBounds(bounds, { padding: 36, maxZoom: 15 });
        var km = (route.distance / 1000).toFixed(1);
        var min = Math.round(route.duration / 60);
        setStatus('Ruta ~' + km + ' km · ~' + min + ' min (Mapbox)');
      })
      .catch(function (e) {
        setStatus(e.message || String(e), true);
      });
  }

  function renderRouteList() {
    var ul = $('reparto-route-list');
    if (!ul) return;
    ul.innerHTML = '';
    stops().forEach(function (o, idx) {
      var li = document.createElement('li');
      li.innerHTML =
        '<span class="num">' +
        (idx + 1) +
        '</span><span>' +
        escapeHtml(o.direccion) +
        '<br><span style="color:var(--text-subtle)">' +
        escapeHtml(payLine(o)) +
        '</span></span><span><button type="button" data-u="' +
        escapeAttr(o.orn) +
        '">↑</button> <button type="button" data-d="' +
        escapeAttr(o.orn) +
        '">↓</button></span>';
      ul.appendChild(li);
    });
    ul.querySelectorAll('[data-u]').forEach(function (b) {
      b.onclick = function () {
        move(b.getAttribute('data-u'), -1);
      };
    });
    ul.querySelectorAll('[data-d]').forEach(function (b) {
      b.onclick = function () {
        move(b.getAttribute('data-d'), 1);
      };
    });

    var list = stops();
    var ef = list.filter(function (o) {
      return /efectivo/i.test(o.pago);
    });
    var sum = ef.reduce(function (s, o) {
      return s + (Number(o.total) || 0);
    }, 0);
    $('reparto-n-stops').textContent = String(list.length);
    $('reparto-ef-total').textContent = fmt(sum);
    $('reparto-hoja').value = buildHoja(list);
    var has = list.length > 0;
    $('reparto-btn-gmaps').disabled = !has;
    $('reparto-btn-wa').disabled = !has;
    $('reparto-btn-copy').disabled = !has;
    scheduleRefreshRoute();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function move(orn, dir) {
    var i = routeOrder.indexOf(orn);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= routeOrder.length) return;
    var t = routeOrder[j];
    routeOrder[j] = routeOrder[i];
    routeOrder[i] = t;
    renderRouteList();
  }

  function isOrnSelected(orn) {
    return selected.indexOf(orn) !== -1;
  }

  function canSelectOrn(orn) {
    return candidates.some(function (c) {
      return c.orn === orn;
    });
  }

  function syncMainTableRepartoUi() {
    document.querySelectorAll('#orders-table .reparto-order-cb').forEach(function (cb) {
      var orn = cb.getAttribute('data-orn');
      var on = isOrnSelected(orn);
      cb.checked = on;
      var tr = cb.closest('tr');
      if (tr) tr.classList.toggle('row-reparto-on', on);
    });
  }

  function setOrderSelected(orn, on) {
    if (!canSelectOrn(orn)) return;
    var ix = selected.indexOf(orn);
    if (on && ix === -1) selected.push(orn);
    if (!on && ix !== -1) selected.splice(ix, 1);
    syncRouteFromSelection();
    syncMainTableRepartoUi();
  }

  function syncRouteFromSelection() {
    routeOrder = selected.filter(function (orn) {
      return candidates.some(function (c) {
        return c.orn === orn;
      });
    });
    updateRepartoMeta();
    renderRouteList();
  }

  function updateRepartoMeta() {
    var noCand = $('reparto-no-candidates');
    if (noCand) noCand.classList.toggle('hidden', candidates.length > 0);
  }

  function pickCandidatesFromOrders(orders) {
    var list = (orders || []).filter(function (o) {
      if (normEst(o.estado) !== 'aceptado') return false;
      return String(o.direccion || '').trim().length > 0;
    });
    list.sort(function (a, b) {
      var ta = a.aceptado_at || a.fecha_creado || '';
      var tb = b.aceptado_at || b.fecha_creado || '';
      return String(ta).localeCompare(String(tb));
    });
    return list;
  }

  function pruneSelection() {
    var valid = new Set(candidates.map(function (c) {
      return c.orn;
    }));
    selected = selected.filter(function (orn) {
      return valid.has(orn);
    });
  }

  function setMapShellVisible(show, message) {
    var shell = $('reparto-map-shell');
    var mapEl = $('reparto-map');
    if (shell) {
      if (message != null) shell.textContent = message;
      shell.classList.toggle('hidden', !show);
      shell.hidden = !show;
    }
    if (mapEl) {
      mapEl.classList.toggle('hidden', show);
      mapEl.hidden = show;
    }
  }

  function showMapContainer() {
    setMapShellVisible(false);
    if (map && mapReady) {
      try {
        map.resize();
      } catch (e) {}
    }
  }

  function initMap(token) {
    accessToken = token;
    mapboxgl.accessToken = token;
    if (map) {
      mapReady = true;
      showMapContainer();
      refreshRoute();
      return;
    }
    showMapContainer();
    map = new mapboxgl.Map({
      container: 'reparto-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-58.49, -34.51],
      zoom: 12
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', function () {
      mapReady = true;
      showMapContainer();
      refreshRoute();
    });
  }

  function ensureMapInit() {
    if (mapInitStarted) return;
    mapInitStarted = true;
    setMapShellVisible(true, 'Cargando mapa…');
    if (!/^https?:/i.test(window.location.protocol)) {
      setMapShellVisible(true, 'Mapa disponible con el admin en HTTPS (Vercel).');
      return;
    }
    fetch('/api/mapbox-config', { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok && data.token) initMap(data.token);
        else setMapShellVisible(true, 'Falta MAPBOX_ACCESS_TOKEN en Vercel.');
      })
      .catch(function () {
        setMapShellVisible(true, 'No se pudo cargar Mapbox.');
      });
  }

  function onOrdersUpdated(orders) {
    candidates = pickCandidatesFromOrders(orders);
    pruneSelection();
    syncRouteFromSelection();
    syncMainTableRepartoUi();
    if ($('sidebar-fold-reparto') && $('sidebar-fold-reparto').open) ensureMapInit();
  }

  function bindUi() {
    var fold = $('sidebar-fold-reparto');
    if (fold) {
      fold.addEventListener('toggle', function () {
        if (fold.open) ensureMapInit();
        else if (map && mapReady) map.resize();
      });
    }
    var originEl = $('reparto-origin');
    if (originEl) {
      try {
        var savedO = sessionStorage.getItem(ORIGIN_KEY);
        if (savedO != null && String(savedO).trim() !== '') originEl.value = savedO;
        else originEl.value = DEFAULT_ORIGIN;
      } catch (e) {}
      originEl.addEventListener('change', function () {
        try {
          sessionStorage.setItem(ORIGIN_KEY, originEl.value);
        } catch (e2) {}
        scheduleRefreshRoute();
      });
      originEl.addEventListener('input', scheduleRefreshRoute);
      originEl.addEventListener('blur', function () {
        try {
          sessionStorage.setItem(ORIGIN_KEY, originEl.value);
        } catch (e3) {}
      });
    }
    var waEl = $('reparto-deli-wa');
    if (waEl) {
      try {
        var savedWa = sessionStorage.getItem(DELI_WA_KEY);
        if (savedWa) waEl.value = savedWa;
      } catch (eWa) {}
    }
    $('reparto-btn-gmaps').onclick = function () {
      var u = gmapsUrl(stops());
      if (u) window.open(u, '_blank', 'noopener');
    };
    $('reparto-btn-wa').onclick = function () {
      var list = stops();
      if (!list.length) return;
      var phone = waEl ? waEl.value : '';
      try {
        sessionStorage.setItem(DELI_WA_KEY, phone);
      } catch (e) {}
      window.open(whatsAppSendUrl(buildDeliWhatsAppText(list), phone), '_blank', 'noopener');
    };
    $('reparto-btn-copy').onclick = function () {
      var ta = $('reparto-hoja');
      if (!ta) return;
      ta.select();
      navigator.clipboard.writeText(ta.value).catch(function () {
        document.execCommand('copy');
      });
    };
  }

  function init() {
    if (!$('reparto-route-list')) return;
    bindUi();
    onOrdersUpdated([]);
  }

  window.BravaReparto = {
    init: init,
    onOrdersUpdated: onOrdersUpdated,
    isOrnSelected: isOrnSelected,
    setOrderSelected: setOrderSelected
  };
})();
