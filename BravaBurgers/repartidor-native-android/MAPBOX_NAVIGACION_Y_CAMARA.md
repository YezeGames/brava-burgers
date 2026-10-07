# Brava Repartidor nativo — Mapbox navegación y cámara

Documento de referencia para analizar o modificar la cámara del mapa, el puck (ubicación del conductor) y la UI de navegación.

**Stack:** Android Kotlin, **Mapbox Navigation SDK drop-in** (`NavigationView`), **no** React Native / Flutter / MapLibre / OSRM en este flujo.

**Versión SDK:** `com.mapbox.navigation:ui-dropin:2.20.4` (ver `app/build.gradle.kts`).

**Última build documentada:** `2.0.0-alpha84` (versionCode **86**) — cámara plana + `BravaPuckCenterFramingStrategy`.

---

## 1. Objetivo de producto (cámara)

| Queremos | Evitamos |
|----------|----------|
| Vista **2D** (pitch 0), estilo “desde arriba” | Pitch ~45° en rectas (default Mapbox si no aplica perfil) |
| **Puck / flecha azul estable** en el centro útil de pantalla | Cámara que “corre” hacia el próximo giro para encuadrarlo |
| Zoom dinámico Mapbox (sin zoom fijo casero) | `MapView.setPadding` que achique el mapa (regresión pantalla negra) |
| UI Brava (banner DiDi, panel abajo, FABs) flotando **edge-to-edge** | UI nativa del drop-in (maneuver, panel info, botones Mapbox) |

---

## 2. Arquitectura (reglas que no romper)

1. **Rutas y guidance:** solo `NavigationView.api.startActiveGuidance(routes)`.
   - **No** llamar `MapboxNavigation.startTripSession()` manualmente mezclado con drop-in (rompe state machine / crashes).
2. **Lifecycle Mapbox:** `MapboxNavigationApp.setup` en `BravaRepartidorApp`; `attach(this)` / `detach(this)` en `BravaMapboxDeliveryActivity`.
3. **Un `NavigationView` por sesión de entrega** — la pestaña mapa en home no monta otro (`DriverMapTabScreen.kt` explica por qué).
4. **Márgenes de cámara:** `MapboxNavigationViewportDataSource.followingPadding` vía `BravaMapboxCameraAnchor`.
   - **No** usar padding del `MapView` para reservar banner/panel (`BravaMapboxViewportPadding` fuerza `0,0,0,0`).
5. **Panel drop-in:** oculto con `customizeViewOptions` (`BravaMapboxDropInUi`), **no** recorrer/ocultar el árbol BottomSheet a mano (regresión pantalla negra).

### Diagrama de flujo (simplificado)

```
BravaRepartidorApp
  └─ MapboxNavigationApp.setup + BravaMapboxNavigation.ensureRegistered()

NavigationScreen (Compose)
  └─ Intent → BravaMapboxDeliveryActivity

BravaMapboxDeliveryActivity
  ├─ NavigationView (XML, full bleed)
  ├─ Overlays Brava (maneuver, panel, speed, FABs)
  ├─ BravaMapboxViewportPadding → onAttached(MapView) → map ready
  ├─ BravaMapboxNavigation.bindNavigationView + requestActiveGuidance
  └─ applyMapContentInsets → BravaMapboxCameraAnchor.applyBravaOverlayPadding

BravaMapboxNavigation (observer)
  ├─ requestRoutes → startActiveGuidance
  ├─ RouteProgressObserver → UI + maintainFlatFollowing
  └─ LocationObserver → lastEnhancedLocationPoint (framing)

BravaMapboxCameraAnchor
  ├─ findViewportDataSource (reflection en NavigationView / MapboxNavigation)
  └─ followingFrameOptions + followingPadding + evaluate()
```

---

## 3. Índice de archivos

