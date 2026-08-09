const { restSelect, restInsert, restPatch, restDelete, restRpc } = require('./supabaseServer');



function rowToOrder(row) {

  if (!row) return null;

  var items = row.items_json;

  if (typeof items === 'string') {

    try {

      items = JSON.parse(items);

    } catch (e) {

      items = [];

    }

  }

  return {

    orn: row.orn,

    fecha_creado: row.fecha_creado,

    estado: String(row.estado || 'pendiente').toLowerCase(),

    cliente: row.cliente,

    telefono: row.telefono,

    direccion: row.direccion,

    localidad: row.localidad,

    piso: row.piso,

    turno: row.turno,

    zona: row.zona,

    envio: Number(row.envio) || 0,

    pago: row.pago,

    items_json: typeof row.items_json === 'object' ? JSON.stringify(row.items_json) : row.items_json,

    items: items || [],

    subtotal: Number(row.subtotal) || 0,

    total: Number(row.total) || 0,

    modificado: row.modificado,

    modificado_at: row.modificado_at,

    entregado_at: row.entregado_at,

    cancelado_at: row.cancelado_at,

    aceptado_at: row.aceptado_at,

    en_camino_at: row.en_camino_at,

    en_preparacion_at: row.en_preparacion_at,

    rechazado_at: row.rechazado_at,

    rechazo_mensaje: row.rechazo_mensaje,

  };

}



function supabaseFail(r, fallback) {

  return { ok: false, error: fallback || r.error, detail: r.detail || '' };

}



async function createOrderFromShop(order) {

  const idem = order.idempotencyKey ? String(order.idempotencyKey).slice(0, 120) : '';

  if (idem) {

    const ex = await restSelect('orders', 'select=orn,total&idempotency_key=eq.' + encodeURIComponent(idem) + '&limit=1');

    if (ex.ok && ex.data && ex.data[0]) {

      return { ok: true, orn: ex.data[0].orn, total: Number(ex.data[0].total) || 0 };

    }

  }



  const ornRes = await restRpc('next_orn_del');

  if (!ornRes.ok || !ornRes.data) return supabaseFail(ornRes, 'orn_failed');

  const ornVal = ornRes.data;



  const subtotal = Number(order.subtotal) || 0;

  const envio = Number(order.envio) || 0;

  const total = Number(order.total) || subtotal + envio;

  const { validateShopOrder } = require('./turnosDelivery');
  const turnCheck = await validateShopOrder(order);
  if (!turnCheck.ok) return turnCheck;

  const row = {
    orn: ornVal,
    estado: 'pendiente',
    cliente: order.cliente || '',
    telefono: order.telefono || '',
    direccion: order.direccion || '',
    localidad: order.localidad || '',
    piso: order.piso || '',
    turno: order.turno || '',
    zona: order.zona || '',
    envio,
    pago: order.pago || '',
    items_json: order.items || [],
    subtotal,
    total,
    idempotency_key: idem || null,
  };

  const ins = await restInsert('orders', row);

  if (!ins.ok) {

    if (idem) {

      const again = await restSelect('orders', 'select=orn,total&idempotency_key=eq.' + encodeURIComponent(idem) + '&limit=1');

      if (again.ok && again.data && again.data[0]) {

        return { ok: true, orn: again.data[0].orn, total: Number(again.data[0].total) || 0 };

      }

    }

    return supabaseFail(ins, 'insert_failed');

  }

  return { ok: true, orn: ornVal, total };

}



async function listOrders(maxRows) {

  const limit = maxRows || 250;

  const r = await restSelect('orders', 'select=*&order=fecha_creado.desc&limit=' + limit);

  if (!r.ok) return supabaseFail(r, r.error);

  const rows = Array.isArray(r.data) ? r.data : [];

  return { ok: true, orders: rows.map(rowToOrder).filter(Boolean) };

}



