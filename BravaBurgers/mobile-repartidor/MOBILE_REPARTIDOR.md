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

## Firma release (WhatsApp)

Generar keystore una sola vez y guardarlo en lugar seguro. Configurar signing en `android/app/build.gradle` o Android Studio → Generate Signed Bundle/APK.

## Push (FCM)

Configuración paso a paso: **`FIREBASE_REPARTIDOR.md`** (`google-services.json` + `FIREBASE_SERVICE_ACCOUNT_JSON` en Vercel).

## Próximas fases

- GPS en background.
- Check de versión + URL del APK.
- APK release firmado.
