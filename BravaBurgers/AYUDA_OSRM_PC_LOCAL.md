# OSRM en la PC del local (USD 0)

Guía completa: [`infra/osrm-local-pc/README.md`](infra/osrm-local-pc/README.md)

## Un solo comando (administrador)

PowerShell **como administrador**:

```powershell
cd C:\Users\Yezeg\Documents\BravaBurgers\BravaBurgers\infra\osrm-local-pc
.\INSTALAR-OSRM-LOCAL.ps1
```

Si pide **reinicio** (WSL/Docker), reiniciá y volvé a ejecutar el mismo script.

## Después del túnel

```powershell
.\set-vercel-osrm-url.ps1 -Url "https://osrm.bravaburgers.com.ar/route/v1/driving"
```

(`VERCEL_TOKEN` en variable de entorno o en un `.env` local — ver script.)

La app repartidor **no se reinstala**: usa `osrmRoute` en Vercel, que apunta a tu PC.

## OpenRouteService (mientras no hay Docker)

1. Guardá la key en `secrets/openrouteservice-api-key.txt` (una línea, gitignored).
2. Ejecutá: `BravaBurgers\scripts\set-vercel-openrouteservice-from-secrets.ps1`

La API Brava usa **cache + OSRM gratis + ORS solo si hace falta** (ahorra cuota).
