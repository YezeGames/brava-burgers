# Zonas de entrega — My Maps + checkout web

Validar automáticamente si la dirección del cliente está **dentro o fuera** del área de delivery, usando los límites dibujados en **Google My Maps**.

**Alcance:** solo **tienda web** (checkout). Pedido manual sigue con líneas de envío 601/602… (ver `PEDIDO_MANUAL.md`).

Última actualización: sep 2026.

---

## Mapa operativo (Brava)

| | URL |
|---|-----|
| **Editar** | https://www.google.com/maps/d/u/0/edit?mid=19CBdgAGGJnksChZYmVvWSzqaqTgZOuU |
| **Ver** | https://www.google.com/maps/d/viewer?mid=19CBdgAGGJnksChZYmVvWSzqaqTgZOuU |
| **Export KML** | https://www.google.com/maps/d/kml?mid=19CBdgAGGJnksChZYmVvWSzqaqTgZOuU&forcekml=1 |
| **Map ID** | `19CBdgAGGJnksChZYmVvWSzqaqTgZOuU` |

Título del mapa: **Brava Burgers** — *Zona de Cobertura - BRAVA BURGERS*.

### Contenido actual (sep 2026)

- **7 polígonos** en My Maps, uno por barrio:
  Olivos · La Lucila · Martinez · Acasusso · Munro · Carapachay · Villa Adelina.
- **Adentro de alguno** → se puede pedir + detectar zona y costo (Sheet).
- **Afuera de los 7** → bloquear checkout.
- El polígono amarillo legacy (`Polígono 5`) **no se usa** — ignorado al exportar.
- Copia KML en repo: [`data/zonas-entrega.kml`](data/zonas-entrega.kml) (re-exportar al cambiar el mapa).

---

## Objetivo

Cuando el cliente carga/selecciona su dirección en el checkout:

1. Obtener **lat/lng** (Mapbox en `/api/address-suggest`).
2. Comparar el punto contra los **7 polígonos** del mapa.
3. **Dentro de alguno** → detectar barrio, pre-seleccionar zona/costo del Sheet.
4. **Fuera de los 7** → bloquear pedido (*«Por ahora no llegamos a esa dirección»*).

---

## Contexto actual (código)

| Pieza | Estado |
|-------|--------|
| Autocompletado dirección | `brava-address.js` + `/api/address-suggest` (Mapbox) |
| Sugerencias con `lat`, `lng` | Ya parseado en `address-suggest.js` |
| Filtro grosso | `DELIVERY_BBOX` (rectángulo aprox.) — **reemplazar por polígono real** |
| Zona + costo checkout | Sheet `configuracion` (`Zona N - Nombre/Costo`) + selector en tienda |
| Match localidad → zona | `bravaMatchZonaNombre()` (heurística texto) |

---

## Limitación importante: My Maps

**Google My Maps no tiene API en vivo** para leer polígonos desde la tienda en cada pedido.

Flujo operativo acordado:

```
My Maps (editar mapa Brava Burgers)
    → Export KML (URL arriba o My Maps → ⋮ → Exportar KML)
    → Actualizar `data/zonas-entrega.kml` en repo
    → (Opcional) script → `data/zonas-entrega.geojson`
    → Deploy Vercel
    → Checkout valida contra GeoJSON/KML convertido
```

Cuando cambien el mapa en My Maps → **re-exportar + push** (documentar en `sheets/OPERACIONES.md`).

---

## Modelo de datos GeoJSON

El GeoJSON tiene **7 features** (solo zonas, sin polígono amarillo):

| `properties.nombre` | Uso |
|---------------------|-----|
| Olivos, La Lucila, Martinez, Acasusso, Munro, Carapachay, Villa Adelina | ¿En qué barrio cae? → match con Sheet |

Si un punto cae en más de una zona (solapamiento), regla: la de **menor área**.

---

## Implementación técnica (propuesta)

### 1. Archivo de zonas

- Ruta: `BravaBurgers/data/zonas-entrega.geojson`
- Script opcional: `scripts/kml-to-geojson.js` (input KML exportado de My Maps).
- Versionar en git; cache bust con `?v=` o hash en nombre.

