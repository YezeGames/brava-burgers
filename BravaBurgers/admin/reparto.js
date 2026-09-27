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
  var mapInitStarted = false;
  var OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  var MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  var refreshTimer = null;
  var lastRouteStopsSig = '';
  var mapViewInitialized = false;
  var prevStopCount = 0;

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

  function isEfectivo(o) {
    return /efectivo/i.test(o && o.pago);
  }

  function payBadge(o) {
    if (isEfectivo(o)) {
      return '<span class="pay-badge pay-badge--ef"><i class="fas fa-money-bill-wave" aria-hidden="true"></i> EF</span>';
    }
    return '<span class="pay-badge pay-badge--mp"><i class="fas fa-mobile-screen" aria-hidden="true"></i> MP</span>';
  }

  function parseOrderItems(o) {
    if (!o) return [];
    if (Array.isArray(o.items) && o.items.length) return o.items;
    if (o.items_json) {
      try {
        var j = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json;
        if (Array.isArray(j)) return j;
      } catch (e) {}
    }
    return [];
  }

  function itemQty(it) {
    var q = it.qty != null ? it.qty : it.cantidad;
    q = parseFloat(q);
    return isNaN(q) || q <= 0 ? 1 : q;
  }

  function orderItemsSummary(o) {
    var items = parseOrderItems(o);
    if (!items.length) return '—';
    return items
      .map(function (it) {
        var q = itemQty(it);
        var name = String(it.nombre || it.name || 'Item').trim();
        return (q > 1 ? q + '× ' : '') + name;
      })
      .join(' · ');
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

  function repartidorAppPhoneReady() {
    var waEl = $('reparto-deli-wa');
    return !!(waEl && normalizeWaPhone(waEl.value));
  }

  function updateRepartoAppButton() {
    var appBtn = $('reparto-btn-app');
    if (appBtn) appBtn.disabled = !repartidorAppPhoneReady();
  }

  function routeStopsSignature() {
    return routeOrder
      .map(function (orn) {
        var o = candidates.find(function (c) {
          return c.orn === orn;
        });
        if (!o) return '';
        return orn + '|' + fullAddr(o);
      })
      .filter(Boolean)
      .join(';;');
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
    return fetch('/api/address-suggest?mode=geocode&q=' + encodeURIComponent(q))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || data.lng == null || data.lat == null) {
          throw new Error('No se encontró: ' + q);
        }
        var c = { lng: Number(data.lng), lat: Number(data.lat) };
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
    if (!mapReady) return;
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
        var url = OSRM + pairs.join(';') + '?geometries=geojson&overview=full';
        setStatus('Calculando ruta…');
        return fetch(url).then(function (r) {
          return r.json();
        });
      })
      .then(function (data) {
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
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
        var stopCount = list.length;
        var shouldFit = !mapViewInitialized || stopCount !== prevStopCount;
        prevStopCount = stopCount;
        if (shouldFit) {
          map.fitBounds(bounds, { padding: 36, maxZoom: 15 });
          mapViewInitialized = true;
        }
        var km = (route.distance / 1000).toFixed(1);
        var min = Math.round(route.duration / 60);
        setStatus('Ruta ~' + km + ' km · ~' + min + ' min · OSM/OSRM');
      })
      .catch(function (e) {
        setStatus(e.message || String(e), true);
      });
  }

  function reorderRoute(fromOrn, toOrn, insertAfter) {
    if (!fromOrn || !toOrn || fromOrn === toOrn) return;
    var fromIdx = routeOrder.indexOf(fromOrn);
    var toIdx = routeOrder.indexOf(toOrn);
    if (fromIdx < 0 || toIdx < 0) return;
    routeOrder.splice(fromIdx, 1);
    var newToIdx = routeOrder.indexOf(toOrn);
    if (newToIdx < 0) return;
    if (insertAfter) newToIdx += 1;
    routeOrder.splice(newToIdx, 0, fromOrn);
    renderRouteList({ refreshMap: true });
  }

  function bindRouteListDragDrop() {
    var ul = $('reparto-route-list');
    if (!ul || ul._routeDragBound) return;
    ul._routeDragBound = true;

    var routeDrag = null;

    function clearDragUi() {
      ul.querySelectorAll('.is-drag-over, .is-dragging').forEach(function (el) {
        el.classList.remove('is-drag-over', 'is-dragging');
      });
      routeDrag = null;
    }

    function onPointerMove(e) {
      if (!routeDrag) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var targetLi = el && el.closest ? el.closest('#reparto-route-list .timeline-item[data-orn]') : null;
      ul.querySelectorAll('.is-drag-over').forEach(function (node) {
        if (node !== targetLi) node.classList.remove('is-drag-over');
      });
      if (targetLi && targetLi.getAttribute('data-orn') !== routeDrag.orn) {
        targetLi.classList.add('is-drag-over');
        routeDrag.overOrn = targetLi.getAttribute('data-orn');
        routeDrag.overLi = targetLi;
      } else {
        routeDrag.overOrn = null;
        routeDrag.overLi = null;
      }
    }

    function onPointerUp(e) {
      if (!routeDrag) return;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (routeDrag.overLi && routeDrag.overOrn) {
        var rect = routeDrag.overLi.getBoundingClientRect();
        var insertAfter = e.clientY > rect.top + rect.height / 2;
        reorderRoute(routeDrag.orn, routeDrag.overOrn, insertAfter);
      }
      clearDragUi();
    }

    ul.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest('.reparto-drag-handle');
      if (!handle) return;
      var li = handle.closest('.timeline-item[data-orn]');
      if (!li) return;
      e.preventDefault();
      routeDrag = { orn: li.getAttribute('data-orn'), li: li, overOrn: null, overLi: null };
      li.classList.add('is-dragging');
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    });
  }

  function renderRouteList(opts) {
    opts = opts || {};
    var refreshMap = opts.refreshMap !== false;
    var ul = $('reparto-route-list');
    if (!ul) return;
    ul.innerHTML = '';
    stops().forEach(function (o, idx) {
      var li = document.createElement('li');
      li.className = 'timeline-item';
      li.setAttribute('data-orn', o.orn);
      var locHtml = o.localidad
        ? ' <span class="loc">· ' + escapeHtml(o.localidad) + '</span>'
        : '';
      li.innerHTML =
        '<div class="timeline-marker">' +
        (idx + 1) +
        '</div>' +
        '<article class="timeline-card">' +
        '<div class="timeline-card-line1">' +
        '<span class="addr">' +
        escapeHtml(o.direccion || '') +
        locHtml +
        '</span>' +
        payBadge(o) +
        '</div>' +
        '<div class="timeline-card-line2">' +
        '<span class="items">' +
        escapeHtml(orderItemsSummary(o)) +
        '</span>' +
        '<span class="total">' +
        fmt(o.total) +
        '</span>' +
        '<span class="orn-tag">' +
        escapeHtml(String(o.orn || '')) +
        '</span>' +
        '<button type="button" class="reparto-drag-handle" role="button" tabindex="0" aria-label="Reordenar parada ' +
        (idx + 1) +
        '" title="Arrastrar para reordenar"><i class="fas fa-grip-vertical" aria-hidden="true"></i></button>' +
        '</div></article>';
      ul.appendChild(li);
    });

    var list = stops();
    var ef = list.filter(isEfectivo);
    var sumEf = ef.reduce(function (s, o) {
      return s + (Number(o.total) || 0);
    }, 0);
    var sumMp = list
      .filter(function (o) {
        return !isEfectivo(o);
      })
      .reduce(function (s, o) {
        return s + (Number(o.total) || 0);
      }, 0);
    $('reparto-n-stops').textContent = String(list.length);
    $('reparto-ef-total').textContent = fmt(sumEf);
    var mpEl = $('reparto-mp-total');
    if (mpEl) mpEl.textContent = fmt(sumMp);
    $('reparto-hoja').value = buildHoja(list);
    var has = list.length > 0;
    $('reparto-btn-gmaps').disabled = !has;
    $('reparto-btn-wa').disabled = !has;
    updateRepartoAppButton();
    $('reparto-btn-copy').disabled = !has;
    updateDispatchButton();
    if (refreshMap) {
      var sig = routeStopsSignature();
      if (sig !== lastRouteStopsSig) {
        lastRouteStopsSig = sig;
        scheduleRefreshRoute();
      }
    }
  }

  function selectedOrnsInPreparacion() {
    return routeOrder.filter(function (orn) {
      var o = candidates.find(function (c) {
        return c.orn === orn;
      });
      return o && normEst(o.estado) === 'en_preparacion';
    });
  }

  function updateDispatchButton() {
    var btn = $('reparto-btn-dispatch');
    if (!btn) return;
    var n = selectedOrnsInPreparacion().length;
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? 'Marcar en camino (' + n + ')' : 'Marcar en camino';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    document.querySelectorAll('#orders-list .reparto-order-cb').forEach(function (cb) {
      var orn = cb.getAttribute('data-orn');
      var on = isOrnSelected(orn);
      cb.checked = on;
      var card = cb.closest('.order-card');
      if (card) card.classList.toggle('row-reparto-on', on);
    });
  }

  function setOrderSelected(orn, on) {
    if (!canSelectOrn(orn)) return;
    var ix = selected.indexOf(orn);
    if (on && ix === -1) selected.push(orn);
    if (!on && ix !== -1) selected.splice(ix, 1);
    syncRouteFromSelection();
    syncMainTableRepartoUi();
    renderRouteList({ refreshMap: true });
  }

  function syncRouteFromSelection() {
    var valid = Object.create(null);
    candidates.forEach(function (c) {
      valid[c.orn] = true;
    });
    var sel = selected.filter(function (orn) {
      return valid[orn];
    });
    var next = routeOrder.filter(function (orn) {
      return sel.indexOf(orn) !== -1;
    });
    sel.forEach(function (orn) {
      if (next.indexOf(orn) === -1) next.push(orn);
    });
    routeOrder = next;
    updateRepartoMeta();
  }

  function updateRepartoMeta() {
    var noCand = $('reparto-no-candidates');
    if (noCand) noCand.classList.toggle('hidden', candidates.length > 0);
  }

  function pickCandidatesFromOrders(orders) {
    var list = (orders || []).filter(function (o) {
      var e = normEst(o.estado);
      if (e !== 'en_preparacion' && e !== 'en_camino') return false;
      return String(o.direccion || '').trim().length > 0;
    });
    list.sort(function (a, b) {
      var ta = a.en_camino_at || a.en_preparacion_at || a.aceptado_at || a.fecha_creado || '';
      var tb = b.en_camino_at || b.en_preparacion_at || b.aceptado_at || b.fecha_creado || '';
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

  function initMap() {
    if (map) {
      mapReady = true;
      showMapContainer();
      refreshRoute();
      return;
    }
    showMapContainer();
    map = new mapboxgl.Map({
      container: 'reparto-map',
      style: MAP_STYLE,
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
    if (!window.mapboxgl) {
      setMapShellVisible(true, 'No cargó el mapa (MapLibre). Revisá conexión.');
      return;
    }
    try {
      initMap();
    } catch (e) {
      setMapShellVisible(true, 'No se pudo iniciar el mapa.');
    }
  }

  function onOrdersUpdated(orders) {
    var prevSig = routeStopsSignature();
    candidates = pickCandidatesFromOrders(orders);
    pruneSelection();
    syncRouteFromSelection();
    syncMainTableRepartoUi();
    renderRouteList({ refreshMap: routeStopsSignature() !== prevSig });
    if (!$('view-reparto') || $('view-reparto').hidden) return;
    ensureMapInit();
  }

  function onViewShow() {
    ensureMapInit();
    loadRepartidorUsersUi();
    if (map && mapReady) {
      setTimeout(function () {
        map.resize();
      }, 120);
    }
  }

  function loadRepartidorUsersUi() {
    if (!window.getAdminToken) return;
    fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listRepartidorUsers', token: window.getAdminToken() }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok && data.error === 'repartidor_users_schema_missing') {
          fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'migrateRepartidorUsers', token: window.getAdminToken() }),
          })
            .then(function () {
              loadRepartidorUsersUi();
            })
            .catch(function () {});
          return;
        }
        if (!data.ok) return;
        renderRepartidorUsersSelect(data.users || []);
        renderRepartidorCuentasList(data.users || []);
      })
      .catch(function () {});
  }

  function renderRepartidorUsersSelect(users) {
    var sel = $('reparto-deli-user');
    var waEl = $('reparto-deli-wa');
    if (!sel) return;
    var prev = sel.value;
    var active = (users || []).filter(function (u) {
      return u.activo !== false;
    });
    sel.innerHTML =
      '<option value="">— Elegí repartidor —</option>' +
      active
        .map(function (u) {
          var tel = normalizeWaPhone(u.telefono);
          var label = (u.nombre || u.login) + ' (@' + u.login + ')';
          return (
            '<option value="' +
            tel +
            '" data-login="' +
            u.login +
            '">' +
            label +
            '</option>'
          );
        })
        .join('');
    if (prev) sel.value = prev;
    else {
      try {
        var savedWa = sessionStorage.getItem(DELI_WA_KEY);
        if (savedWa) sel.value = savedWa;
      } catch (eSave) {}
    }
    syncRepartidorDeliFromSelect();
  }

  function syncRepartidorDeliFromSelect() {
    var sel = $('reparto-deli-user');
    var waEl = $('reparto-deli-wa');
    if (!sel || !waEl) return;
    var tel = sel.value || '';
    waEl.value = tel;
    try {
      if (tel) sessionStorage.setItem(DELI_WA_KEY, tel);
    } catch (e) {}
    if (window.BravaWaPanel && typeof window.BravaWaPanel.setRepartidorTel === 'function') {
      window.BravaWaPanel.setRepartidorTel(tel);
    }
    updateRepartoAppButton();
  }

  function renderRepartidorCuentasList(users) {
    var ul = $('reparto-cuentas-list');
    if (!ul) return;
    if (!users || !users.length) {
      ul.innerHTML = '<li class="reparto-cuentas-empty">Todavía no hay cuentas. Creá una abajo.</li>';
      return;
    }
    ul.innerHTML = users
      .map(function (u) {
        var off = u.activo === false ? ' · <em>inactivo</em>' : '';
        return (
          '<li><strong>' +
          (u.nombre || u.login) +
          '</strong> @' +
          u.login +
          ' · ' +
          u.telefono +
          off +
          ' <button type="button" class="btn-sm reparto-reset-pw" data-login="' +
          u.login +
          '">Nueva clave</button></li>'
        );
      })
      .join('');
    ul.querySelectorAll('.reparto-reset-pw').forEach(function (btn) {
      btn.onclick = function () {
        var login = btn.getAttribute('data-login');
        if (!login || !window.getAdminToken) return;
        if (!confirm('¿Generar nueva contraseña para ' + login + '?')) return;
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resetRepartidorUserPassword',
            token: window.getAdminToken(),
            login: login,
          }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (data) {
            if (data.ok && data.password) {
              alert('Nueva contraseña para ' + login + ':\n\n' + data.password + '\n\nCopiala y dásela al repartidor.');
            } else {
              alert('No se pudo resetear: ' + (data.error || 'error'));
            }
          });
      };
    });
  }

  function bindUi() {
    var viewReparto = $('view-reparto');
    if (viewReparto) {
      /* Map init handled by admin shell via onViewShow */
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
    var selUser = $('reparto-deli-user');
    if (selUser) {
      selUser.addEventListener('change', syncRepartidorDeliFromSelect);
    }
    var btnNewCuenta = $('reparto-btn-new-cuenta');
    if (btnNewCuenta) {
      btnNewCuenta.onclick = function () {
        if (!window.getAdminToken) return;
        var login = ($('reparto-new-login') && $('reparto-new-login').value) || '';
        var nombre = ($('reparto-new-nombre') && $('reparto-new-nombre').value) || '';
        var tel = ($('reparto-new-tel') && $('reparto-new-tel').value) || '';
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'createRepartidorUser',
            token: window.getAdminToken(),
            login: login,
            nombre: nombre,
            telefono: tel,
          }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (data) {
            if (!data.ok) {
              alert('No se pudo crear: ' + (data.error || 'error'));
              return;
            }
            alert(
              'Cuenta creada\n\nUsuario: ' +
                data.user.login +
                '\nContraseña: ' +
                data.password +
                '\n\nEl repartidor entra en la app con esos datos.'
            );
            if ($('reparto-new-login')) $('reparto-new-login').value = '';
            if ($('reparto-new-nombre')) $('reparto-new-nombre').value = '';
            if ($('reparto-new-tel')) $('reparto-new-tel').value = '';
            loadRepartidorUsersUi();
          });
      };
    }
    $('reparto-btn-gmaps').onclick = function () {
      var u = gmapsUrl(stops());
      if (u) window.open(u, '_blank', 'noopener');
    };
    function repartoAdminApi(body) {
      if (!window.getAdminToken) return Promise.reject(new Error('no_admin'));
      body.token = window.getAdminToken();
      return fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) {
        return r.json();
      });
    }

    function ensureRepartidorAssignSchemaOnce() {
      try {
        if (sessionStorage.getItem('brava_repartidor_assign_try_v2') === '1') return;
        sessionStorage.setItem('brava_repartidor_assign_try_v2', '1');
      } catch (e) {}
      repartoAdminApi({ action: 'migrateRepartidorAssign' }).catch(function () {});
    }

    function repartidorSchemaHint(data) {
      if (data && data.hint) return data.hint;
      if (data && data.migrate && data.migrate.hint) return data.migrate.hint;
      if (data && data.migrate && data.migrate.error === 'no_postgres_url') {
        return 'Falta SUPABASE_DB_PASSWORD en Vercel. Mientras tanto: Supabase → SQL Editor → pegá supabase/repartidor-asignacion.sql → Run.';
      }
      return 'Supabase → SQL Editor → ejecutá supabase/repartidor-asignacion.sql (columnas repartidor_tel, reparto_parada…).';
    }

    ensureRepartidorAssignSchemaOnce();

    $('reparto-btn-app').onclick = function () {
      var list = stops();
      var waEl = $('reparto-deli-wa');
      var phone = waEl ? waEl.value : '';
      if (!normalizeWaPhone(phone)) {
        setStatus('Elegí un repartidor (cuenta app) arriba o creá una en «Cuentas app repartidor».', true);
        if ($('reparto-deli-user')) $('reparto-deli-user').focus();
        return;
      }
      if (!list.length) {
        if (
          !confirm(
            'No hay paradas en la ruta. ¿Sacar todos los pedidos asignados a este repartidor de la app?'
          )
        ) {
          return;
        }
      }
      try {
        sessionStorage.setItem(DELI_WA_KEY, phone);
      } catch (e) {}
      if (window.BravaWaPanel && typeof window.BravaWaPanel.setRepartidorTel === 'function') {
        window.BravaWaPanel.setRepartidorTel(phone);
      }
      var stopsPayload = list.map(function (o, idx) {
        return { orn: o.orn, parada: idx + 1 };
      });
      var btn = $('reparto-btn-app');
      if (btn) btn.disabled = true;
      setStatus('Preparando Supabase (repartidor)…');
      repartoAdminApi({ action: 'migrateRepartidorAssign' })
        .catch(function () {
          return { ok: false };
        })
        .then(function () {
          setStatus('Publicando ruta en la app…');
          return repartoAdminApi({
            action: 'assignRepartidorRuta',
            repartidor_tel: phone,
            stops: stopsPayload,
            markEnCamino: false,
          });
        })
        .then(function (data) {
          if (!data.ok) {
            var msg = data.error || 'error';
            if (msg === 'repartidor_schema_missing' || msg === 'assign_failed') {
              msg = repartidorSchemaHint(data);
            }
            setStatus('No se pudo publicar: ' + msg, true);
            return;
          }
          var extra = data.failed && data.failed.length ? ' (' + data.failed.length + ' fallaron)' : '';
          if (data.empty_route) {
            setStatus(
              'App del repartidor limpia: ' +
                (data.cleared || 0) +
                ' pedido(s) quitados. Tildá la ruta correcta y volvé a publicar.'
            );
          } else {
            var clearedMsg =
              data.cleared > 0 ? ' · ' + data.cleared + ' quitado(s) de la app' : '';
            var pushHint = '';
            if (data.push_notify) {
              var pn = data.push_notify;
              if (pn.ok && !pn.skipped) pushHint = ' · Push enviado al celular';
              else if (pn.skipped && pn.reason === 'no_device_tokens') {
                pushHint = ' · Sin push: repartidor sin token (abrí la app y permití alertas)';
              } else if (pn.skipped && pn.error === 'firebase_not_configured') {
                pushHint = ' · Push off: falta Firebase en Vercel';
              } else if (pn.error) pushHint = ' · Push: ' + pn.error;
            }
            setStatus(
              'Ruta ' +
                data.ruta_id +
                ' → app del repartidor · ' +
                data.assigned +
                ' pedido(s)' +
                clearedMsg +
                extra +
                pushHint +
                '. El repartidor pone «Iniciar recorrido» → en camino + WhatsApp.'
            );
          }
          if (window.fetchOrdersFromServer) window.fetchOrdersFromServer(true);
        })
        .catch(function () {
          setStatus('Error de red al publicar en app.', true);
        })
        .finally(function () {
          updateDispatchButton();
          updateRepartoAppButton();
        });
    };

    $('reparto-btn-dispatch').onclick = function () {
      var orns = selectedOrnsInPreparacion();
      if (!orns.length) return;
      if (!window.BravaAdminBatchEnCamino) return;
      var btn = $('reparto-btn-dispatch');
      if (btn) btn.disabled = true;
      setStatus('Marcando en camino…');
      window.BravaAdminBatchEnCamino(orns, function (result) {
        if (!result) {
          updateDispatchButton();
          return;
        }
        if (result.fail) {
          setStatus('En camino: ' + result.ok + ' ok, ' + result.fail + ' con error.', true);
        } else {
          setStatus(result.ok === 1 ? '1 pedido en camino.' : result.ok + ' pedidos en camino.');
        }
        updateDispatchButton();
      });
    };
    $('reparto-btn-wa').onclick = function () {
      var list = stops();
      if (!list.length) return;
      var phone = waEl ? waEl.value : '';
      if (!normalizeWaPhone(phone)) {
        setStatus('Completá el WhatsApp del repartidor (54911…).', true);
        if (waEl) waEl.focus();
        return;
      }
      try {
        sessionStorage.setItem(DELI_WA_KEY, phone);
      } catch (e) {}
      var text = buildDeliWhatsAppText(list);
      var btn = $('reparto-btn-wa');
      if (btn) btn.disabled = true;
      setStatus('Enviando ruta por WhatsApp (Brava)…');

      function finish() {
        if (btn) btn.disabled = !stops().length;
      }

      if (window.BravaWaPanel && typeof window.BravaWaPanel.sendTextTo === 'function') {
        window.BravaWaPanel
          .sendTextTo(phone, text, { name: 'Repartidor', isRepartidor: true })
          .then(function () {
            setStatus('Ruta enviada al repartidor desde el número Brava.');
            finish();
          })
          .catch(function (err) {
            setStatus((err && err.message) || 'No se pudo enviar por WhatsApp.', true);
            finish();
          });
        return;
      }

      setStatus('Panel WhatsApp no cargado. Recargá la página.', true);
      finish();
    };
    $('reparto-btn-copy').onclick = function () {
      var ta = $('reparto-hoja');
      if (!ta) return;
      ta.select();
      navigator.clipboard.writeText(ta.value).catch(function () {
        document.execCommand('copy');
      });
    };
    var hojaCollapse = $('reparto-hoja-collapse');
    if (hojaCollapse && !hojaCollapse._bound) {
      hojaCollapse._bound = true;
      var head = hojaCollapse.querySelector('.hoja-collapse-head');
      if (head) {
        function toggleHojaCollapse() {
          var open = hojaCollapse.classList.toggle('is-open');
          head.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        head.addEventListener('click', toggleHojaCollapse);
        head.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleHojaCollapse();
          }
        });
      }
    }
  }

  function init() {
    if (!$('reparto-route-list')) return;
    bindRouteListDragDrop();
    bindUi();
    onOrdersUpdated([]);
  }

  window.BravaReparto = {
    init: init,
    onOrdersUpdated: onOrdersUpdated,
    onViewShow: onViewShow,
    isOrnSelected: isOrnSelected,
    setOrderSelected: setOrderSelected
  };
})();
