# Google Sheets — formato Pedilo (igual que BR Burgers)

La web **Brava Burgers** usa el **mismo Excel / Google Sheet** que Pedilo.shop: dos hojas obligatorias con los mismos nombres de columna y claves de configuración.

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
| Control horario | `SI` / vacío |
| Mensaje si está CERRADO | Popup al cargar / pedir |
| Horario abierto LUNES … DOMINGO | Ej. `19:00-23:30` o `12:00-14:30 17:00-23:30` |
| Monto mínimo del pedido | Número |
| Zona 1 - Nombre / Zona 1 - Costo de envío | Hasta zona 10 |
| Zona de envío - Título | Label del select |
| Extra al pedido 1 - Monto | Umbral envío gratis (opcional) |
| Modelo del pedido en Whatsapp | Plantilla por línea |
| Texto al final del mensaje | Cierre del WhatsApp |
| Moneda signo | `$` |

Editás el Sheet → en ~1 minuto la web actualiza sola (refresh cada 60 s).

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
