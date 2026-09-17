const { parseConfigCSV, normalizeTime, parseIntConfig } = require('./turnosDelivery');
const { emptyDraft, saveStoreMenuDraft, publishStoreMenu, loadPublishedRows } = require('./storeCatalog');

const SHEET_ID =
  process.env.BRAVA_SHEET_ID ||
  process.env.PEDILO_SHEET_ID ||
  '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HORARIO_CFG_KEYS = [
  'Horario abierto DOMINGO',
  'Horario abierto LUNES',
  'Horario abierto MARTES',
  'Horario abierto MIERCOLES',
  'Horario abierto JUEVES',
  'Horario abierto VIERNES',
  'Horario abierto SABADO',
];

function sheetCsvUrl(sheetName) {
  return (
    'https://docs.google.com/spreadsheets/d/' +
    SHEET_ID +
    '/gviz/tq?tqx=out:csv&sheet=' +
    encodeURIComponent(sheetName)
  );
}

async function fetchSheetCsv(sheetName) {
  const r = await fetch(sheetCsvUrl(sheetName));
  if (!r.ok) throw new Error('sheet_http_' + sheetName + '_' + r.status);
  return r.text();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map(function (s) {
    return s.trim();
  });
}

function parseSheetTable(csv) {
  const lines = String(csv || '').split(/\r?\n/).filter(function (l) {
    return l.trim();
  });
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(function (h, index) {
    const name = String(h || '').trim();
    if (name) return name.toLowerCase();
    return 'col_' + (index + 1);
  });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach(function (key, idx) {
      row[key] = cells[idx] != null ? cells[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function col(row, names) {
  for (let i = 0; i < names.length; i++) {
    const k = names[i].toLowerCase();
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return '';
}

function limpiarPrecio(precio) {
  if (precio === undefined || precio === null || precio === '') return 0;
  const s = String(precio);
  if (/e\+?/i.test(s)) {
    const n = parseFloat(s);
    if (!isNaN(n)) return Math.round(n);
  }
  return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
}

function isSi(val) {
  const s = String(val || '').toLowerCase().trim();
  return s === 'si' || s === 'sí' || s === '1' || s === 'true';
}

function parseHorarioFirstRange(raw) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw)
    .replace(/<BR>/gi, ' ')
    .replace(/ - /g, '-')
    .replace(/,/g, ' ')
    .replace(/ Y /gi, ' ')
    .trim();
  const first = s.split(/\s+/).filter(Boolean)[0] || '';
  const partes = first.split('-');
  if (partes.length !== 2) return null;
  return {
    from: normalizeTime(partes[0], '20:00'),
    to: normalizeTime(partes[1], '23:00'),
  };
}

function configGet(cfg, key) {
  if (!cfg) return '';
  if (cfg[key] !== undefined) return cfg[key];
  const lower = key.toLowerCase();
  for (const k in cfg) {
    if (k.toLowerCase() === lower) return cfg[k];
  }
  return '';
}

function buildDaysFromConfig(cfg) {
  return HORARIO_CFG_KEYS.map(function (key, dow) {
    const raw = configGet(cfg, key);
    const range = parseHorarioFirstRange(raw);
    return {
      id: dow,
      name: DAY_NAMES[dow],
      on: !!range,
      from: range ? range.from : '20:00',
      to: range ? range.to : '23:00',
    };
  });
}

function buildTurnosFromConfig(cfg) {
  const turnos = [];
  for (let i = 1; i <= 5; i++) {
    const from = configGet(cfg, 'Turno ' + i + ' - Entrega desde');
    const to = configGet(cfg, 'Turno ' + i + ' - Entrega hasta');
    const cierre = configGet(cfg, 'Turno ' + i + ' - Cierre pedidos');
    if (!from && !to && !cierre) continue;
    turnos.push({
      id: i,
      nombre: 'Turno ' + i,
      from: normalizeTime(from, '20:00'),
      to: normalizeTime(to, '23:00'),
      cierre: normalizeTime(cierre, '22:30'),
    });
  }
  return turnos;
}

function buildSettingsFromConfig(cfg) {
  return {
    controlHorario: isSi(configGet(cfg, 'Control horario')),
    controlTurnos: isSi(
      configGet(cfg, 'Control turnos delivery') || configGet(cfg, 'Control turnos de delivery')
    ),
    msgCerrado:
      configGet(cfg, 'Mensaje cerrado') ||
      configGet(cfg, 'Mensaje tienda cerrada') ||
      '¡Estamos cerrados! 🔥',
    pedidosDesde: normalizeTime(configGet(cfg, 'Pedidos web desde'), '19:30'),
    maxPorHora: parseIntConfig(
      configGet(cfg, 'Máx pedidos por hora') || configGet(cfg, 'Max pedidos por hora'),
      12
    ),
  };
}

function groupProductRows(rows) {
  const groups = new Map();
  const order = [];

  rows.forEach(function (row) {
    const nombre = col(row, ['nombre']);
    if (!nombre) return;
    const precio = limpiarPrecio(col(row, ['precio']));
    if (precio <= 0 && !isSi(col(row, ['ocultar']))) return;

    const key = [
      nombre,
      col(row, ['descripcion']),
      col(row, ['categoria']),
      col(row, ['subcategoria']),
    ].join('\x1e');

    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, {
        nombre: nombre,
        desc: col(row, ['descripcion']),
        categoria: col(row, ['categoria']) || 'General',
        subcategoria: col(row, ['subcategoria']),
        ingredientes: col(row, ['ingredientes', 'ingredientes sacar', 'se puede sacar']),
        atajo: col(row, ['atajo', 'codigo', 'código']),
        precios: [],
        agotado: false,
        oculto: false,
      });
    }

    const g = groups.get(key);
    if (precio > 0) g.precios.push(precio);
    if (isSi(col(row, ['agotado']))) g.agotado = true;
    if (isSi(col(row, ['ocultar']))) g.oculto = true;
    if (!g.ingredientes) g.ingredientes = col(row, ['ingredientes']);
    if (!g.atajo) g.atajo = col(row, ['atajo', 'codigo', 'código']);
    if (!g.desc) g.desc = col(row, ['descripcion']);
  });

  return order.map(function (key) {
    return groups.get(key);
  });
}

function ensureCategory(categorias, catMap, catName) {
  const nom = String(catName || 'General').trim() || 'General';
  const key = nom.toLowerCase();
  if (catMap[key]) return catMap[key];
  const id = categorias.length + 1;
  const cat = { id: id, nombre: nom, visible: true, subs: [] };
  categorias.push(cat);
  catMap[key] = cat;
  return cat;
}

function ensureSubcategory(cat, subName, subMap) {
  const nom = String(subName || '').trim();
  if (!nom) return null;
  const key = cat.id + ':' + nom.toLowerCase();
  if (subMap[key]) return subMap[key];
  const id = cat.id * 100 + cat.subs.length + 1;
  const sub = { id: id, nombre: nom };
  cat.subs.push(sub);
  subMap[key] = sub;
  return sub;
}

function mapGrupoToCatId(grupo, catMap, categorias) {
  const g = String(grupo || '').trim().toLowerCase();
  if (!g) return categorias[0] ? categorias[0].id : 1;
  for (const k in catMap) {
    if (k === g || catMap[k].nombre.toLowerCase() === g) return catMap[k].id;
  }
  const cat = ensureCategory(categorias, catMap, grupo);
  return cat.id;
}

async function buildDraftFromSheet() {
  const [productsCsv, configCsv, extrasCsv] = await Promise.all([
    fetchSheetCsv('productos'),
    fetchSheetCsv('configuracion').catch(function () {
      return '';
    }),
    fetchSheetCsv('extras').catch(function () {
      return '';
    }),
  ]);

  const cfg = configCsv ? parseConfigCSV(configCsv) : {};
  const productRows = parseSheetTable(productsCsv);
  const extraRows = extrasCsv ? parseSheetTable(extrasCsv) : [];
  const grouped = groupProductRows(productRows);

  const draft = emptyDraft();
  draft.days = buildDaysFromConfig(cfg);
  draft.turnos = buildTurnosFromConfig(cfg);
  draft.settings = buildSettingsFromConfig(cfg);

  const catMap = {};
  const subMap = {};
  draft.categorias = [];
  draft.productos = [];
  draft.extras = [];

  grouped.forEach(function (g, idx) {
    const cat = ensureCategory(draft.categorias, catMap, g.categoria);
    const sub = ensureSubcategory(cat, g.subcategoria, subMap);
    const precio = g.precios.length ? Math.min.apply(null, g.precios) : 0;
    draft.productos.push({
      id: idx + 1,
      nombre: g.nombre,
      catId: cat.id,
      subId: sub ? sub.id : null,
      precio: precio,
      ingredientes: g.ingredientes || '',
      desc: g.desc || '',
      atajo: g.atajo || String(100 + idx),
      agotado: !!g.agotado,
      oculto: !!g.oculto,
      sinPromoMenu: false,
      sinPromoCat: false,
    });
  });

  extraRows.forEach(function (row, idx) {
    const nombre = col(row, ['nombre', 'extra', 'titulo']);
    if (!nombre) return;
    draft.extras.push({
      id: idx + 1,
      nombre: nombre,
      catId: mapGrupoToCatId(col(row, ['grupo', 'grupos', 'aplica']), catMap, draft.categorias),
      precio: limpiarPrecio(col(row, ['precio'])),
      atajo: col(row, ['atajo', 'codigo', 'id']) || String(500 + idx),
      oculto: isSi(col(row, ['ocultar'])),
    });
  });

  draft.promos = [];
  return {
    draft: draft,
    stats: {
      categorias: draft.categorias.length,
      productos: draft.productos.length,
      extras: draft.extras.length,
      turnos: draft.turnos.length,
    },
  };
}

async function isCatalogEmpty() {
  const published = await loadPublishedRows();
  if (!published.ok) return true;
  return !published.products.length && !published.categories.length;
}

async function importStoreMenuFromSheet(options) {
  const opts = options || {};
  let built;
  try {
    built = await buildDraftFromSheet();
  } catch (e) {
    return { ok: false, error: 'sheet_fetch_failed', detail: String(e.message || e) };
  }

  const saveR = await saveStoreMenuDraft({ draft: built.draft });
  if (!saveR.ok) return saveR;

  if (opts.publish) {
    const pubR = await publishStoreMenu();
    if (!pubR.ok) return pubR;
    return {
      ok: true,
      imported: true,
      published: true,
      publishedAt: pubR.publishedAt,
      stats: built.stats,
    };
  }

  return { ok: true, imported: true, published: false, stats: built.stats };
}

async function importStoreMenuFromSheetIfEmpty() {
  const empty = await isCatalogEmpty();
  if (!empty) {
    return { ok: true, skipped: true, reason: 'catalog_not_empty' };
  }
  return importStoreMenuFromSheet({ publish: true });
}

module.exports = {
  buildDraftFromSheet,
  importStoreMenuFromSheet,
  importStoreMenuFromSheetIfEmpty,
  isCatalogEmpty,
};
