import { haversineM } from "./geo.js";

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — NavigationLocationProvider (keypoints + duración ~1s, velocidad constante).
 */

const DEFAULT_DURATION_MS = 1000;
const TELEPORT_JUMP_M = 80;

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
  }

  reset() {
    this._display = null;
    this._segment = null;
  }

  /** Nuevo fix GPS (~1 Hz): destino de la animación visual. */
  pushGpsFix(lat, lng, bearing = null, nowMs = Date.now()) {
    const to = { lat, lng };
    if (!this._display) {
      this._display = { lat, lng, bearing, atMs: nowMs };
      return;
    }

    const jumpM = haversineM(this._display.lat, this._display.lng, lat, lng);
    if (jumpM < 6) {
      return;
    }
    const start = { lat: this._display.lat, lng: this._display.lng };
    const duration = jumpM >= this.teleportJumpM ? 0 : this.durationMs;

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
  }

  /** Llamar en cada frame (~60 FPS). */
  tick(nowMs = Date.now()) {
    if (!this._display) return null;

    const seg = this._segment;
    if (!seg) {
      return { ...this._display };
    }

    const total = seg.endMs - seg.startMs;
    const t = total <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - seg.startMs) / total));

    const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * t;
    const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * t;

    let bearing = this._display.bearing ?? null;
    if (seg.bearingTo != null && Number.isFinite(seg.bearingTo)) {
      bearing = seg.bearingTo;
    }

    this._display = { lat, lng, bearing, atMs: nowMs };

    if (t >= 1) {
      this._segment = null;
    }

    return { ...this._display };
  }
}
