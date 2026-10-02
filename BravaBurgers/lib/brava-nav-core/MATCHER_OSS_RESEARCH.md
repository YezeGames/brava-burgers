# Matcher open source — qué copiar y qué no

Referencias para **Brava nav** (opción 3: seguir MapLibre + Valhalla propio).

## 1. MapLibre Navigation Android

Repo: [maplibre/maplibre-navigation-android](https://github.com/maplibre/maplibre-navigation-android)

| Pieza | Archivo | Idea clave |
|-------|---------|------------|
| **Snap al step actual** | `snap/SnapToRoute.kt` | Proyección Turf `nearestPointTo` sobre **geometría del step actual**, no toda la ruta. |
| **Bearing en calle** | mismo | `locateAlong(distanceTraveled + 1 m)` sobre el step; fallback `lastSnappedBearing`. |
| **Off-route antes de snap** | `offroute/OffRouteDetector.kt` | Si estás lejos del step → no fingir que vas bien; tolerancia `max(dynamic, accuracy×interval)`. |
| **Histéresis reruta** | mismo | Ring buffer 3 fixes “alejándose de la maniobra”; mínimo 50 m tras reruta. |
| **Motor** | `MapLibreNavigationEngine` | Orden: location cruda → off-route → **snapEngine** → UI. |

**No trae:** map matching a grafo OSM (solo snap a polyline del step).

## 2. Ferrostar (Stadia)

Repo: [stadiamaps/ferrostar](https://github.com/stadiamaps/ferrostar)

| Pieza | Archivo | Idea clave |
|-------|---------|------------|
| **Snap geométrico** | `common/ferrostar/src/algorithms.rs` | `snap_user_location_to_line` = closest point haversine en `LineString`. |
| **Course** | `apply_snapped_course` | Bearing = geodesic al **siguiente** vértice del segmento. |
| **Desvío** | `deviation_detection.rs` | `StaticThreshold`: si `horizontal_accuracy` peor que umbral → **no** marcar off-route (túnel/casa). |
| **Off-route fino** | mismo | Distancia al step actual; si falla, buscar en **steps futuros** (`OffStepOnRoute` vs `CompletelyOffRoute`). |
| **UI** | `CourseFiltering.SnapToRoute` | `location` cruda vs `snappedLocation` para puck (como Mapbox enhanced). |

**No trae:** Valhalla `/locate` dentro del core; routing sí.

## 3. Valhalla (backend Brava)

| API | Uso matcher Brava |
|-----|-------------------|
| **`/locate`** | Puck en movimiento (enhanced), con límites de salto. |
| **`/trace_route`** | **No** en vivo (re-traza y salta maniobras). |

## 4. Receta Brava “buen matcher” (capas)

```text
GPS crudo
  → BravaStationaryGpsController (parado en salida; speed mentirosa)
  → off-route / voz / reruta (siempre crudo)
  → BravaStepLineSnap (snap al tramo del step actual — estilo MapLibre)
  → opcional Valhalla /locate async (refinar, con techo de metros)
  → BravaLocationAnimator + isTeleport
```

### Reglas concretas (de OSS)

1. **Snap solo si** `offRouteM ≤ max(50 m, accuracy×2)` (Ferrostar + MapLibre).
2. **Snap al step actual**, no avanzar `alongRoute` con speed GPS falsa (evita deslizar en casa).
3. **Ignorar fixes** con accuracy peor que ~48 m para mover puck (Ferrostar).
4. **Valhalla locate** solo si desbloqueado y movimiento físico real.
5. **Bearing** = tangente al step (+1 m adelante), congelado si speed &lt; 5 km/h.

Implementación Kotlin: `BravaStepLineSnap.kt`, `BravaOpenMapMatcher.kt`.
