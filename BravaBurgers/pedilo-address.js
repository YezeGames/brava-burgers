/**
 * Autocompletado de dirección (Mapbox vía /api/address-suggest) para checkout Pedilo.
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

  function cacheKey(q) {
    return q.toLowerCase();
  }

  function cacheSet(key, items) {
    queryCache[key] = items;
    var keys = Object.keys(queryCache);
    if (keys.length > CACHE_MAX) delete queryCache[keys[0]];
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

  function showList(items) {
    var ul = listEl();
    var inp = inputEl();
    if (!ul || !inp) return;
    lastSuggestions = items;
    ul.innerHTML = '';
    if (!items.length) {
      hideList();
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
    if (inp) inp.value = s.direccion || '';
    if (loc) loc.value = s.localidad || '';
    pickedFromList = true;
    inp && inp.classList.add('brava-addr-picked');
    hideList();
  }

  function fetchSuggestions(q) {
    var key = cacheKey(q);
    if (queryCache[key]) {
      showList(queryCache[key]);
      return;
    }

    if (fetchAbort) {
      try {
        fetchAbort.abort();
      } catch (eAbort) {}
    }
    fetchAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var seq = ++reqSeq;
    showLoading();

    var url = '/api/address-suggest?q=' + encodeURIComponent(q);
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
        cacheSet(key, data.suggestions);
        var inp = inputEl();
        if (inp && cacheKey(inp.value.trim()) !== key) return;
        showList(data.suggestions);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (seq !== reqSeq) return;
        hideList();
      });
  }

  function onInput() {
    var inp = inputEl();
    if (!inp) return;
    pickedFromList = false;
    inp.classList.remove('brava-addr-picked');
    var q = inp.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.length < MIN_CHARS) {
      if (fetchAbort) {
        try {
          fetchAbort.abort();
        } catch (e2) {}
      }
      hideList();
      return;
    }
    var cached = queryCache[cacheKey(q)];
    if (cached) {
      showList(cached);
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

    inp.addEventListener('input', onInput);
    inp.addEventListener('blur', function () {
      setTimeout(hideList, 180);
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
          if (q.length >= MIN_CHARS && !pickedFromList && !loc) {
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
