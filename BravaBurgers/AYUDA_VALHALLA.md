# Valhalla — repartidor Brava

## Resumen

1. **PC local:** Docker Valhalla en `:8002` → `infra/valhalla-local-pc/INSTALAR-VALHALLA-LOCAL.ps1`
2. **Túnel:** `run-quick-tunnel-and-vercel.ps1` o hostname fijo → `https://…/route`
3. **Vercel:** `BRAVA_VALHALLA_BASE_URL`, `BRAVA_ROUTING_ENGINE=valhalla` (`set-vercel-valhalla-url.ps1`)
4. **APK:** build con snap Valhalla (alpha36+); OTA cuando publiques

Sin túnel + Vercel, la app no llega a tu Valhalla en 4G.

## Variables Vercel

| Variable | Ejemplo |
|----------|---------|
| `BRAVA_VALHALLA_BASE_URL` | `https://valhalla.tudominio.com/route` |
| `BRAVA_ROUTING_ENGINE` | `valhalla` |
| `BRAVA_OSRM_BASE_URL` | opcional fallback |

## API (sin cambiar nombre legacy)

- `action=osrmRoute` → usa Valhalla primero si está configurado
- `action=valhallaMatch` → snap GPS (`/locate` / `/trace_route`)
- `action=osrmBases` → devuelve `valhalla` + `osrm`

Documentación detallada: `infra/valhalla-local-pc/README.md`
