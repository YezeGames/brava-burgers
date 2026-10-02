# brava-nav-core

Matemática de navegación **$0** (Valhalla/OSRM + MapLibre). Piezas adaptadas del [Mapbox Navigation SDK](https://github.com/mapbox/mapbox-navigation-android) (**Apache 2.0**) donde el código es público. Ver **[MAPBOX_PARITY.md](./MAPBOX_PARITY.md)** (qué es 1:1 con el repo y qué no — el matcher nativo es cerrado).

## Módulos

| Módulo | Uso |
|--------|-----|
| `bearingSmoother` | Rumbo de cámara / puck |
| `locationAnimator` | GPS ~1 Hz → display ~60 FPS |
| `offRouteDetector` | Histéresis + velocidad mínima → reroute Valhalla |
| `voiceTrigger` | Tiers TTS por metros **along-route** |

## Regla de capas

- **GPS crudo** → off-route, voz, reroute.
- **Salida del animador** → solo mapa (MapLibre GL / Native).

## Uso (Node / bundler)

```bash
cd lib/brava-nav-core && npm install
```

```js
import { createNavSession } from "@brava/nav-core";
```

## APK

Port Kotlin en `repartidor-native-android/.../navigation/core/` (misma lógica).
