/** Decodifica shape Valhalla (precision 1e-6). */
function decodeValhallaPolyline(encoded) {
  var str = String(encoded || '');
  if (!str) return [];
  var index = 0;
  var lat = 0;
  var lng = 0;
  var out = [];
  while (index < str.length) {
    var b;
    var shift = 0;
    var result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    var dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    var dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    out.push({ lat: lat * 1e-6, lng: lng * 1e-6 });
  }
  return out;
}

module.exports = { decodeValhallaPolyline };
