/**
 * Brava Burgers — backend en Google Apps Script
 * Publicar como Web app (Ejecutar como: Yo, Acceso: Cualquiera)
 *
 * Script Properties (Proyecto → Configuración → Propiedades del script):
 *   ORDER_SECRET     — debe coincoincidir con BRAVA_ORDER_SECRET en Vercel
 *   ADMIN_USER       — usuario panel admin
 *   ADMIN_PASSWORD   — contraseña panel (cambiar en producción)
 *   OPERATIONS_SHEET_ID — Sheet privado pedidos + gastos (+ config_pedidos)
 *   CATALOG_SHEET_ID   — (opcional) menú público; default BRAVA-BURGERS-Pedilo
 */

var SHEET_PEDIDOS = 'pedidos';
var SHEET_GASTOS = 'gastos';
var SHEET_CONFIG = 'config_pedidos';
var HEADERS = [
  'orn',
  'fecha_creado',
  'estado',
  'cliente',
  'telefono',
  'direccion',
  'localidad',
  'piso',
  'turno',
  'zona',
  'envio',
  'pago',
  'items_json',
  'subtotal',
  'total',
  'modificado',
  'modificado_at',
  'entregado_at',
  'cancelado_at',
  'aceptado_at',
  'rechazado_at',
  'rechazo_mensaje',
];

var GASTOS_HEADERS = ['id', 'fecha', 'concepto', 'monto', 'pagado_con', 'creado_at'];

var CATALOG_MENU_SHEET_ID_DEFAULT = '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';

function doGet(e) {
  return jsonOut({ ok: true, service: 'brava-burgers-gas', version: 8 });
}

function doPost(e) {
  try {
    var body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action;
    if (!action) return jsonOut({ ok: false, error: 'missing_action' });

    if (action === 'createOrder') {
      if (body.secret !== getProp_('ORDER_SECRET')) {
        return jsonOut({ ok: false, error: 'unauthorized' });
      }
      return jsonOut(createOrder_(body.order || {}));
    }

    if (action === 'login') {
      return jsonOut(login_(body.user, body.password));
    }

    if (action === 'listOrders') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(listOrders_(body));
    }

    if (action === 'listOrdersRecent') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(listOrdersRecent_(body));
    }

    if (action === 'updateOrder') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(updateOrder_(body));
    }

    if (action === 'listGastos') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(listGastos_(body));
    }

    if (action === 'createGasto') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(createGasto_(body));
    }

    if (action === 'deleteGasto') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(deleteGasto_(body));
    }

    return jsonOut({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err.message || err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function getOperationsSpreadsheet_() {
  var id = getProp_('OPERATIONS_SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getPedidosSheet_() {
  var ss = getOperationsSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_PEDIDOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PEDIDOS);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else {
    syncPedidosHeaders_(sh);
  }
  return sh;
}

function syncPedidosHeaders_(sh) {
  var lastCol = Math.max(1, sh.getLastColumn());
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var have = row.map(function (h) {
    return String(h || '')
      .trim()
      .toLowerCase();
  });
  for (var i = 0; i < HEADERS.length; i++) {
    var key = HEADERS[i].toLowerCase();
    if (have.indexOf(key) < 0) {
      lastCol += 1;
      sh.getRange(1, lastCol).setValue(HEADERS[i]);
      have.push(key);
    }
  }
}

function nextOrn_() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty('LAST_ORN_DEL') || '0', 10) + 1;
  props.setProperty('LAST_ORN_DEL', String(n));
  return 'ORN-DEL-' + ('0000' + n).slice(-4);
}

function headerIndex_(headers, key) {
  var want = String(key).trim().toLowerCase();
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h] || '').trim().toLowerCase() === want) return h;
  }
  return -1;
}

