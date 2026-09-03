/**
 * Autocompletado Mapbox directo + sync con mapa checkout (brava-checkout-map.js).
 */
(function () {
  'use strict';

  var PROXIMITY = '-58.489,-34.513';
  var DEBOUNCE_MS = 200;
  var MIN_CHARS = 3;

  var mapboxToken = null;
  var debounceTimer = null;
  var activeIndex = -1;
  var lastSuggestions = [];
  var fetchAbort = null;
  var reqSeq = 0;
  var tokenPromise = null;

  function $(sel) {
    return document.querySelector(sel);
  }

  function inputEl() {
    return $('#pregunta_2_respuesta');
  }

  function listEl() {
    return $('#brava-addr-suggest');
  }

  function localityEl() {
    return $('#pregunta_3_respuesta');
  }

  function getToken() {
    if (mapboxToken) return Promise.resolve(mapboxToken);
    if (tokenPromise) return tokenPromise;
    tokenPromise = fetch('/api/mapbox-config')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.token) throw new Error('no_token');
        mapboxToken = data.token;
        return mapboxToken;
      });
    return tokenPromise;
  }

  function hideList() {
    var ul = listEl();
    var inp = inputEl();
    if (!ul) return;
    ul.classList.add('hidden');
    ul.innerHTML = '';
    activeIndex = -1;
    lastSuggestions = [];
    if (inp) inp.setAttribute('aria-expanded', 'false');
  }

  function showLoading() {
    var ul = listEl();
    var inp = inputEl();
    if (!ul || !inp) return;
    lastSuggestions = [];
    ul.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'brava-addr-loading';
    li.textContent = 'Buscando…';
    li.setAttribute('aria-disabled', 'true');
    ul.appendChild(li);
    ul.classList.remove('hidden');
    inp.setAttribute('aria-expanded', 'true');
  }

  function parseFeature(f) {
    var street = String(f.text || '').trim();
    var num = f.address ? String(f.address).trim() : '';
    var direccion = num ? street + ' ' + num : street;
    if (!direccion) direccion = String(f.place_name || '').split(',')[0].trim();
    var locality = '';
    (f.context || []).forEach(function (c) {
      var id = String(c.id || '');
      if (!locality && (id.indexOf('place.') === 0 || id.indexOf('locality.') === 0)) {
        locality = c.text || '';
      }
    });
    return {
      label: f.place_name || direccion,
      direccion: direccion,
      localidad: locality,
      lng: f.center && f.center[0],
      lat: f.center && f.center[1],
    };
  }

  function showList(items) {
    var ul = listEl();
    var inp = inputEl();
    if (!ul || !inp) return;
    lastSuggestions = items;
    ul.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'brava-addr-empty';
      empty.setAttribute('aria-disabled', 'true');
      empty.textContent = 'No encontramos direcciones. Probá con calle y altura.';
      ul.appendChild(empty);
      ul.classList.remove('hidden');
      return;
    }
    items.forEach(function (s, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-idx', String(i));
      li.textContent = s.label || s.direccion;
      li.tabIndex = -1;
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        pick(i);
      });
      ul.appendChild(li);
    });
    ul.classList.remove('hidden');
    inp.setAttribute('aria-expanded', 'true');
  }

  function pick(index) {
    var s = lastSuggestions[index];
    if (!s) return;
    var inp = inputEl();
    var loc = localityEl();
    hideList();
    if (inp) {
      inp.value = s.direccion || s.label || '';
      if (s.lat != null) inp.dataset.lat = String(s.lat);
      if (s.lng != null) inp.dataset.lng = String(s.lng);
      inp.classList.add('brava-addr-picked');
    }
    if (loc && s.localidad) loc.value = s.localidad;
    if (s.lng != null && s.lat != null && window.bravaCheckoutMap) {
      window.bravaCheckoutMap.setPin(Number(s.lng), Number(s.lat), { skipFly: false });
    } else if (typeof window.bravaApplyPinZone === 'function' && s.lng != null && s.lat != null) {
      window.bravaApplyPinZone(
        window.BravaDeliveryZone ? window.BravaDeliveryZone.findZona(s.lng, s.lat) : null,
        s.lng,
        s.lat
      );
    }
  }

  function fetchSuggestions(q) {
    var seq = ++reqSeq;
    showLoading();
    getToken()
      .then(function (tok) {
        var url =
          'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
          encodeURIComponent(q) +
          '.json?country=ar&proximity=' +
          PROXIMITY +
          '&types=address&limit=8&language=es&autocomplete=true&access_token=' +
          encodeURIComponent(tok);
        if (fetchAbort) {
          try {
            fetchAbort.abort();
          } catch (eA) {}
        }
        fetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var opts = fetchAbort ? { signal: fetchAbort.signal } : {};
        return fetch(url, opts).then(function (r) {
          return r.json();
        });
      })
      .then(function (data) {
        if (seq !== reqSeq) return;
        var items = (data.features || []).map(parseFeature);
        showList(items);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (seq !== reqSeq) return;
        hideList();
      });
  }

  function onAddressInput() {
    var inp = inputEl();
    if (!inp) return;
    inp.classList.remove('brava-addr-picked');
    delete inp.dataset.lat;
    delete inp.dataset.lng;
    if (window.bravaCheckoutMap) window.bravaCheckoutMap.setZoneOk(false);
    if (typeof window.bravaResetZoneDelivery === 'function') {
      try {
        window.bravaResetZoneDelivery();
      } catch (eR) {}
    }
    var q = inp.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.length < MIN_CHARS) {
      reqSeq++;
      hideList();
      return;
    }
    debounceTimer = setTimeout(function () {
      fetchSuggestions(q);
    }, DEBOUNCE_MS);
  }

  function init() {
    var inp = inputEl();
    var ul = listEl();
    if (!inp || !ul) return;

    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-controls', 'brava-addr-suggest');

    inp.addEventListener('input', onAddressInput);
    inp.addEventListener('blur', function () {
      setTimeout(hideList, 200);
    });
    inp.addEventListener('keydown', function (e) {
      if (!lastSuggestions.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, lastSuggestions.length - 1);
        highlightOption();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightOption();
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
      } else if (e.key === 'Escape') {
        hideList();
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.brava-addr-wrap')) hideList();
    });
  }

  function highlightOption() {
    var ul = listEl();
    if (!ul) return;
    ul.querySelectorAll('li[role="option"]').forEach(function (li, i) {
      li.classList.toggle('is-active', i === activeIndex);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
