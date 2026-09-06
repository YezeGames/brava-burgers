# Pedido manual (WhatsApp / teléfono)

Emisión de pedidos por WA o mostrador, integrada en **`/admin/`** (producción).

**Demo referencia (local):** `demo-admin-estado-salon-pedido-manual.html`  
**Comanda:** `admin/comanda.js`  
**Lógica:** `admin/pedido-manual.js` + `lib/bravaSupabase.js`

Última actualización: sep 2026.

---

## Estado en producción ✅

| Ítem | Estado |
|------|--------|
| Modal emisión + confirmar cobro (EF / MP / mixto / NO COBRADO) | ✅ |
| Comanda con nota y ajuste descuento/recargo | ✅ |
| Catálogo desde Sheet (productos, extras, envíos/zonas) | ✅ |
| Agenda clientes Supabase (`clientes`) | ✅ |
| API: `searchClientes`, `getCliente`, `saveCliente`, `createManualOrder` | ✅ |
| ORN en Pendientes + realtime | ✅ |
| Badge **MANUAL** en panel | ✅ |
| Caja abierta requerida; **sin turno delivery** | ✅ |
| NO COBRADO no suma ventas en caja | ✅ |
| Migración SQL: `supabase/manual-order.sql` + `migrateManualOrderSchema` | ✅ |

**Acceso:** botón **Pedido manual** en toolbar del admin (habilitado con caja/turno abierto).

---

## Pendiente operativo (Sheet)

| Ítem | Notas |
|------|-------|
| Columna **`Atajo`** en `productos` y `extras` | El código ya la lee; sin ella usa códigos auto (100, 200, 501…) |

---

## Decisiones de diseño (cerradas)

| Tema | Decisión |
|------|----------|
| Mapa de mesas | **No** — solo delivery manual |
| Entrada al flujo | Botón **Pedido manual** en toolbar admin |
| UI emisión | Modal ancho sobre el panel |
| Confirmación | Un modal: comanda + cobro + descuento/recargo + imprimir |
| Extras / envío | Líneas buscables (601 Olivos, 602 Munro…), no selector aparte |
| Turno delivery web | **No aplica** a pedidos manuales (amigos fuera de zona, etc.) |
| Agenda | Una sola para web + manual; teléfono normalizado como clave |
| Cliente | Buscar por tel + Enter/🔍; clic en resumen → editar |

---

## Supabase

### Tabla `clientes`

Ver `supabase/manual-order.sql`. Campos: `telefono` (PK), `nombre`, `direccion`, `localidad`, `piso`, `ultimo_pedido_at`, `origen_ultimo`, timestamps.

### Columnas extra en `orders`

`origen`, `nota_pedido`, `ajuste_label`, `ajuste_monto`, `ajuste_motivo`.  
`origen = 'manual'` para pedidos del panel.

### Alimentación agenda

1. Pedido web → `upsertClienteFromOrder(..., 'web')`
2. Pedido manual → `upsertClienteFromOrder(..., 'manual')`
3. Backfill opcional incluido en `manual-order.sql`

---

## Catálogo (Google Sheet)

| Tipo | Columna Atajo | Pestaña |
|------|---------------|---------|
| Producto | 100, 200… | `productos` |
| Extra | 501, 502… | `extras` |
| Envío | 601, 602… | zonas en `configuracion` o filas envío |

Reglas: filtrar **Agotado = SI**; extras/envío no bajan stock de cocina.

---

## Backlog (no priorizado)

| Ítem | Prioridad |
|------|-----------|
| Historial «último pedido» al cargar cliente | Media |
| Repetir último pedido del cliente | Baja |
| Canal Retiro además de Delivery | Baja |

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `admin/pedido-manual.js` | UI emisión manual |
| `admin/index.html` | Modales + wire |
| `lib/bravaSupabase.js` | `createManualOrder`, clientes |
| `api/admin.js` | Proxy acciones |
| `supabase/manual-order.sql` | Migración SQL |
