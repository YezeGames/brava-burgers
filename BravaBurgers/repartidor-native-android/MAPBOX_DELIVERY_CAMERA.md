# Mapbox delivery — pantalla completa + NavigationCamera 3D

## Layout

- `NavigationView` `match_parent` edge-to-edge (`decorFitsSystemWindows = false`).
- Banner y barra Brava en `FrameLayout` **encima** del mapa; no se usa `MapView.setPadding` para UI.

## Cámara (Mapbox NavigationCamera / ViewportDataSource)

- `followingPadding` / `overviewPadding` = altura real banner + panel Brava.
- `defaultPitch` ≈ **50°** (3D navegación).
- `focalPoint (0.5, 0.78)` — puck en tercio inferior del área útil.
- **Sin** `followingZoomPropertyOverride` — zoom dinámico del SDK (velocidad + ruta).
- `maxZoom` 17.5 como techo; `maximizeViewableGeometryWhenPitchZero = false`.

Si logcat muestra `ViewportDataSource not ready`, reintentar tras `onMapAttached` (map observer).
