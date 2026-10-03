# Informe de auditoría — Fluidez GPS, puck y rerouting

**Proyecto:** Brava Burgers · Repartidor nativo + `brava-nav-core`  
**Referencia de código:** `2.0.0-alpha52` (main)  
**Fecha del informe:** 2026-03-10  
**Tipo:** Auditoría técnica (sin cambios aplicados)  
**Relacionado:** [MAPBOX_PARITY.md](./MAPBOX_PARITY.md), [MATCHER_OSS_RESEARCH.md](./MATCHER_OSS_RESEARCH.md)

---

## 1. Resumen ejecutivo

Durante la conducción real (moto), el **puck/flecha de navegación** en la APK nativa suele percibirse como **discontinuo**: avanza en **saltos ~1 Hz** alineados con los fixes GPS, en lugar de deslizarse de forma continua sobre la polilínea. En **recálculo de ruta (reroute)**, pueden aparecer **parpadeos** (capa de ruta, rumbo, snap al nuevo trazado).

La arquitectura **sí incluye** interpolación (~60 FPS) vía `BravaLocationAnimator` y un pipeline estilo Mapbox (`GPS → matcher → enhanced → animador → UI`). El problema no es “falta total de animación”, sino **varias capas que anulan o compiten** con esa interpolación: umbrales de descarte, teleports en el matcher, duración fija del segmento, Valhalla async, y **cámara MapLibre re-animada en cada recomposición** del driver.

Se evaluó un **task de fixes propuesto** (5 ítems). Parte del diagnóstico es acertado; la implementación sugerida es **incompleta** si no se alinean umbrales matcher/animador, reroute y capas del mapa.

---

## 2. Alcance

| Incluido | Excluido |
|----------|----------|
| APK `repartidor-native-android` (navegación activa) | `demo-repartidor-native-ui.html` (mock UI) |
| Web `admin/repartidor-app.html` + `lib/brava-nav-core` | Mapbox Navigation SDK comercial (matcher C++) |
| Valhalla `/locate` display, OSRM/Valhalla routing | Tracking en background (`TrackForegroundService`) salvo GPS compartido |

---

## 3. Síntomas reportados

1. **En calle:** el punto/flecha no avanza fluido a la velocidad de la moto sobre el trazado; **salto brusco cada ~1 s** (frecuencia típica del fused location).
2. **En reroute:** parpadeo visual al actualizar geometría (Valhalla/OSRM/API Brava).

---

## 4. Arquitectura actual (flujo de datos)

```text
NavLocationTracker (Fused, ~1 Hz)
    → RepartidorViewModel.applyNavDriverFix
        → BravaNavDisplayPipeline.onGpsFix
            → BravaStationaryGpsController (parado)
            → BravaOpenMapMatcher + BravaStepLineSnap (movimiento)
            → BravaLocationAnimator.pushEnhancedFix / snapTo
        → commitNavDriverFix (GPS crudo: voz, reruta, off-route)
        → ValhallaMapMatcher.locateForDisplay (async, solo puck)

ensureNavDisplayFrameLoop (~16 ms)
    → tickDisplay → BravaBearingSmootherState
    → UI: navDriver, navDriverBearing

BravaMapView (Compose)
    → updateDriverMarker (GeoJSON SymbolLayer / círculo azul)
    → LaunchedEffect(driver) → applyNavigationCamera (animateCamera)
```

**Regla de producto:** voz y reruta usan **GPS crudo**; el mapa usa **posición enhanced + animador**.

---

## 5. Causas raíz (con evidencia en código)

### 5.1 Umbral de 6 m en el animador (causa principal en moto lenta–media)

**Archivo:** `BravaLocationAnimator.kt` / `locationAnimator.js`

En cada fix, si la distancia desde la posición **display** actual al nuevo destino es **&lt; 6 m**, **no se crea segmento** (`return`).

A **~15 km/h** (~4,2 m/s), un fix cada **1 s** ≈ **4 m** → muchos fixes **descartados**. El puck termina el segmento anterior, **se detiene** hasta que un fix supera 6 m → percepción de **paso-discreto** sincronizada con el GPS.

A **~40 km/h** (~11 m/s), ~11 m/fix → el umbral se supera con más frecuencia; el síntoma se acentúa en **tránsito urbano** y arranques.

### 5.2 Duración fija 1000 ms sin escala por velocidad o intervalo GPS

**Archivo:** `BravaLocationAnimator.kt` (`durationMs = 1000L`)

Cada segmento válido anima en **1 s** lineal, independiente de:

- distancia del salto,
- velocidad real del vehículo,
- si el fix anterior llegó a 500 ms o 1200 ms.

Efecto: el puck puede ir **retrasado** respecto al movimiento real y **recuperar** de golpe en el siguiente keypoint (aceleración visual no física).

**Nota:** el `from` del segmento es la posición **display** interpolada (correcto vs Mapbox); el problema es **cadencia + umbral 6 m**, no el origen del segmento.

