# Repartidor — APK nativa Android (plan)

Objetivo: app **Kotlin/Compose** sin WebView ni Capacitor, misma API Vercel (`/api/pedido`), mapas **OpenStreetMap** vía **MapLibre Native** + **OSRM** (sin costo de tiles Google/Mapbox).

## Demo UI (elegir dirección visual)

Abrir en el navegador (local o Vercel tras deploy):

**`/demo-repartidor-native-ui.html`**

**Diseño fijado (marzo 2026):**

| Pantalla | Estilo | Detalle |
|----------|--------|---------|
| **Navegación** | A · map-first | Mapa + sheet; maniobra; **solo botón «Llegué»** (sin llamar en mapa). |
| **Ruta / lista** | Lista operativa | Paradas en **orden cocina** (sin elegir parada). Barra **Conectado** (pin verde). Sin botón ↻ en UI: **FCM + sync realtime**; pull-to-refresh solo respaldo. Dock **Iniciar recorrido**. |
| **Entrega** | A · handoff | **Llamar** (abre teléfono, sin mostrar número) + **Entregado**; dirección y piso; **lista de ítems** con notas; bloque de pago. |

**Pago en entrega**

- **Efectivo:** badge EF + chip ámbar **COBRAR** + total (acción: cobrar en mano).
- **Mercado Pago:** badge MP + chip verde **PAGO** (ya cobrado; no efectivo). Mismo patrón previsto para **Chytapay**.

En el demo: pestaña **Entrega** → toggles Efectivo / Mercado Pago.

## Backend (sin cambiar admin)

- `repartidorLogin`, `listRuta`, `iniciarRecorrido`, `reportTrack`, `confirmarLlegada`, `markEntregada`, `savePushToken`
- Mejora deseable v1: incluir **`lat`/`lng`** en `listRuta` por parada (geocódigo en cocina/pedido, no Nominatim en moto).

## Mapas sin gastos

- **Tiles/estilo:** MapLibre + `basemaps.cartocdn.com` (Voyager), atribución OSM/CARTO.
- **Ruta:** OSRM HTTP (mismo contrato que la web); producción a escala → OSRM propio opcional.
- **Cliente seguimiento:** sigue en web; mejoras de latencia = realtime/poll, no app nativa cliente.

## Capacitor actual

Hasta que la nativa reemplace producción, seguir **`mobile-repartidor/MOBILE_REPARTIDOR.md`**. Cuando la nativa esté estable, congelar Capacitor y publicar solo la APK nueva (mismo `applicationId` si querés update in-place).

## MVP nativo v1 (alcance)

1. Login + permisos (ubicación, notificaciones, batería).
2. Lista de paradas + detalle.
3. Mapa MapLibre + ruta OSRM + FGS + `reportTrack`.
4. FCM + notificación ruta modificada (nativo).
5. Llegada / entregado (WhatsApp vía API).
6. UI según opción elegida en el demo.

Referencia operativa: `NAVEGACION_REPARTIDOR.md`.

## Código nativo (inicio mar 2026)

Proyecto Gradle: **`repartidor-native-android/`** · README ahí · Compose + Retrofit.  
Alpha **2.0.0-alpha12** — MapLibre + OSRM, FGS GPS solo en camino, ruta vía **FCM** (sin poll Capacitor), multi-parada, COBRAR/PAGO. Siguiente: **Supabase Realtime** repartidor (event-driven como admin).