| Archivo | Rol |
|---------|-----|
| `app/build.gradle.kts` | `versionCode` / `versionName`, dependencias Mapbox |
| `app/src/main/AndroidManifest.xml` | Declara `BravaMapboxDeliveryActivity` |
| `app/.../BravaRepartidorApp.kt` | `MapboxNavigationApp.setup`, token |
| `app/.../ui/screens/NavigationScreen.kt` | Geocode + abre Activity de entrega |
| `app/.../ui/screens/DriverMapTabScreen.kt` | Home map tab (sin segundo NavigationView) |
| `res/layout/activity_brava_mapbox_delivery.xml` | `NavigationView` + overlays Brava |
| `mapbox/BravaMapboxDeliveryActivity.kt` | Pantalla principal: insets, cámara, callbacks UI |
| `mapbox/BravaMapboxCameraAnchor.kt` | **Cámara:** viewport, pitch, focal, padding, bind |
| `mapbox/BravaPuckCenterFramingStrategy.kt` | **Framing:** solo punto GPS del conductor |
| `mapbox/BravaMapboxViewportPadding.kt` | MapView edge-to-edge, callback map ready |
| `mapbox/BravaMapboxNavigation.kt` | Rutas, observers, GPS para framing |
| `mapbox/BravaMapboxDropInUi.kt` | Ocultar UI Mapbox, ruta naranja bajo puck |
| `mapbox/BravaMapboxControls.kt` | FAB recenter / brújula / voz |
| `mapbox/BravaNavManeuver.kt` | Texto + iconos banner DiDi |
| `mapbox/BravaNavTripFormat.kt` | ETA / distancia panel inferior |
| `mapbox/BravaMapboxHideInfoPanel.kt` | Legacy/nota; panel vía DropInUi |
| `MAPBOX_ALPHA57.md` | Historial migración a drop-in |
| `repartidor-native-update.json` | OTA APK (repo raíz `BravaBurgers/`) |

---

## 4. Inicialización del mapa

### 4.1 Layout XML

```xml
<com.mapbox.navigation.dropin.NavigationView
    android:id="@+id/bravaNavigationView"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:fitsSystemWindows="false"
    app:accessToken="@string/mapbox_access_token" />
```

Ruta: `app/src/main/res/layout/activity_brava_mapbox_delivery.xml`

### 4.2 Application (`BravaRepartidorApp.kt`)

- Si hay `MAPBOX_ACCESS_TOKEN` en `BuildConfig`:
  - `MapboxNavigationApp.setup(NavigationOptions.Builder...accessToken...)`
  - `BravaMapboxNavigation.ensureRegistered()` → registra `MapboxNavigationObserver`.

### 4.3 Activity (`BravaMapboxDeliveryActivity.onCreate`)

Orden relevante:

1. `MapboxNavigationApp.attach(this)`
2. `BravaMapboxNavigation.resetSession()`
3. `setContentView` + find views
4. `BravaMapboxDropInUi.applyBravaOptions(navigationView)`
5. `BravaMapboxViewportPadding.register(navigationView)` + `onMapAttached` → rebind viewport + insets
6. `BravaMapboxNavigation.bindNavigationView(navigationView)`
7. `BravaMapboxControls.wire(..., refreshCamera = { scheduleMapInsets() })`
8. Callbacks `onRouteProgress`, `onManeuver`, `onActiveGuidanceStarted`, etc.
9. `startGuidanceWhenReady` → espera nav + map surface → `requestActiveGuidance`

### 4.4 Destrucción (`onDestroy`)

- Limpia callbacks, `BravaMapboxCameraAnchor.reset()`
- `navigationView.api.startFreeDrive()`
- `unbindNavigationView`, `stopActiveGuidance`, `MapboxNavigationApp.detach(this)`

---

## 5. Cámara — conceptos Mapbox usados en Brava

| API / concepto | Uso en Brava |
|----------------|--------------|
| `NavigationView` | Contenedor drop-in (mapa + navigation camera interna) |
| `navigationView.api.recenterCamera()` | Recentrar modo following (FAB brújula / recenter) |
| `MapboxNavigationViewportDataSource` | Fuente de datos del **NavigationCamera** (padding + frame options) |
| `followingPadding` / `overviewPadding` | `EdgeInsets` en px — área “segura” donde se coloca geometría / focal |
| `FollowingFrameOptions` | Pitch default, focal point, flags de maniobras, **framingStrategy** |
| `FollowingCameraFramingStrategy` | Qué puntos encuadrar en el step actual → Brava: **solo GPS** |
| `followingPitchPropertyOverride(0.0)` | Forzar plano aunque el motor quiera inclinar |
| `followingZoomPropertyOverride(null)` | Dejar zoom automático Mapbox |
| `evaluate()` | Recalcular estado de cámara tras cambiar options/padding |

