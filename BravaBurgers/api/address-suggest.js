const { cors } = require('../lib/gasFetch');
const {
  findDeliveryZoneName,
  getDeliveryBboxString,
  getDeliveryProximityString,
} = require('../lib/deliveryZone');

/**
 * Autocompletado de dirección — reglas:
 * - Polígonos My Maps: solo definen ZONA de entrega (¿llegamos?) y costo (Sheet).
 * - Mapbox: fuente de verdad para CALLE + ALTURA (f.address). No inventar numeración.
 * - Sugerencia válida = Mapbox confirmó la altura + punto dentro de un polígono.
 */

/** Localidades de las 7 zonas My Maps (hint + scoring) */
const ZONA_LOCALIDADES = [
  'Olivos',
  'La Lucila',
  'Martinez',
  'Martínez',
  'Acasusso',
  'Munro',
  'Carapachay',
  'Villa Adelina',
];

const GOOGLE_LOCATION_BIAS = '-34.513,-58.489';
const GOOGLE_RADIUS_M = 22000;

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const googleKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const mapboxToken = (process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || '').trim();
  if (!googleKey && !mapboxToken) {
    return res.status(503).json({ ok: false, error: 'geocoder_not_configured' });
  }

  let q = String(req.query.q || '')
    .trim()
    .slice(0, 120);
  const locHint = String(req.query.loc || '')
    .trim()
    .slice(0, 60);
  if (q.length < 2) {
    return res.status(200).json({ ok: true, suggestions: [], outside_zone: false });
  }

  q = normalizeQuery(q);
  const hasNumber = /\d/.test(q);

  let proximity;
  let bbox;
  try {
    bbox = getDeliveryBboxString();
    proximity = getDeliveryProximityString();
  } catch (eBbox) {
    bbox = '-58.68,-34.75,-58.40,-34.40';
    proximity = '-58.489,-34.513';
  }

  try {
    var merged = [];
    var classified = { streetMatchCount: 0, outsideZoneMatchCount: 0, streetInZoneNoNumber: 0, suggestions: [] };
    var provider = 'mapbox';

    if (googleKey) {
      provider = 'google';
      var googlePack = await suggestGoogle(q, locHint, googleKey);
      merged = googlePack.suggestions;
      var classified = googlePack.classified;
    } else {
      const queries = expandQueries(q, locHint);
      const batches = await Promise.all(
        queries.map(function (queryText) {
          return fetchMapbox(queryText, mapboxToken, bbox, proximity);
        })
      );
      classified = classifySuggestions(batches, q, locHint);
      merged = classified.suggestions;
    }

    var outsideZone = false;
    var streetNoNumber = false;
    if (merged.length === 0 && hasNumber) {
      if (classified.outsideZoneMatchCount > 0) {
        outsideZone = true;
      } else if (classified.streetInZoneNoNumber > 0) {
        streetNoNumber = true;
      } else if (!googleKey && mapboxToken) {
        var wideList = await fetchMapbox(q, mapboxToken, null, proximity);
        var wideClass = classifySuggestions([wideList], q, locHint);
        if (wideClass.suggestions.length) {
          merged = wideClass.suggestions;
          classified = wideClass;
        } else if (wideClass.outsideZoneMatchCount > 0) {
          outsideZone = true;
        }
      } else if (classified.streetMatchCount > 0) {
        outsideZone = true;
      }
    }

    return res.status(200).json({
      ok: true,
      suggestions: merged.slice(0, 8),
      outside_zone: outsideZone,
      street_no_number: streetNoNumber,
      provider: provider,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'geocode_network', detail: String(e.message || e) });
  }
};

