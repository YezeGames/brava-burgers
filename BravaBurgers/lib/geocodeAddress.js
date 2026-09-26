const {
  getDeliveryBboxString,
  getDeliveryProximityString,
} = require('./deliveryZone');

function normalizeGeocodeQuery(q) {
  return String(q || '')
    .replace(/\sirigoyen\b/gi, ' yrigoyen')
    .replace(/\bav\.?\s+/gi, 'avenida ')
    .replace(/\bpje\.?\s+/gi, 'pasaje ')
    .replace(/\s+/g, ' ')
    .trim();
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
      return {
        lng: loc.lng,
        lat: loc.lat,
        label: data.results[0].formatted_address || address,
      };
    });
  });
}

function fetchMapboxPlaces(q, token, bbox, proximity, types) {
  types = types || 'address';
  let url =
    'https://api.mapbox.com/geocoding/v5/mapbox.places/' +
    encodeURIComponent(q) +
    '.json?country=ar&proximity=' +
    proximity +
    '&types=' +
    encodeURIComponent(types) +
    '&limit=5&language=es&autocomplete=false&access_token=' +
    encodeURIComponent(token);
  if (bbox) url += '&bbox=' + bbox;

  return fetch(url).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) throw new Error(data.message || String(r.status));
      return (data.features || []).map(function (f) {
        return {
          lng: f.center && f.center[0],
          lat: f.center && f.center[1],
          label: f.place_name || q,
        };
      });
    });
  });
}

/**
 * Geocodifica una dirección de entrega (Argentina, zona norte GBA).
 * @param {string} q - Calle y altura (+ localidad si viene en el string)
 * @param {{ locHint?: string }} opts
 */
async function geocodeDeliveryAddress(q, opts) {
  opts = opts || {};
  let query = normalizeGeocodeQuery(q);
  if (!query || query.length < 3) {
    return { ok: false, error: 'missing_query' };
  }

  const locHint = normalizeGeocodeQuery(opts.locHint || '');
  if (locHint && query.toLowerCase().indexOf(locHint.toLowerCase()) < 0) {
    query = query + ', ' + locHint;
  }
  if (!/argentina/i.test(query)) {
    query = query + ', Provincia de Buenos Aires, Argentina';
  }

  const googleKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const mapboxToken = (process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || '').trim();
  if (!googleKey && !mapboxToken) {
    return { ok: false, error: 'geocoder_not_configured' };
  }

  let bbox;
  let proximity;
  try {
    bbox = getDeliveryBboxString();
    proximity = getDeliveryProximityString();
  } catch (e) {
    bbox = '-58.68,-34.75,-58.40,-34.40';
    proximity = '-58.489,-34.513';
  }

  if (googleKey) {
    const g = await geocodeGoogle(query, googleKey);
    if (g && g.lat != null && g.lng != null) {
      return { ok: true, lat: g.lat, lng: g.lng, label: g.label, provider: 'google' };
    }
  }

  if (mapboxToken) {
    const tries = [query];
    if (/\b(y?rigoyen|hip[oó]?lito)\b/i.test(query) && !/\bpresidente\b/i.test(query)) {
      tries.push(
        query.replace(/\b(hi?p[oó]?lito\s+)?y?rigoyen\b/gi, 'Presidente Hipólito Yrigoyen')
      );
    }
    for (let i = 0; i < tries.length; i++) {
      const list = await fetchMapboxPlaces(tries[i], mapboxToken, bbox, proximity, 'address,place');
      const hit = list.find(function (p) {
        return p.lat != null && p.lng != null;
      });
      if (hit) {
        return { ok: true, lat: hit.lat, lng: hit.lng, label: hit.label, provider: 'mapbox' };
      }
      const wide = await fetchMapboxPlaces(tries[i], mapboxToken, null, proximity, 'address,place');
      const hit2 = wide.find(function (p) {
        return p.lat != null && p.lng != null;
      });
      if (hit2) {
        return { ok: true, lat: hit2.lat, lng: hit2.lng, label: hit2.label, provider: 'mapbox' };
      }
    }
  }

  return { ok: false, error: 'not_found', query: query };
}

module.exports = { geocodeDeliveryAddress, normalizeGeocodeQuery };
