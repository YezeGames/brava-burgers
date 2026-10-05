# Alpha 57 — Mapbox Navigation SDK

## Tokens (obligatorio para compilar)

En `local.properties` (no commitear):

```properties
MAPBOX_ACCESS_TOKEN=pk.eyJ...   # token público Mapbox
MAPBOX_DOWNLOADS_TOKEN=sk.eyJ... # secret con scope DOWNLOADS:READ
```

- [Access tokens](https://account.mapbox.com/access-tokens/)
- El **downloads token** es distinto del PK; username Maven siempre es `mapbox`.

## Build

```powershell
cd repartidor-native-android
.\gradlew.bat :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Qué cambió

- **Eliminado:** MapLibre, OSRM, Valhalla, animadores/matcher caseros, `BravaMapView`.
- **Nuevo:** `com.mapbox.navigation:ui-dropin:2.20.4` + `NavigationView` en navegación y pestaña Mapa (free drive).
- **Flujo:** geocode destino → `MapboxNavigationApp.requestRoutes` → **`NavigationView.api.startActiveGuidance(routes)`** (no usar `startTripSession()` manual con drop-in).
- **No mezclar** core SDK “a mano” con drop-in: crashea el state machine de Mapbox.

## Pantallas

- **Iniciar entrega / Continuar** → `nav/{orn}` con mapa Mapbox full-screen + barra Brava (Llegué).
- Mapbox administra voz turn-by-turn en el drop-in UI (toggle voz Brava queda como preferencia UI legacy).
