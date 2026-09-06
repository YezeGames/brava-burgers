# Brava Burgers — planificación e ideas



Archivo vivo del proyecto. Acá anotamos ideas, prioridades y decisiones.  

Cuando quieras agregar algo, decilo en el chat y lo incorporamos acá.



---

## Estado actual (sep 2026)

Resumen de lo **operativo en producción** (https://brava-burgers.vercel.app/admin/). Docs detallados: [`PEDIDO_MANUAL.md`](PEDIDO_MANUAL.md), [`WHATSAPP_OPERACION.md`](WHATSAPP_OPERACION.md), [`ZONAS_ENTREGA.md`](ZONAS_ENTREGA.md).

| Área | Estado |
|------|--------|
| Tienda web (UI actual, checkout probado) | ✅ |
| Zonas delivery (Mapbox + `/api/delivery-zone` + GeoJSON) | ✅ |
| Panel admin (órdenes, caja, stock, comanda) | ✅ |
| Inbox WhatsApp (`wa-panel.js`) | ✅ |
| Pedido manual WA/teléfono | ✅ |
| Reclamos: gratificar (cupón) + reenvío $0 | ✅ (`compensaciones.js`) |
| Filtros órdenes (tel + EF/MP) | ✅ |
| Editar comanda en Aceptados | ✅ |
| Caja: refresh manual, salidas por burger | ✅ |

**Pendiente operativo (Sheet):** columna **`Atajo`** en pestañas `productos` y `extras`.

**Tienda — lanzamiento público:** hoy tiene `noindex` (Google no indexa). Ver sección *noindex* abajo. Al abrir al público: quitar esa meta.

**UI tienda:** se mantiene la **UI actual** en producción. Demos/redesigns HTML eliminados del repo (sep 2026).

**Descartado / no priorizar:**

- Flujo “My Maps en vivo” como proyecto aparte (polígonos ya en `data/zonas-entrega.geojson`; Mapbox en checkout).
- Plantillas Meta WhatsApp fuera de ventana 24 h.
- Purge automático de chats cada 24 h (sí hay limpieza de chats de **pedido** al **cerrar turno**).
- Retiro en local / `ORN-RET`, pasarela MP online.

---



Documento único de **alcance deseado** (histórico). Producción: `index.html` (tienda) + `/admin/`.



### 1. Tienda (operativa — UI actual)



- Catálogo y config desde **Google Sheet** (`productos`, `configuracion`, `extras`, `ingredientes`).

- Cliente arma carrito → checkout **Mapbox + zonas** → **WhatsApp** + ORN en Supabase.

- **Checkout probado** (sep 2026): zonas, turnos, cupón, pedido a panel.

- **Delivery solo** — sin retiro en local.

- **`noindex`** en `index.html` hasta apertura pública (ver abajo).



### 2. Guardar pedidos — Supabase (operaciones)



- Tablas **`orders`**, **`gastos`**, contador **`admin_counters`** (`orn_del`, `gasto_id`).

- Contador **`ORN-DEL-0001`** vía RPC `next_orn_del()` (solo delivery).

- Escritura/lectura desde **Vercel** (`api/pedido.js`, `api/admin.js`) con **service role** en servidor; nada secreto en el JS público.

- Cada pedido: datos cliente, tel, dirección, turno, zona, envío, **Efectivo / Mercado Pago**, ítems + aclaraciones (`items_json`), total, estado, flags **editado**, timestamps.

- Schema: **`supabase/schema.sql`**. Guías: **`AYUDA_SUPABASE.md`**, **`VERCEL_SUPABASE_RAPIDO.md`**.

- **Fallback legacy:** si Supabase no está configurado en Vercel, `/api/*` puede usar **Apps Script + Sheet** (`BRAVA_GAS_URL`). En producción el camino principal es **Supabase**.



### 3. Panel `/admin` (login usuario + contraseña)



Pantalla **Órdenes** tipo deli (referencia capturada), adaptada a Brava:



| Elemento | Detalle |

|----------|---------|

| **Pestañas** | **Pendientes** · **Aceptados** · **Rechazados** · **Entregados** · **Cancelados** |

| **Filtros** | Fecha desde/hasta, **Pago** (EF / MP / Todos), **tel/cliente** en pipeline |

| **Columnas** | Fecha, Cliente, **Teléfono**, Método de pago, Total, ORN, Acciones |

| **Buscar** | Por **teléfono** / cliente en barra de órdenes; ORN en comanda |

| **Pendientes** | Aviso sonoro · **Aceptar** / **Rechazar** · WA · ticket |

| **Aceptados** | **Editar** · ticket · WA · **✓ entregado** · **✕ cancelar** |

| **Rechazados** | WA consulta · solo lectura |

| **✓ entregado** | Desde **Aceptados** → Entregados; **suma caja** (EF o MP) |

| **✕ cancelar** | Desde **Aceptados** → Cancelados |

| **Rechazar** | Desde **Pendientes** → Rechazados (modal motivos + WA) |

| **Editar** | Mismo ORN; reimprimir comanda; total al entregar |

| **Caja del día** | EF + MP entregados; cancelados info; **− gastos**; estados intermedios no suman |
| **Registro de ventas** | Por turno de caja: hamburguesas (simples/dobles) + **Acompañamientos** + **Extras** + **Bebidas** (catálogo completo del Sheet, cantidades del turno) |

| **Gastos** | Alta/baja en Supabase; restan del **resultado del día** |

| **Tiempo real** | **Supabase Realtime** en el navegador (+ polling de respaldo). Indicador “En vivo · Supabase” |



### 4. Comanda impresa (80 mm)



- **Igual** para Efectivo y Mercado Pago; solo cambia línea **Medio de pago**.

- Incluye: **ORN-DEL-…**, cliente, tel, dirección, turno, ítems, **Acl.:** por ítem, envío, total.

- **Sin “Estado”** en el papel.

- **Pendiente:** ~~imprimir desde panel~~ → Ticket abre comanda real (`admin/comanda.html`).



### 5. Mercado Pago



- **Solo etiqueta** en pedido y caja; **cobro manual** (transferencia, etc.).

- **Sin** cobro automático ni webhooks por ahora.



### 6. Fuera de alcance (por ahora)



- Retiro en local / `ORN-RET`.

- Pasarela MP online.

- Volver a usar **Sheet como fuente única** de pedidos en el día a día (reemplazado por Supabase para operaciones).



### 7. Por construir — histórico



1. ~~Schema Supabase + Vercel env + `/api/pedido` + `/api/admin`~~ → hecho.

2. ~~Admin: pestañas, caja, gastos, rechazo, sonido~~ → hecho.

3. ~~Comanda dinámica desde pedido real~~ → hecho.

4. ~~Editar comanda en admin producción~~ → hecho.

5. ~~Filtros Pago + buscar por tel en panel~~ → hecho.

6. ~~Pedido manual + agenda clientes~~ → hecho (ver [`PEDIDO_MANUAL.md`](PEDIDO_MANUAL.md)).

7. ~~Zonas checkout con Mapbox + polígonos~~ → hecho (ver [`ZONAS_ENTREGA.md`](ZONAS_ENTREGA.md)).

8. ~~Reclamos / gratificación (cupón + reenvío)~~ → hecho (`admin/compensaciones.js`).

9. Opcional: importar histórico Sheet operaciones → Supabase.



---



## En curso / próximo



1. **Columna `Atajo` en Google Sheet** (`productos`, `extras`) — acelerar pedido manual (código ya lo lee).

2. Probar ciclo completo en operación real: web + manual → entregar → caja → cierre.

3. Actualizar docs al cerrar cada ítem (este archivo).



Implementado en repo: `supabase/`, `lib/bravaSupabase.js`, `api/`, `admin/` (pedido manual, compensaciones, wa-panel, caja v126+).



---



## Decisiones (ago 2026 — actualizado)



| Tema | Decisión |

|------|----------|

| **Retiro en local** | **No** por el momento. Todos los pedidos son **delivery**. No usar `ORN-RET` hasta que exista retiro. |

| **Menú / tienda** | **Google Sheet** (`productos`, `configuracion`, `extras`) — catálogo tienda + registro de ventas admin. |

| **Operaciones (pedidos + caja + gastos + admin)** | **Supabase** (Postgres + Realtime + Auth para sesión admin). |

| **ORN** | Solo **`ORN-DEL-{NNNN}`** mientras no haya retiro. Contador en **`admin_counters`**. |



**Arquitectura actual:**



| Pieza | Rol |

|--------|-----|

| **Sheet (menú)** | Catálogo, precios, zonas, horarios, WhatsApp de la tienda; pestaña **`extras`** para conteo de ventas en admin |

| **Supabase `orders`** | Una fila por pedido: ORN, fechas, cliente, tel, dirección, pago, `items_json`, total, `estado`, timestamps, `rechazo_mensaje`, etc. |

| **Supabase `gastos`** | Gastos de caja (`GAS-0001` vía `next_gasto_id()`) |

| **Checkout web** | POST **`/api/pedido`** → insert en Supabase + WA con `*Ref:* ORN-DEL-…` |

| **`/admin`** | POST **`/api/admin`** → login Vercel (`ADMIN_USER`/`ADMIN_PASSWORD`); CRUD pedidos/gastos; Realtime opcional |

| **Login admin** | Usuario **`admin`** (no email) en el formulario; email Supabase solo para Realtime en servidor |

| **Apps Script + Sheet operaciones** | Legacy / respaldo si no hay Supabase; libro operaciones puede tener histórico previo a la migración |



**Contador ORN:** tabla **`admin_counters`**, clave `orn_del`. Ajuste manual vía SQL si importás histórico (ver `AYUDA_SUPABASE.md`).



---



## Ideas (backlog)



### Panel administrativo (consulta — feb 2026)



**Qué pidió el cliente:**

- Login con usuario y contraseña.

- Dashboard tipo **control de caja**: pedidos que entren, separar **Efectivo** vs **Mercado Pago**.

- Sector **delivery / comanda**: ver datos del cliente, productos, total.



**Estado:** backend en **Vercel + Supabase**; panel en **`/admin`** operativo (comanda, editar, caja, WA inbox, pedido manual, reclamos).



| Pieza | Para qué |

|--------|----------|

| **Backend** (API) | ✅ Vercel `api/pedido`, `api/admin` |

| **Base de datos** | ✅ Supabase `orders`, `gastos` |

| **Checkout → API** | ✅ Hecho |

| **Pantalla `/admin`** | ✅ Hecho |

| **Mercado Pago** | Solo etiqueta + caja manual |



**Opciones históricas:** ~~solo Google Sheets~~ → **híbrido**: Sheet menú + **Supabase operaciones** (ago 2026).



**Seguridad:** login validado en servidor (Vercel); claves Supabase solo en env; panel no usa email de Supabase en el login.



**Código de pedido (ORN):**

- Formato: **`ORN-DEL-{NNNN}`** (4 dígitos; contador Supabase).

- **Uso operativo:** ORN en comanda y panel; búsqueda diaria por **teléfono** + link WA.



**Estados del pedido (modelo actual — cinco pestañas):**



| Estado | Pestaña | Notas |

|--------|---------|--------|

| `pendiente` | Pendientes | Nuevo desde checkout; suena aviso |

| `aceptado` | Aceptados | Cocina / delivery |

| `rechazado` | Rechazados | Modal motivos + `rechazo_mensaje` |

| `entregada` | Entregados | Suma caja |

| `cancelada` | Cancelados | No suma ventas |



**Caja del día:** solo **`entregada`** suma EF/MP; **− gastos** del período; filtros de fecha compartidos.

**Registro de ventas (ago 2026 — hecho):** sidebar **Resumen operativo** y ticket **Cierre operativo** cuentan por turno (desde **Abrir caja** hasta **Cierre**):

| Sección | Fuente Sheet | Qué cuenta |
|---------|--------------|------------|
| **Hamburguesas** | `productos` (simples/dobles por nombre) | Unidades entregadas; **detalle por producto** en Caja → Salidas |
| **Acompañamientos** | `productos` (categoría acompañamiento / entrada / papas, etc.) | Ítems sueltos entregados |
| **Extras** | pestaña `extras` + extras en `variedad` de hamburguesas | Bacon, cheddar, pepinillos… |
| **Bebidas** | `productos` (categoría bebida) | Coca Cola, Zero, Sprite… |

- Lista **todo** lo cargado en el Sheet (incluso qty **0** en el ticket de cierre).
- **Sin hardcodear:** producto o extra nuevo en Sheet → aparece solo.
- Clasificación automática por `categoria` / `subcategoria` del Sheet.
- Snapshot en `cierres_caja.snapshot_json` incluye estos totales para reimpresión desde **Historial**.



**Referencia visual — pantalla “Órdenes”:** producción con filtros tel/EF/MP, badge MANUAL, acciones Gratificar/Reenvío en Entregados.



**Editar comanda:** modal en Aceptados; mismo ORN, reimprimir comanda, total al entregar.



**Aviso sonoro (ago 2026):** beep en ORN nuevo `pendiente`. **Supabase Realtime** en suscripciones `orders`/`gastos`; fallback polling ~0,4 s. Botón **Activar sonido** (política del navegador).



---



## Estados del pedido — flujo operativo (ago 2026)



```mermaid

stateDiagram-v2

  [*] --> pendiente: checkout → Supabase

  pendiente --> aceptado: Aceptar

  pendiente --> rechazado: Rechazar

  aceptado --> entregada: ✓ Entregado

  aceptado --> cancelada: ✕ Cancelar

```



| Pestaña admin | Valor `estado` en Supabase | Acciones principales |

|---------------|----------------------------|----------------------|

| Pendientes | `pendiente` | **Aceptar** · **Rechazar** · WhatsApp · Imprimir |

| Aceptados | `aceptado` | Editar *(pend.)* · **✓** · **✕** · WA · Imprimir |

| Rechazados | `rechazado` | WA; `rechazado_at`, `rechazo_mensaje` |

| Entregados | `entregada` | WA · ticket; `entregado_at` |

| Cancelados | `cancelada` | WA · ticket; `cancelado_at` |



**Modal rechazar:** motivos Local Cerrado / Problemas Técnicos / TURNO LLENO + texto + WA + confirmar en Supabase.



**Histórico Sheet:** pedidos viejos en libro **Operaciones** (Google) no están automáticamente en Supabase; migración opcional.



---



## Caja + gastos (ago 2026)



**UI:** un solo **`/admin`**, sidebar **Caja del día** + **Gastos**.



| Línea | Origen |

|--------|--------|

| Efectivo (entregados) | `orders` con `estado = entregada`, pago efectivo |

| Mercado Pago (entregados) | Igual, pago MP |

| **Ventas** | EF + MP |

| Cancelados (info) | Informativo |

| **Gastos** | Suma `gastos` en rango de fechas |

| **Resultado del día** | Ventas − gastos |

**Registro de ventas (sidebar):** debajo de hamburguesas → **Acompañamientos**, **Extras**, **Bebidas** (mismo catálogo y cantidades del turno que el ticket de cierre). Solo visible con **caja abierta**; al cerrar turno vuelve a 0.

**Cierre operativo:** ticket imprimible + historial con flujo de caja (EF/MP, ingresos, egresos, arqueo) y registro de ventas completo (hamburguesas + tres secciones anteriores).

**Datos Supabase — tabla `gastos`:**



| Campo | Ejemplo |

|--------|---------|

| id | `GAS-0001` |

| fecha | `2026-08-05` |

| concepto | “Pan — mayorista” |

| monto | `15000` |

| pagado_con | `efectivo` / `transferencia` / `otro` |

| creado_at | timestamp |



**API admin:** `listGastos`, `createGasto`, `deleteGasto` (mismos filtros **desde/hasta** que pedidos).



### WhatsApp Business API + inbox admin



**Estado:** ✅ **v1 en producción** (texto, pestañas, bienvenida, cierre de turno). Detalle, coexistencia y roadmap: **[`WHATSAPP_OPERACION.md`](WHATSAPP_OPERACION.md)**.



**Objetivo:** inbox real en `/admin` conectado a **Meta Cloud API**.



**Contexto acordado:**

- Número Brava: **+54 9 11 7372-1945** en API producción (app **BRAVADELI**). Celu con ese número **no** disponible hasta coexistencia o desregistrar API — ver doc coexistencia / chip prepago.

- Mensajes desde **celu (Business App + coexistencia futura)** → **$0** de API.

- Mensajes desde **panel/API** → gratis dentro de ventana 24 h; plantillas fuera ~USD 0,026 (utilidad).

- **Estados, grupos, llamadas** → solo celu; panel = chats **1 a 1**.

- Costo Meta estimado uso normal Brava: **USD 0–5/mes**.



**Hecho (v1):**

1. Webhook + Supabase `wa_messages` + envío `/api/whatsapp-send`.

2. Inbox panel (`wa-panel.js`): Pedidos activos / Consultas, badges, chip ORN, imágenes, wa.me fallback.

3. Bienvenida 1× por cliente; **limpieza chats de pedido al cerrar turno** (no es purge 24 h automático).

4. Borrador auto al aceptar / en camino; Realtime inbox.



**No vamos a implementar (sep 2026):**

- Plantillas Meta para mensajes fuera de ventana 24 h (operación: pedir al cliente que escriba al abrir turno, o wa.me).

- Purge automático de historial cada 24 h.



**Opcional a futuro:** cambio de número WA definitivo, coexistencia celu+API — ver [`WHATSAPP_OPERACION.md`](WHATSAPP_OPERACION.md).



---



## ¿Qué es `noindex`? (tienda web)



En `index.html` hay:

```html
<meta name="robots" content="noindex,nofollow">
```

Le dice a **Google y otros buscadores**: *no muestres esta página en resultados de búsqueda*. La tienda **sí funciona** para quien tiene el link (Linktree, QR, WhatsApp); simplemente **no aparece** si alguien busca “hamburguesas Olivos” en Google.

**Cuándo quitarlo:** el día que quieran apertura pública / SEO. Borrar esa línea (o cambiar a `index, follow`) y redeploy.

**Mientras tanto:** útil en pre-apertura para que no indexen una versión incompleta.



---



## Reclamos y gratificación (sep 2026) — ✅ integrado en admin



**Producción:** [`admin/compensaciones.js`](admin/compensaciones.js) + tabla Supabase `compensaciones` + cupones en checkout (`/api/cupon`).

En pedidos **Entregados**: botones **Gratificar** (cupón + mensaje WA) y **Reenvío** (clonar ítems seleccionados a $0 en Pendientes). Comanda muestra badge reenvío y línea de cupón.



Cuando un cliente se queja (pedido frío, faltante, demora, error de cocina). Objetivo: **resolver rápido**, **costo acotado**, **que vuelva el sábado**.



### Niveles de respuesta (escalera)



| Gravedad | Ejemplos | Gratificación típica |
|----------|----------|-------------------|
| **Leve** | Papas pocas, salsa aparte olvidada, demora 10 min | Disculpa + **extra chico** (papas/bacon) en el **próximo pedido** sin cargo |
| **Media** | Ítem equivocado, hamburguesa incompleta, delivery muy tarde | **Reenvío del ítem** mismo turno si da, o **cupón 15–20%** próximo sábado |
| **Alta** | Pedido muy mal, no comible, doble cobro, cliente muy enojado | **Reembolso parcial/total** (EF devuelto / MP) + **pedido de reemplazo gratis** o **50% off** próxima compra |
| **Crítica** | Salud/higiene, agresión, fraude | Protocolo aparte: no discutir por chat; dueño responde; reembolso + registro interno |



### Formas concretas de “gratificar” (sin complicar el sistema hoy)



1. **Mensaje WA + código verbal** — “Tu código **BRAVA15** en el próximo pedido (solo sábado, 1 uso)”. Lo anotás en agenda/nota del cliente; al armar pedido manual descontás en total.

2. **Extra en comanda sin cobrar** — En pedido manual o edición: línea “Papas regalo reclamo ORN-DEL-XXXX” a $0 + nota en comanda.

3. **Reenvío mismo turno** — Si el turno sigue abierto y hay stock: nuevo pedido $0 o solo envío; marcar en admin como ajuste / nota en ORN original.

4. **Devolución EF en mano** — Si pagó efectivo al delivery: anotar en caja como egreso “Reclamo ORN-…” para que cuadre el arqueo.

5. **Devolución MP** — Manual desde Mercado Pago (no hay integración automática); guardar captura + referencia en nota del pedido.

6. **Prioridad próximo sábado** — “Te guardamos slot primero del turno 2” — costo $0, alto valor percibido.

7. **Tarjeta física / sticker** — “Una simple a elección” en la bolsa del reemplazo (solo si el error fue nuestro claro).



### Flujo operativo sugerido (cuando exista pedido manual + notas)



1. Identificar **ORN** (o teléfono si fue consulta WA).

2. Clasificar gravedad en 30 segundos.

3. Responder por WA con **qué hacemos** (no solo “disculpas”).

4. Registrar en pedido: `reclamo_at`, `reclamo_motivo`, `reclamo_accion` (extra / % / reenvío / reembolso).

5. Al cerrar turno: contar reclamos en cierre operativo (opcional, futuro).



### Backlog reclamos (mejoras opcionales)



- Reporte de reclamos en ticket de cierre.

- Límite automático: máx. 1 gratificación por teléfono por turno.



**Principio:** compensar **proporcional al daño**, siempre **visible en comanda/caja**, nunca pelear por chat.



---



## Hecho ✅



- Tienda Brava (Sheet `productos` + `configuracion` + `extras`; scripts `brava-catalog.js`, `brava-shop.js`, `brava-turnos.js`)

- Horarios tienda desde Sheet (`Horario abierto LUNES` … `SABADO`); hero 🟢 Abierto / 🔴 Cerrado; franja horaria en pie de página

- Checkout → **`/api/pedido`** → Supabase + ORN en WhatsApp

- Panel **`/admin`**: login, 5 pestañas, aceptar/rechazar, entregar/cancelar, caja, gastos, sonido, **ticket/comanda 80 mm**

- **Registro de ventas** por turno: hamburguesas **por producto** (simples/dobles) + acompañamientos, extras y bebidas desde Sheet

- **Pedido manual** (modal, agenda, NO COBRADO, sin turno delivery)

- **Reclamos:** gratificar + reenvío en Entregados

- **Caja:** botón actualizar turno; filtros tel/EF/MP en órdenes

- **Checkout zonas:** Mapbox + `/api/delivery-zone` + `data/zonas-entrega.geojson`

- **Inbox WhatsApp** en panel (`wa-panel.js`)

- Backend operaciones en **Supabase** + env en **Vercel**

- Realtime Supabase (con fallback polling)

- Tema Brava, modals, menú colapsado, logo desde Sheet

- Apps Script legacy + Sheet operaciones (histórico / fallback)



---



## Notas técnicas



| Tema | Detalle |

|------|---------|

| **Menú** | Google Sheet → `brava-catalog.js` / `brava-shop.js` (admin lee `productos` + `extras` para registro de ventas) |

| **Operaciones** | Supabase (`supabase/schema.sql`); ver `.env.example` |

| **Deploy** | https://brava-burgers.vercel.app/ — repo `YezeGames/brava-burgers`, carpeta `BravaBurgers/` |

| **CSV locales** | `sheets/brava-configuracion.csv`, `sheets/brava-productos.csv` (referencia) |



---



## Pedido manual WhatsApp / teléfono — ✅ producción



Ver [`PEDIDO_MANUAL.md`](PEDIDO_MANUAL.md). Botón **Pedido manual** en toolbar admin (requiere caja abierta).

| Ítem | Estado |
|------|--------|
| UI + API + Supabase `clientes` | ✅ |
| Sin validación turno delivery | ✅ |
| Badge MANUAL, filtros panel | ✅ |
| Columna **Atajo** en Sheet | Pendiente (operativo) |



---



## Zonas de entrega — ✅ Mapbox + GeoJSON



Checkout web: **Mapbox** (dirección, mapa, lat/lng) + **`GET /api/delivery-zone`** contra `data/zonas-entrega.geojson`.

My Maps solo sirve opcionalmente para **redibujar** polígonos y reexportar GeoJSON — no hay flujo “My Maps en vivo”. Detalle: [`ZONAS_ENTREGA.md`](ZONAS_ENTREGA.md).



---



## Cómo usar este archivo



1. Mandá ideas por chat (una o varias).

2. Las clasificamos: **próximo**, **backlog**, o **descartado**.

3. Al implementar, movemos ítems a **Hecho**.



_Última actualización: sep 2026 — pedido manual, caja/salidas, Mapbox zonas, WA inbox, reclamos integrados; descartadas plantillas WA y purge 24 h._

