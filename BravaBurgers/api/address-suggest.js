const { cors } = require('../lib/gasFetch');
const {
  findDeliveryZoneName,
  getDeliveryBboxString,
  getDeliveryProximityString,
} = require('../lib/deliveryZone');

/** Localidades de las 7 zonas My Maps (hint Mapbox + scoring) */
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

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token = (process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || '').trim();
  if (!token) {
    return res.status(503).json({ ok: false, error: 'mapbox_not_configured' });
  }

  let q = String(req.query.q || '')
    .trim()
    .slice(0, 120);
  const locHint = String(req.query.loc || '')
    .trim()
    .slice(0, 60);
  if (q.length < 2) {
    return res.status(200).json({ ok: true, suggestions: [] });
  }

  q = normalizeQuery(q);
  const queries = expandQueries(q, locHint);

  let bbox;
  let proximity;
  try {
    bbox = getDeliveryBboxString();
    proximity = getDeliveryProximityString();
  } catch (eBbox) {
    bbox = '-58.68,-34.75,-58.40,-34.40';
    proximity = '-58.489,-34.513';
  }

  try {
    const batches = await Promise.all(
      queries.map(function (queryText) {
        return fetchMapbox(queryText, token, bbox, proximity);
      })
    );
    var mapboxCount = 0;
    batches.forEach(function (list) {
      mapboxCount += list.length;
    });
    const merged = mergeSuggestions(batches, locHint);
    const outsideZone = mapboxCount > 0 && merged.length === 0;
    return res.status(200).json({
      ok: true,
      suggestions: merged.slice(0, 8),
      outside_zone: outsideZone,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'geocode_network', detail: String(e.message || e) });
  }
};

function normalizeQuery(q) {
  return q
    .replace(/\sirigoyen\b/gi, ' yrigoyen')
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

function fetchMapbox(q, token, bbox, proximity) {
  const url =
    'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(q) +
    '.json?country=ar&proximity=' +
    proximity +
    '&bbox=' +
    bbox +
    '&types=address&limit=8&language=es&autocomplete=true&access_token=' +
    encodeURIComponent(token);

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) {
        throw new Error(data.message || String(r.status));
      }
      return (data.features || []).map(parseFeature);
    });
  });
}

function mergeSuggestions(batches, locHint) {
  const seen = Object.create(null);
  const all = [];
  batches.forEach(function (list) {
    list.forEach(function (s) {
      if (s.lng == null || s.lat == null) return;
      var zona = null;
      try {
        zona = findDeliveryZoneName(s.lng, s.lat);
      } catch (eZone) {
        zona = null;
      }
      if (!zona) return;
      if (s.localidad && !localidadMatchesZona(s.localidad, zona)) return;
      s.zona = zona;
      withZonaLabel(s);
      const key =
        String(s.lng) + ',' + String(s.lat) + '|' + String(s.direccion || '').toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      all.push(s);
    });
  });

  all.sort(function (a, b) {
    return scoreSuggestion(b, locHint) - scoreSuggestion(a, locHint);
  });
  return dedupeSameAddress(all);
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

/** Misma calle+altura: Mapbox extrapola alturas; preferir mejor precision y barrio coherente. */
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
  if (f.address) street = (street + ' ' + f.address).trim();
  var locality = localityFromFeature(f);
  var label = formatLabel(street, locality, f.place_name);
  return {
    label: label,
    direccion: street || String(f.place_name || '').split(',')[0].trim(),
    localidad: locality,
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