### 2. API validación (recomendado servidor)

`GET /api/delivery-zone?lat=…&lng=…`

Respuesta:

```json
{
  "ok": true,
  "dentro": true,
  "zona": "Olivos",
  "envio": 800
}
```

o `{ "ok": true, "dentro": false }`

- Cargar GeoJSON en memoria (con cache en cold start).
- **Point-in-polygon:** `@turf/boolean-point-in-polygon` o implementación ligera sin dependencia pesada.
- Si varias zonas contienen el punto (solapamiento), regla: la más específica / menor área / orden en properties (definir).

### 3. Checkout web (`brava-address.js` / `brava-shop.js`)

Al **elegir sugerencia** de dirección (ya tiene lat/lng):

1. Llamar `/api/delivery-zone`.
2. Si `dentro === false` → mensaje + deshabilitar «Confirmar pedido».
3. Si `dentro === true` y hay `zona` → pre-seleccionar dropdown de zona y costo.
4. Si escriben dirección a mano sin elegir sugerencia → al blur o al confirmar, geocodificar una vez y validar.

Estados UI sugeridos:

- 🟢 «Entregamos en tu zona»
- 🔴 «Fuera de zona de entrega» (+ link WA opcional)

### 4. Seguridad / pedido

- Validar **otra vez en servidor** al crear pedido (`/api/pedido` o `createOrderFromShop`) para no confiar solo en el cliente.
- Rechazar con `409` + `error: 'fuera_de_zona'` si lat/lng fuera del polígono.

### 5. Campos opcionales en `orders`

- `lat`, `lng` en pedido (migración Supabase) — útil para reparto y auditoría.
- O guardar en `items_json` / metadata si no queremos migración aún.

---

## Qué NO cambia

- Admin / pedido manual: envío como línea 601…
- Mapbox token y `address-suggest` (solo se afina el bbox o se deja como hint).
- Hoja de ruta / reparto (`demo-hoja-ruta-mapbox.html`) — independiente.

---

## Fases

| Fase | Tarea |
|------|--------|
| 1 | Exportar KML desde My Maps de Brava → primer GeoJSON |
| 2 | Script conversión + `data/zonas-entrega.geojson` en repo |
| 3 | API `delivery-zone` + point-in-polygon |
| 4 | UI checkout: validar al pick + mensaje fuera de zona |
| 5 | Validación server-side en `createOrderFromShop` |
| 6 | Doc operativa: «cómo actualizar zonas» en OPERACIONES |
| 7 | *(Opcional)* Auto-zona + costo si multi-polígono |

Estimado: 1–2 sesiones después de tener el KML exportado.

---

## Decisiones pendientes

- [x] ¿Un polígono o varios? → **7 polígonos** nombrados; fuera de todos = no entregamos; costo por Sheet.
- [ ] Mensaje exacto fuera de zona + CTA WhatsApp
- [x] Acasusso en Sheet → **$1000** (ver `sheets/brava-configuracion.csv`; replicar en Google Sheet live)

---

## Archivos

| Archivo | Estado |
|---------|--------|
| `data/zonas-entrega.kml` | Export My Maps |
| `data/zonas-entrega.geojson` | Generado (91 puntos) |
| `lib/deliveryZone.js` | Hecho — point-in-polygon |
| `api/delivery-zone.js` | Hecho — `GET ?lat=&lng=` |
| `brava-delivery-zone-client.js` | Hecho — cliente demo |
| `demo-tienda-zona-entrega.html` | **Demo checkout + mapa** |
| `brava-address.js` | Hook `bravaOnAddressPicked` |
| `brava-shop.js` | Hecho — checkout + banner + auto-zona |
| `lib/bravaSupabase.js` | Hecho — validar lat/lng al crear pedido |
| `api/address-suggest.js` | Hecho — filtro 7 zonas |
| `sheets/OPERACIONES.md` | Pendiente — re-export My Maps |

---

## Checklist cierre

1. Probar direcciones dentro / fuera del polígono real.
2. Pedido web fuera de zona no debe crearse en Supabase.
3. Actualizar My Maps → re-export → verificar en prod con `?v=`.
4. Mover ítems a **Hecho** en este doc.
