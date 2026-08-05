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
    rechazado_at: row.rechazado_at,
    rechazo_mensaje: row.rechazo_mensaje,
  };
}

function supabaseFail(r, fallback) {
  return { ok: false, error: fallback || r.error, detail: r.detail };
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

  const r = await restPatch('orders', 'orn=eq.' + encodeURIComponent(orn), patch);
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

module.exports = {
  createOrderFromShop,
  listOrders,
  updateOrder,
  listGastos,
  createGasto,
  deleteGasto,
  rowToOrder,
};