### 5.3 Teleport en matcher (45 m) antes que teleport del animador (80 m)

**Archivo:** `BravaOpenMapMatcher.kt` — `TELEPORT_M = 45.0`

Si entre dos posiciones enhanced hay ≥ 45 m → `isTeleport = true` → `animator.snapTo()` (**duración 0**).

Cualquier propuesta de subir solo `teleportJumpM` del animador a **150 m** **no elimina** snaps frecuentes si el matcher sigue en **45 m**.

### 5.4 Valhalla `/locate` async interrumpe el animador

**Archivos:** `ValhallaMapMatcher.kt`, `RepartidorViewModel.maybeValhallaLocateForDisplay`, `BravaNavDisplayPipeline.applyValhallaLocate`

Cada locate válido llama `pushEnhancedFix` → puede **reemplazar** el segmento en curso. Throttle **750 ms** + gates de distancia, pero **no coordinado** con la llegada del fix GPS ni con “segmento a mitad”.

### 5.5 Cámara compite con el animador (~60 `animateCamera`/s)

**Archivo:** `BravaMapView.kt`

`LaunchedEffect` incluye **`driver`** en keys. Cada actualización de `navDriver` (~60/s) invoca `applyNavigationCamera`:

- paso &lt; 1,5 m → `moveCamera` (instantáneo),
- else → `animateCamera` con duración **120–420 ms**.

Múltiples animaciones de cámara **superpuestas** al movimiento del puck generan desincronización (“la flecha y el mapa no van juntos”).

El puck en nav **no rota** (`iconRotate(0)`, alineación viewport); el **bearing** lo lleva la cámara + `BravaBearingSmootherState` en `tickDisplay`.

### 5.6 Reroute: parpadeo no es solo `animator.reset`

**Archivo:** `RepartidorViewModel.rerouteFromCurrentPosition` → `onRouteLoaded`

En reroute **exitoso**:

- `navDisplayPipeline.onRouteLoaded(route.coordinates)` — **no** resetea el animador explícitamente.
- Sí resetea estado del **matcher** (`NavDriverDisplaySmoother`, step context vía voz).
- UI: `navRoute` nueva → `applyRouteGeometry` **elimina y recrea** capas GeoJSON.
- `navDriverBearing` se setea al bearing en **m = 0** de la ruta nueva, no al curso en la posición actual del puck.

Parpadeo atribuible a **redibujado de capas + salto de bearing + snap al nuevo step**, más que a un `snapTo` único en reroute.

### 5.7 Web repartidor (menor paridad)

**Archivo:** `navSession.js`

Mismo animador + estacionario; **sin** `BravaStepLineSnap` ni Valhalla locate. Los síntomas 5.1, 5.2 y 5.5 (web: `easeTo` en `updateUserMarker`) aplican en navegador.

---

## 6. Evaluación del task de fixes propuesto (sin implementar)

| # | Propuesta | Veredicto | Observaciones |
|---|-----------|-----------|---------------|
| **1** | Eliminar filtro `jumpM < 6` | **Parcialmente acertado** | Ataca moto ~15–25 km/h. Riesgo: jitter si estacionario filtra mal o GPS ruidoso &lt; 5 km/h. Mejor: umbral adaptativo (`f(speed, accuracy)`) que “eliminar siempre”. Task cita 1,5 km/h; código usa **MOVING_MIN_SPEED_MPS = 1,45 m/s (~5,2 km/h)**. |
| **2** | Duración dinámica + handoff mid-segment; teleport 150 m en animador | **Dirección correcta, spec incompleta** | Falta fórmula (`duration = f(Δt, jumpM, speed)`). Subir solo animador a 150 m **inútil** mientras matcher teleport = 45 m. Incluir Valhalla en handoff. |
| **3** | Interpolar bearing en `tick()` | **Refinamiento útil** | Cámara ya usa `BravaBearingSmootherState` + límites en `resolveNavCameraBearing`. Evitar doble suavizado excesivo. JS ya tiene `bearingFrom` en segmento pero no lo interpola. |
| **4** | Reroute Valhalla: no snap &lt; 30 m | **Problema mal acotado** | Reroute es **nueva ruta OSRM/Valhalla**, no solo locate. Requiere: `setData` en ruta sin destroy layers, bearing desde proyección del puck, `pushGpsFix` suave hacia polyline nueva. |
| **5** | Cámara a 60 FPS acoplada a `navDriver` | **Mayor impacto percibido** | Implica sacar follow de `LaunchedEffect(driver)` o usar `moveCamera` por frame sin cola de `animateCamera`. Posible acople VM → MapView en el mismo tick. |

---

## 7. Matriz de umbrales (inconsistencias)

