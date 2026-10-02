import * as turf from "@turf/turf";
import { haversineM } from "./geo.js";

/**
 * Off-route con histéresis (reimplementación Brava; inspirada en comportamiento Mapbox docs).
 * Siempre usar coordenadas **GPS crudas**.
 */

export class OffRouteDetector {
  /**
   * @param {{
   *   enterThresholdM?: number,
   *   exitThresholdM?: number,
   *   minSpeedKmh?: number,
   *   consecutiveEnter?: number,
   *   nearManeuverM?: number,
   *   enterThresholdNearManeuverM?: number,
   *   minRerouteIntervalMs?: number,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.enterThresholdM = opts.enterThresholdM ?? 32;
    this.exitThresholdM = opts.exitThresholdM ?? 22;
    this.minSpeedKmh = opts.minSpeedKmh ?? 4;
    this.consecutiveEnter = opts.consecutiveEnter ?? 2;
    this.nearManeuverM = opts.nearManeuverM ?? 120;
    this.enterThresholdNearManeuverM = opts.enterThresholdNearManeuverM ?? 26;
    this.minRerouteIntervalMs = opts.minRerouteIntervalMs ?? 5500;

    this._offRoute = false;
    this._enterStreak = 0;
    this._lastRerouteAtMs = 0;
  }

  reset() {
    this._offRoute = false;
    this._enterStreak = 0;
    this._lastRerouteAtMs = 0;
  }

  /**
   * @param {import('./geo.js').LatLng[]} routeLatLng lat,lng pairs
   * @param {number | null} distToNextManeuverM metros along-route al próximo giro
   */
  evaluate(gpsLat, gpsLng, speedKmh, routeLatLng, distToNextManeuverM = null, nowMs = Date.now()) {
    if (routeLatLng.length < 2) {
      return { offRoute: false, shouldReroute: false, distanceToRouteM: Infinity };
    }

    if (speedKmh < this.minSpeedKmh) {
      this._enterStreak = 0;
      return {
        offRoute: this._offRoute,
        shouldReroute: false,
        distanceToRouteM: distanceToRouteM(gpsLat, gpsLng, routeLatLng),
      };
    }

    const distM = distanceToRouteM(gpsLat, gpsLng, routeLatLng);
    let enter = this.enterThresholdM;
    if (
      distToNextManeuverM != null &&
      distToNextManeuverM <= this.nearManeuverM
    ) {
      enter = Math.min(enter, this.enterThresholdNearManeuverM);
    }

    if (!this._offRoute) {
      if (distM > enter) {
        this._enterStreak += 1;
        if (this._enterStreak >= this.consecutiveEnter) {
          this._offRoute = true;
        }
      } else {
        this._enterStreak = 0;
      }
    } else if (distM < this.exitThresholdM) {
      this._offRoute = false;
      this._enterStreak = 0;
    }

    const shouldReroute =
      this._offRoute &&
      nowMs - this._lastRerouteAtMs >= this.minRerouteIntervalMs;

    return { offRoute: this._offRoute, shouldReroute, distanceToRouteM: distM };
  }

  markRerouteRequested(nowMs = Date.now()) {
    this._lastRerouteAtMs = nowMs;
    this._enterStreak = 0;
  }
}

function distanceToRouteM(lat, lng, routeLatLng) {
  const line = turf.lineString(routeLatLng.map((p) => [p.lng, p.lat]));
  const pt = turf.point([lng, lat]);
  const nearest = turf.nearestPointOnLine(line, pt, { units: "meters" });
  const c = nearest.geometry.coordinates;
  return haversineM(lat, lng, c[1], c[0]);
}
