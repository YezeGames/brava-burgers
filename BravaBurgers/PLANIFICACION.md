# Brava Burgers — planificación e ideas

Archivo vivo del proyecto. Acá anotamos ideas, prioridades y decisiones.  
Cuando quieras agregar algo, decilo en el chat y lo incorporamos acá.

---

## Lo que queremos (resumen — ago 2026)

Documento único de **alcance deseado**. Maquetas: `comanda-ejemplo.html`, `panel-pedidos-ejemplo.html`.

### 1. Tienda (ya operativa, ajustes menores)

- Catálogo y config desde **Google Sheet** (`productos`, `configuracion`).
- Cliente arma carrito → checkout → **WhatsApp** con el pedido (sigue existiendo).
- **Delivery solo** — **sin retiro en local** por ahora (alinear zonas en Sheet cuando toque).
- Agregar al checkout: **teléfono obligatorio**.
- Arreglar **aclaraciones** (ej. “sin salsa”) para que entren bien al pedido guardado y a la comanda.
- Al implementar panel: al confirmar pedido, **guardar en Sheet** además de (o antes de) abrir WA; incluir **ORN** en mensaje WA.

### 2. Guardar pedidos — Google Sheets

- Nueva hoja **`pedidos`** en el mismo Sheet del menú.
- Contador **`ORN-DEL-0001`** en Sheet (solo delivery).
- Escritura/lectura vía **Apps Script** (o API con secreto), no credenciales en el JS público.
- Cada pedido: datos cliente, tel, dirección, turno, zona, envío, **Efectivo / Mercado Pago**, ítems + aclaraciones, total, estado, si fue **editado**.

### 3. Panel `/admin` (login usuario + contraseña)

Pantalla **Órdenes** tipo deli (referencia capturada), adaptada a Brava:

| Elemento | Detalle |
|----------|---------|
| **Pestañas** | **Activas** · **Entregados** · **Cancelados** |
| **Filtros** | Fecha desde/hasta, **Pago** (EF / MP), APLICAR / RESTABLECER |
| **Columnas** | Fecha, Cliente, **Teléfono** (no “Productos”), Método de pago, Total, Acciones |
| **Buscar** | Operación diaria por **teléfono** / WhatsApp; ORN es **referencia** en comanda |
| **Acciones (Activas)** | **Editar** · Imprimir ticket · **WhatsApp** · **✓ entregado** · **✕ cancelar** |
| **✓** | Pasa a Entregados; **suma caja** (EF o MP) |
| **✕** | Pasa a Cancelados; fecha de cancelación; **importe descontado** del cierre del día |
| **Editar** | Más ítems/cantidades por WhatsApp sin re-pedido web; mismo ORN; reimprimir comanda; total final al entregar |
| **Caja del día** | EF entregados + MP entregados; línea cancelados; activas no suman hasta ✓ |
| **Sonido** | Aviso al **pedido nuevo** (activar sonido + polling al Sheet); probado en demo |

### 4. Comanda impresa (80 mm)

- **Igual** para Efectivo y Mercado Pago; solo cambia línea **Medio de pago**.
- Incluye: **ORN-DEL-…**, cliente, tel, dirección, turno, ítems, **Acl.:** por ítem, envío, total.
- **Sin “Estado”** en el papel (no se actualiza en vivo).
- Imprimir desde panel con datos reales del pedido (hoy: `comanda-ejemplo.html` como diseño).

### 5. Mercado Pago

- **Solo etiqueta** en pedido y caja; **cobro manual** (transferencia, etc.).
- **Sin** cobro automático ni webhooks por ahora.

### 6. Fuera de alcance (por ahora)

- Retiro en local / `ORN-RET`.
- Pasarela MP online.
- Base Supabase/Firebase (elegido **Sheet**).

### 7. Por construir (orden lógico)