function normalizeQuery(q) {
  return q
    .replace(/\sirigoyen\b/gi, ' yrigoyen')
    .replace(/\bav\.?\s+/gi, 'avenida ')
    .replace(/\bpje\.?\s+/gi, 'pasaje ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQueries(q, locHint) {
  const out = [];
  const push = function (s) {
    s = String(s || '').trim();
    if (s.length >= 2 && out.indexOf(s) === -1) out.push(s);
  };

  push(withLocHint(q, locHint));
  push(q);

  if (/\b(y?rigoyen|hip[oó]?lito)\b/i.test(q) && !/\bpresidente\b/i.test(q)) {
    const replaced = q.replace(/\b(hi?p[oó]?lito\s+)?y?rigoyen\b/gi, 'Presidente Hipólito Yrigoyen');
    if (replaced !== q) {
      push(withLocHint(replaced, locHint));
      push(replaced);
    }
  }

  return out.slice(0, 4);
}

function withLocHint(q, locHint) {
  if (!locHint) return q;
  if (new RegExp('\\b' + escapeRegExp(locHint) + '\\b', 'i').test(q)) return q;
  return (q + ' ' + locHint).trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function suggestGoogle(q, locHint, key) {
  const queries = expandQueries(q, locHint).slice(0, 2);
  const seenPlace = Object.create(null);
  const parsed = [];

  for (let i = 0; i < queries.length; i++) {
    const preds = await fetchGoogleAutocomplete(queries[i], key);
    const slice = preds.slice(0, 5);
    const details = await Promise.all(
      slice.map(function (p) {
        return fetchGooglePlaceDetails(p.place_id, key).then(function (d) {
          return parseGoogleDetails(d, p.description);
        });
      })
    );
    details.forEach(function (s) {
      if (!s || s.lng == null || s.lat == null) return;
      const pk = String(s.lng) + ',' + String(s.lat) + '|' + normalizeAddrKey(s.direccion);
      if (seenPlace[pk]) return;
      seenPlace[pk] = true;
      parsed.push(s);
    });
  }

  var classified = classifySuggestions([parsed], q, locHint);
  return {
    classified: classified,
    suggestions: classified.suggestions,
  };
}

async function detectOutsideZone(q, googleKey, mapboxToken, proximity) {
  if (googleKey) {
    const preds = await fetchGoogleAutocomplete(q, googleKey);
    if (preds.length > 0) {
      const details = await fetchGooglePlaceDetails(preds[0].place_id, googleKey);
      const point = parseGoogleDetails(details, preds[0].description);
      if (point && point.lng != null && point.lat != null) {
        return !findDeliveryZoneName(point.lng, point.lat);
      }
    }
    const geo = await geocodeGoogle(q + ', Buenos Aires, Argentina', googleKey);
    if (geo) return !findDeliveryZoneName(geo.lng, geo.lat);
    return false;
  }

  if (mapboxToken) {
    const list = await fetchMapbox(q, mapboxToken, null, proximity);
    if (!list.length) return false;
    const first = list[0];
    if (first.lng == null || first.lat == null) return false;
    return !findDeliveryZoneName(first.lng, first.lat);
  }

  return false;
}

function fetchGoogleAutocomplete(input, key) {
  const url =
    'https://maps.googleapis.com/maps/api/place/autocomplete/json?' +
    'input=' +
    encodeURIComponent(input) +
    '&types=address' +
    '&components=country:ar' +
    '&language=es' +
    '&location=' +
    encodeURIComponent(GOOGLE_LOCATION_BIAS) +
    '&radius=' +
    String(GOOGLE_RADIUS_M) +
    '&key=' +
    encodeURIComponent(key);

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(data.error_message || data.status);
      }
      return data.predictions || [];
    });
  });
}

function fetchGooglePlaceDetails(placeId, key) {
  const url =
    'https://maps.googleapis.com/maps/api/place/details/json?' +
    'place_id=' +
    encodeURIComponent(placeId) +
    '&fields=geometry,address_components,formatted_address,name' +
    '&language=es' +
    '&key=' +
    encodeURIComponent(key);

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (data.status && data.status !== 'OK') {
        throw new Error(data.error_message || data.status);
      }
      return data;
    });
  });
}

function geocodeGoogle(address, key) {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?' +
    'address=' +
    encodeURIComponent(address) +
    '&components=country:AR' +
    '&language=es' +
    '&key=' +
    encodeURIComponent(key);

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (!data.results || !data.results.length) return null;
      const loc = data.results[0].geometry && data.results[0].geometry.location;
      if (!loc) return null;
      return { lng: loc.lng, lat: loc.lat };
    });
  });
}

function parseGoogleDetails(data, description) {
  const r = data && data.result;
  if (!r || !r.geometry || !r.geometry.location) return null;

  const loc = r.geometry.location;
  const comps = r.address_components || [];
  let route = '';
  let number = '';
  let locality = '';

  comps.forEach(function (c) {
    const types = c.types || [];
    if (types.indexOf('route') >= 0) route = c.long_name;
    if (types.indexOf('street_number') >= 0) number = c.long_name;
    if (!locality && (types.indexOf('locality') >= 0 || types.indexOf('sublocality') >= 0)) {
      locality = c.long_name;
    }
  });

  let street = '';
  if (route && number) street = route + ' ' + number;
  else if (route) street = route;
  else if (r.name) street = r.name;
  else street = String(description || '').split(',')[0].trim();

  return {
    label: description || street,
    direccion: street,
    localidad: locality,
    lng: loc.lng,
    lat: loc.lat,
    relevance: 1,
    accuracy: 'rooftop',
  };
}

