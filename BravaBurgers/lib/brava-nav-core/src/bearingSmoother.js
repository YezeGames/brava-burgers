import { bearingDeg, shortestRotationDiff, wrapDeg } from "./geo.js";

/**
 * Adaptado de Mapbox Navigation SDK (Apache 2.0)
 * — ViewportDataSourceProcessor.getSmootherBearingForMap
 */
export function getSmootherBearingForMap({
  enabled = true,
  maxBearingAngleDiff = 45,
  currentMapCameraBearing,
  vehicleBearing,
  pointsForBearing = [],
}) {
  if (!enabled || !Number.isFinite(vehicleBearing)) {
    return Number.isFinite(vehicleBearing) ? wrapDeg(vehicleBearing) : currentMapCameraBearing;
  }

  let output = vehicleBearing;
  if (pointsForBearing.length > 1) {
    const first = pointsForBearing[0];
    const last = pointsForBearing[pointsForBearing.length - 1];
    const bearingFromPoints = bearingDeg(first.lat, first.lng, last.lat, last.lng);
    const bearingDiff = shortestRotationDiff(bearingFromPoints, vehicleBearing);
    if (Math.abs(bearingDiff) > maxBearingAngleDiff) {
      const diffDirection = bearingDiff < 0 ? -1 : 1;
      output = vehicleBearing + maxBearingAngleDiff * diffDirection;
    } else {
      output = bearingFromPoints;
    }
  }

  if (!Number.isFinite(currentMapCameraBearing)) {
    return wrapDeg(output);
  }
  return wrapDeg(
    currentMapCameraBearing + shortestRotationDiff(output, currentMapCameraBearing),
  );
}

/**
 * EMA opcional Brava: menos temblor a baja velocidad (no es Mapbox core).
 */
export class BearingSmoother {
  /** @param {{ maxBearingAngleDiff?: number, lowSpeedEmaAlpha?: number, lowSpeedKmh?: number }} [opts] */
  constructor(opts = {}) {
    this.maxBearingAngleDiff = opts.maxBearingAngleDiff ?? 45;
    this.lowSpeedEmaAlpha = opts.lowSpeedEmaAlpha ?? 0.15;
    this.lowSpeedKmh = opts.lowSpeedKmh ?? 5;
    this._cameraBearing = null;
    this._emaBearing = null;
  }

  reset(initialCameraBearing = null) {
    this._cameraBearing = initialCameraBearing;
    this._emaBearing = initialCameraBearing;
  }

  /**
   * @param {{ vehicleBearing: number | null, speedKmh: number, framingPoints?: import('./geo.js').LatLng[] }} input
   * @returns {number | null}
   */
  update({ vehicleBearing, speedKmh, framingPoints = [] }) {
    if (vehicleBearing == null || !Number.isFinite(vehicleBearing)) {
      return this._cameraBearing;
    }

    let vBearing = vehicleBearing;
    if (speedKmh < this.lowSpeedKmh) {
      if (this._emaBearing == null) {
        this._emaBearing = vehicleBearing;
      } else {
        const d = shortestRotationDiff(vehicleBearing, this._emaBearing);
        this._emaBearing = wrapDeg(this._emaBearing + d * this.lowSpeedEmaAlpha);
      }
      vBearing = this._emaBearing;
    } else {
      this._emaBearing = vehicleBearing;
    }

    const next = getSmootherBearingForMap({
      enabled: true,
      maxBearingAngleDiff: this.maxBearingAngleDiff,
      currentMapCameraBearing: this._cameraBearing ?? vBearing,
      vehicleBearing: vBearing,
      pointsForBearing: framingPoints,
    });
    this._cameraBearing = next;
    return next;
  }
}