async function updateOrder(body) {

  const orn = body.orn;

  if (!orn) return { ok: false, error: 'missing_orn' };



  const patch = {};

  if (body.estado) {

    const est = String(body.estado).trim().toLowerCase();

    patch.estado = est;

    const now = new Date().toISOString();

    if (est === 'aceptado') patch.aceptado_at = now;

    if (est === 'en_preparacion') patch.en_preparacion_at = now;

    if (est === 'en_camino') patch.en_camino_at = now;

    if (est === 'rechazado') {

      patch.rechazado_at = now;

      if (body.rechazoMensaje != null) patch.rechazo_mensaje = String(body.rechazoMensaje);

    }

    if (est === 'entregada') patch.entregado_at = now;

    if (est === 'cancelada') patch.cancelado_at = now;

  }

  if (body.items) {

    patch.items_json = body.items;

    patch.modificado = 'SI';

    patch.modificado_at = new Date().toISOString();

  }

  if (body.subtotal != null) patch.subtotal = Number(body.subtotal);

  if (body.total != null) patch.total = Number(body.total);

  if (body.direccion != null) patch.direccion = String(body.direccion).trim();

  if (body.localidad != null) patch.localidad = String(body.localidad).trim();

  if (body.piso != null) patch.piso = String(body.piso).trim();

  if (body.zona != null) patch.zona = String(body.zona).trim();

  if (body.envio != null) patch.envio = Number(body.envio) || 0;

  if (body.modificado != null) patch.modificado = String(body.modificado);

  if (body.modificadoAt != null) patch.modificado_at = String(body.modificadoAt);



  let r = await restPatch('orders', 'orn=eq.' + encodeURIComponent(orn), patch);

  if (!r.ok && (patch.en_camino_at || patch.en_preparacion_at)) {

    const retry = Object.assign({}, patch);

    delete retry.en_camino_at;

    delete retry.en_preparacion_at;

    r = await restPatch('orders', 'orn=eq.' + encodeURIComponent(orn), retry);

  }

  if (!r.ok) return supabaseFail(r, r.error);

  return { ok: true, orn };

}



async function listGastos(desde, hasta) {

  let q = 'select=*&order=fecha.desc';

  if (desde) q += '&fecha=gte.' + encodeURIComponent(desde);

  if (hasta) q += '&fecha=lte.' + encodeURIComponent(hasta);

  const r = await restSelect('gastos', q);

  if (!r.ok) return supabaseFail(r, r.error);

  const gastos = (r.data || []).map(function (g) {

    return {

      id: g.id,

      fecha: g.fecha,

      concepto: g.concepto,

      monto: Number(g.monto) || 0,

      pagado_con: g.pagado_con,

      creado_at: g.creado_at,

    };

  });

  return { ok: true, gastos };

}



async function createGasto(body) {

  const concepto = String(body.concepto || '').trim();

  const monto = Number(body.monto);

  if (!concepto || !monto || monto <= 0) return { ok: false, error: 'invalid_gasto' };



  const idRes = await restRpc('next_gasto_id');

  if (!idRes.ok || !idRes.data) return supabaseFail(idRes, 'id_failed');

  const idVal = idRes.data;



  const fecha = body.fecha || new Date().toISOString().slice(0, 10);

  const pagado = String(body.pagadoCon || body.pagado_con || '').trim();

  const ins = await restInsert('gastos', {

    id: idVal,

    fecha,

    concepto,

    monto,

    pagado_con: pagado,

  });

  if (!ins.ok) return supabaseFail(ins, ins.error);

  return {

    ok: true,

    gasto: { id: idVal, fecha, concepto, monto, pagado_con: pagado },

  };

}



async function deleteGasto(id) {

  const gid = String(id || '').trim();

  if (!gid) return { ok: false, error: 'missing_id' };

  const r = await restDelete('gastos', 'id=eq.' + encodeURIComponent(gid));

  if (!r.ok) return supabaseFail(r, r.error);

  return { ok: true, id: gid };

}



async function listIngresos(desde, hasta) {

  let q = 'select=*&order=fecha.desc';

  if (desde) q += '&fecha=gte.' + encodeURIComponent(desde);

  if (hasta) q += '&fecha=lte.' + encodeURIComponent(hasta);

  const r = await restSelect('ingresos', q);

  if (!r.ok) return supabaseFail(r, r.error);

  const ingresos = (r.data || []).map(function (g) {

    return {

      id: g.id,

      fecha: g.fecha,

      concepto: g.concepto,

      monto: Number(g.monto) || 0,

      cobrado_con: g.cobrado_con,

      creado_at: g.creado_at,

    };

  });

  return { ok: true, ingresos };

}



async function createIngreso(body) {

  const concepto = String(body.concepto || '').trim();

  const monto = Number(body.monto);

  if (!concepto || !monto || monto <= 0) return { ok: false, error: 'invalid_ingreso' };

  const idRes = await restRpc('next_ingreso_id');

  if (!idRes.ok || !idRes.data) return supabaseFail(idRes, 'id_failed');

  const idVal = idRes.data;

  const fecha = body.fecha || new Date().toISOString().slice(0, 10);

  const cobrado = String(body.cobroCon || body.cobrado_con || body.cobradoCon || '').trim();

  const ins = await restInsert('ingresos', {

    id: idVal,

    fecha,

    concepto,

    monto,

    cobrado_con: cobrado,

  });

  if (!ins.ok) return supabaseFail(ins, ins.error);

  return {

    ok: true,

    ingreso: { id: idVal, fecha, concepto, monto, cobrado_con: cobrado },

  };

}



