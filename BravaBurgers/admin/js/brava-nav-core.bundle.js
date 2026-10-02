var BravaNavCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    BearingSmoother: () => BearingSmoother,
    DEFAULT_VOICE_TIERS: () => DEFAULT_VOICE_TIERS,
    LocationAnimator: () => LocationAnimator,
    OffRouteDetector: () => OffRouteDetector,
    VoiceTrigger: () => VoiceTrigger,
    applyStationaryGpsFilter: () => applyStationaryGpsFilter,
    bearingDeg: () => bearingDeg,
    createNavSession: () => createNavSession,
    getSmootherBearingForMap: () => getSmootherBearingForMap,
    haversineM: () => haversineM,
    shortestRotationDiff: () => shortestRotationDiff,
    wrapDeg: () => wrapDeg
  });

  // src/geo.js
  function haversineM(lat1, lng1, lat2, lng2) {
    const r = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(Math.min(1, a)));
  }
  function shortestRotationDiff(angleDeg, anchorDeg) {
    if (!Number.isFinite(angleDeg) || !Number.isFinite(anchorDeg)) return 0;
    let raw = angleDeg - anchorDeg;
    while (raw > 180) raw -= 360;
    while (raw < -180) raw += 360;
    return raw;
  }
  function wrapDeg(angleDeg) {
    let a = angleDeg % 360;
    if (a < 0) a += 360;
    return a;
  }
  function bearingDeg(lat1, lng1, lat2, lng2) {
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dLambda = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    return wrapDeg(Math.atan2(y, x) * 180 / Math.PI);
  }

  // src/bearingSmoother.js
  function getSmootherBearingForMap({
    enabled = true,
    maxBearingAngleDiff = 45,
    currentMapCameraBearing,
    vehicleBearing,
    pointsForBearing = []
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
      currentMapCameraBearing + shortestRotationDiff(output, currentMapCameraBearing)
    );
  }
  var BearingSmoother = class {
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
        pointsForBearing: framingPoints
      });
      this._cameraBearing = next;
      return next;
    }
  };

  // src/locationAnimator.js
  var DEFAULT_DURATION_MS = 1e3;
  var TELEPORT_JUMP_M = 80;
  var LocationAnimator = class {
    /** @param {{ durationMs?: number, teleportJumpM?: number }} [opts] */
    constructor(opts = {}) {
      this.durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
      this.teleportJumpM = opts.teleportJumpM ?? TELEPORT_JUMP_M;
      this._display = null;
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
        bearingTo: bearing
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
  };

  // node_modules/@turf/helpers/dist/esm/index.js
  var earthRadius = 63710088e-1;
  var factors = {
    centimeters: earthRadius * 100,
    centimetres: earthRadius * 100,
    cm: earthRadius * 100,
    degrees: 360 / (2 * Math.PI),
    deg: 360 / (2 * Math.PI),
    feet: earthRadius * 3.28084,
    ft: earthRadius * 3.28084,
    inches: earthRadius * 39.37,
    in: earthRadius * 39.37,
    kilometers: earthRadius / 1e3,
    kilometres: earthRadius / 1e3,
    km: earthRadius / 1e3,
    meters: earthRadius,
    metres: earthRadius,
    m: earthRadius,
    miles: earthRadius / 1609.344,
    mi: earthRadius / 1609.344,
    millimeters: earthRadius * 1e3,
    millimetres: earthRadius * 1e3,
    mm: earthRadius * 1e3,
    nauticalmiles: earthRadius / 1852,
    nmi: earthRadius / 1852,
    radians: 1,
    rad: 1,
    yards: earthRadius * 1.0936,
    yd: earthRadius * 1.0936
  };
  function feature(geom, properties, options = {}) {
    const feat = { type: "Feature" };
    if (options.id === 0 || options.id) {
      feat.id = options.id;
    }
    if (options.bbox) {
      feat.bbox = options.bbox;
    }
    feat.properties = properties || {};
    feat.geometry = geom;
    return feat;
  }
  function point(coordinates, properties, options = {}) {
    if (!coordinates) {
      throw new Error("coordinates is required");
    }
    if (!Array.isArray(coordinates)) {
      throw new Error("coordinates must be an Array");
    }
    if (coordinates.length < 2) {
      throw new Error("coordinates must be at least 2 numbers long");
    }
    if (!isNumber(coordinates[0]) || !isNumber(coordinates[1])) {
      throw new Error("coordinates must contain numbers");
    }
    const geom = {
      type: "Point",
      coordinates
    };
    return feature(geom, properties, options);
  }
  function lineString(coordinates, properties, options = {}) {
    if (coordinates.length < 2) {
      throw new Error("coordinates must be an array of two or more positions");
    }
    const geom = {
      type: "LineString",
      coordinates
    };
    return feature(geom, properties, options);
  }
  function radiansToLength(radians, units = "kilometers") {
    const factor = factors[units];
    if (!factor) {
      throw new Error(units + " units is invalid");
    }
    return radians * factor;
  }
  function radiansToDegrees(radians) {
    const normalisedRadians = radians % (2 * Math.PI);
    return normalisedRadians * 180 / Math.PI;
  }
  function degreesToRadians(degrees) {
    const normalisedDegrees = degrees % 360;
    return normalisedDegrees * Math.PI / 180;
  }
  function isNumber(num) {
    return !isNaN(num) && num !== null && !Array.isArray(num);
  }

  // node_modules/@turf/invariant/dist/esm/index.js
  function getCoord(coord) {
    if (!coord) {
      throw new Error("coord is required");
    }
    if (!Array.isArray(coord)) {
      if (coord.type === "Feature" && coord.geometry !== null && coord.geometry.type === "Point") {
        return [...coord.geometry.coordinates];
      }
      if (coord.type === "Point") {
        return [...coord.coordinates];
      }
    }
    if (Array.isArray(coord) && coord.length >= 2 && !Array.isArray(coord[0]) && !Array.isArray(coord[1])) {
      return [...coord];
    }
    throw new Error("coord must be GeoJSON Point or an Array of numbers");
  }
  function getCoords(coords) {
    if (Array.isArray(coords)) {
      return coords;
    }
    if (coords.type === "Feature") {
      if (coords.geometry !== null) {
        return coords.geometry.coordinates;
      }
    } else {
      if (coords.coordinates) {
        return coords.coordinates;
      }
    }
    throw new Error(
      "coords must be GeoJSON Feature, Geometry Object or an Array"
    );
  }

  // node_modules/@turf/distance/dist/esm/index.js
  function distance(from, to, options = {}) {
    var coordinates1 = getCoord(from);
    var coordinates2 = getCoord(to);
    var dLat = degreesToRadians(coordinates2[1] - coordinates1[1]);
    var dLon = degreesToRadians(coordinates2[0] - coordinates1[0]);
    var lat1 = degreesToRadians(coordinates1[1]);
    var lat2 = degreesToRadians(coordinates2[1]);
    var a = Math.pow(Math.sin(dLat / 2), 2) + Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
    return radiansToLength(
      2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
      options.units
    );
  }

  // node_modules/@turf/meta/dist/esm/index.js
  function geomEach(geojson, callback) {
    var i, j, g, geometry, stopG, geometryMaybeCollection, isGeometryCollection, featureProperties, featureBBox, featureId, featureIndex = 0, isFeatureCollection = geojson.type === "FeatureCollection", isFeature = geojson.type === "Feature", stop = isFeatureCollection ? geojson.features.length : 1;
    for (i = 0; i < stop; i++) {
      geometryMaybeCollection = isFeatureCollection ? (
        // @ts-expect-error: Known type conflict
        geojson.features[i].geometry
      ) : isFeature ? (
        // @ts-expect-error: Known type conflict
        geojson.geometry
      ) : geojson;
      featureProperties = isFeatureCollection ? (
        // @ts-expect-error: Known type conflict
        geojson.features[i].properties
      ) : isFeature ? (
        // @ts-expect-error: Known type conflict
        geojson.properties
      ) : {};
      featureBBox = isFeatureCollection ? (
        // @ts-expect-error: Known type conflict
        geojson.features[i].bbox
      ) : isFeature ? (
        // @ts-expect-error: Known type conflict
        geojson.bbox
      ) : void 0;
      featureId = isFeatureCollection ? (
        // @ts-expect-error: Known type conflict
        geojson.features[i].id
      ) : isFeature ? (
        // @ts-expect-error: Known type conflict
        geojson.id
      ) : void 0;
      isGeometryCollection = geometryMaybeCollection ? geometryMaybeCollection.type === "GeometryCollection" : false;
      stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;
      for (g = 0; g < stopG; g++) {
        geometry = isGeometryCollection ? geometryMaybeCollection.geometries[g] : geometryMaybeCollection;
        if (geometry === null) {
          if (
            // @ts-expect-error: Known type conflict
            callback(
              // @ts-expect-error: Known type conflict
              null,
              featureIndex,
              featureProperties,
              featureBBox,
              featureId
            ) === false
          )
            return false;
          continue;
        }
        switch (geometry.type) {
          case "Point":
          case "LineString":
          case "MultiPoint":
          case "Polygon":
          case "MultiLineString":
          case "MultiPolygon": {
            if (
              // @ts-expect-error: Known type conflict
              callback(
                geometry,
                featureIndex,
                featureProperties,
                featureBBox,
                featureId
              ) === false
            )
              return false;
            break;
          }
          case "GeometryCollection": {
            for (j = 0; j < geometry.geometries.length; j++) {
              if (
                // @ts-expect-error: Known type conflict
                callback(
                  geometry.geometries[j],
                  featureIndex,
                  featureProperties,
                  featureBBox,
                  featureId
                ) === false
              )
                return false;
            }
            break;
          }
          default:
            throw new Error("Unknown Geometry Type");
        }
      }
      featureIndex++;
    }
  }
  function flattenEach(geojson, callback) {
    geomEach(geojson, function(geometry, featureIndex, properties, bbox, id) {
      var type = geometry === null ? null : geometry.type;
      switch (type) {
        case null:
        case "Point":
        case "LineString":
        case "Polygon":
          if (
            // @ts-expect-error: Known type conflict
            callback(
              feature(geometry, properties, { bbox, id }),
              featureIndex,
              0
            ) === false
          )
            return false;
          return;
      }
      var geomType;
      switch (type) {
        case "MultiPoint":
          geomType = "Point";
          break;
        case "MultiLineString":
          geomType = "LineString";
          break;
        case "MultiPolygon":
          geomType = "Polygon";
          break;
      }
      for (
        var multiFeatureIndex = 0;
        // @ts-expect-error: Known type conflict
        multiFeatureIndex < geometry.coordinates.length;
        multiFeatureIndex++
      ) {
        var coordinate = geometry.coordinates[multiFeatureIndex];
        var geom = {
          type: geomType,
          coordinates: coordinate
        };
        if (
          // @ts-expect-error: Known type conflict
          callback(feature(geom, properties), featureIndex, multiFeatureIndex) === false
        )
          return false;
      }
    });
  }

  // node_modules/@turf/nearest-point-on-line/dist/esm/index.js
  var __defProp2 = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp2 = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp2.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  function nearestPointOnLine(lines, inputPoint, options = {}) {
    if (!lines || !inputPoint) {
      throw new Error("lines and inputPoint are required arguments");
    }
    const inputPos = getCoord(inputPoint);
    let closestPt = point([Infinity, Infinity], {
      lineStringIndex: -1,
      segmentIndex: -1,
      totalDistance: -1,
      lineDistance: -1,
      segmentDistance: -1,
      pointDistance: Infinity,
      // deprecated properties START
      multiFeatureIndex: -1,
      index: -1,
      location: -1,
      dist: Infinity
      // deprecated properties END
    });
    let totalDistance = 0;
    let lineDistance = 0;
    let currentLineStringIndex = -1;
    flattenEach(
      lines,
      function(line, _featureIndex, lineStringIndex) {
        if (currentLineStringIndex !== lineStringIndex) {
          currentLineStringIndex = lineStringIndex;
          lineDistance = 0;
        }
        const coords = getCoords(line);
        for (let i = 0; i < coords.length - 1; i++) {
          const start = point(coords[i]);
          const startPos = getCoord(start);
          const stop = point(coords[i + 1]);
          const stopPos = getCoord(stop);
          const segmentLength = distance(start, stop, options);
          let intersectPos;
          let wasEnd;
          if (stopPos[0] === inputPos[0] && stopPos[1] === inputPos[1]) {
            [intersectPos, wasEnd] = [stopPos, true];
          } else if (startPos[0] === inputPos[0] && startPos[1] === inputPos[1]) {
            [intersectPos, wasEnd] = [startPos, false];
          } else {
            [intersectPos, wasEnd] = nearestPointOnSegment(
              startPos,
              stopPos,
              inputPos
            );
          }
          const pointDistance = distance(inputPoint, intersectPos, options);
          if (pointDistance < closestPt.properties.pointDistance) {
            const segmentDistance = distance(start, intersectPos, options);
            closestPt = point(intersectPos, {
              lineStringIndex,
              // Legacy behaviour where index progresses to next segment # if we
              // went with the end point this iteration.
              segmentIndex: wasEnd ? i + 1 : i,
              totalDistance: totalDistance + segmentDistance,
              lineDistance: lineDistance + segmentDistance,
              segmentDistance,
              pointDistance,
              // deprecated properties START
              multiFeatureIndex: -1,
              index: -1,
              location: -1,
              dist: Infinity
              // deprecated properties END
            });
            closestPt.properties = __spreadProps(__spreadValues({}, closestPt.properties), {
              multiFeatureIndex: closestPt.properties.lineStringIndex,
              index: closestPt.properties.segmentIndex,
              location: closestPt.properties.totalDistance,
              dist: closestPt.properties.pointDistance
              // deprecated properties END
            });
          }
          totalDistance += segmentLength;
          lineDistance += segmentLength;
        }
      }
    );
    return closestPt;
  }
  function dot(v1, v2) {
    const [v1x, v1y, v1z] = v1;
    const [v2x, v2y, v2z] = v2;
    return v1x * v2x + v1y * v2y + v1z * v2z;
  }
  function cross(v1, v2) {
    const [v1x, v1y, v1z] = v1;
    const [v2x, v2y, v2z] = v2;
    return [v1y * v2z - v1z * v2y, v1z * v2x - v1x * v2z, v1x * v2y - v1y * v2x];
  }
  function magnitude(v) {
    return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2) + Math.pow(v[2], 2));
  }
  function normalize(v) {
    const mag = magnitude(v);
    return [v[0] / mag, v[1] / mag, v[2] / mag];
  }
  function lngLatToVector(a) {
    const lat = degreesToRadians(a[1]);
    const lng = degreesToRadians(a[0]);
    return [
      Math.cos(lat) * Math.cos(lng),
      Math.cos(lat) * Math.sin(lng),
      Math.sin(lat)
    ];
  }
  function vectorToLngLat(v) {
    const [x, y, z] = v;
    const zClamp = Math.min(Math.max(z, -1), 1);
    const lat = radiansToDegrees(Math.asin(zClamp));
    const lng = radiansToDegrees(Math.atan2(y, x));
    return [lng, lat];
  }
  function nearestPointOnSegment(posA, posB, posC) {
    const A = lngLatToVector(posA);
    const B = lngLatToVector(posB);
    const C = lngLatToVector(posC);
    const segmentAxis = cross(A, B);
    if (segmentAxis[0] === 0 && segmentAxis[1] === 0 && segmentAxis[2] === 0) {
      if (dot(A, B) > 0) {
        return [[...posB], true];
      } else {
        return [[...posC], false];
      }
    }
    const targetAxis = cross(segmentAxis, C);
    if (targetAxis[0] === 0 && targetAxis[1] === 0 && targetAxis[2] === 0) {
      return [[...posB], true];
    }
    const intersectionAxis = cross(targetAxis, segmentAxis);
    const I1 = normalize(intersectionAxis);
    const I2 = [-I1[0], -I1[1], -I1[2]];
    const I = dot(C, I1) > dot(C, I2) ? I1 : I2;
    const segmentAxisNorm = normalize(segmentAxis);
    const cmpAI = dot(cross(A, I), segmentAxisNorm);
    const cmpIB = dot(cross(I, B), segmentAxisNorm);
    if (cmpAI >= 0 && cmpIB >= 0) {
      return [vectorToLngLat(I), false];
    }
    if (dot(A, C) > dot(B, C)) {
      return [[...posA], false];
    } else {
      return [[...posB], true];
    }
  }

  // src/offRouteDetector.js
  var OffRouteDetector = class {
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
          distanceToRouteM: distanceToRouteM(gpsLat, gpsLng, routeLatLng)
        };
      }
      const distM = distanceToRouteM(gpsLat, gpsLng, routeLatLng);
      let enter = this.enterThresholdM;
      if (distToNextManeuverM != null && distToNextManeuverM <= this.nearManeuverM) {
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
      const shouldReroute = this._offRoute && nowMs - this._lastRerouteAtMs >= this.minRerouteIntervalMs;
      return { offRoute: this._offRoute, shouldReroute, distanceToRouteM: distM };
    }
    markRerouteRequested(nowMs = Date.now()) {
      this._lastRerouteAtMs = nowMs;
      this._enterStreak = 0;
    }
  };
  function distanceToRouteM(lat, lng, routeLatLng) {
    const line = lineString(routeLatLng.map((p) => [p.lng, p.lat]));
    const pt = point([lng, lat]);
    const nearest = nearestPointOnLine(line, pt, { units: "meters" });
    const c = nearest.geometry.coordinates;
    return haversineM(lat, lng, c[1], c[0]);
  }

  // src/voiceTrigger.js
  var DEFAULT_VOICE_TIERS = {
    aheadMinM: 120,
    aheadMaxM: 180,
    nowM: 30,
    arriveSideHintMinM: 70,
    arriveSideHintMaxM: 130,
    arriveNowM: 45
  };
  var VoiceTrigger = class {
    /** @param {typeof DEFAULT_VOICE_TIERS} [tiers] */
    constructor(tiers = DEFAULT_VOICE_TIERS) {
      this.tiers = { ...DEFAULT_VOICE_TIERS, ...tiers };
      this._spoken = /* @__PURE__ */ new Map();
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
      const set = this._spoken.get(stepIndex) ?? /* @__PURE__ */ new Set();
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
        } else if (distToManeuverM >= t.aheadMinM && distToManeuverM <= t.aheadMaxM && !set.has("ahead")) {
          set.add("ahead");
          out.push("ahead");
        }
      }
      this._spoken.set(stepIndex, set);
      return out;
    }
  };

  // src/stationaryGpsFilter.js
  var MOVING_MIN_SPEED_MPS = 1.45;
  var REJECT_JUMP_STATIONARY_M = 35;
  var POOR_ACCURACY_M = 48;
  function applyStationaryGpsFilter(rawLat, rawLng, speedMps, accuracyM, anchor) {
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
      acc > POOR_ACCURACY_M ? acc * 1.8 : acc * 1.2
    );
    if (driftM > rejectRadius) {
      return { displayLatLng: null, anchor };
    }
    return { displayLatLng: null, anchor };
  }

  // src/navSession.js
  function createNavSession(opts = {}) {
    const animator = new LocationAnimator(opts.animator);
    const bearing = new BearingSmoother(opts.bearing);
    const offRoute = new OffRouteDetector(opts.offRoute);
    const voice = new VoiceTrigger(opts.voiceTiers);
    let stationaryAnchor = null;
    let courseBearing = null;
    return {
      animator,
      bearing,
      offRoute,
      voice,
      setCourseBearing(deg) {
        courseBearing = deg;
      },
      reset() {
        animator.reset();
        bearing.reset(courseBearing);
        offRoute.reset();
        voice.reset();
        stationaryAnchor = null;
      },
      /**
       * Fix GPS crudo (1 Hz).
       * @param {{ lat: number, lng: number, speedKmh: number, bearing?: number | null, route: import('./geo.js').LatLng[], distToNextManeuverM?: number | null, framingPoints?: import('./geo.js').LatLng[], stepIndex?: number, distToManeuverM?: number }} fix
       */
      onGpsFix(fix) {
        const speedMps = (fix.speedKmh || 0) / 3.6;
        const filtered = applyStationaryGpsFilter(
          fix.lat,
          fix.lng,
          speedMps,
          fix.accuracyM,
          stationaryAnchor
        );
        stationaryAnchor = filtered.anchor;
        if (filtered.displayLatLng) {
          animator.pushGpsFix(
            filtered.displayLatLng.lat,
            filtered.displayLatLng.lng,
            fix.bearing ?? null
          );
        }
        const off = offRoute.evaluate(
          fix.lat,
          fix.lng,
          fix.speedKmh,
          fix.route,
          fix.distToNextManeuverM ?? null
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
            bearing: courseBearing ?? sample.bearing
          };
        }
        const smoothBearing = bearing.update({
          vehicleBearing: vehicleBearing ?? sample.bearing ?? null,
          speedKmh: speedKmh ?? 0,
          framingPoints
        });
        return {
          lat: sample.lat,
          lng: sample.lng,
          bearing: smoothBearing
        };
      }
    };
  }
  return __toCommonJS(index_exports);
})();
