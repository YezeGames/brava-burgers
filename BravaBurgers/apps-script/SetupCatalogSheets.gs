/**
 * Ejecutar UNA vez desde el Sheet de menú Brava (Pedilo):
 * Extensiones → Apps Script → pegar este archivo → Run → setupExtrasEIngredientesEnCatalogo
 *
 * Crea pestañas extras + ingredientes y columnas en productos (sin borrar datos).
 * Columna Ingredientes = lista por hamburguesa ("Cebolla, Cheddar") — prioridad sobre pestaña ingredientes.
 * Columna Agotado (al lado de Ingredientes) = si → producto visible pero sin stock en la tienda.
 */
var SETUP_CATALOG_SHEET_ID = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';

function setupExtrasEIngredientesEnCatalogo() {
  var ss = SpreadsheetApp.openById(SETUP_CATALOG_SHEET_ID);
  setupExtrasSheet_(ss);
  setupIngredientesSheet_(ss);
  setupProductosColumnas_(ss);
  linkProductosGrupos_(ss);
  fillProductosIngredientesEnSheet_(ss);
  try {
    SpreadsheetApp.getUi().alert(
      'Listo: extras, ingredientes, Agotado y vínculos en productos (filas Sin Extra).\n' +
        'Agotado: poné si en una fila del producto para marcar sin stock (vacío = vendible).\n' +
        'Publicá el menú desde Pedilo si hace falta.'
    );
  } catch (e) {
    Logger.log('Setup catalog OK (sin UI): ' + e);
  }
}

function setupExtrasSheet_(ss) {
  var name = 'extras';
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['id', 'Nombre', 'Precio', 'Grupo']]);
  sh.getRange('A2:D3').setValues([
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
  sh.getRange('A2:C7').setValues([
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
  headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  lower = headers.map(function (h) {
    return String(h || '')
      .toLowerCase()
      .trim();
  });
  if (lower.indexOf('ingredientes') === -1) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Ingredientes');
  }
  ensureAgotadoColumnAfterIngredientes_(sh);
}

/** Solo agrega la columna Agotado (junto a Ingredientes) sin tocar extras ni recetas. */
function setupColumnaAgotadoEnProductos() {
  var ss = SpreadsheetApp.openById(SETUP_CATALOG_SHEET_ID);
  var sh = ss.getSheetByName('productos');
  if (!sh) throw new Error('No hay pestaña productos');
  ensureAgotadoColumnAfterIngredientes_(sh);
  try {
    SpreadsheetApp.getUi().alert(
      'Columna Agotado lista (al lado de Ingredientes).\n' +
        'Marcá si en el producto que no podés vender. Vacío = normal.\n' +
        'Ocultar = si sigue sacando el producto del menú por completo.'
    );
  } catch (e) {
    Logger.log('Columna Agotado OK (sin UI): ' + e);
  }
}

/** Inserta encabezado Agotado inmediatamente después de Ingredientes si falta. */
function ensureAgotadoColumnAfterIngredientes_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var lower = headers.map(function (h) {
    return String(h || '')
      .toLowerCase()
      .trim();
  });
  if (lower.indexOf('agotado') !== -1) return;
  var ingIdx = lower.indexOf('ingredientes');
  if (ingIdx >= 0) {
    sh.insertColumnAfter(ingIdx + 1);
    sh.getRange(1, ingIdx + 2).setValue('Agotado');
  } else {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Agotado');
  }
}

/** Rellena Grupo extras / Quitar en filas "Sin Extra" según Subcategoría (no borra filas Extra …). */
function linkProductosGrupos_(ss) {
  var sh = ss.getSheetByName('productos');
  if (!sh || sh.getLastRow() < 2) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = linkColIndex_(headers);
  if (col.variedades < 0 || col.subcategoria < 0) return;
  if (col.grupoExtras < 0 || col.quitar < 0) return;

  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var variedad = String(data[r][col.variedades] || '')
      .toLowerCase()
      .trim();
    if (variedad !== 'sin extra' && variedad !== 'sin extras') continue;
    var sub = String(data[r][col.subcategoria] || '');
    var ge = String(data[r][col.grupoExtras] || '').trim();
    var qu = String(data[r][col.quitar] || '').trim();
    if (!ge) sh.getRange(r + 1, col.grupoExtras + 1).setValue(linkGrupoExtrasFromSub_(sub));
    if (!qu) sh.getRange(r + 1, col.quitar + 1).setValue(linkQuitarFromSub_(sub));
  }
}