async function deleteIngreso(id) {

  const iid = String(id || '').trim();

  if (!iid) return { ok: false, error: 'missing_id' };

  const r = await restDelete('ingresos', 'id=eq.' + encodeURIComponent(iid));

  if (!r.ok) return supabaseFail(r, r.error);

  return { ok: true, id: iid };

}



async function listCierres(limit) {

  const n = Math.min(Math.max(Number(limit) || 40, 1), 100);

  const q = 'select=*&order=cerrado_at.desc&limit=' + n;

  const r = await restSelect('cierres_caja', q);

  if (!r.ok) return supabaseFail(r, r.error);

  const cierres = (r.data || []).map(function (c) {

    return {

      id: c.id,

      cerrado_at: c.cerrado_at,

      periodo_desde: c.periodo_desde,

      periodo_hasta: c.periodo_hasta,

      efectivo: Number(c.efectivo) || 0,

      mercado_pago: Number(c.mercado_pago) || 0,

      ventas_total: Number(c.ventas_total) || 0,

      gastos: Number(c.gastos) || 0,

      ingresos: Number(c.ingresos) || 0,

      resultado: Number(c.resultado) || 0,

      cancelados: Number(c.cancelados) || 0,

      hamb_simples: Number(c.hamb_simples) || 0,

      hamb_dobles: Number(c.hamb_dobles) || 0,

      hamb_total: Number(c.hamb_total) || 0,

      notas: c.notas || '',

      turno: c.turno || '',

      ventana_desde: c.ventana_desde,

      ventana_hasta: c.ventana_hasta,

    };

  });

  return { ok: true, cierres };

}



async function createCierre(body) {

  const desde = String(body.periodo_desde || body.desde || '').trim();

  const hasta = String(body.periodo_hasta || body.hasta || '').trim();

  if (!desde || !hasta) return { ok: false, error: 'missing_period' };



  const idRes = await restRpc('next_cierre_id');

  if (!idRes.ok || !idRes.data) return supabaseFail(idRes, 'id_failed');

  const idVal = idRes.data;



  const row = {

    id: idVal,

    periodo_desde: desde,

    periodo_hasta: hasta,

    efectivo: Number(body.efectivo) || 0,

    mercado_pago: Number(body.mercado_pago) || 0,

    ventas_total: Number(body.ventas_total) || 0,

    gastos: Number(body.gastos) || 0,

    ingresos: Number(body.ingresos) || 0,

    resultado: Number(body.resultado) || 0,

    cancelados: Number(body.cancelados) || 0,

    hamb_simples: Number(body.hamb_simples) || 0,

    hamb_dobles: Number(body.hamb_dobles) || 0,

    hamb_total: Number(body.hamb_total) || 0,

    notas: String(body.notas || '').trim(),

    turno: String(body.turno || '').trim(),

    ventana_desde: body.ventana_desde || null,

    ventana_hasta: body.ventana_hasta || null,

  };



  const ins = await restInsert('cierres_caja', row);

  if (!ins.ok) {
    const legacy = Object.assign({}, row);
    delete legacy.ingresos;
    let retry = await restInsert('cierres_caja', legacy);
    if (!retry.ok) {
      delete legacy.ventana_desde;
      delete legacy.ventana_hasta;
      retry = await restInsert('cierres_caja', legacy);
    }
    if (retry.ok) {
      return {
        ok: true,
        warning: 'ingresos_column_missing',
        cierre: Object.assign(
          { id: idVal, cerrado_at: new Date().toISOString(), ingresos: Number(body.ingresos) || 0 },
          legacy
        ),
      };
    }
    console.error('createCierre insert failed', { first: ins.detail, retry: retry.detail });
    const errDetail = String(retry.detail || ins.detail || '');
    return {
      ok: false,
      error: retry.error || ins.error,
      detail: errDetail.slice(0, 400),
      hint: 'supabase_migration',
    };
  }

  return { ok: true, cierre: Object.assign({ id: idVal, cerrado_at: new Date().toISOString() }, row) };

}



async function deleteCierre(id) {

  const cid = String(id || '').trim();

  if (!cid) return { ok: false, error: 'missing_id' };

  const r = await restDelete('cierres_caja', 'id=eq.' + encodeURIComponent(cid));

  if (!r.ok) return supabaseFail(r, r.error);

  return { ok: true, id: cid };

}



module.exports = {

  createOrderFromShop,

  listOrders,

  updateOrder,

  listGastos,

  createGasto,

  deleteGasto,

  listIngresos,

  createIngreso,

  deleteIngreso,

  listCierres,

  createCierre,

  deleteCierre,

  rowToOrder,

};

