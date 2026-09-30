# Valhalla — repartidor Brava

## Resumen

1. **PC local:** Docker Valhalla en `:8002` → `infra/valhalla-local-pc/INSTALAR-VALHALLA-LOCAL.ps1`
2. **Túnel:** `run-quick-tunnel-and-vercel.ps1` o hostname fijo → `https://…/route`
3. **Vercel:** `BRAVA_VALHALLA_BASE_URL`, `BRAVA_ROUTING_ENGINE=valhalla` (`set-vercel-valhalla-url.ps1`)
4. **APK:** build con snap Valhalla (alpha36+); OTA cuando publiques

Sin túnel + Vercel, la app no llega a tu Valhalla en 4G.

## Dominio fijo (bravaburgers.com.ar)

Subdominios recomendados:

| Host | Puerto local | Uso |
|------|----------------|-----|
| `valhalla.bravaburgers.com.ar` | 8002 | Valhalla (`/route`, `/locate`, `/trace_route`) |
| `osrm.bravaburgers.com.ar` | 5000 | Fallback OSRM (opcional) |

**Una sola vez** en la PC (requiere login en el navegador):

```powershell
cd BravaBurgers\infra\routing-local-pc
# Tras cloudflared tunnel login + tunnel create brava-routing:
.\setup-tunnel-bravaburgers.ps1 -TunnelUuid <UUID-del-tunel>
```

En Cloudflare DNS (zona `bravaburgers.com.ar`), CNAME **proxied**:

- `valhalla` → `<UUID>.cfargotunnel.com`
- `osrm` → `<UUID>.cfargotunnel.com`

Cada día de reparto:

```powershell
.\start-reparto-dia.ps1          # Docker OSRM + Valhalla
.\run-tunnel-bravaburgers.ps1    # túnel fijo (no trycloudflare)
```

Vercel producción:

```powershell
cd ..\valhalla-local-pc
.\set-vercel-valhalla-url.ps1 -Url "https://valhalla.bravaburgers.com.ar/route"
```

Plantilla: `infra/routing-local-pc/tunnel-config.bravaburgers.example.yml`

## Variables Vercel

| Variable | Ejemplo |
|----------|---------|
| `BRAVA_VALHALLA_BASE_URL` | `https://valhalla.bravaburgers.com.ar/route` |
| `BRAVA_ROUTING_ENGINE` | `valhalla` |
| `BRAVA_OSRM_BASE_URL` | opcional fallback |

## API (sin cambiar nombre legacy)

- `action=osrmRoute` → usa Valhalla primero si está configurado
- `action=valhallaMatch` → snap GPS (`/locate` / `/trace_route`)
- `action=osrmBases` → devuelve `valhalla` + `osrm`

Documentación detallada: `infra/valhalla-local-pc/README.md`
