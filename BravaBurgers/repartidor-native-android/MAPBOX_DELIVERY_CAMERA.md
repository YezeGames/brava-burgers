# Mapbox delivery — full screen + NavigationCamera

## Layout
- `NavigationView` edge-to-edge; overlays con `WindowInsets` (status + nav bar).
- Sin `MapView.setPadding` para UI Brava.

## Cámara
- `followingPadding` según banner + panel + system bars.
- Perfil Mapbox: pitch 45°, focal (0.5, 0.68), zoom dinámico (sin override fijo).
- `recenterCamera()` solo al iniciar guía y botón recentrar.

## Ruta
- `withRouteLineBelowLayerId("mapbox-location-indicator-layer")` — puck sobre la línea.

## Viewport
- Enlace desde `MapboxNavigation.onAttached` + retry en map ready.
- Log: `ViewportDataSource bound from MapboxNavigation`.
