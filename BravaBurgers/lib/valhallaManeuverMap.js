/**
 * Valhalla maneuver.type (enter) → campos OSRM-like para navManeuverEs / OsrmNavText.
 * @see valhalla/baldr/turn.h
 */
function valhallaTypeToOsrm(type) {
  var t = Number(type);
  switch (t) {
    case 1:
    case 2:
    case 3:
      return { type: 'depart', modifier: '' };
    case 4:
      return { type: 'arrive', modifier: '' };
    case 5:
      return { type: 'arrive', modifier: 'right' };
    case 6:
      return { type: 'arrive', modifier: 'left' };
    case 8:
    case 22:
      return { type: 'continue', modifier: '' };
    case 9:
      return { type: 'turn', modifier: 'slight right' };
    case 10:
      return { type: 'turn', modifier: 'right' };
    case 11:
      return { type: 'turn', modifier: 'sharp right' };
    case 12:
    case 13:
      return { type: 'turn', modifier: 'uturn' };
    case 14:
      return { type: 'turn', modifier: 'sharp left' };
    case 15:
      return { type: 'turn', modifier: 'left' };
    case 16:
      return { type: 'turn', modifier: 'slight left' };
    case 18:
    case 20:
      return { type: 'off ramp', modifier: 'right' };
    case 19:
    case 21:
      return { type: 'off ramp', modifier: 'left' };
    case 25:
      return { type: 'merge', modifier: '' };
    case 26:
      return { type: 'roundabout', modifier: '' };
    case 27:
      return { type: 'roundabout', modifier: 'exit' };
    default:
      return { type: 'turn', modifier: '' };
  }
}

function valhallaManeuversToOsrmSteps(maneuvers, shapeCoords, shapeIndexOffset) {
  var list = maneuvers || [];
  if (!list.length || !shapeCoords || !shapeCoords.length) return [];
  var base = Number(shapeIndexOffset) || 0;
  var steps = [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    var localIdx = Math.max(0, Math.min(Number(m.begin_shape_index) || 0, shapeCoords.length - 1));
    var globalIdx = base + localIdx;
    var pt = shapeCoords[localIdx];
    var mapped = valhallaTypeToOsrm(m.type);
    var street =
      (m.street_names && m.street_names[0]) ||
      (m.begin_street_names && m.begin_street_names[0]) ||
      '';
    var exit = m.roundabout_exit_count;
    if (exit == null || exit === 0) exit = undefined;
    steps.push({
      distance: Math.max(0, Number(m.length) || 0) * 1000,
      duration: Number(m.time) || 0,
      name: street,
      maneuver: {
        type: mapped.type,
        modifier: mapped.modifier,
        instruction: m.verbal_pre_transition_instruction || m.instruction || '',
        name: street,
        location: [pt.lng, pt.lat],
        exit: exit,
        begin_shape_index: globalIdx,
      },
    });
  }
  return steps;
}

/** Shape completo del trip + steps con puntos de giro en la geometría Valhalla. */
function tripShapeAndSteps(trip) {
  var { decodeValhallaPolyline } = require('./valhallaPolyline');
  var legs = (trip && trip.legs) || [];
  var shapeCoords = [];
  var steps = [];
  for (var li = 0; li < legs.length; li++) {
    var leg = legs[li];
    var legCoords = decodeValhallaPolyline(leg.shape);
    var base = shapeCoords.length;
    if (li > 0 && legCoords.length && shapeCoords.length) {
      var a = shapeCoords[shapeCoords.length - 1];
      var b = legCoords[0];
      if (Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7) {
        legCoords = legCoords.slice(1);
      }
    }
    steps = steps.concat(valhallaManeuversToOsrmSteps(leg.maneuvers, legCoords, base));
    shapeCoords = shapeCoords.concat(legCoords);
  }
  return { shapeCoords: shapeCoords, steps: steps };
}

module.exports = {
  valhallaTypeToOsrm,
  valhallaManeuversToOsrmSteps,
  tripShapeAndSteps,
};
