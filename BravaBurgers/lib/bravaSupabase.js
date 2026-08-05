const { getServiceClient } = require('./supabaseServer');

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

async function createOrderFromShop(order) {
  const sb = getServiceClient();
  if (!sb) return { ok: false, error: 'supabase_not_configured' };

  const idem = order.idempotencyKey ? String(order.idempotencyKey).slice(0, 120) : '';
  if (idem) {
    const { data: existing } = await sb.from('orders').select('orn,total').eq('idempotency_key', idem).maybeSingle();
    if (existing) return { ok: true, orn: existing.orn, total: Number(existing.total) || 0 };
  }

  const { data: ornVal, error: ornErr } = await sb.rpc('next_orn_del');
  if (ornErr || !ornVal) return { ok: false, error: 'orn_failed', detail: ornErr?.message };

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

  const { error } = await sb.from('orders').insert(row);
  if (error) {
    if (error.code === '23505' && idem) {
      const { data: again } = await sb.from('orders').select('orn,total').eq('idempotency_key', idem).maybeSingle();
      if (again) return { ok: true, orn: again.orn, total: Number(again.total) || 0 };
    }
    return { ok: false, error: 'insert_failed', detail: error.message };
  }
  return { ok: true, orn: ornVal, total };
}

async function listOrders(maxRows) {
  const sb = getServiceClient();
  const limit = maxRows || 250;
  const { data, error } = await sb
    .from('orders')
    .select('*')
    .order('fecha_creado', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, orders: (data || []).map(rowToOrder) };
}

async function updateOrder(body) {
  const sb = getServiceClient();
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

  const { error } = await sb.from('orders').update(patch).eq('orn', orn);
  if (error) return { ok: false, error: error.message };
  return { ok: true, orn };
}

async function listGastos(desde, hasta) {
  const sb = getServiceClient();
  let q = sb.from('gastos').select('*').order('fecha', { ascending: false });
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const gastos = (data || []).map(function (g) {
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
  const sb = getServiceClient();
  const concepto = String(body.concepto || '').trim();
  const monto = Number(body.monto);
  if (!concepto || !monto || monto <= 0) return { ok: false, error: 'invalid_gasto' };

  const { data: idVal, error: idErr } = await sb.rpc('next_gasto_id');
  if (idErr || !idVal) return { ok: false, error: 'id_failed' };

  const fecha = body.fecha || new Date().toISOString().slice(0, 10);
  const pagado = String(body.pagadoCon || body.pagado_con || '').trim();
  const { error } = await sb.from('gastos').insert({
    id: idVal,
    fecha,
    concepto,
    monto,
    pagado_con: pagado,
  });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    gasto: { id: idVal, fecha, concepto, monto, pagado_con: pagado },
  };
}

async function deleteGasto(id) {
  const sb = getServiceClient();
  const gid = String(id || '').trim();
  if (!gid) return { ok: false, error: 'missing_id' };
  const { error } = await sb.from('gastos').delete().eq('id', gid);
  if (error) return { ok: false, error: error.message };
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
