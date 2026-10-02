# Paridad con Mapbox Navigation (código abierto)

Referencias oficiales ([Apache 2.0](https://github.com/mapbox/mapbox-navigation-android)):

| Mapbox (OSS) | Qué hace | Brava |
|--------------|----------|--------|
| [`LocationMatcherResult`](https://github.com/mapbox/mapbox-navigation-android/blob/main/navigation/src/main/java/com/mapbox/navigation/core/trip/session/LocationMatcherResult.kt) | `enhancedLocation`, `keyPoints`, **`isTeleport`**, `isDegradedMapMatching` | `BravaLocationMatcherResult` (Kotlin) |
| [`NavigationLocationProvider`](https://github.com/mapbox/mapbox-navigation-android/blob/main/ui-maps/src/main/java/com/mapbox/navigation/ui/maps/location/NavigationLocationProvider.kt) | Anima **solo** `enhancedLocation`; si `isTeleport` → duración **0** | `BravaLocationAnimator` |
| [`ViewportDataSourceProcessor.getSmootherBearingForMap`](https://github.com/mapbox/mapbox-navigation-android/blob/main/ui-maps/src/main/java/com/mapbox/navigation/ui/maps/camera/data/ViewportDataSourceProcessor.kt) | Rumbo cámara | `BravaBearingSmoother` / `bearingSmoother.js` |
| **`mapbox-navigation-native` (matcher C++)** | Snap a grafo vial, speed coherente, parado estable | **No portable** (binario / licencia). Sustituto Brava: ancla parado + proyección OSRM/Valhalla solo en movimiento real |

## Regla que Mapbox cumple y nosotros imitamos

```text
GPS crudo  →  map matcher  →  enhancedLocation  →  NavigationLocationProvider (~1 s)
                ↑                          ↑
         off-route / voz              NUNCA animar crudo con speed falsa
```

En Brava:

- **Crudo** → reruta, voz, off-route (`RepartidorViewModel.commitNavDriverFix`).
- **`BravaOpenMapMatcher`** → posición “enhanced” (ancla en casa; snap a polyline solo tras desbloqueo).
- **Animador** → igual que Mapbox: segmento ~1 s, salto grande = teleport (duración 0).

## Por qué en casa “no se siente igual”

Mapbox en parado usa el **matcher nativo** (no publicado). Sin eso, pegar el puck a la polyline cuando el chip inventa ~5 km/h reproduce el bug de “deslizar a la calle”. Por eso el bloqueo de salida imita `isDegradedMapMatching` + no animar teleports.

## Valhalla (substituto parcial del matcher nativo)

| Uso | Endpoint | Capa |
|-----|----------|------|
| Puck en movimiento | **`/locate` solo** | `ValhallaMapMatcher.locateForDisplay` → `applyValhallaLocate` |
| Voz / reruta / off-route | GPS crudo | `commitNavDriverFix` (nunca Valhalla) |
| Parado en casa | — | Valhalla **off** (`isStationaryLocked`) |

**No** usar `trace_route` en vivo: re-traza geometry y saltaba maniobras. Trace solo vía API `mode: "trace"` para herramientas.

Validaciones: snap ≤42 m del crudo; paso máximo según speed; si `/locate` cae en calle paralela → proyección OSRM.

Detalle OSS (MapLibre SnapToRoute + Ferrostar): [MATCHER_OSS_RESEARCH.md](./MATCHER_OSS_RESEARCH.md).
