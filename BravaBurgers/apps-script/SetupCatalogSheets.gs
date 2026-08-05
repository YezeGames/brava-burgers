/**
 * Ejecutar UNA vez desde el Sheet de menú Brava (Pedilo):
 * Extensiones → Apps Script → pegar este archivo → Run → setupExtrasEIngredientesEnCatalogo
 *
 * Crea pestañas extras + ingredientes y columnas en productos (sin borrar datos).
 */
var SETUP_CATALOG_SHEET_ID = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';

function setupExtrasEIngredientesEnCatalogo() {
  var ss = SpreadsheetApp.openById(SETUP_CATALOG_SHEET_ID);
  setupExtrasSheet_(ss);
  setupIngredientesSheet_(ss);
  setupProductosColumnas_(ss);
  SpreadsheetApp.getUi().alert(
    'Listo: pestañas extras e ingredientes creadas/actualizadas.\n' +
      'Revisá productos (columnas Grupo extras / Quitar) y publicá el menú.'
  );
}

function setupExtrasSheet_(ss) {
  var name = 'extras';
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['id', 'Nombre', 'Precio', 'Grupo']]);
  sh.getRange(2, 1, 3, 4).setValues([
    ['ext_cheddar', 'Extra cheddar', 1000, 'simple,doble'],
    ['ext_bacon', 'Extra bacon', 1500, 'simple,doble'],
  ]);
  sh.setFrozenRows(1);
}

function setupIngredientesSheet_(ss) {
  var name = 'ingredientes';
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['grupo', 'Ingrediente', 'Default']]);
  sh.getRange(2, 1, 7, 3).setValues([
    ['simple_std', 'Cebolla', 'si'],
    ['simple_std', 'Salsa mil islas', 'si'],
    ['simple_std', 'Cheddar', 'si'],
    ['doble_std', 'Cebolla', 'si'],
    ['doble_std', 'Salsa mil islas', 'si'],
    ['doble_std', 'Cheddar', 'si'],
  ]);
  sh.setFrozenRows(1);
}

function setupProductosColumnas_(ss) {
  var sh = ss.getSheetByName('productos');
  if (!sh || sh.getLastColumn() < 1) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var lower = headers.map(function (h) {
    return String(h || '')
      .toLowerCase()
      .trim();
  });
  var lastCol = sh.getLastColumn();
  if (lower.indexOf('grupo extras') === -1 && lower.indexOf('grupo_extras') === -1) {
    lastCol++;
    sh.getRange(1, lastCol).setValue('Grupo extras');
  }
  headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  lower = headers.map(function (h) {
    return String(h || '')
      .toLowerCase()
      .trim();
  });
  if (lower.indexOf('quitar') === -1) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Quitar');
  }
}
