import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shortestRotationDiff } from "../src/geo.js";
import { getSmootherBearingForMap as smooth } from "../src/bearingSmoother.js";

describe("shortestRotationDiff", () => {
  it("wraps across 0", () => {
    assert.equal(shortestRotationDiff(1, 359), 2);
    assert.equal(shortestRotationDiff(359, 1), -2);
  });
});

describe("getSmootherBearingForMap", () => {
  it("clamps vehicle vs framing geometry", () => {
    const b = smooth({
      enabled: true,
      maxBearingAngleDiff: 45,
      currentMapCameraBearing: 0,
      vehicleBearing: 0,
      pointsForBearing: [
        { lat: -34.5, lng: -58.5 },
        { lat: -34.5, lng: -58.4 },
      ],
    });
    assert.ok(Math.abs(b - 45) < 1, `expected ~45 got ${b}`);
  });
});