| Constante | Valor | Ubicación | Efecto |
|-----------|-------|-----------|--------|
| Descarte animador | **6 m** | `BravaLocationAnimator` | No nuevo segmento |
| Teleport animador | **80 m** | `BravaLocationAnimator` | duration 0 |
| Teleport matcher | **45 m** | `BravaOpenMapMatcher` | `snapTo` |
| Valhalla max desde raw | **42 m** | `ValhallaMapMatcher` / matcher | rechazo locate |
| Cámara paso pequeño | **&lt; 1,5 m** | `BravaMapView` | `moveCamera` brusco |
| Movimiento “real” | **≥ 1,45 m/s** | `NavDriverDisplaySmoother` | snap step / Valhalla |

Auditoría recomienda **tabla única de umbrales** al implementar fixes.

---

## 8. Plan de remediación recomendado (orden sugerido)

1. **Cámara (ítem 5)** — dejar de encolar `animateCamera` en cada cambio de `driver`; seguir posición interpolada en el mismo reloj que el puck.
2. **Umbral 6 m (ítem 1)** — relajar o adaptar por velocidad; mantener protección estacionaria.
3. **Segmento dinámico + handoff (ítem 2)** — alinear **matcher 45 m** con política de teleport; coordinar GPS vs Valhalla.
4. **Bearing en animador (ítem 3)** — tras estabilizar posición/cámara.
5. **Reroute suave (ítem 4)** — capas GeoJSON, bearing desde along-route, transición matcher sin reset visual.

**Paridad:** cambios en `locationAnimator.js` + rebundle `admin/js/brava-nav-core.bundle.js` para web.

---

## 9. Plan de pruebas (aceptación)

| Escenario | Qué observar |
|-----------|----------------|
| Recto 30 km/h, 2 min | Sin pausa ~1 s; velocidad visual estable |
| Recto 50 km/h, 1 min | Puck no retrasado &gt; ~15 m persistente |
| Urbano 15–20 km/h | Menos “escalones” (región afectada por 6 m) |
| Giro 90° | Bearing sin tirones (cámara + puck) |
| Semáforo 30 s | Sin drift ni vibración (estacionario) |
| Reroute en marcha (&lt; 30 m a nueva línea) | Sin flash de capa; bearing coherente |
| Reroute off-route fuerte | Transición aceptable, voz OK |
| Casa 1 min nav abierta | Sin deslizamiento a calle (regresión) |

Dispositivo real Android; comparar opcional con grabación de pantalla + log de distancia display vs GPS crudo.

---

## 10. Índice de archivos

| Componente | Ruta |
|------------|------|
| GPS fused | `repartidor-native-android/.../location/NavLocationTracker.kt` |
| Orquestación | `.../viewmodel/RepartidorViewModel.kt` |
| Pipeline | `.../navigation/core/BravaNavDisplayPipeline.kt` |
| Animador | `.../navigation/core/BravaLocationAnimator.kt` |
| Matcher | `.../navigation/core/BravaOpenMapMatcher.kt`, `BravaStepLineSnap.kt` |
| Valhalla display | `.../navigation/ValhallaMapMatcher.kt`, `.../data/OsrmClient.kt` |
| Mapa + cámara | `.../ui/map/BravaMapView.kt` |
| Core JS | `lib/brava-nav-core/src/navSession.js`, `locationAnimator.js` |
| Web | `admin/repartidor-app.html` |

---

## 11. Conclusión

El pipeline Brava **implementa** interpolación y snap-to-route acorde a prácticas OSS (MapLibre/Ferrostar/Mapbox OSS animador), pero la **experiencia en moto** se degrada por:

1. **Descarte de fixes &lt; 6 m** en el animador.  
2. **Segmentos de 1 s fijos** sin acople a velocidad/Δt.  
3. **Teleports a 45 m** en el matcher.  
4. **Cámara MapLibre** reaccionando a ~60 actualizaciones/s con animaciones de duración fija.  
5. **Reroute** que redibuja capas y resetea rumbo al inicio de la polyline.

El task de fixes propuesto ataca **(1)** y **(5)** de forma directa; **(2–4)** requieren diseño adicional y alineación de constantes entre módulos. Este informe puede usarse como base de revisión de código y de un PR por fases.

---

## 12. Registro de implementación

| Fase | Estado | Notas |
|------|--------|--------|
| 1. Cámara sync (`moveCamera` + bearing desde `tickDisplay`) | **Hecho** (alpha53 local) | `BravaMapView.kt`; web: `easeTo` duration 0 en loop display |
| 2. Umbral adaptativo animador | **Hecho** | `minJumpThresholdM(speedMps * 0.35)` Kotlin + JS |
| 3. Segmento Δt + teleport 120 m unificado | **Hecho** | `NavDisplayThresholds`, matcher + animador + JS |
| 4. Bearing en tick (`shortestRotationDiff`) | **Hecho** | Kotlin + JS animador |
| 5. Reroute (`setGeoJson`, bearing along-route, soft snap ≤30 m) | **Hecho** | `BravaMapView`, `RepartidorViewModel`, `onRouteLoaded` |

*Documento generado para revisión interna.*
