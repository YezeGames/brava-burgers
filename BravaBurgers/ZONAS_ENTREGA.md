# Zonas de entrega — Mapbox + GeoJSON (producción)

Validación automática en **checkout web**: ¿entregamos en esta dirección?

**Alcance:** tienda web. Pedido manual usa líneas de envío 601/602… (ver [`PEDIDO_MANUAL.md`](PEDIDO_MANUAL.md)).

Última actualización: sep 2026.

---

## Estado en producción ✅

| Pieza | Archivo / ruta |
|-------|----------------|
| Mapa + autocompletado dirección | **Mapbox** — `brava-checkout-map.js`, `/api/mapbox-config` |
| Sugerencias de calle | `brava-address.js`, `/api/address-suggest` |
| Validación point-in-polygon | **`GET /api/delivery-zone?lat=&lng=`** — `api/delivery-zone.js` |
| Polígonos (7 barrios) | `data/zonas-entrega.geojson` — `lib/deliveryZone.js` |
| Cliente checkout | `brava-delivery-zone-client.js` (incluido en `index.html`) |
| Costo / nombre zona | Sheet `configuracion` + match por nombre devuelto por API |

**Barrios:** Olivos · La Lucila · Martinez · Acasusso · Munro · Carapachay · Villa Adelina.

**Fuera de los 7 polígonos** → checkout bloqueado.

---

## My Maps — solo referencia opcional

**No usamos My Maps en runtime.** Los polígonos viven en **`data/zonas-entrega.geojson`** en el repo.

My Maps puede servir para **redibujar** zonas si preferís la UI de Google:

1. Editar [mapa Brava](https://www.google.com/maps/d/edit?mid=19CBdgAGGJnksChZYmVvWSzqaqTgZOuU)
2. Export KML → convertir a GeoJSON
3. Reemplazar `data/zonas-entrega.geojson` → commit → deploy Vercel

Map ID: `19CBdgAGGJnksChZYmVvWSzqaqTgZOuU`

---

## División de responsabilidades

| Fuente | Qué define |
|--------|------------|
| **GeoJSON en repo** | ¿Entregamos acá? → nombre de barrio/zona |
| **Mapbox** | Dirección, lat/lng, mapa interactivo, altura verificada |
| **Google Sheet** | Costo de envío por zona (`Zona N - Costo`) |

---

## Mantenimiento

Al cambiar cobertura:

1. Actualizar polígonos en GeoJSON (vía My Maps export o edición directa).
2. Alinear nombres de zona con filas del Sheet `configuracion`.
3. Push a `main` → Vercel redeploy.
4. Probar checkout con dirección dentro y fuera de zona.

---

## Qué NO cambia

- Admin / pedido manual: envío como línea catálogo.
- Inbox WhatsApp / wa-panel.
