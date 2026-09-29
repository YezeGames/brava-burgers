# Brava Repartidor — APK nativa (Kotlin + Compose)

App **sin WebView** · API: `https://www.bravaburgers.com.ar/api/pedido`  
UI según `demo-repartidor-native-ui.html` y `REPARTIDOR_NATIVE_ANDROID.md`.

**Application ID:** `app.bravaburgers.repartidor.nativeapp` (distinto de Capacitor: `app.bravaburgers.repartidor`).

**Prueba de rendimiento:** desinstalá o cerrá sesión en la **APK Capacitor** vieja (`app.bravaburgers.repartidor`). Con sesión activa, esa app hace `listRuta` en background (~cada 28 s) y compite por el mismo repartidor en el servidor (no comparten datos en el teléfono, pero sí cargan la API). La nativa no acumula “basura” de versiones viejas: si hay lag, suele ser red (OSRM/geocode) o dos apps repartidor a la vez — no hace falta borrar datos de Android salvo reinstalar la APK nativa para limpiar caché del mapa.

## Abrir en Android Studio

1. **File → Open** → carpeta `BravaBurgers/repartidor-native-android`
2. Dejá que Gradle sincronice (JDK **17**).
3. **Run** en dispositivo o emulador.

Por terminal (con wrapper generado o desde Studio):

```powershell
cd BravaBurgers\repartidor-native-android
.\gradlew.bat assembleDebug
```

APK debug: `app/build/outputs/apk/debug/app-debug.apk`

## Estado actual (alpha20)

| Hecho | Pendiente |
|-------|-----------|
| Login · lista · pull-to-refresh · multi-parada | |
| **Voz GPS** (TTS turn-by-turn, chip Voz ON/OFF en mapa) | |
| MapLibre · OSRM · maniobra · geocode | Mismo `applicationId` prod |
| **Ruta:** Supabase **Realtime** (websocket) + **FCM** — **sin poll** | |
| **GPS:** FGS solo en camino · `reportTrack` ~16 s | |
| Entrega COBRAR/PAGO · Llamar · auto sig. parada | |

### Modelo nativo (sin pagar extra)

Usa el **mismo Supabase gratis** que el admin (Realtime incluido en el plan free).

1. **Cocina publica ruta** → fila en `repartidor_route_events` + **FCM**.
2. App con sesión abierta → **websocket** refresca la lista al instante (pantalla on/off, mientras Android mantenga el proceso).
3. App matada / Doze fuerte → **FCM** despierta y avisa.
4. **Sin timers** en la app.

**Una vez en Supabase/Vercel:**

- SQL: `supabase/repartidor-realtime-events.sql` (SQL Editor o migración con `SUPABASE_DB_PASSWORD`).
- Vercel: `SUPABASE_JWT_SECRET` = **Legacy JWT Secret** (Supabase → Settings → **JWT Keys**).
- Automatizar: `secrets/supabase-jwt.txt` + `$env:VERCEL_TOKEN` → `.\scripts\setup-repartidor-vercel-realtime.ps1`

**FGS** solo con entrega **en camino** (GPS cliente). Esperando turno: Realtime + FCM, sin notificación permanente.

### FCM (obligatorio para ruta en background)

1. Firebase → **brava-repartidor** → app Android **`app.bravaburgers.repartidor.nativeapp`**.
2. Reemplazar `app/google-services.json` con el descargado.
3. Permisos: **ubicación** + **notificaciones**; batería sin restricción recomendado en moto.

## API key

Si en Vercel tenés `REPARTIDOR_APP_KEY`, agregá en `app/build.gradle.kts` un `buildConfigField` o seteá `repository.apiKey` en código de debug.

## Próximo paso

Integrar **MapLibre Android** con `MAP_STYLE` (CARTO Voyager) y servicio en primer plano para ubicación.
