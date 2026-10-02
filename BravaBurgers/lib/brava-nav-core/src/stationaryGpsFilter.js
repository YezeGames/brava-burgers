import { haversineM } from "./geo.js";

const MOVING_MIN_SPEED_MPS = 1.45;
const REJECT_JUMP_STATIONARY_M = 35;
const POOR_ACCURACY_M = 48;

/** Parado: no animar puck con drift GPS (equivalente a no animar ruido en Mapbox UI). */
export function applyStationaryGpsFilter(rawLat, rawLng, speedMps, accuracyM, anchor) {
  const speed = speedMps != null && speedMps >= 0 ? speedMps : 0;
  const moving = speed >= MOVING_MIN_SPEED_MPS;
  const raw = { lat: rawLat, lng: rawLng };

  if (moving) {
    return { displayLatLng: raw, anchor: raw };
  }
  const acc = accuracyM != null && accuracyM >= 0 ? accuracyM : 25;
  if (!anchor) {
    return { displayLatLng: raw, anchor: raw };
  }
  const driftM = haversineM(anchor.lat, anchor.lng, rawLat, rawLng);
  const rejectRadius = Math.max(
    REJECT_JUMP_STATIONARY_M,
    acc > POOR_ACCURACY_M ? acc * 1.8 : acc * 1.2,
  );
  if (driftM > rejectRadius) {
    return { displayLatLng: null, anchor };
  }
  return { displayLatLng: null, anchor };
}
