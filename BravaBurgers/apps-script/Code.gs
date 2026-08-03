/**
 * Brava Burgers — backend en Google Apps Script
 * Publicar como Web app (Ejecutar como: Yo, Acceso: Cualquiera)
 *
 * Script Properties (Proyecto → Configuración → Propiedades del script):
 *   ORDER_SECRET     — debe coincoincidir con BRAVA_ORDER_SECRET en Vercel
 *   ADMIN_USER       — usuario panel admin
 *   ADMIN_PASSWORD   — contraseña panel (cambiar en producción)
 */

var SHEET_PEDIDOS = 'pedidos';
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
];

function doGet(e) {
  return jsonOut({ ok: true, service: 'brava-burgers-gas', version: 1 });
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

    if (action === 'updateOrder') {
      if (!validateToken_(body.token)) return jsonOut({ ok: false, error: 'unauthorized' });
      return jsonOut(updateOrder_(body));
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

function getPedidosSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_PEDIDOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PEDIDOS);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function nextOrn_() {
  var props = PropertiesService.getScriptProperties();
  var n = parseInt(props.getProperty('LAST_ORN_DEL') || '0', 10) + 1;
  props.setProperty('LAST_ORN_DEL', String(n));
  return 'ORN-DEL-' + ('0000' + n).slice(-4);
}

function createOrder_(order) {
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
    'activa',
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
  ];
  sh.appendRow(row);
  return { ok: true, orn: orn, total: total };
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

function validateToken_(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('tok_' + token) === '1';
}

function listOrders_(opts) {
  var sh = getPedidosSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, orders: [] };
  var headers = data[0];
  var estadoFilter = opts.estado || '';
  var orders = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var o = rowToOrder_(headers, row);
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
  if (o.estado != null) o.estado = String(o.estado).trim().toLowerCase();
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
  var ornCol = headers.indexOf('orn');
  if (ornCol < 0) return { ok: false, error: 'bad_sheet' };

  for (var i = 1; i < data.length; i++) {
    if (data[i][ornCol] !== orn) continue;
    var rowNum = i + 1;
    if (body.estado) {
      setCell_(sh, headers, rowNum, 'estado', body.estado);
      if (body.estado === 'entregada') {
        setCell_(sh, headers, rowNum, 'entregado_at', new Date());
      }
      if (body.estado === 'cancelada') {
        setCell_(sh, headers, rowNum, 'cancelado_at', new Date());
      }
    }
    if (body.items) {
      setCell_(sh, headers, rowNum, 'items_json', JSON.stringify(body.items));
      setCell_(sh, headers, rowNum, 'modificado', 'SI');
      setCell_(sh, headers, rowNum, 'modificado_at', new Date());
    }
    if (body.subtotal != null) setCell_(sh, headers, rowNum, 'subtotal', Number(body.subtotal));
    if (body.total != null) setCell_(sh, headers, rowNum, 'total', Number(body.total));
    return { ok: true, orn: orn };
  }
  return { ok: false, error: 'not_found' };
}

function setCell_(sh, headers, rowNum, key, value) {
  var col = headers.indexOf(key);
  if (col >= 0) sh.getRange(rowNum, col + 1).setValue(value);
}
