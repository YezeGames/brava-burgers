/**
 * Autocompletado de dirección (Mapbox vía /api/address-suggest) para checkout tienda.
 */
(function () {
  'use strict';

  var DEBOUNCE_MS = 140;
  var MIN_CHARS = 2;
  var debounceTimer = null;
  var activeIndex = -1;
  var lastSuggestions = [];
  var pickedFromList = false;
  var fetchAbort = null;
  var reqSeq = 0;
  var queryCache = Object.create(null);
  var CACHE_MAX = 24;
  var zonaSyncTimer = null;

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

  function currentQueryKey() {
    var inp = inputEl();
    var q = inp ? inp.value.trim() : '';
    var hint = locHintFromForm();
    return cacheKey(q + '|' + hint);
  }

  function invalidateInFlight() {
    reqSeq++;
    if (fetchAbort) {
      try {
        fetchAbort.abort();
      } catch (eAbort) {}
      fetchAbort = null;
    }
  }

  function cacheSet(key, payload) {
    queryCache[key] = payload;
    var keys = Object.keys(queryCache);
    if (keys.length > CACHE_MAX) delete queryCache[keys[0]];
  }

  function cachePayload(key) {
    var hit = queryCache[key];
    if (!hit) return null;
    if (Array.isArray(hit)) return { suggestions: hit, outside_zone: false };
    return hit;
  }

  function queryHasStreetNumber(q) {
    return /\d/.test(String(q || ''));
  }

  function presentSuggestions(payload, forKey) {
    if (forKey && forKey !== currentQueryKey()) return;
    var items = payload.suggestions || [];
    var meta = { outside_zone: !!payload.outside_zone };
    var inp = inputEl();
    var q = inp ? inp.value.trim() : '';
    if (!items.length && typeof window.bravaOnAddressNoResults === 'function') {
      try {
        window.bravaOnAddressNoResults({ outside_zone: meta.outside_zone, query: q });
      } catch (eNoRes) {}
    }
    showList(items, meta, q);
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

  function showList(items, meta, queryText) {
    var ul = listEl();
    var inp = inputEl();
    if (!ul || !inp) return;
    meta = meta || {};
    queryText = queryText != null ? queryText : inp.value.trim();
    lastSuggestions = items;
    ul.innerHTML = '';
    if (!items.length) {
      showEmptyList(meta, queryText);
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

  function showEmptyList(meta, queryText) {
    var ul = listEl();
    var inp = inputEl();
    if (!ul || !inp) return;
    meta = meta || {};
    queryText = queryText != null ? queryText : inp.value.trim();
    lastSuggestions = [];
    ul.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'brava-addr-empty';
    li.setAttribute('aria-disabled', 'true');
    if (!queryHasStreetNumber(queryText)) {
      li.textContent = 'Seguí escribiendo calle y altura';
    } else if (meta.outside_zone) {
      li.textContent = 'No llegamos ahí — fuera de nuestra zona de entrega';
    } else {
      li.textContent = 'No encontramos esa calle en nuestra zona';
    }
    ul.appendChild(li);
    ul.classList.remove('hidden');
    inp.setAttribute('aria-expanded', 'true');
  }

  function syncZonaFromLocalidad() {
    if (zonaSyncTimer) clearTimeout(zonaSyncTimer);
    zonaSyncTimer = setTimeout(function () {
      var loc = localityEl() ? localityEl().value.trim() : '';
      if (loc && typeof window.bravaSyncZonaEnvioFromLocalidad === 'function') {
        window.bravaSyncZonaEnvioFromLocalidad(loc);
      }
    }, 180);
  }

  function pick(index) {
    var s = lastSuggestions[index];
    if (!s) return;
    var inp = inputEl();
    var loc = localityEl();
    if (inp) {
      inp.value = s.direccion || '';
      if (s.lat != null) inp.dataset.lat = String(s.lat);
      else delete inp.dataset.lat;
      if (s.lng != null) inp.dataset.lng = String(s.lng);
      else delete inp.dataset.lng;
    }
    if (loc) loc.value = s.localidad || '';
    pickedFromList = true;
    inp && inp.classList.add('brava-addr-picked');
    hideList();
    syncZonaFromLocalidad();
    if (typeof window.bravaOnAddressPicked === 'function') {
      try {
        window.bravaOnAddressPicked(s);
      } catch (ePick) {}
    }
  }

  function locHintFromForm() {
    var sel = document.getElementById('pregunta_10_respuesta');
    if (sel && sel.selectedIndex >= 0) {
      var opt = sel.options[sel.selectedIndex];
      var zona = (opt && (opt.getAttribute('data-nombre') || opt.textContent)) || '';
      zona = String(zona).trim();
      if (zona && !/^[-—]/.test(zona) && !/selecciona/i.test(zona)) {
        if (/olivos/i.test(zona)) return 'Olivos';
        if (/la lucila/i.test(zona)) return 'La Lucila';
        if (/mart[ií]nez/i.test(zona)) return 'Martínez';
        if (/acasusso/i.test(zona)) return 'Acasusso';
        if (/munro/i.test(zona)) return 'Munro';
        if (/carapachay/i.test(zona)) return 'Carapachay';
        if (/villa adelina/i.test(zona)) return 'Villa Adelina';
        return zona.split(/\s+/)[0] || '';
      }
    }
    var inp = inputEl();
    if (inp && inp.classList.contains('brava-addr-picked')) {
      var loc = localityEl() ? localityEl().value.trim() : '';
      if (loc) return loc;
    }
    return '';
  }

  function fetchSuggestions(q) {
    var hint = locHintFromForm();
    var key = cacheKey(q + '|' + hint);
    var cached = cachePayload(key);
    if (cached) {
      presentSuggestions(cached, key);
      return;
    }

    fetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var seq = reqSeq;
    showLoading();

    var url = '/api/address-suggest?q=' + encodeURIComponent(q);
    if (hint) url += '&loc=' + encodeURIComponent(hint);
    var opts = { cache: 'default' };
    if (fetchAbort) opts.signal = fetchAbort.signal;

    fetch(url, opts)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (seq !== reqSeq) return;
        if (!data.ok || !data.suggestions) {
          hideList();
          return;
        }
        cacheSet(key, {
          suggestions: data.suggestions,
          outside_zone: !!data.outside_zone,
        });
        if (currentQueryKey() !== key) return;
        presentSuggestions(
          {
            suggestions: data.suggestions,
            outside_zone: !!data.outside_zone,
          },
          key
        );
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
    pickedFromList = false;
    inp.classList.remove('brava-addr-picked');
    delete inp.dataset.lat;
    delete inp.dataset.lng;
    var loc = localityEl();
    if (loc) loc.value = '';
    if (typeof window.bravaResetZoneDelivery === 'function') {
      try {
        window.bravaResetZoneDelivery();
      } catch (eReset) {}
    }
    scheduleFetch();
  }

  function scheduleFetch() {
    var inp = inputEl();
    if (!inp) return;
    var q = inp.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.length < MIN_CHARS) {
      invalidateInFlight();
      hideList();
      return;
    }
    invalidateInFlight();
    showLoading();
    var hint = locHintFromForm();
    var key = cacheKey(q + '|' + hint);
    var cached = cachePayload(key);
    if (cached) {
      presentSuggestions(cached, key);
    }
    debounceTimer = setTimeout(function () {
      fetchSuggestions(q);
    }, DEBOUNCE_MS);
  }

  function cacheKey(q) {
    return q.toLowerCase();
  }

  function init() {
    var inp = inputEl();
    var ul = listEl();
    if (!inp || !ul) return;

    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-controls', 'brava-addr-suggest');

    inp.addEventListener('input', onAddressInput);
    var zonaSel = document.getElementById('pregunta_10_respuesta');
    if (zonaSel) zonaSel.addEventListener('change', scheduleFetch);
    inp.addEventListener('blur', function () {
      setTimeout(function () {
        hideList();
        if (pickedFromList) return;
        var q = inp.value.trim();
        if (
          q.length >= MIN_CHARS &&
          queryHasStreetNumber(q) &&
          typeof window.bravaValidateAddressQuery === 'function'
        ) {
          window.bravaValidateAddressQuery(q);
        }
      }, 200);
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

    var form = inp.closest('form');
    if (form) {
      form.addEventListener(
        'submit',
        function (e) {
          var q = inp.value.trim();
          var loc = localityEl() ? localityEl().value.trim() : '';
          if (
            window.bravaZoneDeliveryRequired &&
            window.bravaZoneDeliveryRequired() &&
            q.length >= MIN_CHARS &&
            !pickedFromList
          ) {
            e.preventDefault();
            e.stopPropagation();
            alert('Elegí tu dirección de la lista para validar la zona de entrega.');
            inp.focus();
            return;
          }
          if (q.length >= MIN_CHARS && !pickedFromList) {
            var ok = window.confirm(
              'No elegiste una dirección de la lista.\n\n¿Enviar igual con la dirección escrita a mano?'
            );
            if (!ok) {
              e.preventDefault();
              e.stopPropagation();
              inp.focus();
            }
          }
        },
        true
      );
    }
  }

  function highlightOption() {
    var ul = listEl();
    if (!ul) return;
    var opts = ul.querySelectorAll('li[role="option"]');
    opts.forEach(function (li, i) {
      li.classList.toggle('is-active', i === activeIndex);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
