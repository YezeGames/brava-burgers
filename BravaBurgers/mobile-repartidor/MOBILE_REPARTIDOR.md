# Brava Repartidor — app Android (Capacitor)

La app carga la web de producción (`/repartidor/` en Vercel). Cambios de UI/API no requieren nuevo APK salvo plugins nativos o permisos.

## Requisitos en Windows

- **Android Studio** (SDK instalado con el wizard Standard).
- **Node.js LTS** (`node`, `npm`).
- **JDK 21** (Microsoft OpenJDK) para compilar por terminal. Android Studio trae Java 25; Gradle en consola usa JDK 21.
- Variables de entorno (recomendado, Panel → Sistema → Variables):

  - `JAVA_HOME` = `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot` (ajustá si cambia la versión)
  - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
  - Agregar al `Path`: `%ANDROID_HOME%\platform-tools`

  En PowerShell por sesión: `. .\scripts\env-android.ps1`

## Comandos

```powershell
cd BravaBurgers\mobile-repartidor
npm install
npx cap add android   # solo la primera vez (ya en repo si está commiteado)
npx cap sync android
npx cap open android
```

En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

APK debug: `android\app\build\outputs\apk\debug\app-debug.apk`

## Icono y splash

1. Reemplazá el logo fuente: `mobile-repartidor/assets/logo.png` (cuadrado, ideal **1024×1024**, PNG).
2. Regenerá iconos Android:

```powershell
cd mobile-repartidor
npm run icons:android
```

3. Volvé a compilar el APK (`assembleDebug` o `build-repartidor-release.ps1`).

Fondo del icono adaptativo: naranja Brava `#FF6B35`. Splash: fondo `#0b141a`.

## APK release firmado (WhatsApp)

Desde `BravaBurgers` en PowerShell (JDK 21 + `ANDROID_HOME`; opcional `. .\scripts\env-android.ps1`):

```powershell
.\scripts\build-repartidor-release.ps1
```

- Crea **una vez** `secrets/brava-repartidor-release.jks` + contraseñas en `secrets/brava-repartidor-release.properties` (gitignored).
- Salida: `mobile-repartidor/android/app/build/outputs/apk/release/app-release.apk` y copia en `secrets/brava-repartidor-release.apk`.
- **Hacé backup del `.jks`** (OneDrive/USB): sin eso no podés publicar updates con la misma firma.

Manual: copiá `android/keystore.properties.example` → `android/keystore.properties` y `assembleRelease`.

## Push (FCM)

Configuración paso a paso: **`FIREBASE_REPARTIDOR.md`** (`google-services.json` + `FIREBASE_SERVICE_ACCOUNT_JSON` en Vercel).

## GPS en background (seguimiento al cliente)

Con entregas **en camino**, el APK usa `@capacitor-community/background-geolocation`: notificación persistente en la barra. Desde **1.3.3**, el plugin nativo **`BravaRepartoSession`** escucha ese GPS y manda `reportTrack` al API **sin pasar por el WebView**; al prender la pantalla, `getLastPosition` actualiza el mapa del repartidor. Requiere **CapacitorHttp** (`useLegacyBridge: true` en `capacitor.config.json`). Tras `npm install`, el script `scripts/patch-bg-geo-service.ps1` aplica el parche FGS (también en `build-repartidor-release.ps1`).

## Próximas fases

- Check de versión + URL del APK.
- APK release firmado.
