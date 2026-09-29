# Brava Repartidor — APK nativa (Kotlin + Compose)

App **sin WebView** · API: `https://www.bravaburgers.com.ar/api/pedido`  
UI según `demo-repartidor-native-ui.html` y `REPARTIDOR_NATIVE_ANDROID.md`.

**Application ID:** `app.bravaburgers.repartidor.nativeapp` (instala junto a la APK Capacitor mientras desarrollamos).

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

## Estado actual (alpha3)

| Hecho | Pendiente |
|-------|-----------|
| Login · lista · pull-to-refresh · multi-parada | FCM push ruta |
| MapLibre (CARTO/OSM) · OSRM · maniobra | Realtime Supabase |
| FGS GPS · `reportTrack` ~16 s | Voz navegación nativa |
| Entrega COBRAR/PAGO · Llamar · auto sig. parada | Mismo `applicationId` prod |

## API key

Si en Vercel tenés `REPARTIDOR_APP_KEY`, agregá en `app/build.gradle.kts` un `buildConfigField` o seteá `repository.apiKey` en código de debug.

## Próximo paso

Integrar **MapLibre Android** con `MAP_STYLE` (CARTO Voyager) y servicio en primer plano para ubicación.
