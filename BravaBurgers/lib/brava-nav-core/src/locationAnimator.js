import { destinationPoint, haversineM, shortestRotationDiff, wrapDeg } from "./geo.js";

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — NavigationLocationProvider (keypoints + duración ~Δt GPS).
 */

const DEFAULT_DURATION_MS = 1000;
const TELEPORT_JUMP_M = 120;
const SEGMENT_DURATION_MIN_MS = 400;
const SEGMENT_DURATION_MAX_MS = 1200;
const COAST_MIN_SPEED_MPS = 1.45;
const COAST_MAX_DT_MS = 120;

/** @param {number | null | undefined} speedMps */
export function minJumpThresholdM(speedMps) {
  const v = Math.max(0, speedMps ?? 0);
  return Math.max(1, Math.min(6, v * 0.35));
}

/** @typedef {{ lat: number, lng: number, bearing?: number | null, atMs: number }} DisplaySample */

export class LocationAnimator {
  /** @param {{ durationMs?: number, teleportJumpM?: number }} [opts] */
  constructor(opts = {}) {
    this.durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    this.teleportJumpM = opts.teleportJumpM ?? TELEPORT_JUMP_M;
    /** @type {DisplaySample | null} */
    this._display = null;
    /** @type {{ from: import('./geo.js').LatLng, to: import('./geo.js').LatLng, startMs: number, endMs: number, bearingFrom: number | null, bearingTo: number | null } | null} */
    this._segment = null;
    this._lastPushAtMs = 0;
    this._lastTickAtMs = 0;
    this._coastSpeedMps = 0;
    /** @type {number | null} */
    this._coastBearing = null;
  }

  reset() {
    this._display = null;
    this._segment = null;
    this._lastPushAtMs = 0;
    this._lastTickAtMs = 0;
    this._coastSpeedMps = 0;
    this._coastBearing = null;
  }

  snapTo(lat, lng, bearing = null, nowMs = Date.now()) {
    this._display = {
      lat,
      lng,
      bearing: bearing ?? this._display?.bearing ?? null,
      atMs: nowMs,
    };
    this._segment = null;
    this._lastPushAtMs = nowMs;
  }

  /** @param {number} nowMs */
  _segmentDurationMs(nowMs) {
    const dt =
      this._lastPushAtMs === 0
        ? this.durationMs
        : Math.min(4000, Math.max(250, nowMs - this._lastPushAtMs));
    return Math.min(SEGMENT_DURATION_MAX_MS, Math.max(SEGMENT_DURATION_MIN_MS, dt));
  }

  /** Nuevo fix GPS (~1 Hz): destino de la animación visual. */
  pushGpsFix(lat, lng, bearing = null, speedMps = null, nowMs = Date.now()) {
    const to = { lat, lng };
    if (speedMps != null) this._coastSpeedMps = Math.max(0, speedMps);
    if (bearing != null && Number.isFinite(bearing)) this._coastBearing = bearing;
    if (!this._display) {
      this._display = { lat, lng, bearing, atMs: nowMs };
      this._lastPushAtMs = nowMs;
      return;
    }

    const jumpM = haversineM(this._display.lat, this._display.lng, lat, lng);
    if (jumpM < minJumpThresholdM(speedMps)) {
      return;
    }
    const start = { lat: this._display.lat, lng: this._display.lng };
    const duration = jumpM >= this.teleportJumpM ? 0 : this._segmentDurationMs(nowMs);

    this._segment = {
      from: start,
      to,
      startMs: nowMs,
      endMs: nowMs + duration,
      bearingFrom: this._display.bearing ?? null,
      bearingTo: bearing,
    };

    if (duration === 0) {
      this._display = { lat, lng, bearing, atMs: nowMs };
      this._segment = null;
    }
    this._lastPushAtMs = nowMs;
  }

  /** Llamar en cada frame (~60 FPS). */
  tick(nowMs = Date.now(), speedMps = null) {
    if (!this._display) return null;

    const seg = this._segment;
    if (!seg) {
      const v = Math.max(0, speedMps ?? this._coastSpeedMps);
      const brg = this._coastBearing ?? this._display.bearing;
      if (v >= COAST_MIN_SPEED_MPS && brg != null && Number.isFinite(brg)) {
        const prev = this._lastTickAtMs || nowMs;
        const dtMs = Math.min(COAST_MAX_DT_MS, Math.max(0, nowMs - prev));
        this._lastTickAtMs = nowMs;
        if (dtMs > 0) {
          const distM = v * (dtMs / 1000);
          const next = destinationPoint(this._display.lat, this._display.lng, brg, distM);
          this._display = { lat: next.lat, lng: next.lng, bearing: brg, atMs: nowMs };
        }
      } else {
        this._lastTickAtMs = nowMs;
      }
      return { ...this._display };
    }

    const total = seg.endMs - seg.startMs;
    const t = total <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - seg.startMs) / total));

    const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * t;
    const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * t;

    const bearing = interpolateBearing(seg.bearingFrom, seg.bearingTo, t, this._display.bearing);

    this._display = { lat, lng, bearing, atMs: nowMs };
    this._lastTickAtMs = nowMs;

    if (t >= 1) {
      this._segment = null;
    }

    return { ...this._display };
  }
}

/** @param {number | null | undefined} from @param {number | null | undefined} to @param {number} t @param {number | null | undefined} fallback */
function interpolateBearing(from, to, t, fallback) {
  if (to == null || !Number.isFinite(to)) return from ?? fallback ?? null;
  if (from == null || !Number.isFinite(from)) return to;
  const delta = shortestRotationDiff(to, from);
  return wrapDeg(from + delta * t);
}
