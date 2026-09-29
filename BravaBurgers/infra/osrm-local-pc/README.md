# OSRM en la PC del local (USD 0)

La **PC del local** puede ser el servidor de **rutas** (turn-by-turn). El mapa en el celular sigue siendo **MapLibre + OpenStreetMap** (CARTO); solo cambia **quién calcula el camino**.

## Cómo entra en Brava

```text
APK repartidor  →  https://www.bravaburgers.com.ar/api/pedido  (osrmRoute)
                         ↓
              BRAVA_OSRM_BASE_URL (Vercel)
                         ↓
              Cloudflare Tunnel (HTTPS gratis)
                         ↓
              PC del local :5000  (Docker OSRM)
```

No hace falta cambiar la APK: la app ya llama a `osrmRoute` en paralelo con OSRM público.

## Requisitos en el local

| Item | Detalle |
|------|---------|
| PC | Windows 10/11, **8 GB RAM** mínimo recomendado para Argentina entera |
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Disco | ~15 GB libres (`.osm.pbf` + archivos `.osrm`) |
| Internet | Estable; la PC **debe estar encendida** mientras reparten |
| Uptime | Si apagan la PC, Vercel vuelve a OSRM público (más lento) |

## 1. Preparar mapa (una vez)

En PowerShell, desde esta carpeta:

```powershell
cd BravaBurgers\infra\osrm-local-pc
.\prepare.ps1
```

Descarga **Argentina** desde [Geofabrik](https://download.geofabrik.de/south-america/argentina.html) y corre extract/partition/customize en Docker.

## 2. Levantar OSRM

```powershell
docker compose up -d
```

Prueba en el navegador de la PC:

```text
http://127.0.0.1:5000/route/v1/driving/-58.381,-34.603;-58.420,-34.615?overview=false
```

Deberías ver JSON con `"code":"Ok"`.

## 3. Exponer a internet (celulares en 4G) — Cloudflare Tunnel gratis

Los repartidores **no** están en el WiFi del local. Hace falta una URL **HTTPS** pública sin abrir puertos en el router:

1. Cuenta en [Cloudflare](https://dash.cloudflare.com) (gratis).
2. Instalar **cloudflared** en la PC: [documentación](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
3. Crear túnel (ejemplo):

```powershell
cloudflared tunnel login
cloudflared tunnel create brava-osrm
```

Archivo `config.yml` (ruta típica `%USERPROFILE%\.cloudflared\config.yml`):

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: C:\Users\TU_USUARIO\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: osrm.tudominio.com
    service: http://127.0.0.1:5000
  - service: http_status:404
```

En Cloudflare DNS, CNAME `osrm` → `<tunnel-id>.cfargotunnel.com`.

```powershell
cloudflared tunnel run brava-osrm
```

(O instalar como **servicio de Windows** para que arranque con la PC.)

Probar desde el celular (datos móviles):

```text
https://osrm.tudominio.com/route/v1/driving/-58.381,-34.603;-58.420,-34.615?overview=false
```

## 4. Vercel

En **Environment Variables** del proyecto:

```env
BRAVA_OSRM_BASE_URL=https://osrm.tudominio.com/route/v1/driving
```

Redeploy. El proxy `lib/osrmRouteProxy.js` usa **primero** esta URL y solo si falla prueba OSRM público.

## 5. Operación diaria

- Encender PC + Docker (`docker compose up -d`) + túnel Cloudflare antes del servicio de reparto.
- Opcional: tarea programada Windows al inicio de sesión.
- Cada 1–2 meses: volver a correr `prepare.ps1` si querés mapas actualizados (calle nueva).

## WiFi solo (prueba en el local, sin túnel)

En la misma red WiFi podés apuntar temporalmente `BRAVA_OSRM_BASE_URL` a `http://IP-LAN:5000` — **no sirve para 4G** y Vercel no puede llamar HTTP a tu LAN. Para producción usá túnel.

## Seguridad

- OSRM en `127.0.0.1:5000` (no expuesto directo al modem).
- Solo el túnel Cloudflare publica HTTPS.
- Opcional: Cloudflare Access (PIN) si querés limitar quién pega al OSRM; la app pasa por Vercel, no hace falta para empezar.

## Alternativa más liviana (PC débil)

Argentina entera es pesada. Si el `prepare.ps1` falla por RAM, podés recortar zona con [BBBike extract](https://extract.bbbike.org/) (GBA) y renombrar el `.pbf` a `argentina-latest.osm.pbf` en `data/` antes de extract, o ajustar nombres en `docker-compose.yml`.
