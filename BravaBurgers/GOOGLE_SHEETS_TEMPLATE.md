# Google Sheets — formato Pedilo (igual que BR Burgers)

## Modelo híbrido (operación actual)

| Dónde editás | Qué controla |
|--------------|--------------|
| **Admin → Tienda** (publicar) | Menú, categorías, extras, ingredientes, horarios, turnos, promos, agotados |
| **Sheet → `configuracion`** | Colores, logo, imagen de fondo, título, pie, zonas de envío, labels checkout, WhatsApp, monto mínimo, moneda |

La web carga siempre `configuracion` del Sheet y el menú desde **Supabase** (`/api/catalog`). Si hay catálogo publicado en admin, **horarios y turnos del Sheet no aplican** (los pisa Supabase).

**Import desde Sheet** en admin: solo para sincronización inicial o carga masiva; el día a día del menú es desde admin.

Pestañas `productos`, `extras` e `ingredientes` del Sheet: **respaldo** si Supabase no responde.

Sheet operativo: [BRAVA-BURGERS](https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit)

---

La web mantiene el **mismo formato** que Pedilo.shop: hojas con los mismos nombres de columna y claves de configuración.

---

## 1. Crear el Sheet desde el Excel de Pedilo

1. Abrí el archivo **`DOCS PAGINA PEDILO.SHOP.xlsx`** (export de BR Burgers).
2. En [Google Sheets](https://sheets.google.com): **Archivo → Importar → Subir** y elegí ese `.xlsx`.
3. Verificá que existan estas pestañas (nombres exactos):
   - **`productos`**
   - **`configuracion`**
   - `Sheet4` (opcional, lista de subcategorías para validación en Sheets)
4. **Compartir → Cualquier persona con el enlace → Lector**.
5. Copiá el ID de la URL:
   `https://docs.google.com/spreadsheets/d/ESTE_ID/edit`

6. En `index.html`, actualizá:

```javascript
window.PEDILO_SHEET_ID = 'ESTE_ID';
```

---

## 2. Hoja `productos` (catálogo)

Encabezados de la **fila 1** (como Pedilo):

| Columna | Uso |
|---------|-----|
| **Nombre** | Nombre del producto |
| **Descripcion** | Texto bajo el título |
| **Variedades** | Opción de esa fila (ej. `Sin Extra`, `Extra cheddar x1`) |
| **Precio** | Precio de **esa** variante |
| **Ocultar** | `SI` = no se publica; otro valor = visible |
| **Categoria** | Ej. Hamburguesas |
| **Subcategoria** | Ej. Simples, Dobles |
| **Imagen** | URL (opcional) |

**Modelo Pedilo:** una fila = **una variante**. Mismo `Nombre` + varias filas con distinto `Variedades` / `Precio` → un solo producto con menú de opciones (Fancybox “Elija una opción”).

Ejemplo:

| Nombre | Descripcion | Variedades | Precio | Ocultar | Categoria | Subcategoria |
|--------|-------------|------------|--------|---------|-----------|--------------|
| Cheese Simple | Medallon 120gr... | Sin Extra | 17000 | | Hamburguesas | Simples |
| Cheese Simple | Medallon 120gr... | Extra Bacon | 18500 | | Hamburguesas | Simples |

---

## 3. Hoja `configuracion` (toda la tienda)

Columnas **A = Nombre**, **B = Valor** (clave / valor), igual que Pedilo.

Claves importantes (mismas etiquetas que en el Excel):

| Nombre (col A) | Qué controla |
|----------------|--------------|
| Titulo | Marca en navbar |
| Logo | URL del logo |
| Whatsapp pedidos | Número (ej. 5491173721945) |
| Pie de página | HTML del footer |
| Color de la cabecera / pie / fondo | Tema |
| Color del producto seleccionado | Hover y fila en pedido |
| Color de fondo de los botones | Botones |
| Imagen de fondo | Fondo del body |
| Pregunta previa al pedido 1 … 6 | Labels del checkout |
| Preguntas encabezado / Preguntas pie | Textos del modal |
| Pregunta previa al pedido 5 / 6 | URL Pedilo `select.php` **o** la web usa opciones por defecto si no hay URL |
| Control horario | Respaldo; **admin publicado** manda |
| Mensaje si está CERRADO | Respaldo; admin puede definir `msg_cerrado` |
| Horario abierto LUNES … DOMINGO | Respaldo; **admin → Horarios** manda si hay publicación |
| Monto mínimo del pedido | Número |
| Zona 1 - Nombre / Zona 1 - Costo de envío | Hasta zona 10 |
| Zona de envío - Título | Label del select |
| Extra al pedido 1 - Monto | Umbral envío gratis (opcional) |
| Modelo del pedido en Whatsapp | Plantilla por línea |
| Texto al final del mensaje | Cierre del WhatsApp |
| Moneda signo | `$` |

Cambios en **`configuracion`** (diseño, zonas, checkout): ~1 min en la web (refresh cada 60 s). Cambios de menú/horarios: **admin → Publicar**.

---

## 4. Archivos de la web

| Archivo | Función |
|---------|---------|
| `index.html` | Shell + modales Pedilo |
| `pedilo-data.js` | Lee CSV `productos` + `configuracion` |
| `pedilo-shop.js` | Carrito, Fancybox, horarios, WhatsApp |

---

## 5. Diferencias con Pedilo hosted

| Pedilo.shop | Brava (esta web) |
|-------------|------------------|
| Servidor `create.order.php` | Solo **WhatsApp** (`wa.me`) |
| Republicar manual desde panel | Auto-refresh desde Sheet |
| Facebook Pixel / Analytics | No incluidos (podés agregar en configuracion HTML) |

El **menú, checkout, zonas, horarios y Sheet** siguen el mismo criterio que BR Burgers.

---

## 6. Checklist rápido

- [ ] Sheet importado desde `DOCS PAGINA PEDILO.SHOP.xlsx`
- [ ] Pestañas `productos` y `configuracion`
- [ ] Sheet público (lector)
- [ ] `PEDILO_SHEET_ID` en `index.html`
- [ ] `Whatsapp pedidos` en configuracion
- [ ] Probar: agregar producto → carrito → Enviar pedido → WhatsApp
