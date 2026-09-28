# Repartidor APK — plan Capacitor Pro (marzo 2026)

## Fase A (esta entrega)

- API repartidor vía **CapacitorHttp** en APK (mejor con GPS en background).
- Push FCM: **ruta vacía**, **modificada**, **paradas quitadas**, assign.
- App: alertas cuando **sacan** paradas o **limpian** ruta (poll + push).
- **TTS nativo** en navegación (`@capacitor-community/text-to-speech`).
- Poll backup **8 s** (antes 18 s).
- Botón **batería sin restricciones** en pantalla de permisos.

## Probar

1. APK **1.3.0** release (`build-repartidor-release.ps1`).
2. Permisos + batería sin límites.
3. Publicar / modificar / vaciar ruta en Reparto → push + sonido.
4. Iniciar recorrido → minimizar → seguimiento cliente ~2 min.

## Siguiente (Fase B)

- Sonido custom por tipo de evento.
- Tap notificación → pantalla concreta.
- Cola offline de `reportTrack`.
- Check versión APK en Vercel.
