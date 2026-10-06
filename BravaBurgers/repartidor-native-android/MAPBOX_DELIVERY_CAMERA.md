# Mapbox delivery — UI Brava + cámara Mapbox default

## UI Brava
- Drop-in con paneles Mapbox ocultos; banner, ETA, swipe, FABs propios.
- `WindowInsets` en overlays; mapa edge-to-edge.

## Cámara
- **Sin** tocar `FollowingFrameOptions` (pitch, focal, zoom = SDK).
- Solo `followingPadding` / `overviewPadding` según altura banner + panel + system bars.
- Limpieza de overrides viejos (`followingZoomPropertyOverride(null)`, etc.).
- Ruta bajo puck: `mapbox-location-indicator-layer`.

## Si el viewport no enlaza
Log `ViewportDataSource not ready` → padding no aplicado; cámara 100% default pero puck puede quedar bajo UI Brava.