function fetchMapbox(q, token, bbox, proximity) {
  let url =
    'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(q) +
    '.json?country=ar&proximity=' +
    proximity +
    '&types=address&limit=10&language=es&autocomplete=true&access_token=' +
    encodeURIComponent(token);
  if (bbox) url += '&bbox=' + bbox;

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) {
        throw new Error(data.message || String(r.status));
      }
      return (data.features || []).map(parseFeature);
    });
  });
}

function classifySuggestions(batches, q, locHint) {
  const seen = Object.create(null);
  const inZone = [];
  var streetMatchCount = 0;
  var outsideZoneMatchCount = 0;
  var streetInZoneNoNumber = 0;
  var qNum = queryNumber(q);

  batches.forEach(function (list) {
    list.forEach(function (s) {
      if (s.lng == null || s.lat == null) return;
      if (!streetMatchesQuery(s, q)) return;

      streetMatchCount++;

      var zona = null;
      try {
        zona = findDeliveryZoneName(s.lng, s.lat);
      } catch (eZone) {
        zona = null;
      }

      if (!zona) {
        outsideZoneMatchCount++;
        return;
      }

      if (qNum && !hasVerifiedNumber(s, q)) {
        streetInZoneNoNumber++;
        return;
      }

      s.zona = zona;
      withZonaLabel(s);
      const key =
        String(s.lng) + ',' + String(s.lat) + '|' + String(s.direccion || '').toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      inZone.push(s);
    });
  });

  inZone.sort(function (a, b) {
    return scoreSuggestion(b, locHint) - scoreSuggestion(a, locHint);
  });

  return {
    suggestions: dedupeSameAddress(inZone),
    streetMatchCount: streetMatchCount,
    outsideZoneMatchCount: outsideZoneMatchCount,
    streetInZoneNoNumber: streetInZoneNoNumber,
  };
}

var STREET_QUERY_STOP = {
  de: 1,
  la: 1,
  el: 1,
  los: 1,
  las: 1,
  av: 1,
  ave: 1,
  avda: 1,
  avenida: 1,
  calle: 1,
  pasaje: 1,
  pje: 1,
  doctor: 1,
  dr: 1,
  gral: 1,
  general: 1,
  pte: 1,
  presidente: 1,
  san: 1,
  santa: 1,
  del: 1,
};

function queryNumber(q) {
  var m = String(q || '').match(/\d+/);
  return m ? m[0] : '';
}

/** Solo alturas que Mapbox devolvió explícitamente (no inventar numeración). */
function hasVerifiedNumber(s, q) {
  var queryNum = queryNumber(q);
  if (!queryNum) return true;

  var mapboxNum = String(s.mapbox_number || '').trim();
  if (mapboxNum) return mapboxNum === queryNum;

  var accuracy = normalizeLocText(s.accuracy);
  if (accuracy === 'street' || accuracy === 'approximate') return false;

  var dirMatch = String(s.direccion || '').match(/\d+/);
  if (!dirMatch) return false;
  return dirMatch[0] === queryNum;
}

function streetTokensFromQuery(q) {
  return normalizeLocText(q)
    .replace(/\d+/g, ' ')
    .split(/\s+/)
    .filter(function (t) {
      return t.length >= 3 && !STREET_QUERY_STOP[t];
    });
}

/** Coincidencia por nombre principal de calle (evita yerbal → Alberdi). */
function streetMatchesQuery(s, q) {
  var tokens = streetTokensFromQuery(q);
  if (!tokens.length) return true;

  var hay = normalizeLocText(
    String(s.direccion || '') +
      ' ' +
      String(s.label || '') +
      ' ' +
      String(s.localidad || '') +
      ' ' +
      String(s.place_name || '')
  );

  var primary = tokens.slice().sort(function (a, b) {
    return b.length - a.length;
  })[0];

  if (!primary || hay.indexOf(primary) === -1) return false;
  if (tokens.length === 1) return true;

  if (primary.length >= 6) return true;

  var others = 0;
  tokens.forEach(function (t) {
    if (t !== primary && hay.indexOf(t) !== -1) others++;
  });
  return others > 0;
}

function mergeSuggestions(batches, locHint) {
  return classifySuggestions(batches, '', locHint).suggestions;
}

function localidadMatchesZona(localidad, zona) {
  return zonaMatchesHint(zona, localidad);
}

function accuracyRank(s) {
  var a = normalizeLocText(s.accuracy);
  if (a === 'rooftop' || a === 'parcel' || a === 'point') return 4;
  if (a === 'street' || a === 'address') return 3;
  if (a === 'approximate') return 2;
  if (a === 'interpolated') return 1;
  return 2;
}

