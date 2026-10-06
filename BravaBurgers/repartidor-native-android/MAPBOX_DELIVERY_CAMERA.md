# Mapbox + UI Brava (repartidor)

## Producto

- **Mapbox drop-in** a pantalla completa: cámara y puck **como Mapbox** (encuadre de ruta, focal por defecto).
- **Sin 3D**: `defaultPitch = 0` + `followingPitchPropertyOverride(0)`.
- **UI Brava encima**: maniobras, ETA, swipe, km/h, brújula / volumen / centrar (Mapbox oculta sus FABs).

## Único ajuste de cámara

`followingPadding` = espacio para banner de maniobra (arriba) y panel ETA+swipe (abajo).  
No usamos `MapView.setPadding` grande (rompe el tamaño del mapa).

## Botones Brava

Llaman a la API drop-in: `navigationView.api.recenterCamera()` y voz Mapbox.

Guía: [Navigation camera](https://docs.mapbox.com/android/navigation/guides/ui-components/camera/)
