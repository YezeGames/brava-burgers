# Valhalla en Brava (routing repartidor)

**Instalación Docker + túnel:** `infra/valhalla-local-pc/README.md` y `AYUDA_VALHALLA.md`.

Valhalla calcula **ruta + shape denso (polyline6)** y maniobras con `begin_shape_index` sobre esa geometría. La app usa ese shape para dibujar la línea y para **metros al giro** (`maneuverAlongRouteM`).

## Cableado

```text
APK / Vercel osrmRoute  →  BRAVA_VALHALLA_BASE_URL (Vercel env)
                                ↓
                         Túnel HTTPS (Cloudflare)
                                ↓
                         Valhalla POST /route  (PC del local)
```

- Variable en Vercel: **`BRAVA_VALHALLA_BASE_URL`** = URL pública terminada en `/route` (ej. `https://valhalla.tudominio.com/route`).
- **`BRAVA_OSRM_BASE_URL`** sigue como fallback si Valhalla no responde.
- Mapa en pantalla: **MapLibre + OSM** (no cambia).

## Probar desde la PC

```powershell
$body = @{
  locations = @(
    @{ lon = -58.482; lat = -34.505; type = "break" },
    @{ lon = -58.478; lat = -34.502; type = "break" }
  )
  costing = "auto"
  shape_format = "polyline6"
  directions_options = @{ language = "es-ES" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:8002/route" -Method Post -Body $body -ContentType "application/json"
```

Debe devolver `trip.legs[].shape` y `maneuvers[].begin_shape_index`.

## Map-matching / progreso (Valhalla completo en navegación)

Con Valhalla configurado, en navegación la APK:

1. **Ruta** — `POST /route` → shape denso + maniobras en el shape.
2. **GPS en vivo** — buffer de fixes → `POST /trace_route` (`map_snap`) o `/locate` → posición **en calle**.
3. **Metros al giro / voz** — `NavRouteProgress` sobre el shape de la ruta usando la posición matched (no el GPS crudo).

API opcional: `POST /api/pedido` `{ "action": "valhallaMatch", "lat", "lng", "trail": [...] }` si el celular no llega directo al túnel.

Modo estricto en Vercel: **`BRAVA_ROUTING_ENGINE=valhalla`** (sin fallback OSRM/ORS en el proxy).

## APK

Con `BRAVA_VALHALLA_BASE_URL` en Vercel, `osrmBases` expone `valhalla` y la app intenta **Valhalla directo por túnel** antes que OSRM. Publicá APK nueva para snap + etiqueta «snap Valhalla» en meta.
