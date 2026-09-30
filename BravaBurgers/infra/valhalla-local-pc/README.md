# Valhalla en la PC del local (USD 0)

Motor **principal** de Brava: ruta (`/route`), map-matching (`/trace_route`, `/locate`). El mapa en el celular sigue siendo **MapLibre + OSM**.

## Flujo

```text
APK / Vercel (osrmRoute, valhallaMatch)
        ↓
BRAVA_VALHALLA_BASE_URL  +  BRAVA_ROUTING_ENGINE=valhalla
        ↓
Cloudflare Tunnel (HTTPS)
        ↓
PC :8002  (Docker Valhalla)
```

Comparte el **mismo recorte OSM** que OSRM: `infra/osrm-local-pc/data/brava-zona.osm.pbf`.

## Requisitos

| Item | Detalle |
|------|---------|
| PC | Windows 10/11, **8 GB+ RAM**, Docker Desktop |
| Disco | ~15 GB (PBF Argentina + tiles Valhalla zona) |
| Internet | PC encendida + túnel activo mientras reparten |

## Instalación (una vez)

```powershell
cd BravaBurgers\infra\valhalla-local-pc
.\INSTALAR-VALHALLA-LOCAL.ps1
```

O manual:

```powershell
cd BravaBurgers\infra\osrm-local-pc
.\prepare.ps1
.\prepare-zona-brava.ps1

cd ..\valhalla-local-pc
.\prepare.ps1
.\test-valhalla.ps1
```

**Primera vez:** el contenedor **construye tiles** (20–90 min). Seguí:

```powershell
docker compose logs -f valhalla
```

## Reparto del día

```powershell
cd BravaBurgers\infra\routing-local-pc
.\start-reparto-dia.ps1

cd ..\valhalla-local-pc
.\run-quick-tunnel-and-vercel.ps1
```

Dejá abierta la ventana del túnel. Si la URL trycloudflare cambia, el script actualiza Vercel.

## Túnel fijo (Cloudflare)

Mismo túnel que OSRM, **otro hostname** al puerto **8002**:

```yaml
ingress:
  - hostname: valhalla.tudominio.com
    service: http://127.0.0.1:8002
  - hostname: osrm.tudominio.com
    service: http://127.0.0.1:5000
  - service: http_status:404
```

Vercel:

```powershell
cd infra\valhalla-local-pc
$env:VERCEL_TOKEN = "..."
.\set-vercel-valhalla-url.ps1 -Url "https://valhalla.tudominio.com/route"
```

## Probar

```powershell
.\test-valhalla.ps1
```

Desde celular (4G): mismo POST a `https://tu-host/route` con JSON de locations.

## Código app

- Proxy: `lib/valhallaRouteProxy.js`, `lib/valhallaMatchProxy.js`
- APK: `ValhallaRouteParser`, `ValhallaMapMatcher`
- Guía corta: `infra/valhalla/README.md`, `AYUDA_VALHALLA.md`
