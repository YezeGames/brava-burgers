import { BearingSmoother } from "./bearingSmoother.js";
import { LocationAnimator } from "./locationAnimator.js";
import { OffRouteDetector } from "./offRouteDetector.js";
import { VoiceTrigger } from "./voiceTrigger.js";
import { StationaryGpsController } from "./stationaryGpsFilter.js";

/** Orquestador: GPS crudo → lógica; tick → display. */
export function createNavSession(opts = {}) {
  const animator = new LocationAnimator(opts.animator);
  const bearing = new BearingSmoother(opts.bearing);
  const offRoute = new OffRouteDetector(opts.offRoute);
  const voice = new VoiceTrigger(opts.voiceTiers);

  const stationary = new StationaryGpsController();
  let courseBearing = null;

  return {
    animator,
    bearing,
    offRoute,
    voice,

    setCourseBearing(deg) {
      courseBearing = deg;
    },

    get isStationaryLocked() {
      return stationary.isLocked;
    },

    reset() {
      animator.reset();
      bearing.reset(courseBearing);
      offRoute.reset();
      voice.reset();
      stationary.reset();
    },

    /**
     * Fix GPS crudo (1 Hz).
     * @param {{ lat: number, lng: number, speedKmh: number, bearing?: number | null, route: import('./geo.js').LatLng[], distToNextManeuverM?: number | null, framingPoints?: import('./geo.js').LatLng[], stepIndex?: number, distToManeuverM?: number }} fix
     */
    onGpsFix(fix) {
      const speedMps = (fix.speedKmh || 0) / 3.6;
      const filtered = stationary.onFix(fix.lat, fix.lng, speedMps, fix.accuracyM);
      if (filtered.locked && filtered.anchor) {
        animator.snapTo(filtered.anchor.lat, filtered.anchor.lng, fix.bearing ?? null);
      } else if (filtered.displayLatLng) {
        animator.pushGpsFix(
          filtered.displayLatLng.lat,
          filtered.displayLatLng.lng,
          fix.bearing ?? null,
        );
      }

      const off = offRoute.evaluate(
        fix.lat,
        fix.lng,
        fix.speedKmh,
        fix.route,
        fix.distToNextManeuverM ?? null,
      );

      let voiceEvents = [];
      if (fix.stepIndex != null && fix.distToManeuverM != null) {
        voiceEvents = voice.poll(fix.stepIndex, fix.distToManeuverM);
      }

      return { offRoute: off, voiceEvents };
    },

    /** ~60 FPS */
    tickDisplay(nowMs, { vehicleBearing, speedKmh, framingPoints = [] } = {}) {
      const sample = animator.tick(nowMs);
      if (!sample) return null;
      if ((speedKmh ?? 0) < 5) {
        return {
          lat: sample.lat,
          lng: sample.lng,
          bearing: courseBearing ?? sample.bearing,
        };
      }
      const smoothBearing = bearing.update({
        vehicleBearing: vehicleBearing ?? sample.bearing ?? null,
        speedKmh: speedKmh ?? 0,
        framingPoints,
      });
      return {
        lat: sample.lat,
        lng: sample.lng,
        bearing: smoothBearing,
      };
    },
  };
}
