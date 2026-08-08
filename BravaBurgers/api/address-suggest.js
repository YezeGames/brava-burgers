const { cors } = require('../lib/gasFetch');

/** Olivos — sesgo de proximidad */
const PROXIMITY = '-58.489,-34.513';
/** Zona de delivery Brava (aprox.) — minLng,minLat,maxLng,maxLat */
const DELIVERY_BBOX = '-58.68,-34.75,-58.40,-34.40';

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

  try {
    const batches = await Promise.all(
      queries.map(function (queryText) {
        return fetchMapbox(queryText, token);
      })
    );
    const merged = mergeSuggestions(batches, locHint);
    return res.status(200).json({ ok: true, suggestions: merged.slice(0, 8) });
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

function fetchMapbox(q, token) {
  const url =
    'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(q) +
    '.json?country=ar&proximity=' +
    PROXIMITY +
    '&bbox=' +
    DELIVERY_BBOX +
    '&types=address&limit=6&language=es&autocomplete=true&access_token=' +
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
      const key =
        String(s.lng || '') +
        ',' +
        String(s.lat || '') +
        '|' +
        String(s.direccion || '').toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      all.push(s);
    });
  });

  all.sort(function (a, b) {
    return scoreSuggestion(b, locHint) - scoreSuggestion(a, locHint);
  });
  return all;
}

function scoreSuggestion(s, locHint) {
  let score = 0;
  if (inDeliveryBbox(s.lng, s.lat)) score += 10;
  if (locHint) {
    const loc = String(s.localidad || '');
    const label = String(s.label || '');
    if (loc.toLowerCase().indexOf(locHint.toLowerCase()) !== -1) score += 20;
    if (label.toLowerCase().indexOf(locHint.toLowerCase()) !== -1) score += 8;
  }
  if (/presidente hip[oó]?lito yrigoyen/i.test(String(s.direccion || ''))) score += 3;
  return score;
}

function inDeliveryBbox(lng, lat) {
  if (lng == null || lat == null) return false;
  const parts = DELIVERY_BBOX.split(',').map(Number);
  return lng >= parts[0] && lng <= parts[2] && lat >= parts[1] && lat <= parts[3];
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
  };
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