1. ~~Plantilla hoja `pedidos` + Apps Script~~ → **`apps-script/`** (desplegar en tu Sheet).
2. ~~Checkout → guardar pedido + teléfono~~ → hecho (`/api/pedido`).
3. ~~Admin mínimo~~ → **`/admin`** (login + listado + ✓/✕ + sonido).
4. Comanda dinámica desde pedido real (ticket aún usa ejemplo).
5. **Editar** comanda en admin producción (solo en demo HTML por ahora).

---

## En curso / próximo

1. **Vos (Google):** pegar `apps-script/Code.gs`, Script Properties, publicar web app → URL en Vercel.
2. **Vercel:** `BRAVA_GAS_URL` + `BRAVA_ORDER_SECRET` (ver `.env.example`).
3. Redeploy → probar checkout + **`/admin`**.

Implementado en repo: `api/pedido.js`, `api/admin.js`, `admin/`, checkout con teléfono y POST pedido.

---

## Decisiones (ago 2026)

| Tema | Decisión |
|------|----------|
| **Retiro en local** | **No** por el momento. Todos los pedidos son **delivery** (zonas de envío del Sheet). No usar `ORN-RET` hasta que exista retiro. |
| **Persistencia** | **Google Sheets** (más simple). Catálogo ya está en Sheet; agregar pestaña **`pedidos`** (+ opcional `admin` / contador ORN). |
| **ORN** | Solo **`ORN-DEL-{NNNN}`** mientras no haya retiro. |

**Arquitectura Sheet (borrador):**

| Pieza | Rol |
|--------|-----|
| Hoja **`pedidos`** | Una fila por pedido: ORN, fecha, cliente, tel, dirección, localidad, piso, turno, zona, envío, pago, ítems (JSON o columnas), total, estado (`activa` / `entregada` / `cancelada`), flags `modificado`, timestamps |
| **Checkout web** | Tras validar formulario → **append** fila en `pedidos` (vía **Google Apps Script** web app o **Vercel Function** con service account) + seguir con WhatsApp |
| **`/admin`** | Lee/filtra Sheet, ✓/✕/editar actualizan fila; imprimir comanda desde esos datos |
| **Login admin** | No solo front: **Apps Script** o API con clave/sesión; contraseña no en el JS público |

**Contador ORN:** celda o hoja **`config_pedidos`** en el mismo Sheet (último número DEL); al crear pedido incrementar y formatear `ORN-DEL-0001`.

---

## Ideas (backlog)

### Panel administrativo (consulta — feb 2026)

**Qué pidió el cliente:**
- Login con usuario y contraseña.
- Dashboard tipo **control de caja**: pedidos que entren, separar **Efectivo** vs **Mercado Pago**.
- Sector **delivery / comanda**: ver datos del cliente, productos, total (como ticket de cocina/delivery).

**¿Es posible?** **Sí**, pero hoy la web **no guarda pedidos**: solo arma el mensaje y abre **WhatsApp**. No hay servidor ni base de datos de órdenes.

**Qué habría que agregar (resumen):**

| Pieza | Para qué |
|--------|----------|
| **Backend** (API) | Recibir pedidos, login, listar/cambiar estado |
| **Base de datos** | Pedidos, usuarios admin, estados (nuevo / en cocina / entregado / pagado) |
| **Cambio en el checkout** | Además de (o en lugar de solo) WhatsApp, **enviar el pedido a la API** |
| **Pantalla `/admin`** | Dashboard protegido con sesión o JWT |
| **Mercado Pago** | Solo **etiqueta + caja** (cobro manual afuera). **Sin** integración API ni cobro automático (fuera de alcance por ahora). |

**Opciones de “cómo lo armamos”:** ~~Supabase/Firebase~~ · ~~Pedilo hosted~~ — **elegido: Google Sheets** (ver **Decisiones** arriba). Alternativa futura si el volumen crece: API + DB.

~~4. **MVP acotado**~~ → cubierto por Sheets + panel descrito abajo.

**Seguridad:** usuario/contraseña **no** puede quedar solo en JavaScript visible; el login tiene que validarse en servidor (**Apps Script** o Vercel + secret).

