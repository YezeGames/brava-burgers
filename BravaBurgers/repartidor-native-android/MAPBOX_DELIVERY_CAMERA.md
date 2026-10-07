# Navegación Brava — mapa plano + iconos de giro

## Cámara
- Pitch **0** (vista desde arriba), sin inclinar en maniobras.
- `maximizeViewableGeometryWhenPitchZero = false` (no zoom raro al doblar).
- Zoom dinámico Mapbox (sin override fijo).
- `followingPadding` = banner + panel Brava + system bars.

## Maniobras (banner)
- Icono desde **banner Mapbox** (`primary.type` / `primary.modifier`), luego `upcomingStep`, luego step actual.
- Flecha izquierda/derecha/recto según modifier Mapbox (`left`, `right`, `straight`, etc.).
