/**
 * Autocompletado de dirección (Mapbox vía /api/address-suggest) para checkout Pedilo.
 */
(function () {
  'use strict';

  var debounceTimer = null;
  var activeIndex = -1;
  var lastSuggestions = [];
  var pickedFromList = false;

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
    var url = '/api/address-suggest?q=' + encodeURIComponent(q);
    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.suggestions) {
          hideList();
          return;
        }
        showList(data.suggestions);
      })
      .catch(function () {
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
    if (q.length < 3) {
      hideList();
      return;
    }
    debounceTimer = setTimeout(function () {
      fetchSuggestions(q);
    }, 320);
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
          if (q.length >= 3 && !pickedFromList && !loc) {
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
    var opts = ul.querySelectorAll('li');
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