**Documentación Mapbox útil:**

- [Navigation camera (guides)](https://docs.mapbox.com/android/navigation/guides/ui-components/camera/)
- [FollowingFrameOptions](https://docs.mapbox.com/android/navigation/v2/api/2.21.0/libnavui-maps/com.mapbox.navigation.ui.maps.camera.data/-following-frame-options/)
- PR custom framing: [mapbox-navigation-android #7041](https://github.com/mapbox/mapbox-navigation-android/pull/7041)

---

## 6. `BravaMapboxCameraAnchor` — detalle

### 6.1 Obtener el ViewportDataSource

Mapbox drop-in **no expone** públicamente el `MapboxNavigationViewportDataSource` en la API estable que usamos. Brava lo obtiene con:

1. `bindFromMapboxNavigation(mapboxNavigation)` — BFS por fields en el objeto `MapboxNavigation`
2. `findViewportDataSource(navigationView)` — BFS desde el `NavigationView`

Límites: `MAX_NODES = 240`, `MAX_DEPTH = 14`, solo recorre paquetes `com.mapbox.*`, `android.view.*`, `androidx.*`.

**Logs (logcat, tag `BravaMapboxCamera`):**

- `ViewportDataSource bound — flat 2D, puck-centered` → perfil Brava aplicable
- `ViewportDataSource NOT bound — cámara Mapbox default (3D en rectas)` → **bug crítico**: usuario ve comportamiento stock
- `ViewportDataSource not ready` → reintentar (Activity ya reintenta a 0 ms, 500 ms, 2 s al iniciar guidance)

### 6.2 Perfil plano + puck (`applyFlatPuckCenteredProfile`)

Propiedades actuales (alpha84):

```kotlin
vds.options.followingFrameOptions.apply {
    defaultPitch = 0.0
    focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.5)
    maximizeViewableGeometryWhenPitchZero = false
    pitchNearManeuvers.enabled = false
    frameGeometryAfterManeuver.enabled = false
    intersectionDensityCalculation.enabled = false
    framingStrategy = puckFramingStrategy  // BravaPuckCenterFramingStrategy
}
vds.followingPitchPropertyOverride(0.0)
vds.followingZoomPropertyOverride(null)
vds.followingBearingPropertyOverride(0.0)  // norte fijo; reaplicado en maintainFlatFollowing
```

`maintainFlatFollowing()` vuelve a llamar `applyFlatPuckCenteredProfile` en **cada** `RouteProgressObserver` tick (por si Mapbox restaura pitch u options).

### 6.3 Padding de cámara (`applyBravaOverlayPadding`)

Entrada desde Activity (px reales):

- `topPx` = status bar + reserva fija banner (`maneuverTopReserveDp` × density)
- `bottomPx` = alto panel inferior + nav bar + 36dp extra
- `sidePx` = 40dp × density

Dentro del anchor:

- Mínimos: top ≥ 48, bottom ≥ 96, side ≥ 24
- **Simétrico vertical (alpha84):** `vSym = max(top, bottom)` → `followingPadding = EdgeInsets(vSym, side, vSym, side)`
- `overviewPadding` = 0.9 × vSym arriba/abajo
- `vds.evaluate()` tras cambios

**Nota:** el mapa sigue full screen; el padding solo afecta **dónde** el NavigationCamera coloca el punto focal dentro del viewport, no el tamaño del `MapView`.

### 6.4 Constantes en Activity relacionadas con cámara

```kotlin
private val maneuverTopReserveDp = 118f   // reserva superior fija aunque el banner esté GONE
private val overlayExtraTopDp = 8f
private val overlayExtraBottomDp = 10f
```

En `applyMapContentInsets`:

```kotlin
val topPad = statusTop + (maneuverTopReserveDp * density).toInt()
val bottomPad = bottomPanel.height + navBarBottom + (36 * density).toInt()
val side = (40 * density).toInt()
```

Al expandir/colapsar panel inferior → `scheduleMapInsets(force = true)` recalcula `bottomPad`.

---

## 7. `BravaPuckCenterFramingStrategy`

Implementa `FollowingCameraFramingStrategy`:

- **`getPointsToFrameOnCurrentStep`:** devuelve **un solo** `Point`:
  1. Preferido: `BravaMapboxNavigation.lastEnhancedLocationPoint` (GPS enhanced)
  2. Fallback: ubicación del maneuver del step actual
- **`getPointsToFrameAfterCurrentManeuver`:** lista vacía (no encuadrar post-giro)

Alimentación GPS (`BravaMapboxNavigation`, `LocationObserver.onNewLocationMatcherResult`):

```kotlin
lastEnhancedLocationPoint = Point.fromLngLat(lng, lat)
```

---

## 8. MapView padding vs camera padding

`BravaMapboxViewportPadding`:

- Registra `MapViewObserver` en el `NavigationView`
- `onAttached` → `clearMapPadding()` (`setPadding(0,0,0,0)`), `notifyMapSurfaceReady()`, callback `onMapAttached`
- Comentario en código: el margen visual lo maneja **`followingPadding`**, no el MapView

---

## 9. Drop-in UI Mapbox (`BravaMapboxDropInUi`)

`navigationView.customizeViewOptions { ... }`:

- Oculta: maneuver, panel info, botones acción, compass/audio/recenter Mapbox, speed limit, etc.
- `infoPanelForcedState = BottomSheetBehavior.STATE_HIDDEN`
- Ruta: `withRouteLineBelowLayerId("mapbox-location-indicator-layer")` para que la línea naranja quede **debajo** del puck
- Colores Brava: `#FF6B35` / casing `#CC4A1F`

**No afecta directamente la cámara**, pero define capas del mapa respecto al indicador de ubicación.

---

## 10. Controles usuario

`BravaMapboxControls.wire`:

- **Recenter / brújula:** `refreshCamera()` (schedule insets) + `navigationView.api.recenterCamera()`
- **Volumen:** mute/unmute `VoiceInstructionsPlayer`

---

## 11. Rutas y guidance (`BravaMapboxNavigation`)

Flujo:

1. `requestActiveGuidance(origin, dest)` → encola `PendingRoute`
2. Requiere: `boundNavigationView`, `mapSurfaceReady`, `MapboxNavigationApp.current()`
3. `nav.requestRoutes(RouteOptions... coordinatesList(origin, dest), alternatives=false)`
4. `view.api.startActiveGuidance(routes)` → `onActiveGuidanceStarted`

**Observers registrados en `onAttached`:**

- `RouteProgressObserver` → ETA, maniobras Brava, `maintainFlatFollowing`
- `RoutesObserver` → throttle 2.5s → `onRoutesRefreshed` → refresh insets
- `LocationObserver` → velocidad + `lastEnhancedLocationPoint`

---

## 12. UI Brava (no Mapbox stock)

| Elemento | Fuente datos |
|----------|----------------|
| Banner maniobra (distancia, calle, “Luego”) | `BravaNavManeuverFormat.fromBanner(...)` en route progress |
| Panel ETA / reloj / dirección | `BravaNavTripFormat` + extras del Intent |
| Orbe velocidad | GPS `speed` → km/h |
| Swipe “Llegué” | `BravaSwipeButton` → `RESULT_OK` |

Iconos de giro: prioridad banner Mapbox → upcoming step → step; ver `BravaNavManeuver.kt`.

---

## 13. Palancas para ajustar “puck al centro visual”

Orden recomendado al tunear:

1. **Confirmar bind** — logcat debe mostrar `ViewportDataSource bound`. Si no, arreglar bind antes de tocar focal.
2. **`FollowingFrameOptions.FocalPoint(x, y)`** — `(0.5, 0.5)` = centro del área tras padding. Subir `y` (ej. `0.55–0.62`) si el puck queda **bajo** respecto al hueco entre banner y panel.
3. **`followingPadding`** — hoy simétrico `max(top,bottom)`. Volver a asimétrico `EdgeInsets(top, side, bottom, side)` si querés compensar banner ≠ panel por separado.
4. **`maneuverTopReserveDp` (118)** — infla `topPad` aunque el banner esté oculto; bajarlo si sobra espacio arriba y la cámara empuja el puck.
5. **`framingStrategy`** — quitar `BravaPuckCenterFramingStrategy` restaura encuadre de geometría Mapbox (giros visibles adelante).
6. **`followingPitchPropertyOverride`** — quitar o no llamar `maintainFlatFollowing` permite pitch 3D stock.
7. **Side padding (`40dp`)** — más margen horizontal reduce zoom efectivo en calles estrechas.

---

## 14. Problemas conocidos / síntomas

| Síntoma | Causa probable |
|---------|----------------|
| Puck abajo-derecha, mapa “mira” al giro | Viewport no bound **o** framing stock (geometría del step) |
| Vista 3D en rectas | `ViewportDataSource NOT bound` o pitch override no aplicado |
| Puck desaparece | Regresiones pasadas por zoom extremo o padding MapView (evitar `setPadding` UI) |
| Banner flecha recta pero mapa gira izq. | Banner Mapbox aún dice straight; lógica en `BravaNavManeuver` / upcoming step |
| Cámara salta al mostrar banner | Mitigado con `maneuverTopReserveDp` fijo + insets no atados solo a visibilidad GONE |

---

## 15. Publicación APK

Script: `BravaBurgers/scripts/publish-repartidor-native-release.ps1`

- `-PushGit` → commit manifest + push `main`
- GitHub Release tag: `repartidor-native-v{versionCode}`
- Manifest: `BravaBurgers/repartidor-native-update.json`
- FCM `app_update` a tokens repartidor

Requiere `MAPBOX_ACCESS_TOKEN` en `repartidor-native-android/local.properties` para build local.

---

## 16. Código fuente completo (archivos cortos de cámara)

Los archivos grandes viven en el repo; estos son los que más se copian para revisión externa.

### `BravaMapboxViewportPadding.kt` (completo)

Ver: `app/src/main/java/.../mapbox/BravaMapboxViewportPadding.kt` (~47 líneas)

### `BravaPuckCenterFramingStrategy.kt` (completo)

Ver: `app/src/main/java/.../mapbox/BravaPuckCenterFramingStrategy.kt` (~50 líneas)

### `BravaMapboxControls.kt` (completo)

Ver: `app/src/main/java/.../mapbox/BravaMapboxControls.kt` (~35 líneas)

### `BravaMapboxCameraAnchor.kt`

Ver: `app/src/main/java/.../mapbox/BravaMapboxCameraAnchor.kt` (~290 líneas) — **archivo principal de cámara**.

### `BravaMapboxDeliveryActivity.kt` — funciones cámara

- `applyNavigationCameraOnce()`
- `applyMapContentInsets()`
- `onActiveGuidanceStarted` (reintentos viewport)
- Constantes `maneuverTopReserveDp`

Ruta: `app/src/main/java/.../mapbox/BravaMapboxDeliveryActivity.kt`

---

## 17. Entrada a la pantalla de navegación

`NavigationScreen.kt` prepara coordenadas y lanza:

```kotlin
BravaMapboxDeliveryActivity.intent(
    context, orn, originLat, originLng, destLat, destLng, addressLine
)
```

Extras: `EXTRA_ORN`, `EXTRA_ORIGIN_*`, `EXTRA_DEST_*`, `EXTRA_ADDRESS`.

---

## 18. Changelog cámara (resumen interno)

| Release | Notas cámara |
|---------|----------------|
| alpha78–81 | Iteraciones DiDi UI, pitch 45, factory padding |
| alpha82–83 | Pitch 0, desactivar frame-after-maneuver, iconos maniobra |
| alpha84 (86) | `BravaPuckCenterFramingStrategy`, focal 0.5/0.5, padding vertical simétrico, `intersectionDensityCalculation` off |

---

*Generado para el repo Brava Burgers — carpeta `repartidor-native-android`. Actualizar este doc cuando cambien `BravaMapboxCameraAnchor` o el flujo de `NavigationView`.*
