# Hoja de cálculo Brava (formato Pedilo)

## Archivo único (recomendado)

**`BRAVA-BURGERS-Pedilo.xlsx`**

Dos pestañas, igual que BR Burgers / Pedilo:

| Pestaña | Contenido |
|---------|-----------|
| **productos** | Catálogo (una fila por variante) |
| **configuracion** | Clave / valor (WhatsApp, colores, zonas, horarios…) |

### Subir a Google Sheets

1. Abrí [tu Sheet de Brava](https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit).
2. **Archivo → Importar → Subir** → elegí `BRAVA-BURGERS-Pedilo.xlsx`.
3. Opción: **Reemplazar hoja de cálculo** o **Insertar hojas nuevas** (si reemplazás, renombrá las pestañas a `productos` y `configuracion` si hace falta).
4. Compartir: **Lector** (público) para que la web lea el CSV.

---

## Archivos CSV (origen de datos)

Si editás los CSV y querés regenerar el Excel:

- `brava-productos.csv`
- `brava-configuracion.csv`

En PowerShell, desde la carpeta `sheets`:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-brava-xlsx-openxml.ps1
```

Se vuelve a crear **`BRAVA-BURGERS-Pedilo.xlsx`**.

(Si tenés Microsoft Excel instalado, podés probar `build-brava-xlsx.ps1`.)

---

## Alternativa: pegar CSV a mano

Ver pasos en la sección anterior del repo; los CSV siguen siendo válidos pestaña por pestaña.

---

## Columna **Agotado** (sin stock visible)

En la pestaña **productos**, al lado de **Ingredientes**:

| Columna | Valor | Efecto en la tienda |
|---------|-------|---------------------|
| **Ocultar** | `si` | No aparece en el menú |
| **Agotado** | `si` | Aparece con badge **Agotado**, no se puede sumar al pedido |
| (vacío) | — | Se vende normal |

**Uso operativo:** si te quedás sin panceta y **La Cuarta** lleva panceta, poné `si` en **Agotado** en **una fila** de ese producto (ej. la fila `Sin Extra`). No hace falta marcar todas las variantes.

No es por ingrediente suelto: agotás el **producto entero**, igual que ocultar pero el cliente lo sigue viendo.

### Crear la columna en tu Sheet

1. Abrí el [Sheet de menú](https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit).
2. **Extensiones → Apps Script** → pegá `apps-script/SetupCatalogSheets.gs` (o actualizá el que ya tenés).
3. Ejecutá **`setupColumnaAgotadoEnProductos`** (solo la columna) o **`setupExtrasEIngredientesEnCatalogo`** (setup completo).
4. Autorizá si Google lo pide. Deberías ver **Agotado** justo después de **Ingredientes**.

Plantilla CSV con el orden de columnas: `sheets/brava-productos-personalizacion.csv`.
