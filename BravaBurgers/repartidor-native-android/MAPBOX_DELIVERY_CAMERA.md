# Mapbox + UI Brava (repartidor) — perfil cámara tipo DiDi (plano)

## Producto

- **NavigationView** a pantalla completa; maniobras, ETA, swipe y FABs Brava **flotan encima** (no recortan el `MapView` salvo fallback).
- **Mapa oscuro** Mapbox; ruta naranja Brava (`BravaMapboxDropInUi`).

## Objetivo vs captura DiDi (referencia)

| Objetivo | Cómo en Brava (`BravaMapboxCameraAnchor`) |
|----------|-------------------------------------------|
| Ver mucho camino adelante (~800 m), no zoom en la esquina | `maximizeViewableGeometryWhenPitchZero = false`, `maxZoom` + `followingZoomPropertyOverride` ≈ **13.15** |
| Flecha (puck) abajo-centro, no tapada por panel | `focalPoint (0.5, 0.80)` + `followingPadding` inferior = alto panel + nav bar + margen |
| Heading-up / ruta “hacia arriba” | Modo following Mapbox; `followingBearingPropertyOverride(null)` |
| Plano tipo DiDi 2D (sin 3D fuerte) | `defaultPitch = 0`, `followingPitchPropertyOverride(0)` |
| UI respeta zona segura | `BravaMapboxDeliveryActivity.applyMapContentInsets` → padding top (banner) y bottom (barra) |

Si el **ViewportDataSource** no enlaza (log `ViewportDataSource not ready`), solo aplica padding de `MapView` y **no** el tope de zoom — por eso `retryViewportBinding` + refresh al iniciar ruta.

## No hacemos

- Pitch 30–45° “Google 3D” (rompió sensación y encuadre en pruebas previas).
- `startTripSession` manual mezclado con drop-in.

Guía Mapbox: [Navigation camera](https://docs.mapbox.com/android/navigation/guides/ui-components/camera/)
