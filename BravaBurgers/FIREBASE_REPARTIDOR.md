# Push FCM — app repartidor Android

## Atajo (Windows, recomendado)

En PowerShell, desde la carpeta `BravaBurgers`:

```powershell
.\scripts\setup-firebase-repartidor.ps1
```

Solo tenés que **iniciar sesión con Google** cuando se abre el navegador y **guardar un JSON** cuando el script te lo pida. Opcional: `$env:VERCEL_TOKEN = "..."` antes del script para subir la clave a Vercel solo.

---

## Manual — 1. Firebase Console

1. [Firebase Console](https://console.firebase.google.com/) → **Agregar proyecto** (ej. `brava-repartidor`).
2. **Agregar app** → **Android**.
3. **Nombre del paquete:** `app.bravaburgers.repartidor` (igual que el APK).
4. Descargá **`google-services.json`** y copialo a:

   `BravaBurgers/mobile-repartidor/android/app/google-services.json`

   (No subas este archivo a GitHub si preferís; en el repo hay un `.example`.)

5. Volvé a compilar el APK (`assembleDebug` o Android Studio).

## 2. Cuenta de servicio (servidor Vercel)

1. Firebase → **Configuración del proyecto** → **Cuentas de servicio**.
2. **Generar nueva clave privada** → JSON.
3. En **Vercel** → Environment Variables:

   - **`FIREBASE_SERVICE_ACCOUNT_JSON`** = contenido **completo** del JSON en **una línea** (minificado).

4. Redeploy del sitio en Vercel.

## 3. Supabase

Tabla `repartidor_push_tokens`:

- Admin → consola de red con token, acción **`migrateRepartidorPush`**, o
- SQL Editor → pegar `supabase/repartidor-push-tokens.sql`.

## 4. Probar

1. Instalá APK nuevo (con `google-services.json`).
2. Entrá como repartidor → **Permitir ubicación y alertas** (registra FCM).
3. Desde admin **Reparto**, publicá ruta a ese repartidor.
4. Con la app minimizada debería llegar la notificación.

Si `push_notify` en la respuesta del admin dice `firebase_not_configured`, falta la variable en Vercel.  
Si dice `no_device_tokens`, el repartidor no registró token (reabrí app y repetí permisos).