function appendOrderRow_(order) {
  var sh = getPedidosSheet_();
  var orn = nextOrn_();
  var now = new Date();
  var itemsJson = JSON.stringify(order.items || []);
  var subtotal = Number(order.subtotal) || 0;
  var envio = Number(order.envio) || 0;
  var total = Number(order.total) || subtotal + envio;
  var row = [
    orn,
    now,
    'pendiente',
    order.cliente || '',
    order.telefono || '',
    order.direccion || '',
    order.localidad || '',
    order.piso || '',
    order.turno || '',
    order.zona || '',
    envio,
    order.pago || '',
    itemsJson,
    subtotal,
    total,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  sh.appendRow(row);
  clearOrdersListCache_();
  return { ok: true, orn: orn, total: total };
}

function createOrder_(order) {
  var idem = order.idempotencyKey ? String(order.idempotencyKey).slice(0, 120) : '';
  if (!idem) return appendOrderRow_(order);

  var cache = CacheService.getScriptCache();
  var cacheKey = 'idem_' + idem;
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var hit = JSON.parse(cached);
      if (hit && hit.ok) return hit;
    } catch (ignore) {}
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    cached = cache.get(cacheKey);
    if (cached) {
      try {
        hit = JSON.parse(cached);
        if (hit && hit.ok) return hit;
      } catch (ignore2) {}
    }
    var result = appendOrderRow_(order);
    cache.put(cacheKey, JSON.stringify(result), 600);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function login_(user, password) {
  var u = getProp_('ADMIN_USER');
  var p = getProp_('ADMIN_PASSWORD');
  if (!u || !p) {
    return { ok: false, error: 'admin_not_configured' };
  }
  if (user !== u || password !== p) {
    return { ok: false, error: 'invalid_credentials' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, '1', 43200);
  return { ok: true, token: token, expiresIn: 43200 };
}

function clearOrdersListCache_() {
  CacheService.getScriptCache().remove('orders_full_v1');
}

function validateToken_(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('tok_' + token) === '1';
}

function listOrders_(opts) {
  opts = opts || {};
  return buildListOrders_(opts, 250);
}

function listOrdersRecent_(opts) {
  return buildListOrders_(opts || {}, 35);
}

function buildListOrders_(opts, maxRows) {
  var sh = getPedidosSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, orders: [] };
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var startRow = Math.max(2, lastRow - (maxRows - 1));
  var data = sh.getRange(startRow, 1, lastRow, lastCol).getValues();
  var estadoFilter = opts.estado || '';
  var orders = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var o = rowToOrder_(headers, row);
    if (!o.orn || String(o.orn).trim() === '') continue;
    if (estadoFilter && o.estado !== estadoFilter) continue;
    orders.push(o);
  }
  orders.sort(function (a, b) {
    return new Date(b.fecha_creado) - new Date(a.fecha_creado);
  });
  return { ok: true, orders: orders };
}

function rowToOrder_(headers, row) {
  var o = {};
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c] || '')
      .trim()
      .toLowerCase();
    if (key) o[key] = row[c];
  }
  if (o.estado != null) {
    o.estado = String(o.estado).trim().toLowerCase();
    if (o.estado === 'activa') o.estado = 'pendiente';
  }
  if (o.fecha_creado instanceof Date) {
    o.fecha_creado = o.fecha_creado.toISOString();
  }
  try {
    o.items = JSON.parse(o.items_json || '[]');
  } catch (e) {
    o.items = [];
  }
  return o;
}

function updateOrder_(body) {
  var orn = body.orn;
  if (!orn) return { ok: false, error: 'missing_orn' };
  var sh = getPedidosSheet_();
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var ornCol = headerIndex_(headers, 'orn');
  if (ornCol < 0) return { ok: false, error: 'bad_sheet' };

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ornCol] || '').trim() !== String(orn).trim()) continue;
    var rowNum = i + 1;
    if (body.estado) {
      var est = String(body.estado).trim().toLowerCase();
      setCell_(sh, headers, rowNum, 'estado', est);
      var now = new Date();
      if (est === 'aceptado') setCell_(sh, headers, rowNum, 'aceptado_at', now);
      if (est === 'en_preparacion') setCell_(sh, headers, rowNum, 'en_preparacion_at', now);
      if (est === 'en_camino') setCell_(sh, headers, rowNum, 'en_camino_at', now);
      if (est === 'rechazado') {
        setCell_(sh, headers, rowNum, 'rechazado_at', now);
        if (body.rechazoMensaje != null) {
          setCell_(sh, headers, rowNum, 'rechazo_mensaje', String(body.rechazoMensaje));
        }
      }
      if (est === 'entregada') setCell_(sh, headers, rowNum, 'entregado_at', now);
      if (est === 'cancelada') setCell_(sh, headers, rowNum, 'cancelado_at', now);
    }
    if (body.items) {
      setCell_(sh, headers, rowNum, 'items_json', JSON.stringify(body.items));
      setCell_(sh, headers, rowNum, 'modificado', 'SI');
      setCell_(sh, headers, rowNum, 'modificado_at', new Date());
    }
    if (body.subtotal != null) setCell_(sh, headers, rowNum, 'subtotal', Number(body.subtotal));
    if (body.total != null) setCell_(sh, headers, rowNum, 'total', Number(body.total));
    clearOrdersListCache_();
    return { ok: true, orn: orn };
  }
  return { ok: false, error: 'not_found' };
}

function setCell_(sh, headers, rowNum, key, value) {
  var col = headerIndex_(headers, key);
  if (col >= 0) sh.getRange(rowNum, col + 1).setValue(value);
}

function getGastosSheet_() {
  var ss = getOperationsSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_GASTOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_GASTOS);
    sh.appendRow(GASTOS_HEADERS);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(GASTOS_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function nextGastoId_() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty('LAST_GASTO_ID') || '0', 10) + 1;
  props.setProperty('LAST_GASTO_ID', String(n));
  return 'GAS-' + ('0000' + n).slice(-4);
}

function dateOnlyIso_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(value || '').trim();
  if (!s) return '';
  if (s.length >= 10 && s.indexOf('T') > 0) return s.slice(0, 10);
  return s.slice(0, 10);
}

