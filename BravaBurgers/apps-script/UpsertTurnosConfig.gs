/**
 * Pegar en el proyecto Apps Script del Sheet BRAVA-BURGERS-Pedilo.
 * Ejecutar una vez: upsertTurnosDeliveryConfig
 * Actualiza filas en pestaña "configuracion" (Nombre | Valor).
 */
function upsertTurnosDeliveryConfig() {
  var sheetName = 'configuracion';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    throw new Error('No existe la pestaña: ' + sheetName);
  }

  var rows = [
    ['Control turnos delivery', 'SI'],
    ['Pedidos web desde', '19:00'],
    ['Máx pedidos por hora', '4'],
    ['Turno 1 - Entrega desde', '20:00'],
    ['Turno 1 - Entrega hasta', '21:00'],
    ['Turno 1 - Cierre pedidos', '20:30'],
    ['Turno 2 - Entrega desde', '21:00'],
    ['Turno 2 - Entrega hasta', '22:00'],
    ['Turno 2 - Cierre pedidos', '21:30'],
    ['Turno 3 - Entrega desde', '22:00'],
    ['Turno 3 - Entrega hasta', '23:00'],
    ['Turno 3 - Cierre pedidos', '22:40'],
  ];

  var lastRow = Math.max(sh.getLastRow(), 1);
	var numRows = lastRow - 1;
	var names = numRows > 0 ? sh.getRange(2, 1, lastRow, 1).getValues() : [];

  var indexByName = {};
  for (var i = 0; i < names.length; i++) {
    var key = String(names[i][0] || '').trim();
    if (key) indexByName[key] = i;
  }

	rows.forEach(function (pair) {
		var name = pair[0];
		var val = pair[1];
		if (indexByName.hasOwnProperty(name)) {
			var row = indexByName[name] + 2;
			sh.getRange(row, 2).setValue(val);
		} else {
			sh.appendRow([name, val]);
			indexByName[name] = names.length;
			names.push([name]);
		}
	});

  SpreadsheetApp.flush();
  Logger.log('Turnos delivery: ' + rows.length + ' claves actualizadas.');
}