function linkColIndex_(headers) {
  function idx(names) {
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i] || '')
        .toLowerCase()
        .trim();
      for (var j = 0; j < names.length; j++) {
        if (h === names[j].toLowerCase()) return i;
      }
    }
    return -1;
  }
  return {
    variedades: idx(['variedades', 'variedad']),
    subcategoria: idx(['subcategoria', 'subcategoría']),
    grupoExtras: idx(['grupo extras', 'grupo_extras']),
    quitar: idx(['quitar', 'grupo_quitar']),
  };
}

function linkGrupoExtrasFromSub_(sub) {
  var s = String(sub || '').toLowerCase();
  if (s.indexOf('simple') >= 0) return 'simple';
  if (s.indexOf('doble') >= 0) return 'doble';
  if (s.indexOf('triple') >= 0) return 'triple';
  return 'general';
}

function linkQuitarFromSub_(sub) {
  var s = String(sub || '').toLowerCase();
  if (s.indexOf('simple') >= 0) return 'simple_std';
  if (s.indexOf('doble') >= 0) return 'doble_std';
  if (s.indexOf('triple') >= 0) return 'triple_std';
  return '';
}

/** Ejecutar cuando agregues columna Ingredientes o nuevas burgers. Rellena filas "Sin Extra". */
function fillProductosIngredientesBrava() {
  var ss = SpreadsheetApp.openById(SETUP_CATALOG_SHEET_ID);
  setupProductosColumnas_(ss);
  linkProductosGrupos_(ss);
  fillProductosIngredientesEnSheet_(ss);
}

function fillProductosIngredientesEnSheet_(ss) {
  var sh = ss.getSheetByName('productos');
  if (!sh) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = fillColIndex_(headers);
  var recetasPorNombre = {
    'cheeseburger simple': 'Cebolla, Salsa mil islas, Cheddar',
    'cheeseburger doble': 'Cebolla, Salsa mil islas, Cheddar',
    'la destrozaaanos simple': 'Cheddar, Mayonesa, Lechuga, Tomate',
    'la destrozaaanos doble': 'Cheddar, Mayonesa, Lechuga, Tomate',
  };
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var variedad = String(data[r][col.variedades] || '')
      .toLowerCase()
      .trim();
    if (variedad !== 'sin extra' && variedad !== 'sin extras') continue;
    var ingActual = String(data[r][col.ingredientes] || '').trim();
    if (ingActual) continue;
    var nombreKey = String(data[r][col.nombre] || '')
      .toLowerCase()
      .trim();
    var lista = recetasPorNombre[nombreKey];
    if (!lista) lista = ingredientesDesdeDescripcion_(String(data[r][col.descripcion] || ''));
    if (lista) sh.getRange(r + 1, col.ingredientes + 1).setValue(lista);
  }
}

function fillColIndex_(headers) {
  function idx(names) {
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i] || '')
        .toLowerCase()
        .trim();
      for (var j = 0; j < names.length; j++) {
        if (h === names[j].toLowerCase()) return i;
      }
    }
    return -1;
  }
  var base = linkColIndex_(headers);
  return {
    nombre: idx(['nombre']),
    descripcion: idx(['descripcion', 'descripción']),
    variedades: base.variedades,
    subcategoria: base.subcategoria,
    grupoExtras: base.grupoExtras,
    quitar: base.quitar,
    ingredientes: idx(['ingredientes', 'ingredientes sacar', 'se puede sacar']),
  };
}

/** Palabras clave en Descripcion → lista para columna Ingredientes (si no hay receta por nombre). */
function ingredientesDesdeDescripcion_(desc) {
  var d = String(desc || '').toLowerCase();
  var out = [];
  function add(label, re) {
    if (re.test(d) && out.indexOf(label) === -1) out.push(label);
  }
  add('Cebolla', /cebolla/);
  add('Salsa mil islas', /mil islas|salsa mil/);
  add('Cheddar', /cheddar/);
  add('Mayonesa', /mayonesa/);
  add('Lechuga', /lechuga/);
  add('Tomate', /tomate/);
  add('Bacon', /bacon/);
  add('Huevo', /huevo/);
  return out.join(', ');
}