function listGastos_(body) {
  body = body || {};
  var sh = getGastosSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, gastos: [] };
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var data = sh.getRange(2, 1, lastRow, sh.getLastColumn()).getValues();
  var desde = body.desde || '';
  var hasta = body.hasta || '';
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var g = {};
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c] || '')
        .trim()
        .toLowerCase();
      if (key) g[key] = row[c];
    }
    if (!g.id) continue;
    var iso = dateOnlyIso_(g.fecha);
    if (desde && iso && iso < desde) continue;
    if (hasta && iso && iso > hasta) continue;
    if (g.fecha instanceof Date) g.fecha = iso;
    if (g.creado_at instanceof Date) g.creado_at = g.creado_at.toISOString();
    g.monto = Number(g.monto) || 0;
    out.push(g);
  }
  out.sort(function (a, b) {
    return String(b.fecha || '').localeCompare(String(a.fecha || ''));
  });
  return { ok: true, gastos: out };
}

function createGasto_(body) {
  var concepto = String(body.concepto || '').trim();
  var monto = Number(body.monto);
  if (!concepto || !monto || monto <= 0) return { ok: false, error: 'invalid_gasto' };
  var sh = getGastosSheet_();
  var id = nextGastoId_();
  var now = new Date();
  var fecha = body.fecha ? new Date(body.fecha + 'T12:00:00') : now;
  var pagado = String(body.pagadoCon || body.pagado_con || '').trim();
  sh.appendRow([id, fecha, concepto, monto, pagado, now]);
  return { ok: true, gasto: { id: id, fecha: dateOnlyIso_(fecha), concepto: concepto, monto: monto, pagado_con: pagado } };
}

function deleteGasto_(body) {
  var id = String(body.id || '').trim();
  if (!id) return { ok: false, error: 'missing_id' };
  var sh = getGastosSheet_();
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var idCol = headerIndex_(headers, 'id');
  if (idCol < 0) return { ok: false, error: 'bad_sheet' };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol] || '').trim() === id) {
      sh.deleteRow(i + 1);
      return { ok: true, id: id };
    }
  }
  return { ok: false, error: 'not_found' };
}

/**
 * Ejecutar una vez desde el editor (▶): copia pedidos + gastos del menú público al sheet OPERATIONS_SHEET_ID.
 */
function migrateCatalogOpsToOperationsSheet() {
  var opsId = getProp_('OPERATIONS_SHEET_ID');
  if (!opsId) throw new Error('Configurá OPERATIONS_SHEET_ID en Propiedades del script');
  var catalogId = getProp_('CATALOG_SHEET_ID') || CATALOG_MENU_SHEET_ID_DEFAULT;
  var cat = SpreadsheetApp.openById(catalogId);
  var ops = SpreadsheetApp.openById(opsId);
  var pedidosRows = copySheetValuesToOps_(cat, SHEET_PEDIDOS, ops, SHEET_PEDIDOS, HEADERS);
  var gastosRows = copySheetValuesToOps_(cat, SHEET_GASTOS, ops, SHEET_GASTOS, GASTOS_HEADERS);
  migrateConfigPedidos_(cat, ops);
  removeBlankDefaultSheet_(ops);
  return { ok: true, pedidosRows: pedidosRows, gastosRows: gastosRows, operationsSheetId: opsId };
}

function copySheetValuesToOps_(srcSs, srcName, destSs, destName, defaultHeaders) {
  var src = srcSs.getSheetByName(srcName);
  if (!src || src.getLastRow() < 1) {
    ensureSheetWithHeaders_(destSs, destName, defaultHeaders);
    return 0;
  }
  var existing = destSs.getSheetByName(destName);
  if (existing) destSs.deleteSheet(existing);
  var dest = destSs.insertSheet(destName);
  var lastCol = src.getLastColumn();
  var lastRow = src.getLastRow();
  var values = src.getRange(1, 1, lastRow, lastCol).getValues();
  dest.getRange(1, 1, values.length, values[0].length).setValues(values);
  dest.setFrozenRows(1);
  return Math.max(0, values.length - 1);
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
}

function migrateConfigPedidos_(cat, ops) {
  var dest = ops.getSheetByName(SHEET_CONFIG);
  if (!dest) {
    dest = ops.insertSheet(SHEET_CONFIG);
    dest.appendRow(['key', 'value']);
    dest.setFrozenRows(1);
  }
  var src = cat.getSheetByName(SHEET_CONFIG);
  if (!src || src.getLastRow() < 2) return;
  var data = src.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    dest.appendRow(data[i]);
  }
}

function removeBlankDefaultSheet_(ops) {
  var names = ['Hoja 1', 'Sheet1'];
  for (var n = 0; n < names.length; n++) {
    var sh = ops.getSheetByName(names[n]);
    if (!sh || ops.getSheets().length <= 1) continue;
    if (sh.getLastRow() <= 1 && sh.getLastColumn() <= 1) ops.deleteSheet(sh);
  }
}
