/**
 * Ejecutar una vez en el proyecto Apps Script vinculado al Sheet de menú (CATALOG).
 * Menú: migrateProductosToPersonalizacion
 *
 * Convierte filas repetidas (Sin Extra / Extra …) en:
 * - productos: 1 fila por burger + columnas Grupo extras / Quitar
 * - pestañas extras + ingredientes
 */
var MIG_SHEET_PRODUCTOS = 'productos';
var MIG_SHEET_EXTRAS = 'extras';
var MIG_SHEET_INGREDIENTES = 'ingredientes';

function migrateProductosToPersonalizacion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MIG_SHEET_PRODUCTOS);
  if (!sh) throw new Error('No existe hoja productos');

  var data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error('productos vacío');

  var headers = data[0].map(function (h) {
    return String(h || '').trim();
  });
  var col = migColIndex_(headers);

  migEnsureCol_(sh, headers, col, 'Grupo extras');
  migEnsureCol_(sh, headers, col, 'Quitar');
  headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  col = migColIndex_(headers);

  var extrasMap = {};
  var groups = {};
  var rowsToDelete = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var nombre = String(row[col.nombre] || '').trim();
    if (!nombre) continue;
    var variedad = String(row[col.variedades] || '').trim();
    var key = nombre + '\x1e' + String(row[col.descripcion] || '').trim();
    if (!groups[key]) {
      groups[key] = { firstRow: r + 1, sinRow: null, extras: [], sub: String(row[col.subcategoria] || '') };
    }
    var g = groups[key];
    if (migIsSinExtra_(variedad)) {
      if (g.sinRow === null) g.sinRow = r + 1;
      else rowsToDelete.push(r + 1);
    } else if (variedad) {
      g.extras.push({ row: r + 1, nombre: variedad, precio: row[col.precio] });
      rowsToDelete.push(r + 1);
      var addon = migExtraAddon_(row[col.precio], data[g.sinRow ? g.sinRow - 1 : r][col.precio]);
      var ek = variedad.toLowerCase();
      if (!extrasMap[ek]) {
        extrasMap[ek] = { nombre: variedad, precio: addon, grupos: {} };
      }
    }
  }

  for (var k in groups) {
    var gg = groups[k];
    if (!gg.sinRow || !gg.extras.length) continue;
    var grupoExtras = migGrupoFromSub_(gg.sub);
    var quitar = migQuitarFromSub_(gg.sub);
    sh.getRange(gg.sinRow, col.grupoExtras + 1).setValue(grupoExtras);
    sh.getRange(gg.sinRow, col.quitar + 1).setValue(quitar);
    var gkey = grupoExtras;
    gg.extras.forEach(function (ex) {
      extrasMap[ex.nombre.toLowerCase()].grupos[gkey] = true;
    });
  }

  rowsToDelete.sort(function (a, b) {
    return b - a;
  });
  rowsToDelete.forEach(function (rn) {
    sh.deleteRow(rn);
  });

  migWriteExtrasSheet_(ss, extrasMap);
  migWriteIngredientesSheet_(ss);

  SpreadsheetApp.getUi().alert(
    'Listo: productos consolidados, pestañas extras e ingredientes creadas/actualizadas.'
  );
}

function migColIndex_(headers) {
  function idx(names) {
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i].toLowerCase();
      for (var j = 0; j < names.length; j++) {
        if (h === names[j].toLowerCase()) return i;
      }
    }
    return -1;
  }
  return {
    nombre: idx(['Nombre', 'nombre']),
    descripcion: idx(['Descripcion', 'Descripción', 'descripcion']),
    variedades: idx(['Variedades', 'variedades', 'Variedad']),
    precio: idx(['Precio', 'precio']),
    subcategoria: idx(['Subcategoria', 'Subcategoría', 'subcategoria']),
    grupoExtras: idx(['Grupo extras', 'grupo_extras', 'Grupo Extras']),
    quitar: idx(['Quitar', 'grupo_quitar', 'Grupo quitar']),
  };
}

function migEnsureCol_(sh, headers, col, title) {
  if (col.grupoExtras >= 0 && title === 'Grupo extras') return;
  if (col.quitar >= 0 && title === 'Quitar') return;
  var last = sh.getLastColumn();
  sh.getRange(1, last + 1).setValue(title);
  if (title === 'Grupo extras') col.grupoExtras = last;
  if (title === 'Quitar') col.quitar = last;
}

function migIsSinExtra_(v) {
  var n = String(v || '')
    .toLowerCase()
    .trim();
  return n === 'sin extra' || n === 'sin extras';
}

function migGrupoFromSub_(sub) {
  var s = String(sub || '').toLowerCase();
  if (s.indexOf('simple') >= 0) return 'simple';
  if (s.indexOf('doble') >= 0) return 'doble';
  if (s.indexOf('triple') >= 0) return 'triple';
  return 'general';
}

function migQuitarFromSub_(sub) {
  var s = String(sub || '').toLowerCase();
  if (s.indexOf('simple') >= 0) return 'simple_std';
  if (s.indexOf('doble') >= 0) return 'doble_std';
  if (s.indexOf('triple') >= 0) return 'triple_std';
  return '';
}

function migExtraAddon_(precioExtra, precioBase) {
  var pe = parseFloat(String(precioExtra || '').replace(/[^\d.-]/g, '')) || 0;
  var pb = parseFloat(String(precioBase || '').replace(/[^\d.-]/g, '')) || 0;
  var d = pe - pb;
  return d > 0 ? d : pe;
}

function migWriteExtrasSheet_(ss, extrasMap) {
  var sh = ss.getSheetByName(MIG_SHEET_EXTRAS);
  if (!sh) sh = ss.insertSheet(MIG_SHEET_EXTRAS);
  sh.clear();
  sh.appendRow(['id', 'Nombre', 'Precio', 'Grupo']);
  for (var k in extrasMap) {
    var e = extrasMap[k];
    var grupos = Object.keys(e.grupos).join(',');
    sh.appendRow(['ext_' + k.replace(/\s+/g, '_'), e.nombre, e.precio, grupos]);
  }
  sh.setFrozenRows(1);
}

function migWriteIngredientesSheet_(ss) {
  var sh = ss.getSheetByName(MIG_SHEET_INGREDIENTES);
  if (!sh) sh = ss.insertSheet(MIG_SHEET_INGREDIENTES);
  sh.clear();
  sh.appendRow(['grupo', 'Ingrediente', 'Default']);
  var rows = [
    ['simple_std', 'Cebolla', 'si'],
    ['simple_std', 'Salsa mil islas', 'si'],
    ['simple_std', 'Cheddar', 'si'],
    ['doble_std', 'Cebolla', 'si'],
    ['doble_std', 'Salsa mil islas', 'si'],
    ['doble_std', 'Cheddar', 'si'],
  ];
  rows.forEach(function (r) {
    sh.appendRow(r);
  });
  sh.setFrozenRows(1);
}
