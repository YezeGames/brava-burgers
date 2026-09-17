const fs = require('fs');
const path = require('path');
const { restSelect, restInsert, restPatch, restDelete, restFetch } = require('./supabaseServer');

const META_ID = 1;

function restErrorBlob(r) {
  return String((r && r.detail) || (r && r.error) || '').toLowerCase();
}

function isStoreCatalogUnavailable(r) {
  if (!r || r.ok) return false;
  const blob = restErrorBlob(r);
  if (blob.indexOf('pgrst205') >= 0 || blob.indexOf('42p01') >= 0) return true;
  if (
    blob.indexOf('store_menu_meta') >= 0 ||
    blob.indexOf('menu_products') >= 0 ||
    blob.indexOf('menu_categories') >= 0
  ) {
    if (
      blob.indexOf('does not exist') >= 0 ||
      blob.indexOf('could not find') >= 0 ||
      blob.indexOf('schema cache') >= 0
    ) {
      return true;
    }
  }
  if (r.error === 'supabase_http_404') return true;
  return false;
}

async function restUpsert(table, rows, onConflict) {
  if (!rows || !rows.length) return { ok: true };
  return restFetch('/rest/v1/' + table + '?on_conflict=' + encodeURIComponent(onConflict || 'id'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

function parseIngredientes(str) {
  return String(str || '')
    .split(/[,;]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function extrasGrupoForCat(catId) {
  return 'cat_' + catId;
}

function emptyDraft() {
  return {
    days: [
      { id: 0, name: 'Domingo', on: false, from: '20:00', to: '23:00' },
      { id: 1, name: 'Lunes', on: false, from: '20:00', to: '23:00' },
      { id: 2, name: 'Martes', on: false, from: '20:00', to: '23:00' },
      { id: 3, name: 'Miércoles', on: false, from: '20:00', to: '23:00' },
      { id: 4, name: 'Jueves', on: false, from: '20:00', to: '23:00' },
      { id: 5, name: 'Viernes', on: false, from: '20:00', to: '23:00' },
      { id: 6, name: 'Sábado', on: true, from: '20:00', to: '23:00' },
    ],
    turnos: [],
    categorias: [],
    productos: [],
    extras: [],
    promos: [],
    settings: {
      controlHorario: true,
      controlTurnos: true,
      msgCerrado: '',
      pedidosDesde: '19:30',
      maxPorHora: 12,
    },
  };
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function getMenuMetaRow() {
  const r = await restSelect('store_menu_meta', 'id=eq.' + META_ID + '&select=*');
  if (!r.ok) return r;
  const row = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
  return { ok: true, row: row };
}

async function loadPublishedRows() {
  const [cats, subs, products, extras, days, turnos, settings, promos] = await Promise.all([
    restSelect('menu_categories', 'select=*&order=orden.asc,id.asc'),
    restSelect('menu_subcategories', 'select=*&order=orden.asc,id.asc'),
    restSelect('menu_products', 'select=*&order=orden.asc,id.asc'),
    restSelect('menu_extras', 'select=*&order=orden.asc,id.asc'),
    restSelect('store_days', 'select=*&order=dow.asc'),
    restSelect('store_turnos', 'select=*&order=orden.asc,id.asc'),
    restSelect('store_settings', 'select=*'),
    restSelect('menu_promos', 'select=*&order=id.asc'),
  ]);
  const first = cats.ok ? cats : subs.ok ? subs : products;
  if (!first.ok && isStoreCatalogUnavailable(first)) {
    return { ok: false, error: 'store_catalog_not_migrated', hint: 'Ejecutá migrateStoreCatalogSchema en admin o store_catalog.sql en Supabase.' };
  }
  for (const r of [cats, subs, products, extras, days, turnos, settings, promos]) {
    if (!r.ok) return r;
  }
  const settingsMap = {};
  (settings.data || []).forEach(function (row) {
    settingsMap[row.key] = row.value;
  });
  return {
    ok: true,
    categories: cats.data || [],
    subcategories: subs.data || [],
    products: products.data || [],
    extras: extras.data || [],
    days: days.data || [],
    turnos: turnos.data || [],
    settings: settingsMap,
    promos: promos.data || [],
  };
}

function publishedToDraft(published) {
  if (!published || !published.ok) return emptyDraft();
  const subsByCat = {};
  published.subcategories.forEach(function (s) {
    if (!subsByCat[s.cat_id]) subsByCat[s.cat_id] = [];
    subsByCat[s.cat_id].push({ id: s.id, nombre: s.nombre });
  });
  const draft = emptyDraft();
  draft.categorias = published.categories.map(function (c) {
    return {
      id: c.id,
      nombre: c.nombre,
      visible: c.visible !== false,
      subs: subsByCat[c.id] || [],
    };
  });
  draft.productos = published.products.map(function (p) {
    return {
      id: p.id,
      nombre: p.nombre,
      catId: p.cat_id,
      subId: p.sub_id || null,
      precio: Number(p.precio) || 0,
      ingredientes: p.ingredientes || '',
      desc: p.descripcion || '',
      atajo: p.atajo || '',
      agotado: !!p.agotado,
      oculto: !!p.oculto,
      sinPromoMenu: !!p.sin_promo_menu,
      sinPromoCat: !!p.sin_promo_cat,
    };
  });
  draft.extras = published.extras.map(function (e) {
    return {
      id: e.id,
      nombre: e.nombre,
      catId: e.cat_id,
      precio: Number(e.precio) || 0,
      atajo: e.atajo || '',
      oculto: !!e.oculto,
    };
  });
  draft.promos = published.promos.map(function (pr) {
    return {
      id: pr.id,
      nombre: pr.nombre,
      modo: pr.modo || 'codigo',
      codigo: pr.codigo || '',
      tipo: pr.tipo,
      alcance: pr.alcance || '',
      alcanceLabel: pr.alcance_label || '',
      valor: Number(pr.valor) || 0,
      hasta: pr.hasta || '',
      activa: pr.activa !== false,
      unTelefono: pr.un_telefono !== false,
      noCombinar: pr.no_combinar !== false,
      exceptuados: Array.isArray(pr.exceptuados) ? pr.exceptuados : [],
    };
  });
  if (published.days.length) {
    draft.days = published.days.map(function (d) {
      return {
        id: d.dow,
        name: DAY_NAMES[d.dow] || 'Día',
        on: !!d.abierto,
        from: d.desde || '20:00',
        to: d.hasta || '23:00',
      };
    });
  }
  draft.turnos = published.turnos.map(function (t) {
    return {
      id: t.id,
      nombre: t.nombre,
      from: t.desde,
      to: t.hasta,
      cierre: t.cierre,
    };
  });
  const s = published.settings || {};
  draft.settings = {
    controlHorario: s.control_horario !== '0' && s.control_horario !== 'false',
    controlTurnos: s.control_turnos !== '0' && s.control_turnos !== 'false',
    msgCerrado: s.msg_cerrado || '',
    pedidosDesde: s.pedidos_desde || '19:30',
    maxPorHora: parseInt(s.max_por_hora, 10) || 12,
  };
  return draft;
}

function draftHasContent(draft) {
  if (!draft || typeof draft !== 'object') return false;
  return (
    (draft.categorias && draft.categorias.length > 0) ||
    (draft.productos && draft.productos.length > 0) ||
    (draft.extras && draft.extras.length > 0)
  );
}

async function getStoreMenuDraft() {
  const metaR = await getMenuMetaRow();
  if (!metaR.ok) {
    if (isStoreCatalogUnavailable(metaR)) {
      return { ok: false, error: 'store_catalog_not_migrated' };
    }
    return metaR;
  }
  const publishedR = await loadPublishedRows();
  if (!publishedR.ok) return publishedR;
  const publishedDraft = publishedToDraft(publishedR);
  const draftJson = metaR.row && metaR.row.draft_json ? metaR.row.draft_json : {};
  const draft = draftHasContent(draftJson) ? draftJson : publishedDraft;
  return {
    ok: true,
    draft: draft,
    publishedAt: metaR.row && metaR.row.published_at ? metaR.row.published_at : null,
    hasDraft: draftHasContent(draftJson),
    source: draftHasContent(draftJson) ? 'draft' : publishedDraft.categorias.length ? 'published' : 'empty',
  };
}

async function saveStoreMenuDraft(body) {
  const draft = body && body.draft ? body.draft : body;
  if (!draft || typeof draft !== 'object') {
    return { ok: false, error: 'invalid_draft' };
  }
  const r = await restPatch('store_menu_meta', 'id=eq.' + META_ID, {
    draft_json: draft,
    updated_at: new Date().toISOString(),
  });
  if (!r.ok) return r;
  return { ok: true };
}

async function deleteIdsNotIn(table, keepIds) {
  const ids = (keepIds || []).filter(function (x) {
    return x != null && x !== '';
  });
  if (!ids.length) {
    return restDelete(table, 'id=neq.0');
  }
  return restDelete(table, 'id=not.in.(' + ids.join(',') + ')');
}

async function publishStoreMenu() {
  const draftR = await getStoreMenuDraft();
  if (!draftR.ok) return draftR;
  const draft = draftR.draft;
  if (!draftHasContent(draft)) {
    return { ok: false, error: 'empty_draft' };
  }

  const catRows = (draft.categorias || []).map(function (c, i) {
    return { id: c.id, nombre: c.nombre, visible: c.visible !== false, orden: i };
  });
  const subRows = [];
  (draft.categorias || []).forEach(function (c) {
    (c.subs || []).forEach(function (s, i) {
      subRows.push({ id: s.id, cat_id: c.id, nombre: s.nombre, orden: i });
    });
  });
  const prodRows = (draft.productos || []).map(function (p, i) {
    return {
      id: p.id,
      cat_id: p.catId,
      sub_id: p.subId || null,
      nombre: p.nombre,
      descripcion: p.desc || '',
      precio: Number(p.precio) || 0,
      ingredientes: p.ingredientes || '',
      atajo: String(p.atajo || ''),
      agotado: !!p.agotado,
      oculto: !!p.oculto,
      sin_promo_menu: !!p.sinPromoMenu,
      sin_promo_cat: !!p.sinPromoCat,
      imagen: p.imagen || '',
      orden: i,
    };
  });
  const extraRows = (draft.extras || []).map(function (e, i) {
    return {
      id: e.id,
      cat_id: e.catId,
      nombre: e.nombre,
      precio: Number(e.precio) || 0,
      atajo: String(e.atajo || ''),
      oculto: !!e.oculto,
      orden: i,
    };
  });
  const promoRows = (draft.promos || []).map(function (pr) {
    return {
      id: pr.id,
      nombre: pr.nombre,
      modo: pr.modo || 'codigo',
      codigo: pr.codigo || '',
      tipo: pr.tipo,
      alcance: pr.alcance || '',
      alcance_label: pr.alcanceLabel || '',
      valor: Number(pr.valor) || 0,
      hasta: pr.hasta || null,
      activa: pr.activa !== false,
      un_telefono: pr.unTelefono !== false,
      no_combinar: pr.noCombinar !== false,
      exceptuados: Array.isArray(pr.exceptuados) ? pr.exceptuados : [],
    };
  });
  const dayRows = (draft.days || []).map(function (d) {
    return {
      dow: d.id,
      abierto: !!d.on,
      desde: d.from || '20:00',
      hasta: d.to || '23:00',
    };
  });
  const turnoRows = (draft.turnos || []).map(function (t, i) {
    return {
      id: t.id,
      nombre: t.nombre,
      desde: t.from,
      hasta: t.to,
      cierre: t.cierre,
      orden: i,
    };
  });
  const settings = draft.settings || {};
  const settingRows = [
    { key: 'control_horario', value: settings.controlHorario ? '1' : '0' },
    { key: 'control_turnos', value: settings.controlTurnos ? '1' : '0' },
    { key: 'msg_cerrado', value: settings.msgCerrado || '' },
    { key: 'pedidos_desde', value: settings.pedidosDesde || '19:30' },
    { key: 'max_por_hora', value: String(settings.maxPorHora || 12) },
  ];

  const steps = [
    await restUpsert('menu_categories', catRows),
    await restUpsert('menu_subcategories', subRows),
    await restUpsert('menu_products', prodRows),
    await restUpsert('menu_extras', extraRows),
    await restUpsert('menu_promos', promoRows),
    await restUpsert('store_days', dayRows, 'dow'),
    await restUpsert('store_turnos', turnoRows),
    await restUpsert('store_settings', settingRows, 'key'),
  ];
  for (const s of steps) {
    if (!s.ok) return s;
  }

  await deleteIdsNotIn(
    'menu_subcategories',
    subRows.map(function (r) {
      return r.id;
    })
  );
  await deleteIdsNotIn(
    'menu_categories',
    catRows.map(function (r) {
      return r.id;
    })
  );
  await deleteIdsNotIn(
    'menu_products',
    prodRows.map(function (r) {
      return r.id;
    })
  );
  await deleteIdsNotIn(
    'menu_extras',
    extraRows.map(function (r) {
      return r.id;
    })
  );
  await deleteIdsNotIn(
    'menu_promos',
    promoRows.map(function (r) {
      return r.id;
    })
  );
  await deleteIdsNotIn(
    'store_turnos',
    turnoRows.map(function (r) {
      return r.id;
    })
  );

  const now = new Date().toISOString();
  const metaPatch = await restPatch('store_menu_meta', 'id=eq.' + META_ID, {
    draft_json: draft,
    published_at: now,
    updated_at: now,
  });
  if (!metaPatch.ok) return metaPatch;
  return { ok: true, publishedAt: now };
}

async function patchDraftProductAgotado(productId, agotado) {
  const metaR = await getMenuMetaRow();
  if (!metaR.ok || !metaR.row) return;
  const draft = metaR.row.draft_json && typeof metaR.row.draft_json === 'object' ? metaR.row.draft_json : {};
  if (!draft.productos || !draft.productos.length) return;
  let changed = false;
  draft.productos.forEach(function (p) {
    if (p.id === productId) {
      p.agotado = !!agotado;
      if (agotado) p.oculto = false;
      changed = true;
    }
  });
  if (!changed) return;
  await restPatch('store_menu_meta', 'id=eq.' + META_ID, {
    draft_json: draft,
    updated_at: new Date().toISOString(),
  });
}

async function setProductAgotado(productId, agotado) {
  const id = parseInt(productId, 10);
  if (!id) return { ok: false, error: 'invalid_product_id' };
  const r = await restPatch('menu_products', 'id=eq.' + id, { agotado: !!agotado });
  if (!r.ok) {
    if (isStoreCatalogUnavailable(r)) {
      return { ok: false, error: 'store_catalog_not_migrated' };
    }
    return r;
  }
  await patchDraftProductAgotado(id, agotado);
  return { ok: true, productId: id, agotado: !!agotado };
}

function productsToShopFormat(published) {
  const catMap = {};
  (published.categories || []).forEach(function (c) {
    if (c.visible === false) return;
    catMap[c.id] = c;
  });
  const subMap = {};
  (published.subcategories || []).forEach(function (s) {
    subMap[s.id] = s;
  });
  const extrasByCat = {};
  (published.extras || []).forEach(function (e) {
    if (e.oculto) return;
    const g = extrasGrupoForCat(e.cat_id);
    if (!extrasByCat[g]) extrasByCat[g] = true;
  });

  return (published.products || [])
    .filter(function (p) {
      return !p.oculto && catMap[p.cat_id];
    })
    .map(function (p, idx) {
      const cat = catMap[p.cat_id];
      const sub = p.sub_id ? subMap[p.sub_id] : null;
      const precio = Math.round(Number(p.precio) || 0);
      const ingredientesSacar = parseIngredientes(p.ingredientes);
      const grupo = extrasGrupoForCat(p.cat_id);
      const hasExtras = !!extrasByCat[grupo];
      const personalizable = hasExtras || ingredientesSacar.length > 0;
      return {
        id: 'db_' + p.id,
        db_id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        categoria: cat.nombre,
        subcategoria: sub ? sub.nombre : '',
        imagen: p.imagen || '',
        precio: String(precio),
        precio_mostrar: String(precio),
        precio_base: String(precio),
        tiene_precios_diferentes: personalizable,
        se_puede_pedir: !p.agotado,
        minimo: 1,
        maximo: 999999,
        step: 1,
        variedades: [],
        personalizable: personalizable,
        extrasGrupo: hasExtras ? grupo : '',
        quitarGrupo: '',
        ingredientesSacar: ingredientesSacar,
        atajo: p.atajo || '',
      };
    });
}

function extrasToShopFormat(published) {
  const catMap = {};
  (published.categories || []).forEach(function (c) {
    catMap[c.id] = c;
  });
  return (published.extras || [])
    .filter(function (e) {
      return !e.oculto;
    })
    .map(function (e) {
      return {
        id: 'ex_' + e.id,
        nombre: e.nombre,
        precio: Math.round(Number(e.precio) || 0),
        grupos: [extrasGrupoForCat(e.cat_id)],
      };
    });
}

async function getPublishedShopCatalog() {
  const publishedR = await loadPublishedRows();
  if (!publishedR.ok) return publishedR;
  if (!publishedR.products.length && !publishedR.categories.length) {
    return { ok: true, empty: true, productos: [], extras: [] };
  }
  const metaR = await getMenuMetaRow();
  return {
    ok: true,
    empty: false,
    productos: productsToShopFormat(publishedR),
    extras: extrasToShopFormat(publishedR),
    publishedAt: metaR.ok && metaR.row ? metaR.row.published_at : null,
  };
}

async function storeCatalogHealth() {
  const r = await restSelect('store_menu_meta', 'id=eq.' + META_ID + '&select=id,published_at');
  if (!r.ok) {
    return { ok: false, configured: false, error: isStoreCatalogUnavailable(r) ? 'not_migrated' : r.error };
  }
  return { ok: true, configured: true, publishedAt: r.data && r.data[0] ? r.data[0].published_at : null };
}

module.exports = {
  emptyDraft,
  getStoreMenuDraft,
  saveStoreMenuDraft,
  publishStoreMenu,
  setProductAgotado,
  getPublishedShopCatalog,
  storeCatalogHealth,
  publishedToDraft,
  isStoreCatalogUnavailable,
  loadPublishedRows,
};
