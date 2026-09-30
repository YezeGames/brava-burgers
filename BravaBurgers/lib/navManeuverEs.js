/**

 * Plantillas OSRM → español (voseo AR). Formato: [distancia] + acción + vía.

 * Alineado con repartidor-native-android …/OsrmNavText.kt

 * No es el listado propietario de Google Maps.

 */



function streetSuffix(street) {

  return street ? ' en ' + street : '';

}



function streetTowards(street) {

  return street ? ' hacia ' + street : '';

}



function bearingCardinalEs(bearing) {

  if (bearing == null || isNaN(bearing)) return null;

  var b = ((bearing % 360) + 360) % 360;

  var idx = Math.floor(((b + 22.5) / 45) % 8);

  return ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'][idx];

}



function ordinalEs(n) {

  if (n === 1) return 'primera';

  if (n === 2) return 'segunda';

  if (n === 3) return 'tercera';

  if (n === 4) return 'cuarta';

  if (n === 5) return 'quinta';

  return n + '.ª';

}



function departPhrase(street, bearingAfter) {

  var head = bearingCardinalEs(bearingAfter);

  if (street && head) return 'Dirigite hacia el ' + head + ' por ' + street;

  if (street) return 'Salí por ' + street;

  if (head) return 'Dirigite hacia el ' + head;

  return 'Iniciá el recorrido';

}



function turnPhrase(left, sharp, slight, street) {

  var side = left ? 'izquierda' : 'derecha';

  if (sharp && street) return 'Girá a la ' + side + ' en ángulo cerrado hacia ' + street;

  if (sharp) return 'Girá a la ' + side + ' en ángulo cerrado';

  if (slight && street) return 'Girá levemente a la ' + side + ' en ' + street;

  if (slight) return 'Girá levemente a la ' + side;

  if (street) return 'Girá a la ' + side + ' en ' + street;

  return 'Girá a la ' + side;

}



function keepLanePhrase(left, street) {

  var side = left ? 'izquierda' : 'derecha';

  if (street) return 'Mantenete a la ' + side + ' hacia ' + street;

  return 'Mantenete a la ' + side;

}



function roundaboutPhrase(exit, street) {

  var n = exit || 0;

  if (n > 0) return 'En la rotonda, tomá la ' + ordinalEs(n) + ' salida' + streetTowards(street);

  return 'Entrá a la rotonda' + streetSuffix(street);

}



function localizeOsrmInstruction(raw) {

  var s = String(raw || '').trim();

  if (!s) return 'Seguí la ruta';

  if (/^(Turn|Continue|Head|Merge|Enter|Take|Keep|Exit|Arrive)\b/i.test(s)) return 'Seguí la ruta';

  return s;

}



function maneuverTextFromOsrmStep(step) {

  if (!step || !step.maneuver) return 'Seguí por la ruta resaltada';

  var m = step.maneuver;

  var street = String(m.name || step.name || '').trim();

  var t = m.type || '';

  var mod = m.modifier || '';

  if (t === 'arrive') return 'Llegaste al destino';

  if (t === 'depart') return departPhrase(street, m.bearing_after);

  if (t === 'roundabout' || t === 'rotary') return roundaboutPhrase(m.exit, street);

  if (mod === 'sharp left') return turnPhrase(true, true, false, street);

  if (mod === 'left') return turnPhrase(true, false, false, street);

  if (mod === 'sharp right') return turnPhrase(false, true, false, street);

  if (mod === 'right') return turnPhrase(false, false, false, street);

  if (mod === 'slight left') return keepLanePhrase(true, street);

  if (mod === 'slight right') return keepLanePhrase(false, street);

  if (mod === 'uturn') return 'Hacé un giro en U';

  if (t === 'fork' && mod === 'left') return 'En la bifurcación, tomá a la izquierda';

  if (t === 'fork' && mod === 'right') return 'En la bifurcación, tomá a la derecha';

  if (t === 'merge') return street ? 'Incorporate a ' + street : 'Incorporate a la vía';

  if (t === 'off ramp' && mod.indexOf('right') >= 0) return 'Tomá la salida a la derecha' + streetTowards(street);

  if (t === 'off ramp' && mod.indexOf('left') >= 0) return 'Tomá la salida a la izquierda' + streetTowards(street);

  if (t === 'continue') return street ? 'Permanecé en ' + street : '';

  if (t === 'new name' && street) return 'Continuá por ' + street;

  if (m.instruction) return localizeOsrmInstruction(m.instruction);

  return 'Seguí la ruta';

}



module.exports = { maneuverTextFromOsrmStep };