**Código de pedido (ID en comanda y panel):**
- Formato: **`ORN-DEL-{NNNN}`** (4 dígitos; contador en Sheet).
- Ejemplo: **`ORN-DEL-0014`**
- **Sin retiro local** → no usar `ORN-RET` por ahora.
- **Uso operativo (decisión feb 2026):** el **ORN queda en comanda y panel como referencia** (ticket, cruce con cliente). Para **buscar rápido el chat**, la referencia principal es el **teléfono del cliente** → en el admin conviene **tel visible**, **link a WhatsApp** (`wa.me/...`) y **buscar/filtrar por tel**; el ORN no reemplaza al teléfono en el día a día.

**Estados del pedido (decisión feb 2026):**

| Estado | Dónde se ve | Acción |
|--------|-------------|--------|
| **Activa** | Lista principal **Órdenes** (pendientes del turno/día) | Pedido recién guardado |
| **Entregada** | Pestaña / lista **Entregados** | Botón **✓ (V)** al lado de WhatsApp → sale de Activas, **suma a caja** (EF o MP según método) |
| **Cancelada** | Pestaña / lista **Cancelados** | Botón **✕ (X)** → sale de Activas; queda **fecha/hora de cancelación** registrada; **importe descontado del total de caja del día** |

**Acciones por fila (lista Activas):** Imprimir ticket · WhatsApp · **✓ entregado** · **✕ cancelar**. En Entregados/Cancelados: ticket + WhatsApp (consulta).

**Caja del día:**
- **Efectivo (entregados)** + **Mercado Pago (entregados)** = subtotal entregados.
- **Menos cancelados (descontado):** suma de totales de pedidos cancelados ese día.
- **Total caja** = entregados − cancelados (las **activas no suman** hasta marcar ✓).

**Medio de pago (etiqueta fija al crear pedido):** `Efectivo` | `Mercado Pago` — filtros y columnas de caja EF / MP.

_(Prioridad y fases: definir con el cliente.)_

**Referencia visual — pantalla “Órdenes” (captura deli):**

Layout como la referencia: título **Órdenes**, filtros arriba, tabla abajo, paginación.

| Zona | Contenido |
|------|-----------|
| **Filtros** | **Desde** / **Hasta**, **Pago** → **APLICAR** / **RESTABLECER** (solo delivery; sin filtro retiro) |
| **Columnas tabla** | **Fecha** · **Cliente** · **Teléfono** · **Método de pago** · **Total** · **Acciones** (columna Tipo opcional fija “delivery”) |
| **Acciones** | **Editar** (solo Activas) · **Imprimir ticket** · **WhatsApp** · **✓** · **✕** |

**ORN:** no hace falta columna en esta tabla si operás por tel; el código **`ORN-DEL-0000`** queda en **comanda impresa** y en detalle del pedido si hace falta.

| **Ticket impreso** | **Misma comanda** para Efectivo y Mercado Pago. **Medio de pago**, **ORN-DEL-0000**, cliente, tel, dirección, turno, ítems, aclaraciones, envío, total. **Sin estado** en el ticket. |

**Ajustes vs Pedidos Ya / panel genérico:**
- En Brava hoy el pago sale del formulario (Efectivo / Mercado Pago), no “Definido por mensaje” — conviene guardarlo **explícito** al crear el pedido.
- **Mercado Pago (decisión feb 2026):** **solo manual.** No planificar cobro automático ni webhooks. El cliente elige **Mercado Pago** en el checkout; vos cobrás **manual** (link, transferencia, POS, etc.). El panel debe:
  - Mostrar etiqueta **Mercado Pago** (no confundir con efectivo).
  - Sumar ese importe en **totales del día / caja** igual que efectivo, pero en columna o filtro **“Total MP”** aparte de **“Total efectivo”**.
  - Opcional: botón **“Marcar cobrado”** cuando confirmás el pago manual (estado pago: pendiente → cobrado).
