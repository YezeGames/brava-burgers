import { haversineM } from "./geo.js";

const MOVING_MIN_SPEED_MPS = 1.45;
const MIN_COMPUTED_MPS = 0.85;
const MIN_COMPUTED_VS_GPS_RATIO = 0.28;
const HIGH_TRUST_GPS_MPS = 7.0;
const MIN_UNLOCK_DISPLACEMENT_M = 22;
const UNLOCK_FIXES_REQUIRED = 3;
const REJECT_TELEPORT_STEP_M = 18;

export class StationaryGpsController {
  constructor() {
    this.anchor = null;
    this.lastRaw = null;
    this.lastRawAtMs = 0;
    this.unlockStreak = 0;
    this.isLocked = true;
  }

  reset() {
    this.anchor = null;
    this.lastRaw = null;
    this.lastRawAtMs = 0;
    this.unlockStreak = 0;
    this.isLocked = true;
  }

  onFix(rawLat, rawLng, speedMps, accuracyM) {
    const now = Date.now();
    const gpsMps = speedMps != null && speedMps >= 0 ? speedMps : 0;
    const raw = { lat: rawLat, lng: rawLng };

    const dtSec =
      this.lastRawAtMs === 0
        ? 0
        : Math.min(Math.max(now - this.lastRawAtMs, 200), 4000) / 1000;
    const stepM = this.lastRaw ? haversineM(this.lastRaw.lat, this.lastRaw.lng, rawLat, rawLng) : 0;
    const computedMps = dtSec > 0 ? stepM / dtSec : 0;

    const acc = accuracyM != null && accuracyM >= 0 ? accuracyM : 25;
    const fromAnchorM = this.anchor
      ? haversineM(this.anchor.lat, this.anchor.lng, rawLat, rawLng)
      : 0;

    const teleportM = Math.max(REJECT_TELEPORT_STEP_M, acc * 1.6);
    if (this.anchor && this.isLocked && stepM > teleportM && dtSec < 2.8) {
      this._rememberRaw(raw, now);
      return { displayLatLng: null, anchor: this.anchor, locked: true };
    }

    const physicallyMoving = this._physicallyMoving(gpsMps, computedMps, fromAnchorM);

    if (physicallyMoving && fromAnchorM >= MIN_UNLOCK_DISPLACEMENT_M) {
      this.unlockStreak++;
    } else {
      this.unlockStreak = 0;
    }

    if (this.isLocked && this.unlockStreak >= UNLOCK_FIXES_REQUIRED) {
      this.isLocked = false;
    }

    if (!this.isLocked && physicallyMoving) {
      this.anchor = raw;
      this._rememberRaw(raw, now);
      return { displayLatLng: raw, anchor: raw, locked: false };
    }

    if (!this.isLocked && !physicallyMoving) {
      this.isLocked = true;
      this.unlockStreak = 0;
    }

    if (!this.anchor) {
      this.anchor = raw;
      this.isLocked = true;
      this._rememberRaw(raw, now);
      return { displayLatLng: raw, anchor: raw, locked: true };
    }

    this._rememberRaw(raw, now);
    return { displayLatLng: null, anchor: this.anchor, locked: this.isLocked };
  }

  _rememberRaw(raw, nowMs) {
    this.lastRaw = raw;
    this.lastRawAtMs = nowMs;
  }

  _physicallyMoving(gpsMps, computedMps, fromAnchorM) {
    if (gpsMps < MOVING_MIN_SPEED_MPS) return false;
    if (computedMps < MIN_COMPUTED_MPS) return false;
    if (gpsMps > 0.5 && computedMps < gpsMps * MIN_COMPUTED_VS_GPS_RATIO) return false;
    if (fromAnchorM < MIN_UNLOCK_DISPLACEMENT_M && gpsMps < HIGH_TRUST_GPS_MPS) return false;
    return true;
  }
}
