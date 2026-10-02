/**
 * Tiers de voz por distancia along-route (compatible con NavRouteVoiceGuide Kotlin).
 */

export const DEFAULT_VOICE_TIERS = {
  aheadMinM: 120,
  aheadMaxM: 180,
  nowM: 30,
  arriveSideHintMinM: 70,
  arriveSideHintMaxM: 130,
  arriveNowM: 45,
};

export class VoiceTrigger {
  /** @param {typeof DEFAULT_VOICE_TIERS} [tiers] */
  constructor(tiers = DEFAULT_VOICE_TIERS) {
    this.tiers = { ...DEFAULT_VOICE_TIERS, ...tiers };
    /** @type {Map<number, Set<string>>} stepIndex -> spoken keys */
    this._spoken = new Map();
  }

  reset() {
    this._spoken.clear();
  }

  /**
   * @param {number} stepIndex
   * @param {number} distToManeuverM distancia sobre geometría al giro
   * @param {'maneuver' | 'arrive'} kind
   * @returns {('ahead' | 'now' | 'arrive' | 'side_hint')[]}
   */
  poll(stepIndex, distToManeuverM, kind = "maneuver") {
    const out = [];
    const set = this._spoken.get(stepIndex) ?? new Set();
    const t = this.tiers;

    if (kind === "arrive") {
      if (distToManeuverM >= t.arriveSideHintMinM && distToManeuverM <= t.arriveSideHintMaxM && !set.has("side_hint")) {
        set.add("side_hint");
        out.push("side_hint");
      }
      if (distToManeuverM <= t.arriveNowM && !set.has("arrive")) {
        set.add("arrive");
        out.push("arrive");
      }
    } else {
      if (distToManeuverM <= t.nowM && !set.has("now")) {
        set.add("now");
        out.push("now");
      } else if (
        distToManeuverM >= t.aheadMinM &&
        distToManeuverM <= t.aheadMaxM &&
        !set.has("ahead")
      ) {
        set.add("ahead");
        out.push("ahead");
      }
    }

    this._spoken.set(stepIndex, set);
    return out;
  }
}