function suggestionRank(s) {
  var rank = accuracyRank(s) * 100;
  if (s.localidad && s.zona && localidadMatchesZona(s.localidad, s.zona)) rank += 20;
  rank += Math.round((s.relevance || 0) * 10);
  return rank;
}

function normalizeAddrKey(direccion) {
  return normalizeLocText(String(direccion || '').replace(/\s+/g, ' ').trim());
}

function dedupeSameAddress(suggestions) {
  var byKey = Object.create(null);
  suggestions.forEach(function (s) {
    var key = normalizeAddrKey(s.direccion);
    if (!key) return;
    var prev = byKey[key];
    if (!prev) {
      byKey[key] = s;
      return;
    }
    var rankS = suggestionRank(s);
    var rankP = suggestionRank(prev);
    if (rankS > rankP) {
      byKey[key] = s;
      return;
    }
    if (rankS === rankP && s.lat < prev.lat) {
      byKey[key] = s;
    }
  });
  return Object.keys(byKey).map(function (k) {
    return byKey[k];
  });
}

function normalizeLocText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function zonaMatchesHint(zona, locHint) {
  if (!zona || !locHint) return false;
  var z = normalizeLocText(zona);
  var h = normalizeLocText(locHint);
  if (z === h || z.indexOf(h) !== -1 || h.indexOf(z) !== -1) return true;
  if (h.indexOf('munro') !== -1 && z === 'munro') return true;
  if (h.indexOf('martinez') !== -1 && z === 'martinez') return true;
  if (h.indexOf('lucila') !== -1 && z === 'la lucila') return true;
  if (h.indexOf('villa adelina') !== -1 && z === 'villa adelina') return true;
  return false;
}

function scoreSuggestion(s, locHint) {
  let score = 0;
  if (s.zona) score += 15;
  if (locHint && zonaMatchesHint(s.zona, locHint)) score += 25;
  if (locHint) {
    const loc = String(s.localidad || '');
    const label = String(s.label || '');
    const hint = normalizeLocText(locHint);
    if (normalizeLocText(loc).indexOf(hint) !== -1) score += 12;
    if (normalizeLocText(label).indexOf(hint) !== -1) score += 6;
  }
  ZONA_LOCALIDADES.forEach(function (zloc) {
    if (zonaMatchesHint(s.zona, zloc) && normalizeLocText(s.localidad).indexOf(normalizeLocText(zloc)) !== -1) {
      score += 5;
    }
  });
  if (/presidente hip[oó]?lito yrigoyen/i.test(String(s.direccion || ''))) score += 3;
  return score;
}

function parseFeature(f) {
  var street = String(f.text || '').trim();
  var mapboxNum = f.address ? String(f.address).trim() : '';
  if (mapboxNum) street = (street + ' ' + mapboxNum).trim();
  var locality = localityFromFeature(f);
  var label = formatLabel(street, locality, f.place_name);
  return {
    label: label,
    direccion: street || String(f.place_name || '').split(',')[0].trim(),
    localidad: locality,
    place_name: String(f.place_name || ''),
    mapbox_number: mapboxNum,
    lng: f.center && f.center[0],
    lat: f.center && f.center[1],
    relevance: typeof f.relevance === 'number' ? f.relevance : 0,
    accuracy: (f.properties && f.properties.accuracy) || '',
  };
}

function withZonaLabel(s) {
  if (!s) return s;
  var street = s.direccion || '';
  if (s.zona) s.label = street + ' · ' + s.zona;
  return s;
}

function localityFromFeature(f) {
  var fromName = localityFromPlaceName(f.place_name);
  if (fromName) return fromName;

  var neighborhood = '';
  var locality = '';
  (f.context || []).forEach(function (c) {
    var id = String(c.id || '');
    var text = String(c.text || '').trim();
    if (!neighborhood && id.indexOf('neighborhood.') === 0) neighborhood = text;
    if (!locality && (id.indexOf('locality.') === 0 || id.indexOf('place.') === 0)) locality = text;
  });
  return neighborhood || locality || '';
}

function localityFromPlaceName(placeName) {
  var parts = String(placeName || '')
    .split(',')
    .map(function (p) {
      return p.trim();
    });
  for (var i = 1; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    if (/^argentina$/i.test(p)) continue;
    if (/^provincia de/i.test(p)) continue;
    if (/^comuna \d/i.test(p)) continue;
    if (/^[A-Z]\d{4}/i.test(p)) continue;
    return p;
  }
  return '';
}

function formatLabel(street, locality, placeName) {
  if (street && locality) return street + ' · ' + locality;
  return placeName || street || '';
}
