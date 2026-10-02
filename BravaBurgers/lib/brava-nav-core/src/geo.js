/** Utilidades geográficas (sin dependencia Mapbox). */

export function haversineM(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Adaptado de Mapbox Navigation SDK (Apache 2.0) — equivalente a shortestRotationDiff. */
export function shortestRotationDiff(angleDeg, anchorDeg) {
  if (!Number.isFinite(angleDeg) || !Number.isFinite(anchorDeg)) return 0;
  let raw = angleDeg - anchorDeg;
  while (raw > 180) raw -= 360;
  while (raw < -180) raw += 360;
  return raw;
}

export function wrapDeg(angleDeg) {
  let a = angleDeg % 360;
  if (a < 0) a += 360;
  return a;
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return wrapDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** @typedef {{ lat: number, lng: number }} LatLng */
