# Mapbox — cámara para app de reparto (Brava)

Referencia interna alineada con [Navigation camera](https://docs.mapbox.com/android/navigation/guides/ui-components/camera/) (SDK 2.20.x).

## Drop-in + UI Brava

Usamos `NavigationView` a pantalla completa y **paneles propios** (maniobras, ETA, swipe). El panel inferior de Mapbox está oculto (`infoPanelForcedState = HIDDEN`).

La cámara **no** se configura con `customizeViewOptions` (solo estilos/ruta). Hay que tocar `MapboxNavigationViewportDataSource` del drop-in (ver `BravaMapboxCameraAnchor`).

## Padding (espacio para UI)

```text
followingPadding = EdgeInsets(top, side, bottom, side)
```

- **top**: banner de maniobra + status bar (reserva fija ~88dp + insets).
- **bottom**: panel ETA + swipe.
- **side**: márgenes para FABs Brava.

## Puck centrado (estilo Maps) vs default Mapbox

| | Default Mapbox turn-by-turn | Brava (delivery, puck centrado) |
|---|---------------------------|----------------------------------|
| Focal point | `(0.5, 1.0)` — puck abajo | `(0.5, 0.5)` — centro de la banda útil |
| `maximizeViewableGeometryWhenPitchZero` | `true` — cámara persigue geometría de ruta | `false` — respeta focal (menos “salto” tras giros) |
| Pitch | puede ser 0 en ciudad | `0` (top-down); subir a ~35–45 si queremos look “navegación 3D” |

Con `maximizeViewableGeometryWhenPitchZero = true` y pitch 0, **focalPoint no aplica** y el puck se mueve para encuadrar la ruta (síntoma: cámara rara después de doblar hasta que recalcula).

## MapView.setPadding

No usar padding simétrico grande en `MapView` (achica el mapa a un “cuadrado”). Solo `followingPadding` en el viewport de navegación.

## Recálculo de ruta

`RoutesObserver` + `recenterCamera()` tras cambio de rutas (off-route / reroute).