- Datos que ya tenemos en checkout: nombre, dirección, localidad, piso, turno, zona + costo envío, ítems del carrito. **Falta hoy:** **teléfono** — hay que agregarlo al formulario para llenar la columna **Teléfono** del panel.
- WhatsApp puede seguir como copia; el **origen de verdad** sería el pedido guardado en **Sheet `pedidos`**.

**Editar comanda (decisión feb 2026):**

Caso real: entra pedido web (ej. 2 Cheeseburger Simple) → imprimís comanda → el cliente **por WhatsApp pide una más** sin volver a enviar el pedido en la web.

| Regla | Detalle |
|--------|---------|
| **Cuándo** | Solo pedidos **Activos** (antes de ✓ entregado o ✕ cancelado) |
| **Qué se edita** | Cantidades, ítems (+/−), agregar producto del **catálogo** (precios Sheet), aclaraciones; **recalcular total** (productos + envío) |
| **Mismo ORN** | No se crea pedido nuevo; sigue **`ORN-DEL-0000`** con badge **editado** + hora de última modificación |
| **Comanda** | **Reimprimir ticket** con ítems actualizados (cocina ve la versión nueva) |
| **Caja** | Cuenta el **total final** al marcar ✓ entregado (lo editado manda) |
| **WhatsApp** | No se sincroniza solo; vos coordinás con el cliente por chat |

En la prueba: botón **Editar** en `panel-pedidos-ejemplo.html` (ej. Lucas: 1 simple → sumá otra con +).

**MVP sugerido (misma UX, alcance chico):**
1. `/admin` login → pestañas **Activas / Entregados / Cancelados** + filtros.
2. Botón **Imprimir ticket** (CSS 80 mm, como `comanda-ejemplo.html`).
3. **Editar** comanda (ítems y total) en Activas.
4. **WhatsApp**, **✓**, **✕** por fila en Activas.
5. **Caja del día** (EF / MP / cancelados) — ver `panel-pedidos-ejemplo.html`.

**Aviso sonoro pedido nuevo (ago 2026):** **Sí, es posible** en `/admin`. Al detectar un pedido nuevo (estado `activa`, ORN que antes no estaba), reproducir un **beep** corto (archivo `mp3`/`wav` en el proyecto). Implementación típica con Sheet: **polling** cada 15–30 s (o al foco de la pestaña) comparando último ORN / `ultima_actualizacion`; si hay fila nueva → sonido + opcional parpadeo en título. **Limitación navegador:** el audio suele requerir **un clic previo** en la página (desbloquear audio); mostrar botón “Activar avisos” la primera vez. No hace falta push nativo para el MVP; más adelante: Supabase realtime, Firebase, o extensión PWA.

---

## Hecho ✅

- Tienda Pedilo-compatible (Sheet `productos` + `configuracion`)
- Tema Brava (oscuro + naranja `#FF6B35`)
- Modals checkout y extras (~350px, estilo Pedilo)
- Logo desde Sheet (Imgur / fila fusionada)
- Pie de página formato Pedilo con datos Brava
- Menú colapsado al entrar (categoría → subcategoría → productos)
- Precio en catálogo: **Desde $** en todos los productos
- Sin sync automático cada 30s (carga al abrir; F5 para actualizar Sheet)
- Sin textos “Pedilo-compatible” / sync en footer

---

## Notas técnicas

| Tema | Detalle |
|------|---------|
| **Datos** | `productos` + `configuracion` + **`pedidos`** (nueva) en el mismo Google Sheet |
| **Deploy** | Vercel: https://brava-burgers.vercel.app/ |
| **Config local** | `sheets/brava-configuracion.csv`, `sheets/brava-productos.csv` |

---

## Cómo usar este archivo

1. Mandá ideas por chat (una o varias).
2. Las clasificamos: **próximo**, **backlog**, o **descartado**.
3. Al implementar, movemos ítems a **Hecho**.

_Última actualización: resumen “lo que queremos” consolidado._
